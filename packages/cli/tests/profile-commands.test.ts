import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, readdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { profileCreate, profileLs, profileShow, profileUse } from "../src/commands/profile.js";
import { type Profile, readProfile, writeProfile, getActiveProfileName, setActiveProfileName } from "../src/core/profile.js";

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

    // Put a pre-existing skill in skillsDir (should be removed)
    const oldSkill = join(skillsDir, "old-skill");
    await mkdir(oldSkill, { recursive: true });
    await writeFile(join(oldSkill, "SKILL.md"), "old");

    // Switch to profile
    await profileUse("myprofile", {
      profilesDir,
      activeFile,
      skillsDir,
      storePath: join(baseDir, "store"),
      copy: true,
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
