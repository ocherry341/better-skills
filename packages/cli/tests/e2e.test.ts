import { describe, test, expect, beforeEach } from "bun:test";
import { writeFile, mkdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { hashDirectory } from "../src/core/hasher.js";
import * as store from "../src/core/store.js";
import { linkSkill, unlinkSkill } from "../src/core/linker.js";
import { cleanTestHome, getStorePath, home } from "../src/utils/paths.js";

describe("e2e: store → link flow", () => {
  let skillDir: string;
  let targetDir: string;

  beforeEach(async () => {
    await cleanTestHome();
    skillDir = join(home(), "skill-source");
    targetDir = join(home(), "target");
    await mkdir(skillDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });
    await mkdir(getStorePath(), { recursive: true });

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

  test("hash → store → link → verify", async () => {
    // Hash
    const hash = await hashDirectory(skillDir);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // Store (use temp storeDir to avoid polluting real home)
    const storePath = await store.store(hash, skillDir);
    const s = await stat(storePath);
    expect(s.isDirectory()).toBe(true);

    // Link (copy is now the default)
    const linkedDir = join(targetDir, "test-skill");
    await linkSkill(storePath, linkedDir);

    // Verify linked files exist
    const skillMd = await readFile(join(linkedDir, "SKILL.md"), "utf-8");
    expect(skillMd).toContain("test-skill");

    const indexTs = await readFile(join(linkedDir, "src", "index.ts"), "utf-8");
    expect(indexTs).toContain("hello");

    // Unlink
    await unlinkSkill(linkedDir);
    expect(stat(linkedDir)).rejects.toThrow();
  });
});
