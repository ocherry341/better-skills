import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  readRegistry,
  writeRegistry,
  registerSkill,
  unregisterSkill,
  isManaged,
} from "../src/core/registry.js";

describe("registry", () => {
  let baseDir: string;
  let registryPath: string;
  let storeDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "registry-test-"));
    registryPath = join(baseDir, "registry.json");
    storeDir = join(baseDir, "store");
    await mkdir(storeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  describe("readRegistry", () => {
    test("returns empty registry when file missing", async () => {
      const reg = await readRegistry(registryPath);
      expect(reg).toEqual({ skills: {} });
    });

    test("reads valid registry", async () => {
      const data = {
        skills: {
          "my-skill": { hash: "abc123", source: "owner/repo" },
        },
      };
      await writeFile(registryPath, JSON.stringify(data));
      const reg = await readRegistry(registryPath);
      expect(reg).toEqual(data);
    });

    test("returns empty registry for corrupted JSON", async () => {
      await writeFile(registryPath, "not valid json {{{");
      const reg = await readRegistry(registryPath);
      expect(reg).toEqual({ skills: {} });
    });

    test("returns empty registry for unexpected structure", async () => {
      await writeFile(registryPath, JSON.stringify({ foo: "bar" }));
      const reg = await readRegistry(registryPath);
      expect(reg).toEqual({ skills: {} });
    });
  });

  describe("writeRegistry", () => {
    test("writes registry to disk", async () => {
      const reg = {
        skills: {
          "my-skill": { hash: "abc123", source: "owner/repo" },
        },
      };
      // Create store hash directory so it's not cleaned as stale
      await mkdir(join(storeDir, "abc123"), { recursive: true });

      await writeRegistry(reg, registryPath, storeDir);
      const loaded = await readRegistry(registryPath);
      expect(loaded).toEqual(reg);
    });

    test("cleans stale entries where hash is missing from store", async () => {
      const reg = {
        skills: {
          "exists": { hash: "aaa", source: "a/b" },
          "gone": { hash: "bbb", source: "c/d" },
        },
      };
      // Only create store directory for hash "aaa"
      await mkdir(join(storeDir, "aaa"), { recursive: true });

      await writeRegistry(reg, registryPath, storeDir);
      const loaded = await readRegistry(registryPath);
      expect(loaded.skills).toHaveProperty("exists");
      expect(loaded.skills).not.toHaveProperty("gone");
    });

    test("creates parent directories", async () => {
      const nestedPath = join(baseDir, "nested", "dir", "registry.json");
      await writeRegistry({ skills: {} }, nestedPath, storeDir);
      const loaded = await readRegistry(nestedPath);
      expect(loaded).toEqual({ skills: {} });
    });
  });

  describe("registerSkill", () => {
    test("adds skill to registry", async () => {
      await mkdir(join(storeDir, "abc123"), { recursive: true });
      await registerSkill("my-skill", "abc123", "owner/repo", registryPath, storeDir);

      const reg = await readRegistry(registryPath);
      expect(reg.skills["my-skill"]).toEqual({
        hash: "abc123",
        source: "owner/repo",
      });
    });

    test("overwrites existing entry", async () => {
      await mkdir(join(storeDir, "abc123"), { recursive: true });
      await mkdir(join(storeDir, "def456"), { recursive: true });
      await registerSkill("my-skill", "abc123", "owner/repo", registryPath, storeDir);
      await registerSkill("my-skill", "def456", "owner/repo2", registryPath, storeDir);

      const reg = await readRegistry(registryPath);
      expect(reg.skills["my-skill"]).toEqual({
        hash: "def456",
        source: "owner/repo2",
      });
    });
  });

  describe("unregisterSkill", () => {
    test("removes skill from registry", async () => {
      await mkdir(join(storeDir, "abc123"), { recursive: true });
      await registerSkill("my-skill", "abc123", "owner/repo", registryPath, storeDir);
      await unregisterSkill("my-skill", registryPath, storeDir);

      const reg = await readRegistry(registryPath);
      expect(reg.skills).not.toHaveProperty("my-skill");
    });

    test("no-ops for nonexistent skill", async () => {
      await unregisterSkill("nonexistent", registryPath, storeDir);
      const reg = await readRegistry(registryPath);
      expect(reg).toEqual({ skills: {} });
    });
  });

  describe("isManaged", () => {
    test("returns true for registered skill", async () => {
      await mkdir(join(storeDir, "abc123"), { recursive: true });
      await registerSkill("my-skill", "abc123", "owner/repo", registryPath, storeDir);

      expect(await isManaged("my-skill", registryPath)).toBe(true);
    });

    test("returns false for unregistered skill", async () => {
      expect(await isManaged("unknown", registryPath)).toBe(false);
    });

    test("returns false when registry is empty", async () => {
      expect(await isManaged("anything", registryPath)).toBe(false);
    });
  });
});
