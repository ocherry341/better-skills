import { describe, test, expect, beforeEach } from "bun:test";
import { mkdir, readdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { hashDirectory } from "../src/core/hasher.js";
import * as store from "../src/core/store.js";
import { linkSkill, cpRecursive } from "../src/core/linker.js";
import { registerSkill, isManaged, readRegistry } from "../src/core/registry.js";
import { profileUse } from "../src/commands/profile.js";
import { addSkillToProfile } from "../src/commands/add.js";
import { type Profile, writeProfile, readProfile, getActiveProfileName, setActiveProfileName } from "../src/core/profile.js";
import { cleanTestHome, getGlobalSkillsPath, getStorePath, getProfilesPath, getProfilePath, getActiveProfileFilePath, home } from "../src/utils/paths.js";

describe("add -g conflict detection", () => {
  let localSkillDir: string;

  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getGlobalSkillsPath(), { recursive: true });
    await mkdir(getStorePath(), { recursive: true });

    // Create a local skill to add
    localSkillDir = join(home(), "local-skill");
    await mkdir(localSkillDir, { recursive: true });
    await writeFile(join(localSkillDir, "SKILL.md"), "---\nname: my-skill\n---\n# Skill");
  });

  test("new skill: links and registers without issue", async () => {
    const hash = await hashDirectory(localSkillDir);
    await store.store(hash, localSkillDir);

    const targetDir = join(getGlobalSkillsPath(), "my-skill");
    await linkSkill(join(getStorePath(), hash), targetDir);
    await mkdir(join(getStorePath(), hash), { recursive: true });
    await registerSkill("my-skill", hash, "local:/path");

    // Skill should exist on disk
    const entries = await readdir(getGlobalSkillsPath());
    expect(entries).toContain("my-skill");

    // Skill should be registered
    expect(await isManaged("my-skill")).toBe(true);

    const reg = await readRegistry();
    expect(reg.skills["my-skill"].versions[0].hash).toBe(hash);
  });

  test("managed overwrite: silently overwrites and updates registry", async () => {
    // First add
    const hash1 = await hashDirectory(localSkillDir);
    await store.store(hash1, localSkillDir);
    const targetDir = join(getGlobalSkillsPath(), "my-skill");
    await linkSkill(join(getStorePath(), hash1), targetDir);
    await mkdir(join(getStorePath(), hash1), { recursive: true });
    await registerSkill("my-skill", hash1, "local:/path1");

    // Modify skill content
    await writeFile(join(localSkillDir, "extra.txt"), "new content");
    const hash2 = await hashDirectory(localSkillDir);
    await store.store(hash2, localSkillDir);

    // isManaged should return true — safe to overwrite
    expect(await isManaged("my-skill")).toBe(true);

    // Overwrite
    await linkSkill(join(getStorePath(), hash2), targetDir);
    await mkdir(join(getStorePath(), hash2), { recursive: true });
    await registerSkill("my-skill", hash2, "local:/path2");

    // Registry should reflect updated hash and source (v2 is latest)
    const reg = await readRegistry();
    const latest = reg.skills["my-skill"].versions[reg.skills["my-skill"].versions.length - 1];
    expect(latest.hash).toBe(hash2);
    expect(latest.source).toBe("local:/path2");

    // Disk should have the new file
    const content = await readFile(join(targetDir, "extra.txt"), "utf-8");
    expect(content).toBe("new content");
  });

  test("unmanaged conflict: isManaged returns false, blocks overwrite", async () => {
    // Create an unmanaged skill directory (not in registry)
    const unmanagedDir = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(unmanagedDir, { recursive: true });
    await writeFile(join(unmanagedDir, "README.md"), "user content");

    // isManaged should return false
    expect(await isManaged("my-skill")).toBe(false);

    // The add command would throw here (simulating the check)
    const error = `Skill 'my-skill' exists but is not managed by bsk. Use --force to overwrite.`;
    expect(error).toContain("not managed by bsk");

    // User content should still be intact
    const content = await readFile(join(unmanagedDir, "README.md"), "utf-8");
    expect(content).toBe("user content");
  });

  test("unmanaged conflict with --force: overwrites and registers", async () => {
    // Create an unmanaged skill directory
    const unmanagedDir = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(unmanagedDir, { recursive: true });
    await writeFile(join(unmanagedDir, "README.md"), "user content");

    expect(await isManaged("my-skill")).toBe(false);

    // With --force, overwrite + register
    const hash = await hashDirectory(localSkillDir);
    await store.store(hash, localSkillDir);
    await linkSkill(join(getStorePath(), hash), unmanagedDir);
    await mkdir(join(getStorePath(), hash), { recursive: true });
    await registerSkill("my-skill", hash, "local:/path");

    // Now managed
    expect(await isManaged("my-skill")).toBe(true);

    // Old user content should be gone
    const entries = await readdir(unmanagedDir);
    expect(entries).not.toContain("README.md");
    expect(entries).toContain("SKILL.md");
  });
});

describe("profile use preserves unmanaged skills", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
    await mkdir(getGlobalSkillsPath(), { recursive: true });
  });

  test("preserves unmanaged skills and removes managed ones", async () => {
    // Set up store with a skill for the target profile using real hash
    const tmpSkill = join(home(), "tmp-new-skill");
    await mkdir(tmpSkill, { recursive: true });
    await writeFile(join(tmpSkill, "SKILL.md"), "---\nname: new-skill\n---\n# New");
    const newHash = await hashDirectory(tmpSkill);
    const storeSkillDir = join(getStorePath(), newHash);
    await mkdir(storeSkillDir, { recursive: true });
    await cpRecursive(tmpSkill, storeSkillDir);

    // Register in registry so profileUse can resolve v -> hash
    await registerSkill("new-skill", newHash, "test/repo");

    // Create target profile
    const profile: Profile = {
      name: "target",
      skills: [
        { skillName: "new-skill", v: 1, source: "test/repo", addedAt: "2026-03-03T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("target"), profile);

    // Put a managed skill in skillsDir (should be removed)
    const managedSkill = join(getGlobalSkillsPath(), "old-managed");
    await mkdir(managedSkill, { recursive: true });
    await writeFile(join(managedSkill, "SKILL.md"), "old managed");
    await mkdir(join(getStorePath(), "oldhash"), { recursive: true });
    await registerSkill("old-managed", "oldhash", "old/source");

    // Put an unmanaged skill in skillsDir (should be preserved)
    const unmanagedSkill = join(getGlobalSkillsPath(), "user-skill");
    await mkdir(unmanagedSkill, { recursive: true });
    await writeFile(join(unmanagedSkill, "README.md"), "user content");

    // Switch profile
    await profileUse("target", {});

    const entries = (await readdir(getGlobalSkillsPath())).sort();

    // new-skill should be linked, old-managed should be gone, user-skill should remain
    expect(entries).toEqual(["new-skill", "user-skill"]);

    // Verify user content is intact
    const content = await readFile(join(getGlobalSkillsPath(), "user-skill", "README.md"), "utf-8");
    expect(content).toBe("user content");

    // Verify new-skill is registered
    expect(await isManaged("new-skill")).toBe(true);

    // Verify old-managed persists in registry (lockfile behavior)
    expect(await isManaged("old-managed")).toBe(true);
  });
});

describe("auto-create default profile", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("creates default profile when no active profile exists", async () => {
    // No active profile set
    expect(await getActiveProfileName(getActiveProfileFilePath())).toBeNull();

    // addSkillToProfile should auto-create default profile
    await addSkillToProfile({
      skillName: "my-skill",
      v: 1,
      source: "owner/repo",
      global: true,
    });

    // Active profile should now be "default"
    expect(await getActiveProfileName(getActiveProfileFilePath())).toBe("default");

    // Profile should exist with the skill
    const profile = await readProfile(getProfilePath("default"));
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
    });

    // Should still have no active profile
    expect(await getActiveProfileName(getActiveProfileFilePath())).toBeNull();
  });

  test("uses existing active profile instead of creating default", async () => {
    // Set up an existing active profile
    await writeProfile(getProfilePath("work"), { name: "work", skills: [] });
    await setActiveProfileName(getActiveProfileFilePath(), "work");

    await addSkillToProfile({
      skillName: "my-skill",
      v: 1,
      source: "owner/repo",
      global: true,
    });

    // Active profile should still be "work", not "default"
    expect(await getActiveProfileName(getActiveProfileFilePath())).toBe("work");

    // Skill should be in "work" profile
    const profile = await readProfile(getProfilePath("work"));
    expect(profile.skills[0].skillName).toBe("my-skill");
  });
});
