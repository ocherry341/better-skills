import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";
import { storeVerify, type VerifyResult } from "../src/commands/store-cmd.js";

describe("bsk store verify", () => {
  let baseDir: string;
  let storeDir: string;
  let registryPath: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "store-verify-"));
    storeDir = join(baseDir, "store");
    registryPath = join(baseDir, "registry.json");
    await mkdir(storeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("reports no issues for healthy store", async () => {
    const sourceDir = join(baseDir, "source");
    await mkdir(sourceDir);
    await writeFile(join(sourceDir, "SKILL.md"), "# Hello");
    const hash = await hashDirectory(sourceDir);
    const hashPath = join(storeDir, hash);
    await mkdir(hashPath);
    await cpRecursive(sourceDir, hashPath);

    const result = await storeVerify({ storePath: storeDir, registryPath });
    expect(result.total).toBe(1);
    expect(result.ok).toBe(1);
    expect(result.corrupted).toHaveLength(0);
  });

  test("detects corrupted store entry", async () => {
    const sourceDir = join(baseDir, "source");
    await mkdir(sourceDir);
    await writeFile(join(sourceDir, "SKILL.md"), "# Hello");
    const hash = await hashDirectory(sourceDir);
    const hashPath = join(storeDir, hash);
    await mkdir(hashPath);
    await writeFile(join(hashPath, "SKILL.md"), "CORRUPTED");

    const result = await storeVerify({ storePath: storeDir, registryPath });
    expect(result.total).toBe(1);
    expect(result.ok).toBe(0);
    expect(result.corrupted).toHaveLength(1);
    expect(result.corrupted[0].hash).toBe(hash);
  });

  test("reports empty store", async () => {
    const result = await storeVerify({ storePath: storeDir, registryPath });
    expect(result.total).toBe(0);
    expect(result.corrupted).toHaveLength(0);
  });
});
