import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";
import { registerSkill, readRegistry } from "../src/core/registry.js";
import { storeAdopt } from "../src/commands/store-cmd.js";

describe("storeAdopt", () => {
  let baseDir: string;
  let storeDir: string;
  let registryPath: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "store-adopt-"));
    storeDir = join(baseDir, "store");
    registryPath = join(baseDir, "registry.json");
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(storeDir, { recursive: true });
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("returns zero when store is empty", async () => {
    const result = await storeAdopt({ storePath: storeDir, registryPath, profilesDir, activeFile });
    expect(result.adopted).toBe(0);
  });

  test("does not adopt already-registered entries", async () => {
    const sourceDir = join(baseDir, "source");
    await mkdir(sourceDir);
    await writeFile(join(sourceDir, "SKILL.md"), "---\nname: test-skill\ndescription: test\n---\n# Test");
    const hash = await hashDirectory(sourceDir);
    const hashPath = join(storeDir, hash);
    await mkdir(hashPath);
    await cpRecursive(sourceDir, hashPath);
    await registerSkill("test-skill", hash, "local", registryPath, storeDir);

    const result = await storeAdopt({ storePath: storeDir, registryPath, profilesDir, activeFile });
    expect(result.adopted).toBe(0);
  });

  test("adopts orphan entries with valid SKILL.md", async () => {
    const sourceDir = join(baseDir, "source");
    await mkdir(sourceDir);
    await writeFile(
      join(sourceDir, "SKILL.md"),
      "---\nname: orphan-skill\ndescription: An orphan\n---\n# Orphan Skill\n"
    );
    const hash = await hashDirectory(sourceDir);
    const hashPath = join(storeDir, hash);
    await mkdir(hashPath);
    await cpRecursive(sourceDir, hashPath);

    const result = await storeAdopt({ storePath: storeDir, registryPath, profilesDir, activeFile });
    expect(result.adopted).toBe(1);

    const registry = await readRegistry(registryPath);
    expect(registry.skills["orphan-skill"]).toBeDefined();
    expect(registry.skills["orphan-skill"].versions[0].hash).toBe(hash);
  });

  test("skips orphans without valid SKILL.md", async () => {
    const orphanHash = "deadbeef1234567890abcdef";
    await mkdir(join(storeDir, orphanHash));

    const result = await storeAdopt({ storePath: storeDir, registryPath, profilesDir, activeFile });
    expect(result.adopted).toBe(0);
  });
});
