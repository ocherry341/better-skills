import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { linkToClients, unlinkFromClients } from "../src/core/linker.js";

describe("linker client operations", () => {
  let storeDir: string;
  let clientDir1: string;
  let clientDir2: string;

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), "linker-store-"));
    clientDir1 = await mkdtemp(join(tmpdir(), "linker-client1-"));
    clientDir2 = await mkdtemp(join(tmpdir(), "linker-client2-"));

    // Create a test skill in store
    await writeFile(join(storeDir, "SKILL.md"), "---\nname: test\n---\n# Test");
    await mkdir(join(storeDir, "scripts"), { recursive: true });
    await writeFile(join(storeDir, "scripts", "run.sh"), "echo hi");
  });

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true });
    await rm(clientDir1, { recursive: true, force: true });
    await rm(clientDir2, { recursive: true, force: true });
  });

  describe("linkToClients", () => {
    test("links skill to multiple client dirs", async () => {
      await linkToClients("test-skill", storeDir, [clientDir1, clientDir2]);

      const content1 = await readFile(join(clientDir1, "test-skill", "SKILL.md"), "utf-8");
      expect(content1).toContain("name: test");

      const content2 = await readFile(join(clientDir2, "test-skill", "SKILL.md"), "utf-8");
      expect(content2).toContain("name: test");
    });

    test("default mode uses copy (not hardlink)", async () => {
      await linkToClients("test-skill", storeDir, [clientDir1]);

      const storeStat = await stat(join(storeDir, "SKILL.md"));
      const linkedStat = await stat(join(clientDir1, "test-skill", "SKILL.md"));
      // Different inode = copy, same inode = hardlink
      expect(linkedStat.ino).not.toBe(storeStat.ino);
    });

    test("hardlink mode shares inodes with store", async () => {
      await linkToClients("test-skill", storeDir, [clientDir1], { hardlink: true });

      const storeStat = await stat(join(storeDir, "SKILL.md"));
      const linkedStat = await stat(join(clientDir1, "test-skill", "SKILL.md"));
      expect(linkedStat.ino).toBe(storeStat.ino);
    });

    test("does nothing with empty client dirs", async () => {
      await linkToClients("test-skill", storeDir, []);
      // No error, no-op
    });

    test("creates nested directories if needed", async () => {
      const nestedDir = join(clientDir1, "deep", "nested");
      await linkToClients("test-skill", storeDir, [nestedDir]);

      const content = await readFile(join(nestedDir, "test-skill", "SKILL.md"), "utf-8");
      expect(content).toContain("name: test");
    });
  });

  describe("unlinkFromClients", () => {
    test("unlinks skill from multiple client dirs", async () => {
      // First link
      await linkToClients("test-skill", storeDir, [clientDir1, clientDir2]);

      // Then unlink
      await unlinkFromClients("test-skill", [clientDir1, clientDir2]);

      await expect(stat(join(clientDir1, "test-skill"))).rejects.toThrow();
      await expect(stat(join(clientDir2, "test-skill"))).rejects.toThrow();
    });

    test("no error when skill dir does not exist", async () => {
      await unlinkFromClients("nonexistent", [clientDir1]);
      // No error
    });

    test("does nothing with empty client dirs", async () => {
      await unlinkFromClients("test-skill", []);
      // No error, no-op
    });
  });
});
