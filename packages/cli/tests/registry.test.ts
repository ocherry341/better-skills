import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  readRegistry,
  writeRegistry,
  registerSkill,
  unregisterSkill,
  isManaged,
  getLatestVersion,
  resolveVersion,
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

    test("reads valid multi-version registry", async () => {
      const data = {
        skills: {
          "my-skill": {
            versions: [
              { v: 1, hash: "abc123", source: "owner/repo", addedAt: "2026-03-01T00:00:00.000Z" },
            ],
          },
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
          "my-skill": {
            versions: [
              { v: 1, hash: "abc123", source: "owner/repo", addedAt: "2026-03-01T00:00:00.000Z" },
            ],
          },
        },
      };
      await mkdir(join(storeDir, "abc123"), { recursive: true });

      await writeRegistry(reg, registryPath, storeDir);
      const loaded = await readRegistry(registryPath);
      expect(loaded).toEqual(reg);
    });

    test("removes version entries where hash is missing from store", async () => {
      const reg = {
        skills: {
          "my-skill": {
            versions: [
              { v: 1, hash: "aaa", source: "a/b", addedAt: "2026-03-01T00:00:00.000Z" },
              { v: 2, hash: "bbb", source: "c/d", addedAt: "2026-03-02T00:00:00.000Z" },
            ],
          },
        },
      };
      // Only hash "aaa" exists in store
      await mkdir(join(storeDir, "aaa"), { recursive: true });

      await writeRegistry(reg, registryPath, storeDir);
      const loaded = await readRegistry(registryPath);
      expect(loaded.skills["my-skill"].versions).toEqual([
        { v: 1, hash: "aaa", source: "a/b", addedAt: "2026-03-01T00:00:00.000Z" },
      ]);
    });

    test("removes entire skill entry when all versions are stale", async () => {
      const reg = {
        skills: {
          "ghost": {
            versions: [
              { v: 1, hash: "gone1", source: "x/y", addedAt: "2026-03-01T00:00:00.000Z" },
            ],
          },
        },
      };
      await writeRegistry(reg, registryPath, storeDir);
      const loaded = await readRegistry(registryPath);
      expect(loaded.skills).not.toHaveProperty("ghost");
    });

    test("creates parent directories", async () => {
      const nestedPath = join(baseDir, "nested", "dir", "registry.json");
      await writeRegistry({ skills: {} }, nestedPath, storeDir);
      const loaded = await readRegistry(nestedPath);
      expect(loaded).toEqual({ skills: {} });
    });
  });

  describe("registerSkill", () => {
    test("adds new skill with v=1", async () => {
      await mkdir(join(storeDir, "abc123"), { recursive: true });
      await registerSkill("my-skill", "abc123", "owner/repo", registryPath, storeDir);

      const reg = await readRegistry(registryPath);
      expect(reg.skills["my-skill"].versions).toHaveLength(1);
      expect(reg.skills["my-skill"].versions[0].v).toBe(1);
      expect(reg.skills["my-skill"].versions[0].hash).toBe("abc123");
      expect(reg.skills["my-skill"].versions[0].source).toBe("owner/repo");
      expect(reg.skills["my-skill"].versions[0].addedAt).toBeDefined();
    });

    test("appends new version with auto-incremented v", async () => {
      await mkdir(join(storeDir, "abc123"), { recursive: true });
      await mkdir(join(storeDir, "def456"), { recursive: true });

      await registerSkill("my-skill", "abc123", "owner/repo", registryPath, storeDir);
      await registerSkill("my-skill", "def456", "owner/repo2", registryPath, storeDir);

      const reg = await readRegistry(registryPath);
      expect(reg.skills["my-skill"].versions).toHaveLength(2);
      expect(reg.skills["my-skill"].versions[0].v).toBe(1);
      expect(reg.skills["my-skill"].versions[0].hash).toBe("abc123");
      expect(reg.skills["my-skill"].versions[1].v).toBe(2);
      expect(reg.skills["my-skill"].versions[1].hash).toBe("def456");
    });

    test("skips when hash already exists (idempotent)", async () => {
      await mkdir(join(storeDir, "abc123"), { recursive: true });

      await registerSkill("my-skill", "abc123", "owner/repo", registryPath, storeDir);
      await registerSkill("my-skill", "abc123", "owner/repo", registryPath, storeDir);

      const reg = await readRegistry(registryPath);
      expect(reg.skills["my-skill"].versions).toHaveLength(1);
    });

    test("auto-increments v after gap (deleted middle version)", async () => {
      await mkdir(join(storeDir, "aaa"), { recursive: true });
      await mkdir(join(storeDir, "bbb"), { recursive: true });
      await mkdir(join(storeDir, "ccc"), { recursive: true });
      await mkdir(join(storeDir, "ddd"), { recursive: true });

      await registerSkill("my-skill", "aaa", "src", registryPath, storeDir);
      await registerSkill("my-skill", "bbb", "src", registryPath, storeDir);
      await registerSkill("my-skill", "ccc", "src", registryPath, storeDir);
      // Manually remove v=2 to simulate deletion of middle version
      const reg = await readRegistry(registryPath);
      reg.skills["my-skill"].versions = reg.skills["my-skill"].versions.filter(v => v.v !== 2);
      await writeRegistry(reg, registryPath, storeDir);

      // Next registration should be v=4 (max existing v=3 + 1), not v=2
      await registerSkill("my-skill", "ddd", "src", registryPath, storeDir);
      const updated = await readRegistry(registryPath);
      const versions = updated.skills["my-skill"].versions;
      expect(versions[versions.length - 1].v).toBe(4);
    });
  });

  describe("unregisterSkill", () => {
    test("removes entire skill entry from registry", async () => {
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

    test("deletes orphaned store hash directories", async () => {
      await mkdir(join(storeDir, "hash-a"), { recursive: true });
      await registerSkill("skill-a", "hash-a", "src", registryPath, storeDir);
      await unregisterSkill("skill-a", registryPath, storeDir);

      const exists = await stat(join(storeDir, "hash-a")).then(() => true, () => false);
      expect(exists).toBe(false);
    });

    test("preserves store hash still referenced by another skill", async () => {
      await mkdir(join(storeDir, "shared-hash"), { recursive: true });
      await registerSkill("skill-a", "shared-hash", "src", registryPath, storeDir);
      await registerSkill("skill-b", "shared-hash", "src", registryPath, storeDir);
      await unregisterSkill("skill-a", registryPath, storeDir);

      const exists = await stat(join(storeDir, "shared-hash")).then(() => true, () => false);
      expect(exists).toBe(true);
    });

    test("handles store deletion failure gracefully", async () => {
      await mkdir(join(storeDir, "fail-hash"), { recursive: true });
      await registerSkill("skill-a", "fail-hash", "src", registryPath, storeDir);

      // Remove store dir so rm will encounter already-gone dir
      await rm(join(storeDir, "fail-hash"), { recursive: true, force: true });
      await expect(
        unregisterSkill("skill-a", registryPath, storeDir)
      ).resolves.toBeUndefined();
    });

    test("no-op for unknown skill does not delete any store entries", async () => {
      await mkdir(join(storeDir, "keep-hash"), { recursive: true });
      await registerSkill("existing-skill", "keep-hash", "src", registryPath, storeDir);
      await unregisterSkill("nonexistent", registryPath, storeDir);

      const exists = await stat(join(storeDir, "keep-hash")).then(() => true, () => false);
      expect(exists).toBe(true);
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
  });

  describe("getLatestVersion", () => {
    test("returns version with highest v number", async () => {
      await mkdir(join(storeDir, "aaa"), { recursive: true });
      await mkdir(join(storeDir, "bbb"), { recursive: true });

      await registerSkill("my-skill", "aaa", "src1", registryPath, storeDir);
      await registerSkill("my-skill", "bbb", "src2", registryPath, storeDir);

      const reg = await readRegistry(registryPath);
      const latest = getLatestVersion(reg, "my-skill");
      expect(latest).not.toBeNull();
      expect(latest!.hash).toBe("bbb");
      expect(latest!.v).toBe(2);
    });

    test("returns null for nonexistent skill", async () => {
      const reg = await readRegistry(registryPath);
      expect(getLatestVersion(reg, "nope")).toBeNull();
    });
  });

  describe("resolveVersion", () => {
    // Setup helper: register 3 versions (v1=aaa, v2=bbb, v3=ccc)
    async function setupThreeVersions() {
      await mkdir(join(storeDir, "aaa"), { recursive: true });
      await mkdir(join(storeDir, "bbb"), { recursive: true });
      await mkdir(join(storeDir, "ccc"), { recursive: true });
      await registerSkill("my-skill", "aaa", "src", registryPath, storeDir);
      await registerSkill("my-skill", "bbb", "src", registryPath, storeDir);
      await registerSkill("my-skill", "ccc", "src", registryPath, storeDir);
      return readRegistry(registryPath);
    }

    test("@latest returns highest v", async () => {
      const reg = await setupThreeVersions();
      const ver = resolveVersion(reg, "my-skill", "latest");
      expect(ver!.v).toBe(3);
      expect(ver!.hash).toBe("ccc");
    });

    test("@previous returns second-highest v", async () => {
      const reg = await setupThreeVersions();
      const ver = resolveVersion(reg, "my-skill", "previous");
      expect(ver!.v).toBe(2);
      expect(ver!.hash).toBe("bbb");
    });

    test("@~1 equals @previous", async () => {
      const reg = await setupThreeVersions();
      const ver = resolveVersion(reg, "my-skill", "~1");
      expect(ver!.v).toBe(2);
    });

    test("@~2 returns third from end", async () => {
      const reg = await setupThreeVersions();
      const ver = resolveVersion(reg, "my-skill", "~2");
      expect(ver!.v).toBe(1);
    });

    test("@vN returns exact version", async () => {
      const reg = await setupThreeVersions();
      const ver = resolveVersion(reg, "my-skill", "v2");
      expect(ver!.v).toBe(2);
      expect(ver!.hash).toBe("bbb");
    });

    test("@hash-prefix matches by hash prefix", async () => {
      const reg = await setupThreeVersions();
      const ver = resolveVersion(reg, "my-skill", "bb");
      expect(ver!.v).toBe(2);
    });

    test("returns null for nonexistent skill", async () => {
      const reg = await readRegistry(registryPath);
      expect(resolveVersion(reg, "nope", "latest")).toBeNull();
    });

    test("returns null for out-of-range ~N", async () => {
      const reg = await setupThreeVersions();
      expect(resolveVersion(reg, "my-skill", "~99")).toBeNull();
    });

    test("returns null for nonexistent vN", async () => {
      const reg = await setupThreeVersions();
      expect(resolveVersion(reg, "my-skill", "v99")).toBeNull();
    });

    test("returns null for unmatched hash prefix", async () => {
      const reg = await setupThreeVersions();
      expect(resolveVersion(reg, "my-skill", "zzz")).toBeNull();
    });
  });
});
