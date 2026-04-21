import { describe, test, expect, beforeEach } from "bun:test";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { cleanTestHome, getProjectSkillsPath, home } from "../src/utils/paths.js";

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
    const originalNodeEnv = process.env.NODE_ENV;
    const originalHome = process.env.HOME;
    const originalCwd = process.cwd();
    const fakeHome = await mkdtemp(join(tmpdir(), "bsk-home-paths-"));

    try {
      process.env.NODE_ENV = "production";
      process.env.HOME = fakeHome;
      process.chdir(fakeHome);

      expect(getProjectSkillsPath()).toBeNull();
    } finally {
      process.chdir(originalCwd);
      process.env.NODE_ENV = originalNodeEnv;
      process.env.HOME = originalHome;
    }
  });
});
