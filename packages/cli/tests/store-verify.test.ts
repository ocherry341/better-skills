import { describe, test, expect, beforeEach } from "bun:test";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";
import { storeVerify, type VerifyResult } from "../src/commands/store-cmd.js";
import { cleanTestHome, getStorePath, home } from "../src/utils/paths.js";

describe("bsk store verify", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getStorePath(), { recursive: true });
  });

  test("reports no issues for healthy store", async () => {
    const sourceDir = join(home(), "source");
    await mkdir(sourceDir);
    await writeFile(join(sourceDir, "SKILL.md"), "# Hello");
    const hash = await hashDirectory(sourceDir);
    const hashPath = join(getStorePath(), hash);
    await mkdir(hashPath);
    await cpRecursive(sourceDir, hashPath);

    const result = await storeVerify();
    expect(result.total).toBe(1);
    expect(result.ok).toBe(1);
    expect(result.corrupted).toHaveLength(0);
  });

  test("detects corrupted store entry", async () => {
    const sourceDir = join(home(), "source");
    await mkdir(sourceDir);
    await writeFile(join(sourceDir, "SKILL.md"), "# Hello");
    const hash = await hashDirectory(sourceDir);
    const hashPath = join(getStorePath(), hash);
    await mkdir(hashPath);
    await writeFile(join(hashPath, "SKILL.md"), "CORRUPTED");

    const result = await storeVerify();
    expect(result.total).toBe(1);
    expect(result.ok).toBe(0);
    expect(result.corrupted).toHaveLength(1);
    expect(result.corrupted[0].hash).toBe(hash);
  });

  test("reports empty store", async () => {
    const result = await storeVerify();
    expect(result.total).toBe(0);
    expect(result.corrupted).toHaveLength(0);
  });
});
