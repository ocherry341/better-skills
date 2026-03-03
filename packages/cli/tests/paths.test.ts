import { describe, test, expect } from "bun:test";
import { getProfilesPath, getProfilePath, getActiveProfileFilePath } from "../src/utils/paths.js";
import { homedir } from "os";
import { join } from "path";

const HOME = homedir();

describe("profile paths", () => {
  test("getProfilesPath returns ~/.better-skills/profiles", () => {
    expect(getProfilesPath()).toBe(join(HOME, ".better-skills", "profiles"));
  });

  test("getProfilePath returns path for a named profile", () => {
    expect(getProfilePath("work")).toBe(
      join(HOME, ".better-skills", "profiles", "work.json")
    );
  });

  test("getActiveProfileFilePath returns ~/.better-skills/active-profile", () => {
    expect(getActiveProfileFilePath()).toBe(
      join(HOME, ".better-skills", "active-profile")
    );
  });
});
