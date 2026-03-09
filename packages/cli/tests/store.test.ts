import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";

// store.ts uses getStorePath() which reads a global path.
// We test the logic directly instead of importing store.ts.
// This mirrors how migrate.ts inlines the same pattern.

describe("store integrity", () => {
  let baseDir: string;
  let storeDir: string;
  let sourceDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "store-integrity-"));
    storeDir = join(baseDir, "store");
    sourceDir = join(baseDir, "source");
    await mkdir(storeDir, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("verifyStoreEntry returns false for incomplete store", async () => {
    // Create source with two files
    await writeFile(join(sourceDir, "a.txt"), "aaa");
    await writeFile(join(sourceDir, "b.txt"), "bbb");
    const hash = await hashDirectory(sourceDir);

    // Create incomplete store entry (missing b.txt)
    const hashPath = join(storeDir, hash);
    await mkdir(hashPath, { recursive: true });
    await writeFile(join(hashPath, "a.txt"), "aaa");

    // Import after setup to avoid global path issues
    const { verifyStoreEntry } = await import("../src/core/store.js");
    const result = await verifyStoreEntry(hash, storeDir);
    expect(result).toBe(false);
  });

  test("verifyStoreEntry returns true for complete store", async () => {
    await writeFile(join(sourceDir, "a.txt"), "aaa");
    await writeFile(join(sourceDir, "b.txt"), "bbb");
    const hash = await hashDirectory(sourceDir);

    // Create complete store entry
    const hashPath = join(storeDir, hash);
    await mkdir(hashPath, { recursive: true });
    await cpRecursive(sourceDir, hashPath);

    const { verifyStoreEntry } = await import("../src/core/store.js");
    const result = await verifyStoreEntry(hash, storeDir);
    expect(result).toBe(true);
  });

  test("verifyStoreEntry returns false for non-existent store", async () => {
    const { verifyStoreEntry } = await import("../src/core/store.js");
    const result = await verifyStoreEntry("nonexistenthash", storeDir);
    expect(result).toBe(false);
  });
});
