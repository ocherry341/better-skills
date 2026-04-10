import { describe, test, expect, beforeEach } from "bun:test";
import { mkdir, writeFile, readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";
import { verifyStoreEntry, verifiedLinkSkill, remove, store, readStoreMeta } from "../src/core/store.js";
import { cleanTestHome, getStorePath, home } from "../src/utils/paths.js";

describe("store integrity", () => {
  let sourceDir: string;

  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getStorePath(), { recursive: true });
    sourceDir = join(home(), "source");
    await mkdir(sourceDir, { recursive: true });
  });

  test("verifyStoreEntry returns false for incomplete store", async () => {
    // Create source with two files
    await writeFile(join(sourceDir, "a.txt"), "aaa");
    await writeFile(join(sourceDir, "b.txt"), "bbb");
    const hash = await hashDirectory(sourceDir);

    // Create incomplete store entry (missing b.txt)
    const hashPath = join(getStorePath(), hash);
    await mkdir(hashPath, { recursive: true });
    await writeFile(join(hashPath, "a.txt"), "aaa");

    const result = await verifyStoreEntry(hash);
    expect(result).toBe(false);
  });

  test("verifyStoreEntry returns true for complete store", async () => {
    await writeFile(join(sourceDir, "a.txt"), "aaa");
    await writeFile(join(sourceDir, "b.txt"), "bbb");
    const hash = await hashDirectory(sourceDir);

    // Create complete store entry
    const hashPath = join(getStorePath(), hash);
    await mkdir(hashPath, { recursive: true });
    await cpRecursive(sourceDir, hashPath);

    const result = await verifyStoreEntry(hash);
    expect(result).toBe(true);
  });

  test("verifyStoreEntry returns false for non-existent store", async () => {
    const result = await verifyStoreEntry("nonexistenthash");
    expect(result).toBe(false);
  });

  test("verifiedLinkSkill succeeds when store entry is valid", async () => {
    await writeFile(join(sourceDir, "a.txt"), "aaa");
    const hash = await hashDirectory(sourceDir);

    const hashPath = join(getStorePath(), hash);
    await mkdir(hashPath, { recursive: true });
    await cpRecursive(sourceDir, hashPath);

    const targetDir = join(home(), "link-target");
    await verifiedLinkSkill(hash, targetDir, {});

    const content = await readFile(join(targetDir, "a.txt"), "utf-8");
    expect(content).toBe("aaa");
  });

  test("remove deletes hash directory from store", async () => {
    const hashDir = join(getStorePath(), "deadbeef");
    await mkdir(hashDir, { recursive: true });
    await writeFile(join(hashDir, "file.txt"), "data");

    await remove("deadbeef");

    const entries = await readdir(getStorePath());
    expect(entries).not.toContain("deadbeef");
  });

  test("verifiedLinkSkill throws when store entry is corrupted", async () => {
    await writeFile(join(sourceDir, "a.txt"), "aaa");
    const hash = await hashDirectory(sourceDir);

    const hashPath = join(getStorePath(), hash);
    await mkdir(hashPath, { recursive: true });
    await writeFile(join(hashPath, "a.txt"), "CORRUPTED");

    const targetDir = join(home(), "link-target");
    await expect(verifiedLinkSkill(hash, targetDir, {})).rejects.toThrow(/corrupted/i);
  });
});

describe("store metadata (.bsk-meta.json)", () => {
  let sourceDir: string;

  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getStorePath(), { recursive: true });
    sourceDir = join(home(), "source");
    await mkdir(sourceDir, { recursive: true });
  });

  test("store() writes .bsk-meta.json with valid storedAt ISO string", async () => {
    await writeFile(join(sourceDir, "SKILL.md"), "---\nname: test\n---\n# Test");
    const hash = await hashDirectory(sourceDir);

    const dest = await store(hash, sourceDir);

    const metaRaw = await readFile(join(dest, ".bsk-meta.json"), "utf-8");
    const meta = JSON.parse(metaRaw);
    expect(meta.storedAt).toBeDefined();
    expect(new Date(meta.storedAt).toISOString()).toBe(meta.storedAt);
  });

  test("store() does NOT overwrite .bsk-meta.json on existing verified entry", async () => {
    await writeFile(join(sourceDir, "SKILL.md"), "---\nname: test\n---\n# Test");
    const hash = await hashDirectory(sourceDir);

    await store(hash, sourceDir);
    const meta1Raw = await readFile(join(getStorePath(), hash, ".bsk-meta.json"), "utf-8");
    const meta1 = JSON.parse(meta1Raw);

    await new Promise((r) => setTimeout(r, 10));

    await store(hash, sourceDir);
    const meta2Raw = await readFile(join(getStorePath(), hash, ".bsk-meta.json"), "utf-8");
    const meta2 = JSON.parse(meta2Raw);

    expect(meta2.storedAt).toBe(meta1.storedAt);
  });

  test("readStoreMeta() returns metadata for entries with .bsk-meta.json", async () => {
    await writeFile(join(sourceDir, "SKILL.md"), "---\nname: test\n---\n# Test");
    const hash = await hashDirectory(sourceDir);

    await store(hash, sourceDir);

    const meta = await readStoreMeta(hash);
    expect(meta).not.toBeNull();
    expect(meta!.storedAt).toBeDefined();
  });

  test("readStoreMeta() returns null for entries without .bsk-meta.json", async () => {
    const hash = "fakehash1234";
    await mkdir(join(getStorePath(), hash), { recursive: true });
    await writeFile(join(getStorePath(), hash, "SKILL.md"), "# test");

    const meta = await readStoreMeta(hash);
    expect(meta).toBeNull();
  });

  test("verifyStoreEntry still passes after .bsk-meta.json is written", async () => {
    await writeFile(join(sourceDir, "SKILL.md"), "---\nname: test\n---\n# Test");
    const hash = await hashDirectory(sourceDir);

    await store(hash, sourceDir);

    const metaExists = await stat(join(getStorePath(), hash, ".bsk-meta.json")).then(() => true).catch(() => false);
    expect(metaExists).toBe(true);

    const valid = await verifyStoreEntry(hash);
    expect(valid).toBe(true);
  });
});
