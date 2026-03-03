import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, mkdir, rm, readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { hashDirectory } from "../src/core/hasher.js";
import * as store from "../src/core/store.js";
import { linkSkill, unlinkSkill } from "../src/core/linker.js";
import * as lockfile from "../src/core/lockfile.js";

describe("e2e: store → link → lockfile flow", () => {
  let skillDir: string;
  let targetDir: string;

  beforeEach(async () => {
    skillDir = await mkdtemp(join(tmpdir(), "e2e-skill-"));
    targetDir = await mkdtemp(join(tmpdir(), "e2e-target-"));

    // Create a test skill
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: test-skill
description: A test skill for e2e
---
# Test Skill
This is a test.`
    );
    await mkdir(join(skillDir, "src"), { recursive: true });
    await writeFile(join(skillDir, "src", "index.ts"), 'console.log("hello");');
  });

  afterEach(async () => {
    await rm(skillDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  });

  test("hash → store → link → verify", async () => {
    // Hash
    const hash = await hashDirectory(skillDir);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // Store
    const storePath = await store.store(hash, skillDir);
    expect(await store.has(hash)).toBe(true);

    // Link (using copy mode for test isolation)
    const linkedDir = join(targetDir, "test-skill");
    await linkSkill(storePath, linkedDir, { copy: true });

    // Verify linked files exist
    const skillMd = await readFile(join(linkedDir, "SKILL.md"), "utf-8");
    expect(skillMd).toContain("test-skill");

    const indexTs = await readFile(join(linkedDir, "src", "index.ts"), "utf-8");
    expect(indexTs).toContain("hello");

    // Unlink
    await unlinkSkill(linkedDir);
    expect(stat(linkedDir)).rejects.toThrow();
  });

  test("lockfile roundtrip with real hash", async () => {
    const hash = await hashDirectory(skillDir);

    let lock = lockfile.createEmpty();
    lock = lockfile.setSkill(lock, "test-skill", {
      source: "owner/repo",
      sourceType: "github",
      computedHash: hash,
    });

    expect(lock.skills["test-skill"].computedHash).toBe(hash);
    expect(Object.keys(lock.skills)).toHaveLength(1);

    // Remove and verify
    lock = lockfile.removeSkill(lock, "test-skill");
    expect(Object.keys(lock.skills)).toHaveLength(0);
  });
});
