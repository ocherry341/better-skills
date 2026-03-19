import { describe, test, expect } from "bun:test";
import { homedir } from "os";
import { join } from "path";

const HOME = homedir();

// Import the real source file directly to avoid mock.module pollution from other test files.
// Bun's mock.module is process-global, so importing via the .ts source path
// sidesteps any mocks registered against the .js path.
const { getProfilesPath, getProfilePath, getActiveProfileFilePath } =
  await import("../src/utils/paths.ts");

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
