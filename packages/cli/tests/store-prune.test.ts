import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";
import { registerSkill } from "../src/core/registry.js";
import { storePrune } from "../src/commands/store-cmd.js";

describe("bsk store prune", () => {
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

  test("does not prune referenced entries", async () => {
    const sourceDir = join(baseDir, "source");
    await mkdir(sourceDir);
    await writeFile(join(sourceDir, "SKILL.md"), "# Test");
    const hash = await hashDirectory(sourceDir);
    const hashPath = join(storeDir, hash);
    await mkdir(hashPath);
    await cpRecursive(sourceDir, hashPath);
    await registerSkill("test-skill", hash, "owner/repo", registryPath, storeDir);

    const result = await storePrune({ storePath: storeDir, registryPath });
    expect(result.pruned).toBe(0);
    expect(result.prunedHashes).toHaveLength(0);
    // Entry should still exist
    const remaining = await readdir(storeDir);
    expect(remaining).toContain(hash);
  });

  test("prunes orphan entries not in registry", async () => {
    const orphanHash = "deadbeef1234567890abcdef";
    await mkdir(join(storeDir, orphanHash));

    const result = await storePrune({ storePath: storeDir, registryPath });
    expect(result.pruned).toBe(1);
    expect(result.prunedHashes).toEqual([orphanHash]);
    // Entry should be removed
    const remaining = await readdir(storeDir);
    expect(remaining).not.toContain(orphanHash);
  });

  test("prunes only orphans, keeps referenced entries (mixed)", async () => {
    // Create a referenced entry
    const sourceDir = join(baseDir, "source");
    await mkdir(sourceDir);
    await writeFile(join(sourceDir, "SKILL.md"), "# Test");
    const hash = await hashDirectory(sourceDir);
    const hashPath = join(storeDir, hash);
    await mkdir(hashPath);
    await cpRecursive(sourceDir, hashPath);
    await registerSkill("test-skill", hash, "owner/repo", registryPath, storeDir);

    // Create an orphan entry
    const orphanHash = "deadbeef1234567890abcdef";
    await mkdir(join(storeDir, orphanHash));

    const result = await storePrune({ storePath: storeDir, registryPath });
    expect(result.pruned).toBe(1);
    expect(result.prunedHashes).toEqual([orphanHash]);
    // Referenced entry should still exist
    const remaining = await readdir(storeDir);
    expect(remaining).toContain(hash);
    expect(remaining).not.toContain(orphanHash);
  });

  test("prunes multiple orphans", async () => {
    const orphan1 = "aaaa1111bbbb2222cccc3333";
    const orphan2 = "dddd4444eeee5555ffff6666";
    const orphan3 = "1111aaaa2222bbbb3333cccc";
    await mkdir(join(storeDir, orphan1));
    await mkdir(join(storeDir, orphan2));
    await mkdir(join(storeDir, orphan3));

    const result = await storePrune({ storePath: storeDir, registryPath });
    expect(result.pruned).toBe(3);
    expect(result.prunedHashes.sort()).toEqual([orphan1, orphan2, orphan3].sort());
    const remaining = await readdir(storeDir);
    expect(remaining).toHaveLength(0);
  });
});
