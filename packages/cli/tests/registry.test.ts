import { describe, test, expect, beforeEach } from "bun:test";
import { writeFile, mkdir, stat, rm } from "fs/promises";
import { join } from "path";
import {
  readRegistry,
  writeRegistry,
  registerSkill,
  unregisterSkill,
  isManaged,
  getLatestVersion,
  resolveVersion,
} from "../src/core/registry.js";
import { cleanTestHome, getRegistryPath, getStorePath } from "../src/utils/paths.js";

describe("registry", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getStorePath(), { recursive: true });
  });

  describe("readRegistry", () => {
    test("returns empty registry when file missing", async () => {
      const reg = await readRegistry();
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
      await writeFile(getRegistryPath(), JSON.stringify(data));
      const reg = await readRegistry();
      expect(reg).toEqual(data);
    });

    test("returns empty registry for corrupted JSON", async () => {
      await writeFile(getRegistryPath(), "not valid json {{{");
      const reg = await readRegistry();
      expect(reg).toEqual({ skills: {} });
    });

    test("returns empty registry for unexpected structure", async () => {
      await writeFile(getRegistryPath(), JSON.stringify({ foo: "bar" }));
      const reg = await readRegistry();
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
      await mkdir(join(getStorePath(), "abc123"), { recursive: true });

      await writeRegistry(reg);
      const loaded = await readRegistry();
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
      await mkdir(join(getStorePath(), "aaa"), { recursive: true });

      await writeRegistry(reg);
      const loaded = await readRegistry();
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
      await writeRegistry(reg);
      const loaded = await readRegistry();
      expect(loaded.skills).not.toHaveProperty("ghost");
    });
  });

  describe("registerSkill", () => {
    test("adds new skill with v=1", async () => {
      await mkdir(join(getStorePath(), "abc123"), { recursive: true });
      await registerSkill("my-skill", "abc123", "owner/repo");

      const reg = await readRegistry();
      expect(reg.skills["my-skill"].versions).toHaveLength(1);
      expect(reg.skills["my-skill"].versions[0].v).toBe(1);
      expect(reg.skills["my-skill"].versions[0].hash).toBe("abc123");
      expect(reg.skills["my-skill"].versions[0].source).toBe("owner/repo");
      expect(reg.skills["my-skill"].versions[0].addedAt).toBeDefined();
    });

    test("appends new version with auto-incremented v", async () => {
      await mkdir(join(getStorePath(), "abc123"), { recursive: true });
      await mkdir(join(getStorePath(), "def456"), { recursive: true });

      await registerSkill("my-skill", "abc123", "owner/repo");
      await registerSkill("my-skill", "def456", "owner/repo2");

      const reg = await readRegistry();
      expect(reg.skills["my-skill"].versions).toHaveLength(2);
      expect(reg.skills["my-skill"].versions[0].v).toBe(1);
      expect(reg.skills["my-skill"].versions[0].hash).toBe("abc123");
      expect(reg.skills["my-skill"].versions[1].v).toBe(2);
      expect(reg.skills["my-skill"].versions[1].hash).toBe("def456");
    });

    test("skips when hash already exists (idempotent)", async () => {
      await mkdir(join(getStorePath(), "abc123"), { recursive: true });

      await registerSkill("my-skill", "abc123", "owner/repo");
      await registerSkill("my-skill", "abc123", "owner/repo");

      const reg = await readRegistry();
      expect(reg.skills["my-skill"].versions).toHaveLength(1);
    });

    test("auto-increments v after gap (deleted middle version)", async () => {
      await mkdir(join(getStorePath(), "aaa"), { recursive: true });
      await mkdir(join(getStorePath(), "bbb"), { recursive: true });
      await mkdir(join(getStorePath(), "ccc"), { recursive: true });
      await mkdir(join(getStorePath(), "ddd"), { recursive: true });

      await registerSkill("my-skill", "aaa", "src");
      await registerSkill("my-skill", "bbb", "src");
      await registerSkill("my-skill", "ccc", "src");
      // Manually remove v=2 to simulate deletion of middle version
      const reg = await readRegistry();
      reg.skills["my-skill"].versions = reg.skills["my-skill"].versions.filter(v => v.v !== 2);
      await writeRegistry(reg);

      // Next registration should be v=4 (max existing v=3 + 1), not v=2
      await registerSkill("my-skill", "ddd", "src");
      const updated = await readRegistry();
      const versions = updated.skills["my-skill"].versions;
      expect(versions[versions.length - 1].v).toBe(4);
    });
  });

  describe("unregisterSkill", () => {
    test("removes entire skill entry from registry", async () => {
      await mkdir(join(getStorePath(), "abc123"), { recursive: true });
      await registerSkill("my-skill", "abc123", "owner/repo");
      await unregisterSkill("my-skill");

      const reg = await readRegistry();
      expect(reg.skills).not.toHaveProperty("my-skill");
    });

    test("no-ops for nonexistent skill", async () => {
      await unregisterSkill("nonexistent");
      const reg = await readRegistry();
      expect(reg).toEqual({ skills: {} });
    });

    test("deletes orphaned store hash directories", async () => {
      await mkdir(join(getStorePath(), "hash-a"), { recursive: true });
      await registerSkill("skill-a", "hash-a", "src");
      await unregisterSkill("skill-a");

      const exists = await stat(join(getStorePath(), "hash-a")).then(() => true, () => false);
      expect(exists).toBe(false);
    });

    test("preserves store hash still referenced by another skill", async () => {
      await mkdir(join(getStorePath(), "shared-hash"), { recursive: true });
      await registerSkill("skill-a", "shared-hash", "src");
      await registerSkill("skill-b", "shared-hash", "src");
      await unregisterSkill("skill-a");

      const exists = await stat(join(getStorePath(), "shared-hash")).then(() => true, () => false);
      expect(exists).toBe(true);
    });

    test("handles store deletion failure gracefully", async () => {
      await mkdir(join(getStorePath(), "fail-hash"), { recursive: true });
      await registerSkill("skill-a", "fail-hash", "src");

      // Remove store dir so rm will encounter already-gone dir
      await rm(join(getStorePath(), "fail-hash"), { recursive: true, force: true });
      await expect(
        unregisterSkill("skill-a")
      ).resolves.toBeUndefined();
    });

    test("no-op for unknown skill does not delete any store entries", async () => {
      await mkdir(join(getStorePath(), "keep-hash"), { recursive: true });
      await registerSkill("existing-skill", "keep-hash", "src");
      await unregisterSkill("nonexistent");

      const exists = await stat(join(getStorePath(), "keep-hash")).then(() => true, () => false);
      expect(exists).toBe(true);
    });
  });

  describe("isManaged", () => {
    test("returns true for registered skill", async () => {
      await mkdir(join(getStorePath(), "abc123"), { recursive: true });
      await registerSkill("my-skill", "abc123", "owner/repo");
      expect(await isManaged("my-skill")).toBe(true);
    });

    test("returns false for unregistered skill", async () => {
      expect(await isManaged("unknown")).toBe(false);
    });
  });

  describe("getLatestVersion", () => {
    test("returns version with highest v number", async () => {
      await mkdir(join(getStorePath(), "aaa"), { recursive: true });
      await mkdir(join(getStorePath(), "bbb"), { recursive: true });

      await registerSkill("my-skill", "aaa", "src1");
      await registerSkill("my-skill", "bbb", "src2");

      const reg = await readRegistry();
      const latest = getLatestVersion(reg, "my-skill");
      expect(latest).not.toBeNull();
      expect(latest!.hash).toBe("bbb");
      expect(latest!.v).toBe(2);
    });

    test("returns null for nonexistent skill", async () => {
      const reg = await readRegistry();
      expect(getLatestVersion(reg, "nope")).toBeNull();
    });
  });

  describe("resolveVersion", () => {
    // Setup helper: register 3 versions (v1=aaa, v2=bbb, v3=ccc)
    async function setupThreeVersions() {
      await mkdir(join(getStorePath(), "aaa"), { recursive: true });
      await mkdir(join(getStorePath(), "bbb"), { recursive: true });
      await mkdir(join(getStorePath(), "ccc"), { recursive: true });
      await registerSkill("my-skill", "aaa", "src");
      await registerSkill("my-skill", "bbb", "src");
      await registerSkill("my-skill", "ccc", "src");
      return readRegistry();
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
      const reg = await readRegistry();
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
