import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { fetch, discoverSkills } from "../src/core/fetcher.js";
import { mkdtemp, writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("fetcher", () => {
  test("git clone failure gives friendly error", async () => {
    expect(
      fetch({
        type: "github",
        owner: "nonexistent-owner-xxxxx",
        repo: "nonexistent-repo-xxxxx",
      })
    ).rejects.toThrow(/failed to clone/i);
  });
});

describe("discoverSkills", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "discover-skills-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("root SKILL.md → returns root only", async () => {
    await writeFile(join(tmpDir, "SKILL.md"), "---\nname: root\n---\n");
    const result = await discoverSkills(tmpDir);
    expect(result).toEqual([tmpDir]);
  });

  test("immediate subdirs with SKILL.md", async () => {
    await mkdir(join(tmpDir, "foo"));
    await writeFile(join(tmpDir, "foo", "SKILL.md"), "---\nname: foo\n---\n");
    await mkdir(join(tmpDir, "bar"));
    await writeFile(join(tmpDir, "bar", "SKILL.md"), "---\nname: bar\n---\n");
    const result = await discoverSkills(tmpDir);
    expect(result.sort()).toEqual(
      [join(tmpDir, "bar"), join(tmpDir, "foo")]
    );
  });

  test("skills/<name>/SKILL.md pattern", async () => {
    await mkdir(join(tmpDir, "skills", "alpha"), { recursive: true });
    await writeFile(join(tmpDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\n---\n");
    await mkdir(join(tmpDir, "skills", "beta"), { recursive: true });
    await writeFile(join(tmpDir, "skills", "beta", "SKILL.md"), "---\nname: beta\n---\n");
    const result = await discoverSkills(tmpDir);
    expect(result.sort()).toEqual(
      [join(tmpDir, "skills", "alpha"), join(tmpDir, "skills", "beta")]
    );
  });

  test("skills/ dir without SKILL.md children is ignored", async () => {
    await mkdir(join(tmpDir, "skills", "empty"), { recursive: true });
    await writeFile(join(tmpDir, "skills", "empty", "README.md"), "# nothing");
    const result = await discoverSkills(tmpDir);
    expect(result).toEqual([]);
  });

  test("finds skills at multiple depths", async () => {
    // top-level skill
    await mkdir(join(tmpDir, "top"));
    await writeFile(join(tmpDir, "top", "SKILL.md"), "---\nname: top\n---\n");
    // skills/ dir skill
    await mkdir(join(tmpDir, "skills", "nested"), { recursive: true });
    await writeFile(join(tmpDir, "skills", "nested", "SKILL.md"), "---\nname: nested\n---\n");
    const result = await discoverSkills(tmpDir);
    expect(result.sort()).toEqual(
      [join(tmpDir, "skills", "nested"), join(tmpDir, "top")]
    );
  });

  test("empty directory → returns empty", async () => {
    const result = await discoverSkills(tmpDir);
    expect(result).toEqual([]);
  });

  test("deeply nested SKILL.md files are discovered", async () => {
    await mkdir(join(tmpDir, "source", "skills", "frontend-design"), { recursive: true });
    await writeFile(
      join(tmpDir, "source", "skills", "frontend-design", "SKILL.md"),
      "---\nname: frontend-design\n---\n"
    );
    const result = await discoverSkills(tmpDir);
    expect(result).toEqual([join(tmpDir, "source", "skills", "frontend-design")]);
  });

  test("discovers skills inside a subdir", async () => {
    await mkdir(join(tmpDir, "source", "skills", "my-skill"), { recursive: true });
    await writeFile(
      join(tmpDir, "source", "skills", "my-skill", "SKILL.md"),
      "---\nname: my-skill\n---\n"
    );
    // Discover from the "source/skills" subdir
    const result = await discoverSkills(join(tmpDir, "source", "skills"));
    expect(result).toEqual([join(tmpDir, "source", "skills", "my-skill")]);
  });

  test("hidden dirs are skipped", async () => {
    await mkdir(join(tmpDir, ".hidden"));
    await writeFile(join(tmpDir, ".hidden", "SKILL.md"), "---\nname: hidden\n---\n");
    const result = await discoverSkills(tmpDir);
    expect(result).toEqual([]);
  });
});
