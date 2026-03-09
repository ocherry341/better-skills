import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { migrate } from "../src/commands/migrate.js";
import { readRegistry, isManaged, registerSkill } from "../src/core/registry.js";
import { hashDirectory } from "../src/core/hasher.js";
import { readProfile, getActiveProfileName, writeProfile, setActiveProfileName } from "../src/core/profile.js";
import * as store from "../src/core/store.js";
import { linkSkill } from "../src/core/linker.js";

describe("migrate command", () => {
  let baseDir: string;
  let skillsDir: string;
  let registryPath: string;
  let storeDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "migrate-"));
    skillsDir = join(baseDir, "skills");
    registryPath = join(baseDir, "registry.json");
    storeDir = join(baseDir, "store");
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(skillsDir, { recursive: true });
    await mkdir(storeDir, { recursive: true });
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  function opts() {
    return {
      skillsDir,
      registryPath,
      storePath: storeDir,
      profilesDir,
      activeFile,
    };
  }

  test("migrates unmanaged skills to store and registry", async () => {
    // Create two unmanaged skills
    const skill1 = join(skillsDir, "skill-a");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: skill-a\n---\n# A");

    const skill2 = join(skillsDir, "skill-b");
    await mkdir(skill2, { recursive: true });
    await writeFile(join(skill2, "SKILL.md"), "---\nname: skill-b\n---\n# B");

    await migrate(opts());

    // Both should be managed
    expect(await isManaged("skill-a", registryPath)).toBe(true);
    expect(await isManaged("skill-b", registryPath)).toBe(true);

    // Registry should have source "local"
    const reg = await readRegistry(registryPath);
    expect(reg.skills["skill-a"].source).toBe("local");
    expect(reg.skills["skill-b"].source).toBe("local");

    // Hashes should be in the store
    const hash1 = await hashDirectory(skill1);
    const hash2 = await hashDirectory(skill2);
    expect(reg.skills["skill-a"].hash).toBe(hash1);
    expect(reg.skills["skill-b"].hash).toBe(hash2);
  });

  test("skips already managed skills", async () => {
    // Create a managed skill
    const skill1 = join(skillsDir, "managed-skill");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: managed-skill\n---\n# M");
    const hash = await hashDirectory(skill1);
    await store.store(hash, skill1);
    await mkdir(join(storeDir, hash), { recursive: true });
    await registerSkill("managed-skill", hash, "owner/repo", registryPath, storeDir);

    // Create an unmanaged skill
    const skill2 = join(skillsDir, "new-skill");
    await mkdir(skill2, { recursive: true });
    await writeFile(join(skill2, "SKILL.md"), "---\nname: new-skill\n---\n# N");

    await migrate(opts());

    // Managed skill should keep original source
    const reg = await readRegistry(registryPath);
    expect(reg.skills["managed-skill"].source).toBe("owner/repo");

    // New skill should be migrated with "local" source
    expect(reg.skills["new-skill"].source).toBe("local");
  });

  test("creates default profile when none exists", async () => {
    const skill1 = join(skillsDir, "my-skill");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: my-skill\n---\n# S");

    expect(await getActiveProfileName(activeFile)).toBeNull();

    await migrate(opts());

    // Default profile should be created and active
    expect(await getActiveProfileName(activeFile)).toBe("default");

    // Profile should contain the migrated skill
    const profile = await readProfile(join(profilesDir, "default.json"));
    expect(profile.name).toBe("default");
    expect(profile.skills).toHaveLength(1);
    expect(profile.skills[0].skillName).toBe("my-skill");
    expect(profile.skills[0].source).toBe("local");
  });

  test("adds to existing active profile", async () => {
    // Set up an existing profile
    await writeProfile(join(profilesDir, "work.json"), { name: "work", skills: [] });
    await setActiveProfileName(activeFile, "work");

    const skill1 = join(skillsDir, "my-skill");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: my-skill\n---\n# S");

    await migrate(opts());

    // Should use existing profile, not create default
    expect(await getActiveProfileName(activeFile)).toBe("work");

    const profile = await readProfile(join(profilesDir, "work.json"));
    expect(profile.skills).toHaveLength(1);
    expect(profile.skills[0].skillName).toBe("my-skill");
  });

  test("re-links files from store after migration", async () => {
    const skill1 = join(skillsDir, "my-skill");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: my-skill\n---\n# Skill");

    const hashBefore = await hashDirectory(skill1);

    await migrate(opts());

    // Skill should still exist on disk with same content
    const entries = await readdir(skill1);
    expect(entries).toContain("SKILL.md");

    const content = await readFile(join(skill1, "SKILL.md"), "utf-8");
    expect(content).toBe("---\nname: my-skill\n---\n# Skill");

    // Hash should match store entry
    const reg = await readRegistry(registryPath);
    expect(reg.skills["my-skill"].hash).toBe(hashBefore);

    // Store should have the content (check temp storeDir directly, not global path)
    const s = await stat(join(storeDir, hashBefore));
    expect(s.isDirectory()).toBe(true);
  });

  test("no skills directory: prints message and exits", async () => {
    await rm(skillsDir, { recursive: true, force: true });
    // Should not throw
    await migrate(opts());
  });

  test("empty skills directory: prints message and exits", async () => {
    // skillsDir exists but is empty
    await migrate(opts());
  });

  test("all managed: prints message and exits", async () => {
    const skill1 = join(skillsDir, "managed");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: managed\n---\n# M");
    const hash = await hashDirectory(skill1);
    await mkdir(join(storeDir, hash), { recursive: true });
    await registerSkill("managed", hash, "owner/repo", registryPath, storeDir);

    // Should not throw, and should not modify the registry
    await migrate(opts());
    const reg = await readRegistry(registryPath);
    expect(reg.skills["managed"].source).toBe("owner/repo");
  });

  test("re-copies store when existing store entry is incomplete", async () => {
    // Create a skill with two files
    const skill1 = join(skillsDir, "multi-file-skill");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: multi-file-skill\n---\n# S");
    await writeFile(join(skill1, "data.txt"), "important data");

    // Compute the expected hash
    const expectedHash = await hashDirectory(skill1);

    // Simulate interrupted migration: create store dir with only one file
    const hashPath = join(storeDir, expectedHash);
    await mkdir(hashPath, { recursive: true });
    await writeFile(join(hashPath, "SKILL.md"), "---\nname: multi-file-skill\n---\n# S");
    // data.txt is intentionally missing — simulates interrupted copy

    await migrate(opts());

    // Skill should still have BOTH files after migration
    const entries = (await readdir(skill1)).sort();
    expect(entries).toEqual(["SKILL.md", "data.txt"]);

    // Content should be intact
    const content = await readFile(join(skill1, "data.txt"), "utf-8");
    expect(content).toBe("important data");

    // Store should now have both files too
    const storeEntries = (await readdir(hashPath)).sort();
    expect(storeEntries).toEqual(["SKILL.md", "data.txt"]);
  });
});
