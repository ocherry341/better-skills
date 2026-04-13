import { describe, test, expect, beforeEach } from "bun:test";
import { writeFile, mkdir, rm } from "fs/promises";
import {
  ProfileSchema,
  type Profile,
  readProfile,
  writeProfile,
  getActiveProfileName,
  setActiveProfileName,
  listProfiles,
} from "../src/core/profile.js";
import {
  cleanTestHome,
  getProfilesPath,
  getProfilePath,
} from "../src/utils/paths.js";

describe("ProfileSchema", () => {
  test("validates a correct profile", () => {
    const data = {
      name: "work",
      skills: [
        {
          skillName: "brainstorming",
          v: 1,
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
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("writeProfile + readProfile round-trips", async () => {
    const profile: Profile = {
      name: "test",
      skills: [
        {
          skillName: "foo",
          v: 1,
          source: "owner/repo",
          addedAt: "2026-03-03T00:00:00.000Z",
        },
      ],
    };
    await writeProfile(getProfilePath("test"), profile);
    const loaded = await readProfile(getProfilePath("test"));
    expect(loaded).toEqual(profile);
  });

  test("readProfile throws for missing file", async () => {
    expect(readProfile(getProfilePath("nonexistent"))).rejects.toThrow();
  });

  test("listProfiles returns profile names", async () => {
    await writeFile(getProfilePath("a"), "{}");
    await writeFile(getProfilePath("b"), "{}");
    const names = await listProfiles();
    expect(names.sort()).toEqual(["a", "b"]);
  });

  test("listProfiles returns empty for missing dir", async () => {
    await rm(getProfilesPath(), { recursive: true, force: true });
    const names = await listProfiles();
    expect(names).toEqual([]);
  });

  test("setActiveProfileName + getActiveProfileName round-trips", async () => {
    await setActiveProfileName("work");
    const name = await getActiveProfileName();
    expect(name).toBe("work");
  });

  test("getActiveProfileName returns null for missing file", async () => {
    const name = await getActiveProfileName();
    expect(name).toBeNull();
  });
});
