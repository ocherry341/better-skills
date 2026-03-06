import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { hashDirectory } from "../src/core/hasher.js";
import { mkdtemp, writeFile, mkdir, rm, symlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("hasher", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hasher-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("produces consistent hash for same content", async () => {
    await writeFile(join(tempDir, "file.txt"), "hello world");
    const hash1 = await hashDirectory(tempDir);
    const hash2 = await hashDirectory(tempDir);
    expect(hash1).toBe(hash2);
  });

  test("different content produces different hash", async () => {
    await writeFile(join(tempDir, "file.txt"), "hello");
    const hash1 = await hashDirectory(tempDir);

    await writeFile(join(tempDir, "file.txt"), "world");
    const hash2 = await hashDirectory(tempDir);

    expect(hash1).not.toBe(hash2);
  });

  test("hash is a 64-char hex string (SHA-256)", async () => {
    await writeFile(join(tempDir, "file.txt"), "test");
    const hash = await hashDirectory(tempDir);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("file order does not affect hash", async () => {
    // Create files in one order
    const dir1 = await mkdtemp(join(tmpdir(), "hash-order1-"));
    await writeFile(join(dir1, "a.txt"), "aaa");
    await writeFile(join(dir1, "b.txt"), "bbb");

    // Create files in opposite order
    const dir2 = await mkdtemp(join(tmpdir(), "hash-order2-"));
    await writeFile(join(dir2, "b.txt"), "bbb");
    await writeFile(join(dir2, "a.txt"), "aaa");

    const hash1 = await hashDirectory(dir1);
    const hash2 = await hashDirectory(dir2);

    expect(hash1).toBe(hash2);

    await rm(dir1, { recursive: true, force: true });
    await rm(dir2, { recursive: true, force: true });
  });

  test("subdirectories are included in hash", async () => {
    await mkdir(join(tempDir, "sub"), { recursive: true });
    await writeFile(join(tempDir, "root.txt"), "root");
    await writeFile(join(tempDir, "sub", "nested.txt"), "nested");

    const hash = await hashDirectory(tempDir);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("empty directory throws", async () => {
    expect(hashDirectory(tempDir)).rejects.toThrow();
  });

  test("skips symlinks to directories", async () => {
    await writeFile(join(tempDir, "real.txt"), "content");
    const subdir = join(tempDir, "realdir");
    await mkdir(subdir, { recursive: true });
    await writeFile(join(subdir, "nested.txt"), "nested");
    await symlink(subdir, join(tempDir, "link-to-dir"));

    const hashWithLink = await hashDirectory(tempDir);

    // Remove the symlink — hash should stay the same (symlinks are skipped)
    await rm(join(tempDir, "link-to-dir"));
    const hashWithout = await hashDirectory(tempDir);

    expect(hashWithLink).toBe(hashWithout);
  });

  test("skips symlinks to files", async () => {
    await writeFile(join(tempDir, "real.txt"), "content");
    await symlink(join(tempDir, "real.txt"), join(tempDir, "link-to-file"));

    const hashWithLink = await hashDirectory(tempDir);

    await rm(join(tempDir, "link-to-file"));
    const hashWithout = await hashDirectory(tempDir);

    expect(hashWithLink).toBe(hashWithout);
  });

  test("skips hidden directories", async () => {
    await writeFile(join(tempDir, "visible.txt"), "visible");
    await mkdir(join(tempDir, ".hidden"), { recursive: true });
    await writeFile(join(tempDir, ".hidden", "secret.txt"), "hidden");

    const hashWithHidden = await hashDirectory(tempDir);

    // Remove hidden dir and hash again
    await rm(join(tempDir, ".hidden"), { recursive: true });
    const hashWithout = await hashDirectory(tempDir);

    expect(hashWithHidden).toBe(hashWithout);
  });
});
