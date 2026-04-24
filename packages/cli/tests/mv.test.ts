import { describe, test, expect, beforeEach } from "bun:test";
import { mkdir, writeFile, readFile, stat } from "fs/promises";
import { join } from "path";
import { mvToProject, mvToGlobal } from "../src/commands/mv.js";
import { readRegistry } from "../src/core/registry.js";
import { cleanTestHome, getGlobalSkillsPath, getProjectSkillsPath, getStorePath } from "../src/utils/paths.js";

function projectSkillsPath(): string {
  const path = getProjectSkillsPath();
  if (!path) throw new Error("Expected project skills path in test mode");
  return path;
}

describe("mv to project", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getGlobalSkillsPath(), { recursive: true });
  });

  test("copies global skill to project as unmanaged directory", async () => {
    const globalSkill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# My Skill");

    await mvToProject("my-skill");

    // Project copy exists
    const content = await readFile(join(projectSkillsPath(), "my-skill", "SKILL.md"), "utf-8");
    expect(content).toBe("# My Skill");

    // Global copy still exists
    const globalContent = await readFile(join(globalSkill, "SKILL.md"), "utf-8");
    expect(globalContent).toBe("# My Skill");
  });

  test("errors when skill not found in global", async () => {
    expect(
      mvToProject("nonexistent")
    ).rejects.toThrow("not found");
  });

  test("errors when skill already exists in project without --force", async () => {
    const globalSkill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# Global");

    await mkdir(join(projectSkillsPath(), "my-skill"), { recursive: true });
    await writeFile(join(projectSkillsPath(), "my-skill", "SKILL.md"), "# Project");

    expect(
      mvToProject("my-skill")
    ).rejects.toThrow("already exists");
  });

  test("overwrites project skill with --force", async () => {
    const globalSkill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# Global Version");

    await mkdir(join(projectSkillsPath(), "my-skill"), { recursive: true });
    await writeFile(join(projectSkillsPath(), "my-skill", "SKILL.md"), "# Project Version");

    await mvToProject("my-skill", {
      force: true,
    });

    const content = await readFile(join(projectSkillsPath(), "my-skill", "SKILL.md"), "utf-8");
    expect(content).toBe("# Global Version");
  });

  test("creates project skills directory if missing", async () => {
    const globalSkill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# Skill");

    // projectSkillsDir does not exist yet
    await mvToProject("my-skill");

    const content = await readFile(join(projectSkillsPath(), "my-skill", "SKILL.md"), "utf-8");
    expect(content).toBe("# Skill");
  });

});

describe("mv to global", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getGlobalSkillsPath(), { recursive: true });
    await mkdir(projectSkillsPath(), { recursive: true });
    await mkdir(getStorePath(), { recursive: true });
  });

  test("moves project skill to global: store, register, link, remove project copy", async () => {
    const projectSkill = join(projectSkillsPath(), "my-skill");
    await mkdir(projectSkill, { recursive: true });
    await writeFile(join(projectSkill, "SKILL.md"), "# My Skill");

    await mvToGlobal("my-skill");

    // Global copy exists
    const content = await readFile(join(getGlobalSkillsPath(), "my-skill", "SKILL.md"), "utf-8");
    expect(content).toBe("# My Skill");

    // Project copy removed
    await expect(stat(projectSkill)).rejects.toThrow();

    // Registered in registry
    const reg = await readRegistry();
    expect(reg.skills["my-skill"]).toBeDefined();
    expect(reg.skills["my-skill"].versions).toHaveLength(1);
    expect(reg.skills["my-skill"].versions[0].source).toBe("local");
  });

  test("errors when skill not found in project", async () => {
    expect(
      mvToGlobal("nonexistent")
    ).rejects.toThrow("not found");
  });

  test("errors when skill already exists in global without --force", async () => {
    const projectSkill = join(projectSkillsPath(), "my-skill");
    await mkdir(projectSkill, { recursive: true });
    await writeFile(join(projectSkill, "SKILL.md"), "# Project");

    const globalSkill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# Global");

    expect(
      mvToGlobal("my-skill")
    ).rejects.toThrow("already exists");
  });

  test("overwrites global skill with --force", async () => {
    const projectSkill = join(projectSkillsPath(), "my-skill");
    await mkdir(projectSkill, { recursive: true });
    await writeFile(join(projectSkill, "SKILL.md"), "# From Project");

    const globalSkill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# Old Global");

    await mvToGlobal("my-skill", {
      force: true,
    });

    const content = await readFile(join(getGlobalSkillsPath(), "my-skill", "SKILL.md"), "utf-8");
    expect(content).toBe("# From Project");

    // Project copy removed
    await expect(stat(projectSkill)).rejects.toThrow();
  });

});
