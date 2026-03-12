import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { mvToProject, mvToGlobal } from "../src/commands/mv.js";
import { readRegistry } from "../src/core/registry.js";

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

describe("mv to global", () => {
  let baseDir: string;
  let globalSkillsDir: string;
  let projectSkillsDir: string;
  let registryPath: string;
  let storeDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "mv-global-"));
    globalSkillsDir = join(baseDir, "global-skills");
    projectSkillsDir = join(baseDir, "project-skills");
    registryPath = join(baseDir, "registry.json");
    storeDir = join(baseDir, "store");
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(globalSkillsDir, { recursive: true });
    await mkdir(projectSkillsDir, { recursive: true });
    await mkdir(storeDir, { recursive: true });
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("moves project skill to global: store, register, link, remove project copy", async () => {
    const projectSkill = join(projectSkillsDir, "my-skill");
    await mkdir(projectSkill, { recursive: true });
    await writeFile(join(projectSkill, "SKILL.md"), "# My Skill");

    await mvToGlobal("my-skill", {
      globalSkillsDir,
      projectSkillsDir,
      registryPath,
      storePath: storeDir,
      noClients: true,
      configPath: join(baseDir, "config.json"),
    });

    // Global copy exists
    const content = await readFile(join(globalSkillsDir, "my-skill", "SKILL.md"), "utf-8");
    expect(content).toBe("# My Skill");

    // Project copy removed
    await expect(stat(projectSkill)).rejects.toThrow();

    // Registered in registry
    const reg = await readRegistry(registryPath);
    expect(reg.skills["my-skill"]).toBeDefined();
    expect(reg.skills["my-skill"].versions).toHaveLength(1);
    expect(reg.skills["my-skill"].versions[0].source).toBe("local");
  });

  test("errors when skill not found in project", async () => {
    expect(
      mvToGlobal("nonexistent", {
        globalSkillsDir,
        projectSkillsDir,
        registryPath,
        storePath: storeDir,
        noClients: true,
      })
    ).rejects.toThrow("not found");
  });

  test("errors when skill already exists in global without --force", async () => {
    const projectSkill = join(projectSkillsDir, "my-skill");
    await mkdir(projectSkill, { recursive: true });
    await writeFile(join(projectSkill, "SKILL.md"), "# Project");

    const globalSkill = join(globalSkillsDir, "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# Global");

    expect(
      mvToGlobal("my-skill", {
        globalSkillsDir,
        projectSkillsDir,
        registryPath,
        storePath: storeDir,
        noClients: true,
      })
    ).rejects.toThrow("already exists");
  });

  test("overwrites global skill with --force", async () => {
    const projectSkill = join(projectSkillsDir, "my-skill");
    await mkdir(projectSkill, { recursive: true });
    await writeFile(join(projectSkill, "SKILL.md"), "# From Project");

    const globalSkill = join(globalSkillsDir, "my-skill");
    await mkdir(globalSkill, { recursive: true });
    await writeFile(join(globalSkill, "SKILL.md"), "# Old Global");

    await mvToGlobal("my-skill", {
      globalSkillsDir,
      projectSkillsDir,
      force: true,
      registryPath,
      storePath: storeDir,
      noClients: true,
      configPath: join(baseDir, "config.json"),
    });

    const content = await readFile(join(globalSkillsDir, "my-skill", "SKILL.md"), "utf-8");
    expect(content).toBe("# From Project");

    // Project copy removed
    await expect(stat(projectSkill)).rejects.toThrow();
  });
});
