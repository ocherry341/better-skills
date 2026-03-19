import { describe, test, expect, mock } from "bun:test";
import { homedir } from "os";
import { join } from "path";

const HOME = homedir();

// Override any leaked mock.module from other test files (e.g. rm-throw.test.ts)
// by re-pointing the .js mock back to the real implementation.
const real = await import("../src/utils/paths.ts");
mock.module("../src/utils/paths.js", () => real);

const { getProfilesPath, getProfilePath, getActiveProfileFilePath } = real;

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
