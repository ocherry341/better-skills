import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";
import { registerSkill } from "../src/core/registry.js";
import { storePrune } from "../src/commands/store-cmd.js";

describe("storePrune", () => {
  let baseDir: string;
  let storeDir: string;
  let registryPath: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "store-prune-"));
    storeDir = join(baseDir, "store");
    registryPath = join(baseDir, "registry.json");
    await mkdir(storeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("returns zero when store is empty", async () => {
    const result = await storePrune({ storePath: storeDir, registryPath });
    expect(result.pruned).toBe(0);
    expect(result.prunedHashes).toHaveLength(0);
  });

  test("does not prune registered entries", async () => {
    const sourceDir = join(baseDir, "source");
    await mkdir(sourceDir);
    await writeFile(join(sourceDir, "SKILL.md"), "# Test");
    const hash = await hashDirectory(sourceDir);
    const hashPath = join(storeDir, hash);
    await mkdir(hashPath);
    await cpRecursive(sourceDir, hashPath);
    await registerSkill("test-skill", hash, "local", registryPath, storeDir);

    const result = await storePrune({ storePath: storeDir, registryPath });
    expect(result.pruned).toBe(0);

    const remaining = await readdir(storeDir);
    expect(remaining).toContain(hash);
  });

  test("prunes orphan entries", async () => {
    const orphanHash = "deadbeef1234567890abcdef";
    await mkdir(join(storeDir, orphanHash));
    await writeFile(join(storeDir, orphanHash, "SKILL.md"), "# Orphan");

    const result = await storePrune({ storePath: storeDir, registryPath });
    expect(result.pruned).toBe(1);
    expect(result.prunedHashes).toEqual([orphanHash]);

    const remaining = await readdir(storeDir);
    expect(remaining).toHaveLength(0);
  });

  test("prunes only orphans, keeps registered entries", async () => {
    const sourceDir = join(baseDir, "source");
    await mkdir(sourceDir);
    await writeFile(join(sourceDir, "SKILL.md"), "# Registered");
    const hash = await hashDirectory(sourceDir);
    const hashPath = join(storeDir, hash);
    await mkdir(hashPath);
    await cpRecursive(sourceDir, hashPath);
    await registerSkill("registered", hash, "local", registryPath, storeDir);

    const orphanHash = "orphan1234567890abcdef00";
    await mkdir(join(storeDir, orphanHash));

    const result = await storePrune({ storePath: storeDir, registryPath });
    expect(result.pruned).toBe(1);
    expect(result.prunedHashes).toEqual([orphanHash]);

    const remaining = await readdir(storeDir);
    expect(remaining).toEqual([hash]);
  });
});
