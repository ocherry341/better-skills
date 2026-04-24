import { describe, test, expect, beforeEach } from "bun:test";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { cleanTestHome, getProjectSkillsPath, getProjectSkillsPathFor, home } from "../src/utils/paths.js";

describe("paths", () => {
  beforeEach(async () => {
    await cleanTestHome();
  });

  test("test-mode interception still wins when cwd is home", async () => {
    const originalCwd = process.cwd();

    try {
      process.chdir(home());
      expect(getProjectSkillsPath()).toBe(join(home(), "project", ".agents", "skills"));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test("returns null outside test mode when cwd is home", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "bsk-home-paths-"));

    expect(getProjectSkillsPathFor({ nodeEnv: "production", homeDir: fakeHome, cwd: fakeHome })).toBeNull();
  });

  test("returns project skills path outside test mode when cwd is not home", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "bsk-home-paths-"));
    const projectRoot = join(fakeHome, "work", "repo");

    expect(getProjectSkillsPathFor({ nodeEnv: "production", homeDir: fakeHome, cwd: projectRoot })).toBe(
      join(projectRoot, ".agents", "skills")
    );
  });
});
