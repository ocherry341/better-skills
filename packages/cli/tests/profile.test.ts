import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  ProfileSchema,
  type Profile,
  type ProfileSkillEntry,
  readProfile,
  writeProfile,
  getActiveProfileName,
  setActiveProfileName,
  listProfiles,
} from "../src/core/profile.js";

describe("ProfileSchema", () => {
  test("validates a correct profile", () => {
    const data = {
      name: "work",
      skills: [
        {
          skillName: "brainstorming",
          hash: "abc123",
          source: "obra/superpowers",
          addedAt: "2026-03-03T00:00:00.000Z",
        },
      ],
    };
    const result = ProfileSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("rejects profile without name", () => {
    const data = { skills: [] };
    const result = ProfileSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("profile CRUD", () => {
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    const base = await mkdtemp(join(tmpdir(), "profile-test-"));
    profilesDir = join(base, "profiles");
    activeFile = join(base, "active-profile");
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up parent of profilesDir
    await rm(join(profilesDir, ".."), { recursive: true, force: true });
  });

  test("writeProfile + readProfile round-trips", async () => {
    const profile: Profile = {
      name: "test",
      skills: [
        {
          skillName: "foo",
          hash: "aaa",
          source: "owner/repo",
          addedAt: "2026-03-03T00:00:00.000Z",
        },
      ],
    };
    const filePath = join(profilesDir, "test.json");
    await writeProfile(filePath, profile);
    const loaded = await readProfile(filePath);
    expect(loaded).toEqual(profile);
  });

  test("readProfile throws for missing file", async () => {
    const filePath = join(profilesDir, "nonexistent.json");
    expect(readProfile(filePath)).rejects.toThrow();
  });

  test("listProfiles returns profile names", async () => {
    await writeFile(join(profilesDir, "a.json"), "{}");
    await writeFile(join(profilesDir, "b.json"), "{}");
    const names = await listProfiles(profilesDir);
    expect(names.sort()).toEqual(["a", "b"]);
  });

  test("listProfiles returns empty for missing dir", async () => {
    const names = await listProfiles(join(profilesDir, "nope"));
    expect(names).toEqual([]);
  });

  test("setActiveProfileName + getActiveProfileName round-trips", async () => {
    await setActiveProfileName(activeFile, "work");
    const name = await getActiveProfileName(activeFile);
    expect(name).toBe("work");
  });

  test("getActiveProfileName returns null for missing file", async () => {
    const name = await getActiveProfileName(activeFile);
    expect(name).toBeNull();
  });
});
