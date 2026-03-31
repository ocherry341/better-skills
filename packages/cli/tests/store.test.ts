import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";

// store.ts uses getStorePath() which reads a global path.
// We test the logic directly instead of importing store.ts.

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

  test("verifiedLinkSkill succeeds when store entry is valid", async () => {
    await writeFile(join(sourceDir, "a.txt"), "aaa");
    const hash = await hashDirectory(sourceDir);

    const hashPath = join(storeDir, hash);
    await mkdir(hashPath, { recursive: true });
    await cpRecursive(sourceDir, hashPath);

    const targetDir = join(baseDir, "target");
    const { verifiedLinkSkill } = await import("../src/core/store.js");
    await verifiedLinkSkill(hash, targetDir, {}, storeDir);

    const content = await readFile(join(targetDir, "a.txt"), "utf-8");
    expect(content).toBe("aaa");
  });

  test("remove deletes hash directory from custom storePath", async () => {
    const hashDir = join(storeDir, "deadbeef");
    await mkdir(hashDir, { recursive: true });
    await writeFile(join(hashDir, "file.txt"), "data");

    const { remove } = await import("../src/core/store.js");
    await remove("deadbeef", storeDir);

    const entries = await readdir(storeDir);
    expect(entries).not.toContain("deadbeef");
  });

  test("verifiedLinkSkill throws when store entry is corrupted", async () => {
    await writeFile(join(sourceDir, "a.txt"), "aaa");
    const hash = await hashDirectory(sourceDir);

    const hashPath = join(storeDir, hash);
    await mkdir(hashPath, { recursive: true });
    await writeFile(join(hashPath, "a.txt"), "CORRUPTED");

    const targetDir = join(baseDir, "target");
    const { verifiedLinkSkill } = await import("../src/core/store.js");
    await expect(verifiedLinkSkill(hash, targetDir, {}, storeDir)).rejects.toThrow(/corrupted/i);
  });
});

describe("store metadata (.bsk-meta.json)", () => {
  let baseDir: string;
  let storeDir: string;
  let sourceDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "store-meta-"));
    storeDir = join(baseDir, "store");
    sourceDir = join(baseDir, "source");
    await mkdir(storeDir, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("store() writes .bsk-meta.json with valid storedAt ISO string", async () => {
    await writeFile(join(sourceDir, "SKILL.md"), "---\nname: test\n---\n# Test");
    const hash = await hashDirectory(sourceDir);

    const { store } = await import("../src/core/store.js");
    const dest = await store(hash, sourceDir, storeDir);

    const metaRaw = await readFile(join(dest, ".bsk-meta.json"), "utf-8");
    const meta = JSON.parse(metaRaw);
    expect(meta.storedAt).toBeDefined();
    expect(new Date(meta.storedAt).toISOString()).toBe(meta.storedAt);
  });

  test("store() does NOT overwrite .bsk-meta.json on existing verified entry", async () => {
    await writeFile(join(sourceDir, "SKILL.md"), "---\nname: test\n---\n# Test");
    const hash = await hashDirectory(sourceDir);

    const { store } = await import("../src/core/store.js");

    await store(hash, sourceDir, storeDir);
    const meta1Raw = await readFile(join(storeDir, hash, ".bsk-meta.json"), "utf-8");
    const meta1 = JSON.parse(meta1Raw);

    await new Promise((r) => setTimeout(r, 10));

    await store(hash, sourceDir, storeDir);
    const meta2Raw = await readFile(join(storeDir, hash, ".bsk-meta.json"), "utf-8");
    const meta2 = JSON.parse(meta2Raw);

    expect(meta2.storedAt).toBe(meta1.storedAt);
  });

  test("readStoreMeta() returns metadata for entries with .bsk-meta.json", async () => {
    await writeFile(join(sourceDir, "SKILL.md"), "---\nname: test\n---\n# Test");
    const hash = await hashDirectory(sourceDir);

    const { store, readStoreMeta } = await import("../src/core/store.js");
    await store(hash, sourceDir, storeDir);

    const meta = await readStoreMeta(hash, storeDir);
    expect(meta).not.toBeNull();
    expect(meta!.storedAt).toBeDefined();
  });

  test("readStoreMeta() returns null for entries without .bsk-meta.json", async () => {
    const hash = "fakehash1234";
    await mkdir(join(storeDir, hash), { recursive: true });
    await writeFile(join(storeDir, hash, "SKILL.md"), "# test");

    const { readStoreMeta } = await import("../src/core/store.js");
    const meta = await readStoreMeta(hash, storeDir);
    expect(meta).toBeNull();
  });

  test("verifyStoreEntry still passes after .bsk-meta.json is written", async () => {
    await writeFile(join(sourceDir, "SKILL.md"), "---\nname: test\n---\n# Test");
    const hash = await hashDirectory(sourceDir);

    const { store, verifyStoreEntry } = await import("../src/core/store.js");
    await store(hash, sourceDir, storeDir);

    const metaExists = await stat(join(storeDir, hash, ".bsk-meta.json")).then(() => true).catch(() => false);
    expect(metaExists).toBe(true);

    const valid = await verifyStoreEntry(hash, storeDir);
    expect(valid).toBe(true);
  });
});
