import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, readdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { profileCreate, profileLs, profileShow, profileUse, profileAdd, profileRm } from "../src/commands/profile.js";
import { type Profile, readProfile, writeProfile, getActiveProfileName, setActiveProfileName } from "../src/core/profile.js";
import { addSkillToProfile } from "../src/commands/add.js";
import { removeSkillFromProfile } from "../src/commands/rm.js";
import { registerSkill } from "../src/core/registry.js";

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
        { skillName: "brainstorming", hash: "abc", source: "obra/superpowers", addedAt: "2026-03-03T00:00:00.000Z" },
        { skillName: "debugging", hash: "def", source: "obra/superpowers", addedAt: "2026-03-03T00:00:00.000Z" },
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
    // Set up store with a skill
    const storeDir = join(baseDir, "store", "abc123");
    await mkdir(storeDir, { recursive: true });
    await writeFile(
      join(storeDir, "SKILL.md"),
      "---\nname: test-skill\n---\n# Test"
    );

    // Create profile referencing that hash
    const profile: Profile = {
      name: "myprofile",
      skills: [
        { skillName: "test-skill", hash: "abc123", source: "test/repo", addedAt: "2026-03-03T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "myprofile.json"), profile);

    // Put a pre-existing managed skill in skillsDir (should be removed)
    const oldSkill = join(skillsDir, "old-skill");
    await mkdir(oldSkill, { recursive: true });
    await writeFile(join(oldSkill, "SKILL.md"), "old");
    const registryPath = join(baseDir, "registry.json");
    const storePath = join(baseDir, "store");
    // store/oldhash needs to exist for registry not to purge it
    await mkdir(join(storePath, "oldhash"), { recursive: true });
    await registerSkill("old-skill", "oldhash", "old/source", registryPath, storePath);

    // Switch to profile
    await profileUse("myprofile", {
      profilesDir,
      activeFile,
      skillsDir,
      storePath: join(baseDir, "store"),
      copy: true,
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

    // Set up store with two skills
    await mkdir(join(storePath, "hash-a"), { recursive: true });
    await writeFile(join(storePath, "hash-a", "SKILL.md"), "# Skill A");
    await mkdir(join(storePath, "hash-b"), { recursive: true });
    await writeFile(join(storePath, "hash-b", "SKILL.md"), "# Skill B");

    // Profile alpha has skill-a, profile beta has skill-b
    const alpha: Profile = {
      name: "alpha",
      skills: [{ skillName: "skill-a", hash: "hash-a", source: "a/repo", addedAt: "2026-01-01T00:00:00.000Z" }],
    };
    const beta: Profile = {
      name: "beta",
      skills: [{ skillName: "skill-b", hash: "hash-b", source: "b/repo", addedAt: "2026-01-01T00:00:00.000Z" }],
    };
    await writeProfile(join(profilesDir, "alpha.json"), alpha);
    await writeProfile(join(profilesDir, "beta.json"), beta);

    // Switch to alpha first
    await profileUse("alpha", {
      profilesDir, activeFile, skillsDir,
      storePath, copy: true, registryPath,
    });

    // Switch to beta
    await profileUse("beta", {
      profilesDir, activeFile, skillsDir,
      storePath, copy: true, registryPath,
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
    // Profile references a hash not in store
    const profile: Profile = {
      name: "broken",
      skills: [
        { skillName: "ghost", hash: "nonexistent", source: "x/y", addedAt: "2026-03-03T00:00:00.000Z" },
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
      hash: "abc123",
      source: "obra/superpowers",
      global: true,
      profilesDir,
      activeFile,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("brainstorming");
    expect(updated.skills[0].hash).toBe("abc123");
    expect(updated.skills[0].source).toBe("obra/superpowers");
  });

  test("replaces existing skill with same name", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", hash: "old", source: "old/source", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await addSkillToProfile({
      skillName: "brainstorming",
      hash: "new",
      source: "new/source",
      global: true,
      profilesDir,
      activeFile,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].hash).toBe("new");
  });

  test("no-op when no active profile", async () => {
    // Should not throw, just skip silently
    await addSkillToProfile({
      skillName: "brainstorming",
      hash: "abc",
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
      hash: "abc123",
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
      hash: "xyz789",
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
        { skillName: "brainstorming", hash: "abc", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "debugging", hash: "def", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
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
        { skillName: "brainstorming", hash: "abc", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
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
        { skillName: "brainstorming", hash: "abc", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
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
        { skillName: "test-skill", hash: "old-hash", source: "old", addedAt: "2026-01-01T00:00:00.000Z" },
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
    expect(updated.skills[0].hash).not.toBe("old-hash");
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
        { skillName: "brainstorming", hash: "abc", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "debugging", hash: "def", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
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
        { skillName: "brainstorming", hash: "abc", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
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
        { skillName: "brainstorming", hash: "abc", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
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
        { skillName: "ghost", hash: "abc", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
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
