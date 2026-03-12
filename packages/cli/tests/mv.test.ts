import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { mvToProject } from "../src/commands/mv.js";

describe("mv to project", () => {
  let baseDir: string;
  let globalSkillsDir: string;
  let projectSkillsDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "mv-"));
    globalSkillsDir = join(baseDir, "global-skills");
    projectSkillsDir = join(baseDir, "project-skills");
    await mkdir(globalSkillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("copies global skill to project as unmanaged directory", async () => {
    const globalSkill = join(globalSkillsDir, "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# My Skill");

    await mvToProject("my-skill", {
      globalSkillsDir,
      projectSkillsDir,
    });

    // Project copy exists
    const content = await readFile(join(projectSkillsDir, "my-skill", "SKILL.md"), "utf-8");
    expect(content).toBe("# My Skill");

    // Global copy still exists
    const globalContent = await readFile(join(globalSkill, "SKILL.md"), "utf-8");
    expect(globalContent).toBe("# My Skill");
  });

  test("errors when skill not found in global", async () => {
    expect(
      mvToProject("nonexistent", {
        globalSkillsDir,
        projectSkillsDir,
      })
    ).rejects.toThrow("not found");
  });

  test("errors when skill already exists in project without --force", async () => {
    const globalSkill = join(globalSkillsDir, "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# Global");

    await mkdir(join(projectSkillsDir, "my-skill"), { recursive: true });
    await writeFile(join(projectSkillsDir, "my-skill", "SKILL.md"), "# Project");

    expect(
      mvToProject("my-skill", {
        globalSkillsDir,
        projectSkillsDir,
      })
    ).rejects.toThrow("already exists");
  });

  test("overwrites project skill with --force", async () => {
    const globalSkill = join(globalSkillsDir, "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# Global Version");

    await mkdir(join(projectSkillsDir, "my-skill"), { recursive: true });
    await writeFile(join(projectSkillsDir, "my-skill", "SKILL.md"), "# Project Version");

    await mvToProject("my-skill", {
      globalSkillsDir,
      projectSkillsDir,
      force: true,
    });

    const content = await readFile(join(projectSkillsDir, "my-skill", "SKILL.md"), "utf-8");
    expect(content).toBe("# Global Version");
  });

  test("creates project skills directory if missing", async () => {
    const globalSkill = join(globalSkillsDir, "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# Skill");

    // projectSkillsDir does not exist yet
    await mvToProject("my-skill", {
      globalSkillsDir,
      projectSkillsDir,
    });

    const content = await readFile(join(projectSkillsDir, "my-skill", "SKILL.md"), "utf-8");
    expect(content).toBe("# Skill");
  });
});
