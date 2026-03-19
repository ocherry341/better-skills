import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm as fsRm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { mock } from "bun:test";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "bsk-rm-"));
  // Create the skills dir so stat() can reach it
  await mkdir(join(tmp, "skills"), { recursive: true });
});

afterEach(async () => {
  await fsRm(tmp, { recursive: true, force: true });
});

// Mock paths so rm() doesn't touch real home
mock.module("../src/utils/paths.js", () => ({
  getSkillsPath: (global: boolean) => global ? join(tmp, "skills") : join(tmp, "project-skills"),
  getGlobalSkillsPath: () => join(tmp, "skills"),
  getProjectSkillsPath: () => join(tmp, "project-skills"),
  getRegistryPath: () => join(tmp, "registry.json"),
  getStorePath: () => join(tmp, "store"),
  getProfilesPath: () => join(tmp, "profiles"),
  getProfilePath: (name: string) => join(tmp, "profiles", name),
  getActiveProfileFilePath: () => join(tmp, "active-profile"),
  getConfigPath: () => join(tmp, "config.json"),
  getTempPath: () => join(tmp, "temp"),
  resolveAbsolute: (p: string) => p,
}));

describe("rm", () => {
  test("throws when skill not found instead of calling process.exit", async () => {
    const { rm } = await import("../src/commands/rm.js");
    await expect(
      rm("nonexistent-skill", { global: true })
    ).rejects.toThrow();
  });
});
