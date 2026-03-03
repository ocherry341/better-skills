import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, readdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { profileCreate, profileLs, profileShow } from "../src/commands/profile.js";
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
