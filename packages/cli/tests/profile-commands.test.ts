import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, readdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { profileCreate, profileLs, profileShow, profileUse, profileAdd, profileRm, profileDelete, profileRename, profileClone } from "../src/commands/profile.js";
import { type Profile, readProfile, writeProfile, getActiveProfileName, setActiveProfileName } from "../src/core/profile.js";
import { addSkillToProfile } from "../src/commands/add.js";
import { removeSkillFromProfile } from "../src/commands/rm.js";
import { registerSkill } from "../src/core/registry.js";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";

describe("profile create", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;
  let skillsDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-cmd-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    skillsDir = join(baseDir, "skills");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("creates an empty profile and sets it active", async () => {
    await profileCreate("work", { profilesDir, activeFile, skillsDir });

    const profile = await readProfile(join(profilesDir, "work.json"));
    expect(profile.name).toBe("work");
    expect(profile.skills).toEqual([]);

    const active = await getActiveProfileName(activeFile);
    expect(active).toBe("work");
  });

  test("creates profile from existing skills directory", async () => {
    // Set up a skills dir with one skill that has a SKILL.md
    const skillDir = join(skillsDir, "brainstorming");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: brainstorming\n---\n# Brainstorming"
    );

    await profileCreate("from-existing", {
      profilesDir,
      activeFile,
      skillsDir,
      fromExisting: true,
    });

    const profile = await readProfile(join(profilesDir, "from-existing.json"));
    expect(profile.name).toBe("from-existing");
    expect(profile.skills.length).toBe(1);
    expect(profile.skills[0].skillName).toBe("brainstorming");
  });

  test("throws if profile already exists", async () => {
    await profileCreate("dup", { profilesDir, activeFile, skillsDir });
    expect(
      profileCreate("dup", { profilesDir, activeFile, skillsDir })
    ).rejects.toThrow(/already exists/);
  });
});

describe("profile ls", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;
  let skillsDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-ls-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    skillsDir = join(baseDir, "skills");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("lists profiles and marks active", async () => {
    await profileCreate("alpha", { profilesDir, activeFile, skillsDir });
    await profileCreate("beta", { profilesDir, activeFile, skillsDir });
    // beta is now active (last created)

    const result = await profileLs({ profilesDir, activeFile });
    expect(result).toEqual([
      { name: "alpha", active: false },
      { name: "beta", active: true },
    ]);
  });

  test("returns empty when no profiles", async () => {
    const result = await profileLs({ profilesDir, activeFile });
    expect(result).toEqual([]);
  });
});

describe("profile show", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;
  let skillsDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-show-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    skillsDir = join(baseDir, "skills");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("shows skills in a profile", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "obra/superpowers", addedAt: "2026-03-03T00:00:00.000Z" },
        { skillName: "debugging", v: 2, source: "obra/superpowers", addedAt: "2026-03-03T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);

    const result = await profileShow("dev", { profilesDir });
    expect(result.name).toBe("dev");
    expect(result.skills.length).toBe(2);
    expect(result.skills[0].skillName).toBe("brainstorming");
  });

  test("throws for nonexistent profile", async () => {
    expect(profileShow("nope", { profilesDir })).rejects.toThrow();
  });
});

describe("profile use", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;
  let skillsDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-use-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    skillsDir = join(baseDir, "skills");
    await mkdir(profilesDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("switches skills directory to match profile", async () => {
    // Set up store with a skill using real hash
    const storePath = join(baseDir, "store");
    const registryPath = join(baseDir, "registry.json");
    const tmpSkill = join(baseDir, "tmp-skill");
    await mkdir(tmpSkill, { recursive: true });
    await writeFile(join(tmpSkill, "SKILL.md"), "---\nname: test-skill\n---\n# Test");
    const skillHash = await hashDirectory(tmpSkill);
    const storeDir = join(storePath, skillHash);
    await mkdir(storeDir, { recursive: true });
    await cpRecursive(tmpSkill, storeDir);

    // Register in registry so profileUse can resolve v -> hash
    await registerSkill("test-skill", skillHash, "test/repo", registryPath, storePath);

    // Create profile referencing that version
    const profile: Profile = {
      name: "myprofile",
      skills: [
        { skillName: "test-skill", v: 1, source: "test/repo", addedAt: "2026-03-03T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "myprofile.json"), profile);

    // Put a pre-existing managed skill in skillsDir (should be removed)
    const oldSkill = join(skillsDir, "old-skill");
    await mkdir(oldSkill, { recursive: true });
    await writeFile(join(oldSkill, "SKILL.md"), "old");
    // store/oldhash needs to exist for registry not to purge it
    await mkdir(join(storePath, "oldhash"), { recursive: true });
    await registerSkill("old-skill", "oldhash", "old/source", registryPath, storePath);

    // Switch to profile
    await profileUse("myprofile", {
      profilesDir,
      activeFile,
      skillsDir,
      storePath,
      registryPath,
    });

    // old-skill should be gone, test-skill should be present
    const entries = await readdir(skillsDir);
    expect(entries).toEqual(["test-skill"]);

    const content = await readFile(join(skillsDir, "test-skill", "SKILL.md"), "utf-8");
    expect(content).toContain("test-skill");

    // Active profile should be updated
    const active = await getActiveProfileName(activeFile);
    expect(active).toBe("myprofile");
  });

  test("registry entries persist after profile switch", async () => {
    const storePath = join(baseDir, "store");
    const registryPath = join(baseDir, "registry.json");

    // Set up store with two skills using real hashes
    const tmpA = join(baseDir, "tmp-a");
    await mkdir(tmpA, { recursive: true });
    await writeFile(join(tmpA, "SKILL.md"), "# Skill A");
    const hashA = await hashDirectory(tmpA);
    await mkdir(join(storePath, hashA), { recursive: true });
    await cpRecursive(tmpA, join(storePath, hashA));

    const tmpB = join(baseDir, "tmp-b");
    await mkdir(tmpB, { recursive: true });
    await writeFile(join(tmpB, "SKILL.md"), "# Skill B");
    const hashB = await hashDirectory(tmpB);
    await mkdir(join(storePath, hashB), { recursive: true });
    await cpRecursive(tmpB, join(storePath, hashB));

    // Register both skills in registry so profileUse can resolve v -> hash
    await registerSkill("skill-a", hashA, "a/repo", registryPath, storePath);
    await registerSkill("skill-b", hashB, "b/repo", registryPath, storePath);

    // Profile alpha has skill-a, profile beta has skill-b
    const alpha: Profile = {
      name: "alpha",
      skills: [{ skillName: "skill-a", v: 1, source: "a/repo", addedAt: "2026-01-01T00:00:00.000Z" }],
    };
    const beta: Profile = {
      name: "beta",
      skills: [{ skillName: "skill-b", v: 1, source: "b/repo", addedAt: "2026-01-01T00:00:00.000Z" }],
    };
    await writeProfile(join(profilesDir, "alpha.json"), alpha);
    await writeProfile(join(profilesDir, "beta.json"), beta);

    // Switch to alpha first
    await profileUse("alpha", {
      profilesDir, activeFile, skillsDir,
      storePath, registryPath,
    });

    // Switch to beta
    await profileUse("beta", {
      profilesDir, activeFile, skillsDir,
      storePath, registryPath,
    });

    // Registry should contain BOTH skills (lockfile behavior)
    const reg = JSON.parse(await readFile(registryPath, "utf-8"));
    expect(reg.skills).toHaveProperty("skill-a");
    expect(reg.skills).toHaveProperty("skill-b");
  });

  test("throws for nonexistent profile", async () => {
    expect(
      profileUse("nope", {
        profilesDir,
        activeFile,
        skillsDir,
        storePath: join(baseDir, "store"),
      })
    ).rejects.toThrow();
  });

  test("warns about missing store entries", async () => {
    // Profile references a version not in registry
    const profile: Profile = {
      name: "broken",
      skills: [
        { skillName: "ghost", v: 99, source: "x/y", addedAt: "2026-03-03T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "broken.json"), profile);

    // Should not throw, but log a warning
    await profileUse("broken", {
      profilesDir,
      activeFile,
      skillsDir,
      storePath: join(baseDir, "store"),
    });

    // Skills dir should be empty (the ghost skill wasn't linked)
    const entries = await readdir(skillsDir);
    expect(entries).toEqual([]);
  });
});

describe("add records to active profile", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "add-profile-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("appends skill to active profile", async () => {
    // Create and activate a profile
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await addSkillToProfile({
      skillName: "brainstorming",
      v: 1,
      source: "obra/superpowers",
      global: true,
      profilesDir,
      activeFile,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("brainstorming");
    expect(updated.skills[0].v).toBe(1);
    expect(updated.skills[0].source).toBe("obra/superpowers");
  });

  test("replaces existing skill with same name", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "old/source", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await addSkillToProfile({
      skillName: "brainstorming",
      v: 2,
      source: "new/source",
      global: true,
      profilesDir,
      activeFile,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].v).toBe(2);
  });

  test("no-op when no active profile", async () => {
    // Should not throw, just skip silently
    await addSkillToProfile({
      skillName: "brainstorming",
      v: 1,
      source: "x/y",
      global: true,
      profilesDir,
      activeFile,
    });
  });
});

describe("add respects profile scope constraint", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "add-scope-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("records to profile when global is true", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await addSkillToProfile({
      skillName: "brainstorming",
      v: 1,
      source: "obra/superpowers",
      global: true,
      profilesDir,
      activeFile,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("brainstorming");
  });

  test("skips profile when global is false (project-level)", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await addSkillToProfile({
      skillName: "local-skill",
      v: 0,
      source: "./local",
      global: false,
      profilesDir,
      activeFile,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(0);
  });
});

describe("rm records to active profile", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "rm-profile-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("removes skill from active profile", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "debugging", v: 2, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await removeSkillFromProfile({
      skillName: "brainstorming",
      global: true,
      profilesDir,
      activeFile,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("debugging");
  });

  test("no-op when no active profile", async () => {
    await removeSkillFromProfile({
      skillName: "brainstorming",
      global: true,
      profilesDir,
      activeFile,
    });
  });
});

describe("rm respects profile scope constraint", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "rm-scope-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("removes from profile when global is true", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await removeSkillFromProfile({
      skillName: "brainstorming",
      global: true,
      profilesDir,
      activeFile,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(0);
  });

  test("skips profile when global is false (project-level)", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await removeSkillFromProfile({
      skillName: "brainstorming",
      global: false,
      profilesDir,
      activeFile,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
  });
});

describe("profile add", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;
  let skillsDir: string;
  let storePath: string;
  let localSkillDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-add-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    skillsDir = join(baseDir, "skills");
    storePath = join(baseDir, "store");
    localSkillDir = join(baseDir, "local-skill");
    await mkdir(profilesDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
    await mkdir(storePath, { recursive: true });

    // Create a local skill source
    await mkdir(localSkillDir, { recursive: true });
    await writeFile(
      join(localSkillDir, "SKILL.md"),
      "---\nname: test-skill\n---\n# Test Skill"
    );
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("adds skill to active profile and links", async () => {
    // Create and activate profile
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileAdd(localSkillDir, {
      profilesDir,
      activeFile,
      skillsDir,
      storePath,
    });

    // Profile should have the skill
    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("test-skill");

    // Skill should be linked
    const entries = await readdir(skillsDir);
    expect(entries).toContain("test-skill");
  });

  test("adds skill to non-active profile without linking", async () => {
    // Create two profiles, activate "dev"
    const devProfile: Profile = { name: "dev", skills: [] };
    const workProfile: Profile = { name: "work", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), devProfile);
    await writeProfile(join(profilesDir, "work.json"), workProfile);
    await setActiveProfileName(activeFile, "dev");

    await profileAdd(localSkillDir, {
      profilesDir,
      activeFile,
      skillsDir,
      storePath,
      profileName: "work",
    });

    // Work profile should have the skill
    const updated = await readProfile(join(profilesDir, "work.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("test-skill");

    // Skill should NOT be linked (work is not active)
    const entries = await readdir(skillsDir);
    expect(entries).not.toContain("test-skill");
  });

  test("replaces existing skill in profile", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "test-skill", v: 0, source: "old", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileAdd(localSkillDir, {
      profilesDir,
      activeFile,
      skillsDir,
      storePath,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].v).toBeGreaterThan(0);
  });

  test("throws when no profile specified and no active profile", async () => {
    expect(
      profileAdd(localSkillDir, {
        profilesDir,
        activeFile,
        skillsDir,
        storePath,
      })
    ).rejects.toThrow(/No active profile/);
  });

  test("throws when target profile does not exist", async () => {
    expect(
      profileAdd(localSkillDir, {
        profilesDir,
        activeFile,
        skillsDir,
        storePath,
        profileName: "nonexistent",
      })
    ).rejects.toThrow();
  });

  test("respects --name override", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileAdd(localSkillDir, {
      profilesDir,
      activeFile,
      skillsDir,
      storePath,
      name: "custom-name",
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills[0].skillName).toBe("custom-name");
  });

  test("adds skill from registry with @latest (default)", async () => {
    const registryPath = join(baseDir, "registry.json");
    // Create two versions with real hashes
    const tmp1 = join(baseDir, "tmp-v1");
    await mkdir(tmp1, { recursive: true });
    await writeFile(join(tmp1, "SKILL.md"), "# v1");
    const hash1 = await hashDirectory(tmp1);
    await mkdir(join(storePath, hash1), { recursive: true });
    await cpRecursive(tmp1, join(storePath, hash1));

    const tmp2 = join(baseDir, "tmp-v2");
    await mkdir(tmp2, { recursive: true });
    await writeFile(join(tmp2, "SKILL.md"), "# v2");
    const hash2 = await hashDirectory(tmp2);
    await mkdir(join(storePath, hash2), { recursive: true });
    await cpRecursive(tmp2, join(storePath, hash2));

    await registerSkill("my-skill", hash1, "owner/repo", registryPath, storePath);
    await registerSkill("my-skill", hash2, "owner/repo", registryPath, storePath);

    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileAdd("my-skill", {
      profilesDir, activeFile, skillsDir, storePath,
      registryPath,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills[0].v).toBe(2); // latest
  });

  test("adds skill from registry with @v1", async () => {
    const registryPath = join(baseDir, "registry.json");
    const tmp1 = join(baseDir, "tmp-v1");
    await mkdir(tmp1, { recursive: true });
    await writeFile(join(tmp1, "SKILL.md"), "# v1");
    const hash1 = await hashDirectory(tmp1);
    await mkdir(join(storePath, hash1), { recursive: true });
    await cpRecursive(tmp1, join(storePath, hash1));

    const tmp2 = join(baseDir, "tmp-v2");
    await mkdir(tmp2, { recursive: true });
    await writeFile(join(tmp2, "SKILL.md"), "# v2");
    const hash2 = await hashDirectory(tmp2);
    await mkdir(join(storePath, hash2), { recursive: true });
    await cpRecursive(tmp2, join(storePath, hash2));

    await registerSkill("my-skill", hash1, "owner/repo", registryPath, storePath);
    await registerSkill("my-skill", hash2, "owner/repo", registryPath, storePath);

    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileAdd("my-skill@v1", {
      profilesDir, activeFile, skillsDir, storePath,
      registryPath,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills[0].v).toBe(1);
  });

  test("adds skill from registry with @previous", async () => {
    const registryPath = join(baseDir, "registry.json");
    const tmp1 = join(baseDir, "tmp-v1");
    await mkdir(tmp1, { recursive: true });
    await writeFile(join(tmp1, "SKILL.md"), "# v1");
    const hash1 = await hashDirectory(tmp1);
    await mkdir(join(storePath, hash1), { recursive: true });
    await cpRecursive(tmp1, join(storePath, hash1));

    const tmp2 = join(baseDir, "tmp-v2");
    await mkdir(tmp2, { recursive: true });
    await writeFile(join(tmp2, "SKILL.md"), "# v2");
    const hash2 = await hashDirectory(tmp2);
    await mkdir(join(storePath, hash2), { recursive: true });
    await cpRecursive(tmp2, join(storePath, hash2));

    await registerSkill("my-skill", hash1, "owner/repo", registryPath, storePath);
    await registerSkill("my-skill", hash2, "owner/repo", registryPath, storePath);

    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileAdd("my-skill@previous", {
      profilesDir, activeFile, skillsDir, storePath,
      registryPath,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills[0].v).toBe(1);
  });
});

describe("profile rm", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;
  let skillsDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-rm-cmd-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    skillsDir = join(baseDir, "skills");
    await mkdir(profilesDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("removes skill from active profile and unlinks", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "debugging", v: 2, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    // Create linked skill on disk
    const skillDir = join(skillsDir, "brainstorming");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# Brainstorming");

    await profileRm("brainstorming", {
      profilesDir,
      activeFile,
      skillsDir,
    });

    // Profile should have only debugging
    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("debugging");

    // Skill should be unlinked
    const entries = await readdir(skillsDir);
    expect(entries).not.toContain("brainstorming");
  });

  test("removes skill from non-active profile without unlinking", async () => {
    const devProfile: Profile = { name: "dev", skills: [] };
    const workProfile: Profile = {
      name: "work",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), devProfile);
    await writeProfile(join(profilesDir, "work.json"), workProfile);
    await setActiveProfileName(activeFile, "dev");

    await profileRm("brainstorming", {
      profilesDir,
      activeFile,
      skillsDir,
      profileName: "work",
    });

    // Work profile should be empty
    const updated = await readProfile(join(profilesDir, "work.json"));
    expect(updated.skills.length).toBe(0);
  });

  test("throws when skill not in profile", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    expect(
      profileRm("nonexistent", {
        profilesDir,
        activeFile,
        skillsDir,
      })
    ).rejects.toThrow(/not found in profile/);
  });

  test("throws when no profile specified and no active profile", async () => {
    expect(
      profileRm("brainstorming", {
        profilesDir,
        activeFile,
        skillsDir,
      })
    ).rejects.toThrow(/No active profile/);
  });

  test("throws when target profile does not exist", async () => {
    expect(
      profileRm("brainstorming", {
        profilesDir,
        activeFile,
        skillsDir,
        profileName: "nonexistent",
      })
    ).rejects.toThrow();
  });

  test("registry entry persists after removing skill from active profile", async () => {
    const storePath = join(baseDir, "store");
    const registryPath = join(baseDir, "registry.json");

    // Set up store
    await mkdir(join(storePath, "abc"), { recursive: true });

    // Register the skill in registry
    await registerSkill("brainstorming", "abc", "x/y", registryPath, storePath);

    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    // Create linked skill on disk
    const skillDir = join(skillsDir, "brainstorming");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# Brainstorming");

    await profileRm("brainstorming", {
      profilesDir, activeFile, skillsDir, registryPath,
    });

    // Registry should still have the entry
    const reg = JSON.parse(await readFile(registryPath, "utf-8"));
    expect(reg.skills).toHaveProperty("brainstorming");
  });

  test("handles skill missing on disk gracefully when active", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "ghost", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    // Skill not on disk — should not throw
    await profileRm("ghost", {
      profilesDir,
      activeFile,
      skillsDir,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(0);
  });
});

describe("profile delete", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-delete-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("deletes profile JSON file", async () => {
    const profile: Profile = { name: "work", skills: [] };
    await writeProfile(join(profilesDir, "work.json"), profile);
    // Set a different profile as active
    await setActiveProfileName(activeFile, "dev");

    await profileDelete("work", { profilesDir, activeFile });

    const names = await readdir(profilesDir);
    expect(names).not.toContain("work.json");
  });

  test("refuses to delete active profile", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    expect(
      profileDelete("dev", { profilesDir, activeFile })
    ).rejects.toThrow(/Cannot delete active profile/);
  });

  test("throws for nonexistent profile", async () => {
    expect(
      profileDelete("nope", { profilesDir, activeFile })
    ).rejects.toThrow();
  });
});

describe("profile rename", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-rename-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("renames profile file and updates name field", async () => {
    const profile: Profile = {
      name: "old",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "old.json"), profile);

    await profileRename("old", "new-name", { profilesDir, activeFile });

    const names = await readdir(profilesDir);
    expect(names).toContain("new-name.json");
    expect(names).not.toContain("old.json");

    const renamed = await readProfile(join(profilesDir, "new-name.json"));
    expect(renamed.name).toBe("new-name");
    expect(renamed.skills.length).toBe(1);
    expect(renamed.skills[0].skillName).toBe("brainstorming");
  });

  test("updates active-profile marker when renaming active profile", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileRename("dev", "development", { profilesDir, activeFile });

    const active = await getActiveProfileName(activeFile);
    expect(active).toBe("development");
  });

  test("does not change active marker when renaming non-active profile", async () => {
    const profile: Profile = { name: "work", skills: [] };
    await writeProfile(join(profilesDir, "work.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileRename("work", "job", { profilesDir, activeFile });

    const active = await getActiveProfileName(activeFile);
    expect(active).toBe("dev");
  });

  test("refuses if target name already exists", async () => {
    await writeProfile(join(profilesDir, "a.json"), { name: "a", skills: [] });
    await writeProfile(join(profilesDir, "b.json"), { name: "b", skills: [] });

    expect(
      profileRename("a", "b", { profilesDir, activeFile })
    ).rejects.toThrow(/already exists/);
  });

  test("throws for nonexistent source profile", async () => {
    expect(
      profileRename("nope", "new", { profilesDir, activeFile })
    ).rejects.toThrow();
  });
});

describe("profile clone", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-clone-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("creates copy with new name and same skills", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "debugging", v: 2, source: "a/b", addedAt: "2026-01-02T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);

    await profileClone("dev", "dev-copy", { profilesDir });

    // Source unchanged
    const source = await readProfile(join(profilesDir, "dev.json"));
    expect(source.name).toBe("dev");
    expect(source.skills.length).toBe(2);

    // Clone has same skills but different name
    const clone = await readProfile(join(profilesDir, "dev-copy.json"));
    expect(clone.name).toBe("dev-copy");
    expect(clone.skills.length).toBe(2);
    expect(clone.skills[0].skillName).toBe("brainstorming");
    expect(clone.skills[0].v).toBe(1);
    expect(clone.skills[1].skillName).toBe("debugging");
  });

  test("does not change active profile", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileClone("dev", "dev-copy", { profilesDir });

    const active = await getActiveProfileName(activeFile);
    expect(active).toBe("dev");
  });

  test("refuses if target already exists", async () => {
    await writeProfile(join(profilesDir, "a.json"), { name: "a", skills: [] });
    await writeProfile(join(profilesDir, "b.json"), { name: "b", skills: [] });

    expect(
      profileClone("a", "b", { profilesDir })
    ).rejects.toThrow(/already exists/);
  });

  test("throws for nonexistent source profile", async () => {
    expect(
      profileClone("nope", "copy", { profilesDir })
    ).rejects.toThrow();
  });
});
