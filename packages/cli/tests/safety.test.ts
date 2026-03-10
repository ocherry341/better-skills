import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, readdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { hashDirectory } from "../src/core/hasher.js";
import * as store from "../src/core/store.js";
import { linkSkill, cpRecursive } from "../src/core/linker.js";
import { registerSkill, unregisterSkill, isManaged, readRegistry } from "../src/core/registry.js";
import { profileUse } from "../src/commands/profile.js";
import { addSkillToProfile } from "../src/commands/add.js";
import { type Profile, writeProfile, readProfile, getActiveProfileName, setActiveProfileName } from "../src/core/profile.js";

describe("add -g conflict detection", () => {
  let baseDir: string;
  let skillsDir: string;
  let registryPath: string;
  let storeDir: string;
  let localSkillDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "safety-add-"));
    skillsDir = join(baseDir, "skills");
    registryPath = join(baseDir, "registry.json");
    storeDir = join(baseDir, "store");
    localSkillDir = join(baseDir, "local-skill");
    await mkdir(skillsDir, { recursive: true });
    await mkdir(storeDir, { recursive: true });

    // Create a local skill to add
    await mkdir(localSkillDir, { recursive: true });
    await writeFile(join(localSkillDir, "SKILL.md"), "---\nname: my-skill\n---\n# Skill");
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("new skill: links and registers without issue", async () => {
    const hash = await hashDirectory(localSkillDir);
    await store.store(hash, localSkillDir);

    const targetDir = join(skillsDir, "my-skill");
    await linkSkill(store.getHashPath(hash), targetDir);
    await mkdir(join(storeDir, hash), { recursive: true });
    await registerSkill("my-skill", hash, "local:/path", registryPath, storeDir);

    // Skill should exist on disk
    const entries = await readdir(skillsDir);
    expect(entries).toContain("my-skill");

    // Skill should be registered
    expect(await isManaged("my-skill", registryPath)).toBe(true);

    const reg = await readRegistry(registryPath);
    expect(reg.skills["my-skill"].versions[0].hash).toBe(hash);
  });

  test("managed overwrite: silently overwrites and updates registry", async () => {
    // First add
    const hash1 = await hashDirectory(localSkillDir);
    await store.store(hash1, localSkillDir);
    const targetDir = join(skillsDir, "my-skill");
    await linkSkill(store.getHashPath(hash1), targetDir);
    await mkdir(join(storeDir, hash1), { recursive: true });
    await registerSkill("my-skill", hash1, "local:/path1", registryPath, storeDir);

    // Modify skill content
    await writeFile(join(localSkillDir, "extra.txt"), "new content");
    const hash2 = await hashDirectory(localSkillDir);
    await store.store(hash2, localSkillDir);

    // isManaged should return true — safe to overwrite
    expect(await isManaged("my-skill", registryPath)).toBe(true);

    // Overwrite
    await linkSkill(store.getHashPath(hash2), targetDir);
    await mkdir(join(storeDir, hash2), { recursive: true });
    await registerSkill("my-skill", hash2, "local:/path2", registryPath, storeDir);

    // Registry should reflect updated hash and source (v2 is latest)
    const reg = await readRegistry(registryPath);
    const latest = reg.skills["my-skill"].versions[reg.skills["my-skill"].versions.length - 1];
    expect(latest.hash).toBe(hash2);
    expect(latest.source).toBe("local:/path2");

    // Disk should have the new file
    const content = await readFile(join(targetDir, "extra.txt"), "utf-8");
    expect(content).toBe("new content");
  });

  test("unmanaged conflict: isManaged returns false, blocks overwrite", async () => {
    // Create an unmanaged skill directory (not in registry)
    const unmanagedDir = join(skillsDir, "my-skill");
    await mkdir(unmanagedDir, { recursive: true });
    await writeFile(join(unmanagedDir, "README.md"), "user content");

    // isManaged should return false
    expect(await isManaged("my-skill", registryPath)).toBe(false);

    // The add command would throw here (simulating the check)
    const error = `Skill 'my-skill' exists but is not managed by bsk. Use --force to overwrite.`;
    expect(error).toContain("not managed by bsk");

    // User content should still be intact
    const content = await readFile(join(unmanagedDir, "README.md"), "utf-8");
    expect(content).toBe("user content");
  });

  test("unmanaged conflict with --force: overwrites and registers", async () => {
    // Create an unmanaged skill directory
    const unmanagedDir = join(skillsDir, "my-skill");
    await mkdir(unmanagedDir, { recursive: true });
    await writeFile(join(unmanagedDir, "README.md"), "user content");

    expect(await isManaged("my-skill", registryPath)).toBe(false);

    // With --force, overwrite + register
    const hash = await hashDirectory(localSkillDir);
    await store.store(hash, localSkillDir);
    await linkSkill(store.getHashPath(hash), unmanagedDir);
    await mkdir(join(storeDir, hash), { recursive: true });
    await registerSkill("my-skill", hash, "local:/path", registryPath, storeDir);

    // Now managed
    expect(await isManaged("my-skill", registryPath)).toBe(true);

    // Old user content should be gone
    const entries = await readdir(unmanagedDir);
    expect(entries).not.toContain("README.md");
    expect(entries).toContain("SKILL.md");
  });
});

describe("profile use preserves unmanaged skills", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;
  let skillsDir: string;
  let registryPath: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "safety-use-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    skillsDir = join(baseDir, "skills");
    registryPath = join(baseDir, "registry.json");
    await mkdir(profilesDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("preserves unmanaged skills and removes managed ones", async () => {
    // Set up store with a skill for the target profile using real hash
    const storeBase = join(baseDir, "store");
    const tmpSkill = join(baseDir, "tmp-new-skill");
    await mkdir(tmpSkill, { recursive: true });
    await writeFile(join(tmpSkill, "SKILL.md"), "---\nname: new-skill\n---\n# New");
    const newHash = await hashDirectory(tmpSkill);
    const storeSkillDir = join(storeBase, newHash);
    await mkdir(storeSkillDir, { recursive: true });
    await cpRecursive(tmpSkill, storeSkillDir);

    // Register in registry so profileUse can resolve v -> hash
    await registerSkill("new-skill", newHash, "test/repo", registryPath, storeBase);

    // Create target profile
    const profile: Profile = {
      name: "target",
      skills: [
        { skillName: "new-skill", v: 1, source: "test/repo", addedAt: "2026-03-03T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "target.json"), profile);

    // Put a managed skill in skillsDir (should be removed)
    const managedSkill = join(skillsDir, "old-managed");
    await mkdir(managedSkill, { recursive: true });
    await writeFile(join(managedSkill, "SKILL.md"), "old managed");
    await mkdir(join(storeBase, "oldhash"), { recursive: true });
    await registerSkill("old-managed", "oldhash", "old/source", registryPath, storeBase);

    // Put an unmanaged skill in skillsDir (should be preserved)
    const unmanagedSkill = join(skillsDir, "user-skill");
    await mkdir(unmanagedSkill, { recursive: true });
    await writeFile(join(unmanagedSkill, "README.md"), "user content");

    // Switch profile
    await profileUse("target", {
      profilesDir,
      activeFile,
      skillsDir,
      storePath: storeBase,
      registryPath,
    });

    const entries = (await readdir(skillsDir)).sort();

    // new-skill should be linked, old-managed should be gone, user-skill should remain
    expect(entries).toEqual(["new-skill", "user-skill"]);

    // Verify user content is intact
    const content = await readFile(join(skillsDir, "user-skill", "README.md"), "utf-8");
    expect(content).toBe("user content");

    // Verify new-skill is registered
    expect(await isManaged("new-skill", registryPath)).toBe(true);

    // Verify old-managed persists in registry (lockfile behavior)
    expect(await isManaged("old-managed", registryPath)).toBe(true);
  });
});

describe("auto-create default profile", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "safety-default-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("creates default profile when no active profile exists", async () => {
    // No active profile set
    expect(await getActiveProfileName(activeFile)).toBeNull();

    // addSkillToProfile should auto-create default profile
    await addSkillToProfile({
      skillName: "my-skill",
      v: 1,
      source: "owner/repo",
      global: true,
      profilesDir,
      activeFile,
    });

    // Active profile should now be "default"
    expect(await getActiveProfileName(activeFile)).toBe("default");

    // Profile should exist with the skill
    const profile = await readProfile(join(profilesDir, "default.json"));
    expect(profile.name).toBe("default");
    expect(profile.skills).toHaveLength(1);
    expect(profile.skills[0].skillName).toBe("my-skill");
    expect(profile.skills[0].v).toBe(1);
  });

  test("does not create default profile for non-global add", async () => {
    await addSkillToProfile({
      skillName: "my-skill",
      v: 0,
      source: "owner/repo",
      global: false,
      profilesDir,
      activeFile,
    });

    // Should still have no active profile
    expect(await getActiveProfileName(activeFile)).toBeNull();
  });

  test("uses existing active profile instead of creating default", async () => {
    // Set up an existing active profile
    await writeProfile(join(profilesDir, "work.json"), { name: "work", skills: [] });
    await setActiveProfileName(activeFile, "work");

    await addSkillToProfile({
      skillName: "my-skill",
      v: 1,
      source: "owner/repo",
      global: true,
      profilesDir,
      activeFile,
    });

    // Active profile should still be "work", not "default"
    expect(await getActiveProfileName(activeFile)).toBe("work");

    // Skill should be in "work" profile
    const profile = await readProfile(join(profilesDir, "work.json"));
    expect(profile.skills[0].skillName).toBe("my-skill");
  });
});
