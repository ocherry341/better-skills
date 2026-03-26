import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";
import { registerSkill } from "../src/core/registry.js";
import { storeLs } from "../src/commands/store-cmd.js";

describe("bsk store ls", () => {
  let baseDir: string;
  let storeDir: string;
  let registryPath: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "store-ls-"));
    storeDir = join(baseDir, "store");
    registryPath = join(baseDir, "registry.json");
    await mkdir(storeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("returns empty for empty store", async () => {
    const result = await storeLs({ storePath: storeDir, registryPath });
    expect(result.entries).toHaveLength(0);
  });

  test("lists store entries with skill info", async () => {
    const sourceDir = join(baseDir, "source");
    await mkdir(sourceDir);
    await writeFile(join(sourceDir, "SKILL.md"), "# Test");
    const hash = await hashDirectory(sourceDir);
    const hashPath = join(storeDir, hash);
    await mkdir(hashPath);
    await cpRecursive(sourceDir, hashPath);
    await registerSkill("test-skill", hash, "owner/repo", registryPath, storeDir);

    const result = await storeLs({ storePath: storeDir, registryPath });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].hash).toBe(hash);
    expect(result.entries[0].skills).toHaveLength(1);
    expect(result.entries[0].skills[0].name).toBe("test-skill");
    expect(result.entries[0].skills[0].v).toBe(1);
    expect(result.entries[0].size).toBeGreaterThan(0);
  });

  test("marks orphan entries (hash not in registry)", async () => {
    const orphanHash = "deadbeef1234567890abcdef";
    await mkdir(join(storeDir, orphanHash));

    const result = await storeLs({ storePath: storeDir, registryPath });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].hash).toBe(orphanHash);
    expect(result.entries[0].skills).toHaveLength(0);
  });

  test("populates orphanName from SKILL.md for orphan entries", async () => {
    const orphanDir = join(storeDir, "deadbeef1234567890abcdef");
    await mkdir(orphanDir);
    await writeFile(
      join(orphanDir, "SKILL.md"),
      "---\nname: my-orphan-skill\ndescription: A lost skill\n---\n# My Orphan Skill\n"
    );

    const result = await storeLs({ storePath: storeDir, registryPath });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].skills).toHaveLength(0);
    expect(result.entries[0].orphanName).toBe("my-orphan-skill");
  });

  test("orphanName is undefined when SKILL.md is missing", async () => {
    const orphanDir = join(storeDir, "deadbeef1234567890abcdef");
    await mkdir(orphanDir);

    const result = await storeLs({ storePath: storeDir, registryPath });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].orphanName).toBeUndefined();
  });
});
