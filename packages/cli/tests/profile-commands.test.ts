import { describe, test, expect, beforeEach } from "bun:test";
import { mkdir, readdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { profileCreate, profileLs, profileShow, profileUse, profileAdd, profileRm, profileDelete, profileRename, profileClone } from "../src/commands/profile.js";
import { type Profile, readProfile, writeProfile, getActiveProfileName, setActiveProfileName } from "../src/core/profile.js";
import { addSkillToProfile } from "../src/commands/add.js";
import { removeSkillFromProfile } from "../src/commands/rm.js";
import { registerSkill } from "../src/core/registry.js";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";
import { cleanTestHome, getProfilesPath, getGlobalSkillsPath, getStorePath, getRegistryPath, getProfilePath, home } from "../src/utils/paths.js";

describe("profile create", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("creates an empty profile and sets it active", async () => {
    await profileCreate("work", {});

    const profile = await readProfile(getProfilePath("work"));
    expect(profile.name).toBe("work");
    expect(profile.skills).toEqual([]);

    const active = await getActiveProfileName();
    expect(active).toBe("work");
  });

  test("creates profile from existing skills directory", async () => {
    // Set up a skills dir with one skill that has a SKILL.md
    const skillDir = join(getGlobalSkillsPath(), "brainstorming");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: brainstorming\n---\n# Brainstorming"
    );

    await profileCreate("from-existing", { fromExisting: true });

    const profile = await readProfile(getProfilePath("from-existing"));
    expect(profile.name).toBe("from-existing");
    expect(profile.skills.length).toBe(1);
    expect(profile.skills[0].skillName).toBe("brainstorming");
  });

  test("throws if profile already exists", async () => {
    await profileCreate("dup", {});
    expect(
      profileCreate("dup", {})
    ).rejects.toThrow(/already exists/);
  });
});

describe("profile ls", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("lists profiles and marks active", async () => {
    await profileCreate("alpha", {});
    await profileCreate("beta", {});
    // beta is now active (last created)

    const result = await profileLs();
    expect(result).toEqual([
      { name: "alpha", active: false },
      { name: "beta", active: true },
    ]);
  });

  test("returns empty when no profiles", async () => {
    const result = await profileLs();
    expect(result).toEqual([]);
  });
});

describe("profile show", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("shows skills in a profile", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "obra/superpowers", addedAt: "2026-03-03T00:00:00.000Z" },
        { skillName: "debugging", v: 2, source: "obra/superpowers", addedAt: "2026-03-03T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("dev"), profile);

    const result = await profileShow("dev");
    expect(result.name).toBe("dev");
    expect(result.skills.length).toBe(2);
    expect(result.skills[0].skillName).toBe("brainstorming");
  });

  test("throws for nonexistent profile", async () => {
    expect(profileShow("nope")).rejects.toThrow();
  });
});

describe("profile use", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
    await mkdir(getGlobalSkillsPath(), { recursive: true });
  });

  test("switches skills directory to match profile", async () => {
    // Set up store with a skill using real hash
    const tmpSkill = join(home(), "tmp-skill");
    await mkdir(tmpSkill, { recursive: true });
    await writeFile(join(tmpSkill, "SKILL.md"), "---\nname: test-skill\n---\n# Test");
    const skillHash = await hashDirectory(tmpSkill);
    const storeDir = join(getStorePath(), skillHash);
    await mkdir(storeDir, { recursive: true });
    await cpRecursive(tmpSkill, storeDir);

    // Register in registry so profileUse can resolve v -> hash
    await registerSkill("test-skill", skillHash, "test/repo");

    // Create profile referencing that version
    const profile: Profile = {
      name: "myprofile",
      skills: [
        { skillName: "test-skill", v: 1, source: "test/repo", addedAt: "2026-03-03T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("myprofile"), profile);

    // Put a pre-existing managed skill in skillsDir (should be removed)
    const oldSkill = join(getGlobalSkillsPath(), "old-skill");
    await mkdir(oldSkill, { recursive: true });
    await writeFile(join(oldSkill, "SKILL.md"), "old");
    // store/oldhash needs to exist for registry not to purge it
    await mkdir(join(getStorePath(), "oldhash"), { recursive: true });
    await registerSkill("old-skill", "oldhash", "old/source");

    // Switch to profile
    await profileUse("myprofile", {});

    // old-skill should be gone, test-skill should be present
    const entries = await readdir(getGlobalSkillsPath());
    expect(entries).toEqual(["test-skill"]);

    const content = await readFile(join(getGlobalSkillsPath(), "test-skill", "SKILL.md"), "utf-8");
    expect(content).toContain("test-skill");

    // Active profile should be updated
    const active = await getActiveProfileName();
    expect(active).toBe("myprofile");
  });

  test("registry entries persist after profile switch", async () => {
    // Set up store with two skills using real hashes
    const tmpA = join(home(), "tmp-a");
    await mkdir(tmpA, { recursive: true });
    await writeFile(join(tmpA, "SKILL.md"), "# Skill A");
    const hashA = await hashDirectory(tmpA);
    await mkdir(join(getStorePath(), hashA), { recursive: true });
    await cpRecursive(tmpA, join(getStorePath(), hashA));

    const tmpB = join(home(), "tmp-b");
    await mkdir(tmpB, { recursive: true });
    await writeFile(join(tmpB, "SKILL.md"), "# Skill B");
    const hashB = await hashDirectory(tmpB);
    await mkdir(join(getStorePath(), hashB), { recursive: true });
    await cpRecursive(tmpB, join(getStorePath(), hashB));

    // Register both skills in registry so profileUse can resolve v -> hash
    await registerSkill("skill-a", hashA, "a/repo");
    await registerSkill("skill-b", hashB, "b/repo");

    // Profile alpha has skill-a, profile beta has skill-b
    const alpha: Profile = {
      name: "alpha",
      skills: [{ skillName: "skill-a", v: 1, source: "a/repo", addedAt: "2026-01-01T00:00:00.000Z" }],
    };
    const beta: Profile = {
      name: "beta",
      skills: [{ skillName: "skill-b", v: 1, source: "b/repo", addedAt: "2026-01-01T00:00:00.000Z" }],
    };
    await writeProfile(getProfilePath("alpha"), alpha);
    await writeProfile(getProfilePath("beta"), beta);

    // Switch to alpha first
    await profileUse("alpha", {});

    // Switch to beta
    await profileUse("beta", {});

    // Registry should contain BOTH skills (lockfile behavior)
    const reg = JSON.parse(await readFile(getRegistryPath(), "utf-8"));
    expect(reg.skills).toHaveProperty("skill-a");
    expect(reg.skills).toHaveProperty("skill-b");
  });

  test("throws for nonexistent profile", async () => {
    expect(
      profileUse("nope", {})
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
    await writeProfile(getProfilePath("broken"), profile);

    // Should not throw, but log a warning
    await profileUse("broken", {});

    // Skills dir should be empty (the ghost skill wasn't linked)
    const entries = await readdir(getGlobalSkillsPath());
    expect(entries).toEqual([]);
  });
});

describe("add records to active profile", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("appends skill to active profile", async () => {
    // Create and activate a profile
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await addSkillToProfile({
      skillName: "brainstorming",
      v: 1,
      source: "obra/superpowers",
      global: true,
    });

    const updated = await readProfile(getProfilePath("dev"));
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
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await addSkillToProfile({
      skillName: "brainstorming",
      v: 2,
      source: "new/source",
      global: true,
    });

    const updated = await readProfile(getProfilePath("dev"));
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
    });
  });
});

describe("add respects profile scope constraint", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("records to profile when global is true", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await addSkillToProfile({
      skillName: "brainstorming",
      v: 1,
      source: "obra/superpowers",
      global: true,
    });

    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("brainstorming");
  });

  test("skips profile when global is false (project-level)", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await addSkillToProfile({
      skillName: "local-skill",
      v: 0,
      source: "./local",
      global: false,
    });

    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills.length).toBe(0);
  });
});

describe("rm records to active profile", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("removes skill from active profile", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "debugging", v: 2, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await removeSkillFromProfile({
      skillName: "brainstorming",
      global: true,
    });

    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("debugging");
  });

  test("no-op when no active profile", async () => {
    await removeSkillFromProfile({
      skillName: "brainstorming",
      global: true,
    });
  });
});

describe("rm respects profile scope constraint", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("removes from profile when global is true", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await removeSkillFromProfile({
      skillName: "brainstorming",
      global: true,
    });

    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills.length).toBe(0);
  });

  test("skips profile when global is false (project-level)", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await removeSkillFromProfile({
      skillName: "brainstorming",
      global: false,
    });

    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills.length).toBe(1);
  });
});

describe("profile add", () => {
  let localSkillDir: string;

  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
    await mkdir(getGlobalSkillsPath(), { recursive: true });
    await mkdir(getStorePath(), { recursive: true });

    // Create a local skill source
    localSkillDir = join(home(), "local-skill");
    await mkdir(localSkillDir, { recursive: true });
    await writeFile(
      join(localSkillDir, "SKILL.md"),
      "---\nname: test-skill\n---\n# Test Skill"
    );
  });

  test("adds skill to active profile and links", async () => {
    // Create and activate profile
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await profileAdd(localSkillDir, {});

    // Profile should have the skill
    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("test-skill");

    // Skill should be linked
    const entries = await readdir(getGlobalSkillsPath());
    expect(entries).toContain("test-skill");
  });

  test("adds skill to non-active profile without linking", async () => {
    // Create two profiles, activate "dev"
    const devProfile: Profile = { name: "dev", skills: [] };
    const workProfile: Profile = { name: "work", skills: [] };
    await writeProfile(getProfilePath("dev"), devProfile);
    await writeProfile(getProfilePath("work"), workProfile);
    await setActiveProfileName("dev");

    await profileAdd(localSkillDir, { profileName: "work" });

    // Work profile should have the skill
    const updated = await readProfile(getProfilePath("work"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("test-skill");

    // Skill should NOT be linked (work is not active)
    const entries = await readdir(getGlobalSkillsPath());
    expect(entries).not.toContain("test-skill");
  });

  test("replaces existing skill in profile", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "test-skill", v: 0, source: "old", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await profileAdd(localSkillDir, {});

    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].v).toBeGreaterThan(0);
  });

  test("throws when no profile specified and no active profile", async () => {
    expect(
      profileAdd(localSkillDir, {})
    ).rejects.toThrow(/No active profile/);
  });

  test("throws when target profile does not exist", async () => {
    expect(
      profileAdd(localSkillDir, { profileName: "nonexistent" })
    ).rejects.toThrow();
  });

  test("respects --name override", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await profileAdd(localSkillDir, { name: "custom-name" });

    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills[0].skillName).toBe("custom-name");
  });

  test("adds skill from registry with @latest (default)", async () => {
    // Create two versions with real hashes
    const tmp1 = join(home(), "tmp-v1");
    await mkdir(tmp1, { recursive: true });
    await writeFile(join(tmp1, "SKILL.md"), "# v1");
    const hash1 = await hashDirectory(tmp1);
    await mkdir(join(getStorePath(), hash1), { recursive: true });
    await cpRecursive(tmp1, join(getStorePath(), hash1));

    const tmp2 = join(home(), "tmp-v2");
    await mkdir(tmp2, { recursive: true });
    await writeFile(join(tmp2, "SKILL.md"), "# v2");
    const hash2 = await hashDirectory(tmp2);
    await mkdir(join(getStorePath(), hash2), { recursive: true });
    await cpRecursive(tmp2, join(getStorePath(), hash2));

    await registerSkill("my-skill", hash1, "owner/repo");
    await registerSkill("my-skill", hash2, "owner/repo");

    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await profileAdd("my-skill", {});

    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills[0].v).toBe(2); // latest
  });

  test("adds skill from registry with @v1", async () => {
    const tmp1 = join(home(), "tmp-v1");
    await mkdir(tmp1, { recursive: true });
    await writeFile(join(tmp1, "SKILL.md"), "# v1");
    const hash1 = await hashDirectory(tmp1);
    await mkdir(join(getStorePath(), hash1), { recursive: true });
    await cpRecursive(tmp1, join(getStorePath(), hash1));

    const tmp2 = join(home(), "tmp-v2");
    await mkdir(tmp2, { recursive: true });
    await writeFile(join(tmp2, "SKILL.md"), "# v2");
    const hash2 = await hashDirectory(tmp2);
    await mkdir(join(getStorePath(), hash2), { recursive: true });
    await cpRecursive(tmp2, join(getStorePath(), hash2));

    await registerSkill("my-skill", hash1, "owner/repo");
    await registerSkill("my-skill", hash2, "owner/repo");

    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await profileAdd("my-skill@v1", {});

    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills[0].v).toBe(1);
  });

  test("adds skill from registry with @previous", async () => {
    const tmp1 = join(home(), "tmp-v1");
    await mkdir(tmp1, { recursive: true });
    await writeFile(join(tmp1, "SKILL.md"), "# v1");
    const hash1 = await hashDirectory(tmp1);
    await mkdir(join(getStorePath(), hash1), { recursive: true });
    await cpRecursive(tmp1, join(getStorePath(), hash1));

    const tmp2 = join(home(), "tmp-v2");
    await mkdir(tmp2, { recursive: true });
    await writeFile(join(tmp2, "SKILL.md"), "# v2");
    const hash2 = await hashDirectory(tmp2);
    await mkdir(join(getStorePath(), hash2), { recursive: true });
    await cpRecursive(tmp2, join(getStorePath(), hash2));

    await registerSkill("my-skill", hash1, "owner/repo");
    await registerSkill("my-skill", hash2, "owner/repo");

    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await profileAdd("my-skill@previous", {});

    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills[0].v).toBe(1);
  });
});

describe("profile rm", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
    await mkdir(getGlobalSkillsPath(), { recursive: true });
  });

  test("removes skill from active profile and unlinks", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "debugging", v: 2, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    // Create linked skill on disk
    const skillDir = join(getGlobalSkillsPath(), "brainstorming");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# Brainstorming");

    await profileRm("brainstorming", {});

    // Profile should have only debugging
    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("debugging");

    // Skill should be unlinked
    const entries = await readdir(getGlobalSkillsPath());
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
    await writeProfile(getProfilePath("dev"), devProfile);
    await writeProfile(getProfilePath("work"), workProfile);
    await setActiveProfileName("dev");

    await profileRm("brainstorming", { profileName: "work" });

    // Work profile should be empty
    const updated = await readProfile(getProfilePath("work"));
    expect(updated.skills.length).toBe(0);
  });

  test("throws when skill not in profile", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    expect(
      profileRm("nonexistent", {})
    ).rejects.toThrow(/not found in profile/);
  });

  test("throws when no profile specified and no active profile", async () => {
    expect(
      profileRm("brainstorming", {})
    ).rejects.toThrow(/No active profile/);
  });

  test("throws when target profile does not exist", async () => {
    expect(
      profileRm("brainstorming", { profileName: "nonexistent" })
    ).rejects.toThrow();
  });

  test("registry entry persists after removing skill from active profile", async () => {
    // Set up store
    await mkdir(join(getStorePath(), "abc"), { recursive: true });

    // Register the skill in registry
    await registerSkill("brainstorming", "abc", "x/y");

    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    // Create linked skill on disk
    const skillDir = join(getGlobalSkillsPath(), "brainstorming");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# Brainstorming");

    await profileRm("brainstorming", {});

    // Registry should still have the entry
    const reg = JSON.parse(await readFile(getRegistryPath(), "utf-8"));
    expect(reg.skills).toHaveProperty("brainstorming");
  });

  test("handles skill missing on disk gracefully when active", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "ghost", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    // Skill not on disk — should not throw
    await profileRm("ghost", {});

    const updated = await readProfile(getProfilePath("dev"));
    expect(updated.skills.length).toBe(0);
  });
});

describe("profile delete", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("deletes profile JSON file", async () => {
    const profile: Profile = { name: "work", skills: [] };
    await writeProfile(getProfilePath("work"), profile);
    // Set a different profile as active
    await setActiveProfileName("dev");

    await profileDelete("work");

    const names = await readdir(getProfilesPath());
    expect(names).not.toContain("work.json");
  });

  test("refuses to delete active profile", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    expect(
      profileDelete("dev")
    ).rejects.toThrow(/Cannot delete active profile/);
  });

  test("throws for nonexistent profile", async () => {
    expect(
      profileDelete("nope")
    ).rejects.toThrow();
  });
});

describe("profile rename", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("renames profile file and updates name field", async () => {
    const profile: Profile = {
      name: "old",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("old"), profile);

    await profileRename("old", "new-name");

    const names = await readdir(getProfilesPath());
    expect(names).toContain("new-name.json");
    expect(names).not.toContain("old.json");

    const renamed = await readProfile(getProfilePath("new-name"));
    expect(renamed.name).toBe("new-name");
    expect(renamed.skills.length).toBe(1);
    expect(renamed.skills[0].skillName).toBe("brainstorming");
  });

  test("updates active-profile marker when renaming active profile", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await profileRename("dev", "development");

    const active = await getActiveProfileName();
    expect(active).toBe("development");
  });

  test("does not change active marker when renaming non-active profile", async () => {
    const profile: Profile = { name: "work", skills: [] };
    await writeProfile(getProfilePath("work"), profile);
    await setActiveProfileName("dev");

    await profileRename("work", "job");

    const active = await getActiveProfileName();
    expect(active).toBe("dev");
  });

  test("refuses if target name already exists", async () => {
    await writeProfile(getProfilePath("a"), { name: "a", skills: [] });
    await writeProfile(getProfilePath("b"), { name: "b", skills: [] });

    expect(
      profileRename("a", "b")
    ).rejects.toThrow(/already exists/);
  });

  test("throws for nonexistent source profile", async () => {
    expect(
      profileRename("nope", "new")
    ).rejects.toThrow();
  });
});

describe("profile clone", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("creates copy with new name and same skills", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", v: 1, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "debugging", v: 2, source: "a/b", addedAt: "2026-01-02T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("dev"), profile);

    await profileClone("dev", "dev-copy");

    // Source unchanged
    const source = await readProfile(getProfilePath("dev"));
    expect(source.name).toBe("dev");
    expect(source.skills.length).toBe(2);

    // Clone has same skills but different name
    const clone = await readProfile(getProfilePath("dev-copy"));
    expect(clone.name).toBe("dev-copy");
    expect(clone.skills.length).toBe(2);
    expect(clone.skills[0].skillName).toBe("brainstorming");
    expect(clone.skills[0].v).toBe(1);
    expect(clone.skills[1].skillName).toBe("debugging");
  });

  test("does not change active profile", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(getProfilePath("dev"), profile);
    await setActiveProfileName("dev");

    await profileClone("dev", "dev-copy");

    const active = await getActiveProfileName();
    expect(active).toBe("dev");
  });

  test("refuses if target already exists", async () => {
    await writeProfile(getProfilePath("a"), { name: "a", skills: [] });
    await writeProfile(getProfilePath("b"), { name: "b", skills: [] });

    expect(
      profileClone("a", "b")
    ).rejects.toThrow(/already exists/);
  });

  test("throws for nonexistent source profile", async () => {
    expect(
      profileClone("nope", "copy")
    ).rejects.toThrow();
  });
});
