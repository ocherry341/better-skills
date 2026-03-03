import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as lockfile from "../src/core/lockfile.js";
import { writeFile, rm, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("lockfile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lock-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("createEmpty returns valid lockfile", () => {
    const lock = lockfile.createEmpty();
    expect(lock.version).toBe(1);
    expect(lock.skills).toEqual({});
  });

  test("read returns empty when file does not exist", async () => {
    const lock = await lockfile.read(tempDir);
    expect(lock.version).toBe(1);
    expect(lock.skills).toEqual({});
  });

  test("write and read roundtrip", async () => {
    const lock = lockfile.createEmpty();
    const updated = lockfile.setSkill(lock, "my-skill", {
      source: "owner/repo",
      sourceType: "github",
      computedHash: "abc123",
    });

    await lockfile.write(updated, tempDir);
    const readBack = await lockfile.read(tempDir);

    expect(readBack.skills["my-skill"]).toEqual({
      source: "owner/repo",
      sourceType: "github",
      computedHash: "abc123",
    });
  });

  test("setSkill adds new skill", () => {
    const lock = lockfile.createEmpty();
    const updated = lockfile.setSkill(lock, "test", {
      source: "a/b",
      sourceType: "github",
      computedHash: "hash1",
    });
    expect(updated.skills["test"]).toBeDefined();
    expect(updated.skills["test"].computedHash).toBe("hash1");
  });

  test("setSkill updates existing skill", () => {
    let lock = lockfile.createEmpty();
    lock = lockfile.setSkill(lock, "test", {
      source: "a/b",
      sourceType: "github",
      computedHash: "hash1",
    });
    lock = lockfile.setSkill(lock, "test", {
      source: "a/b",
      sourceType: "github",
      computedHash: "hash2",
    });
    expect(lock.skills["test"].computedHash).toBe("hash2");
  });

  test("removeSkill removes skill", () => {
    let lock = lockfile.createEmpty();
    lock = lockfile.setSkill(lock, "test", {
      source: "a/b",
      sourceType: "github",
      computedHash: "hash1",
    });
    lock = lockfile.removeSkill(lock, "test");
    expect(lock.skills["test"]).toBeUndefined();
  });

  test("read rejects invalid lockfile", async () => {
    await writeFile(join(tempDir, "skills-lock.json"), '{"bad": "data"}');
    expect(lockfile.read(tempDir)).rejects.toThrow();
  });
});
