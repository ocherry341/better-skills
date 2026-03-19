import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir, stat, lstat, readlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { clientAdd, clientRm, clientLs } from "../src/commands/client.js";
import { readConfig } from "../src/core/clients.js";

describe("client commands", () => {
  let baseDir: string;
  let configPath: string;
  let registryPath: string;
  let storeDir: string;
  let skillsDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "client-cmd-"));
    configPath = join(baseDir, "config.json");
    registryPath = join(baseDir, "registry.json");
    storeDir = join(baseDir, "store");
    skillsDir = join(baseDir, "agents-skills");
    await mkdir(storeDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  describe("clientAdd", () => {
    test("fresh add creates symlink to agents dir", async () => {
      const clientDir = join(baseDir, "claude-skills");

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
      });

      const config = await readConfig(configPath);
      expect(config.clients).toContain("claude");

      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);

      const target = await readlink(clientDir);
      expect(target).toBe(skillsDir);
    });

    test("already correct symlink prints already enabled", async () => {
      const clientDir = join(baseDir, "claude-skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(skillsDir, clientDir);

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
      });

      // Still a symlink pointing to correct target
      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);
      const target = await readlink(clientDir);
      expect(target).toBe(skillsDir);

      // Config should still have client
      const config = await readConfig(configPath);
      expect(config.clients).toContain("claude");
    });

    test("symlink to wrong target throws error", async () => {
      const clientDir = join(baseDir, "claude-skills");
      const wrongTarget = join(baseDir, "wrong-dir");
      await mkdir(wrongTarget, { recursive: true });
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(wrongTarget, clientDir);

      await expect(
        clientAdd("claude", {
          configPath,
          registryPath,
          storePath: storeDir,
          skillsDir,
          clientDirOverrides: { claude: clientDir },
          globalSkillsDir: skillsDir,
        })
      ).rejects.toThrow("symlink");
    });

    test("empty existing dir is replaced with symlink", async () => {
      const clientDir = join(baseDir, "claude-skills");
      await mkdir(clientDir, { recursive: true });

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
      });

      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);
      const target = await readlink(clientDir);
      expect(target).toBe(skillsDir);
    });

    test("existing dir with skills migrates to agents dir and creates symlink", async () => {
      const clientDir = join(baseDir, "claude-skills");
      const skillDir = join(clientDir, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "# My Skill");

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
      });

      // Skill should now be in agents dir
      const movedContent = await readFile(join(skillsDir, "my-skill", "SKILL.md"), "utf-8");
      expect(movedContent).toBe("# My Skill");

      // Client dir should be a symlink
      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);
    });

    test("existing dir with conflicting skills throws error", async () => {
      const clientDir = join(baseDir, "claude-skills");

      // Same skill name in both dirs
      await mkdir(join(clientDir, "my-skill"), { recursive: true });
      await writeFile(join(clientDir, "my-skill", "SKILL.md"), "# Client Version");

      await mkdir(join(skillsDir, "my-skill"), { recursive: true });
      await writeFile(join(skillsDir, "my-skill", "SKILL.md"), "# Agents Version");

      await expect(
        clientAdd("claude", {
          configPath,
          registryPath,
          storePath: storeDir,
          skillsDir,
          clientDirOverrides: { claude: clientDir },
          globalSkillsDir: skillsDir,
        })
      ).rejects.toThrow("conflict");

      // Client dir should still be a real directory (unchanged)
      const linkStat = await lstat(clientDir);
      expect(linkStat.isDirectory()).toBe(true);
      expect(linkStat.isSymbolicLink()).toBe(false);
    });

    test("rejects unknown client ID", async () => {
      await expect(
        clientAdd("bogus", {
          configPath,
          registryPath,
          storePath: storeDir,
          skillsDir,
        })
      ).rejects.toThrow("Unknown client");
    });

    test("rejects agents as client", async () => {
      await expect(
        clientAdd("agents", {
          configPath,
          registryPath,
          storePath: storeDir,
          skillsDir,
        })
      ).rejects.toThrow("always enabled");
    });

    test("creates project-level symlink for client with projectSubdir", async () => {
      const projectDir = join(baseDir, "my-project");
      const agentsSkills = join(projectDir, ".agents", "skills");
      await mkdir(agentsSkills, { recursive: true });

      const clientDir = join(baseDir, "claude-skills");

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      const symlinkPath = join(projectDir, ".claude", "skills");
      const linkStat = await lstat(symlinkPath);
      expect(linkStat.isSymbolicLink()).toBe(true);

      const target = await readlink(symlinkPath);
      expect(target).toBe(join("..", ".agents", "skills"));
    });

    test("creates .agents/skills if it does not exist", async () => {
      const projectDir = join(baseDir, "my-project");
      await mkdir(projectDir, { recursive: true });

      const clientDir = join(baseDir, "claude-skills");

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      const agentsSkills = join(projectDir, ".agents", "skills");
      const s = await stat(agentsSkills);
      expect(s.isDirectory()).toBe(true);
    });

    test("skips symlink if target already exists as real directory", async () => {
      const projectDir = join(baseDir, "my-project");
      const claudeSkills = join(projectDir, ".claude", "skills");
      await mkdir(claudeSkills, { recursive: true });
      await writeFile(join(claudeSkills, "existing.md"), "keep me");

      const clientDir = join(baseDir, "claude-skills");

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      // Should still be a real directory, not a symlink
      const linkStat = await lstat(claudeSkills);
      expect(linkStat.isSymbolicLink()).toBe(false);
      expect(linkStat.isDirectory()).toBe(true);
    });

    test("is idempotent when symlink already correct", async () => {
      const projectDir = join(baseDir, "my-project");
      const agentsSkills = join(projectDir, ".agents", "skills");
      await mkdir(agentsSkills, { recursive: true });

      const clientDir = join(baseDir, "claude-skills");

      // Run twice
      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });
      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      const symlinkPath = join(projectDir, ".claude", "skills");
      const linkStat = await lstat(symlinkPath);
      expect(linkStat.isSymbolicLink()).toBe(true);
    });

    test("skips project symlink for client with null projectSubdir", async () => {
      const projectDir = join(baseDir, "my-project");
      await mkdir(projectDir, { recursive: true });

      const clientDir = join(baseDir, "amp-skills");

      await clientAdd("amp", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { amp: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      // .amp/skills should NOT exist
      const ampSkills = join(projectDir, ".amp", "skills");
      await expect(stat(ampSkills)).rejects.toThrow();
    });

    test("handles copilot special path .github/skills", async () => {
      const projectDir = join(baseDir, "my-project");
      const agentsSkills = join(projectDir, ".agents", "skills");
      await mkdir(agentsSkills, { recursive: true });

      const clientDir = join(baseDir, "copilot-skills");

      await clientAdd("copilot", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { copilot: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      const symlinkPath = join(projectDir, ".github", "skills");
      const linkStat = await lstat(symlinkPath);
      expect(linkStat.isSymbolicLink()).toBe(true);

      const target = await readlink(symlinkPath);
      expect(target).toBe(join("..", ".agents", "skills"));
    });
  });

  describe("clientRm", () => {
    test("removes client from config", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude", "cursor"] }));

      const clientDir = join(baseDir, "claude-skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(skillsDir, clientDir);

      await clientRm("claude", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
      });

      const config = await readConfig(configPath);
      expect(config.clients).not.toContain("claude");
      expect(config.clients).toContain("cursor");
    });

    test("removes symlink on clientRm", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      const clientDir = join(baseDir, "claude-skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(skillsDir, clientDir);

      await clientRm("claude", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
      });

      // Symlink should be gone
      await expect(lstat(clientDir)).rejects.toThrow();
      // But agents dir should still exist
      const s = await stat(skillsDir);
      expect(s.isDirectory()).toBe(true);
    });

    test("errors when globalDir is a real directory", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      // Create a real directory (legacy state, not a symlink)
      const clientDir = join(baseDir, "claude-skills");
      await mkdir(join(clientDir, "my-skill"), { recursive: true });
      await writeFile(join(clientDir, "my-skill", "SKILL.md"), "test");

      await expect(
        clientRm("claude", {
          configPath,
          registryPath,
          skillsDir,
          clientDirOverrides: { claude: clientDir },
        })
      ).rejects.toThrow("real directory");

      // Directory should be untouched
      const s = await stat(join(clientDir, "my-skill", "SKILL.md"));
      expect(s.isFile()).toBe(true);
    });

    test("rejects agents removal", async () => {
      await expect(
        clientRm("agents", {
          configPath,
          registryPath,
          skillsDir,
        })
      ).rejects.toThrow("always enabled");
    });

    test("removes project-level symlink", async () => {
      const projectDir = join(baseDir, "my-project");
      const agentsSkills = join(projectDir, ".agents", "skills");
      await mkdir(agentsSkills, { recursive: true });

      // Create the symlink manually
      const claudeDir = join(projectDir, ".claude");
      await mkdir(claudeDir, { recursive: true });
      const symlinkPath = join(claudeDir, "skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(join("..", ".agents", "skills"), symlinkPath);

      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      const clientDir = join(baseDir, "claude-skills");
      await symlinkFn(skillsDir, clientDir);

      await clientRm("claude", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        projectRoot: projectDir,
      });

      await expect(lstat(symlinkPath)).rejects.toThrow();
    });

    test("does not remove real directory on clientRm project-level", async () => {
      const projectDir = join(baseDir, "my-project");
      const claudeSkills = join(projectDir, ".claude", "skills");
      await mkdir(claudeSkills, { recursive: true });
      await writeFile(join(claudeSkills, "keep.md"), "important");

      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      const clientDir = join(baseDir, "claude-skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(skillsDir, clientDir);

      await clientRm("claude", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        projectRoot: projectDir,
      });

      // Real directory should still exist
      const s = await stat(claudeSkills);
      expect(s.isDirectory()).toBe(true);
    });

    test("no-op when globalDir does not exist", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      const clientDir = join(baseDir, "nonexistent-claude-skills");

      // Should not throw
      await clientRm("claude", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
      });

      const config = await readConfig(configPath);
      expect(config.clients).not.toContain("claude");
    });

    test("skips project removal for client with null projectSubdir", async () => {
      const projectDir = join(baseDir, "my-project");
      await mkdir(projectDir, { recursive: true });

      await writeFile(configPath, JSON.stringify({ clients: ["amp"] }));

      const clientDir = join(baseDir, "amp-skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(skillsDir, clientDir);

      // Should not throw
      await clientRm("amp", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { amp: clientDir },
        projectRoot: projectDir,
      });
    });
  });

  describe("clientLs", () => {
    test("lists all clients with enabled status", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      const items = await clientLs({ configPath });
      const claude = items.find((i) => i.id === "claude");
      const cursor = items.find((i) => i.id === "cursor");

      expect(claude?.enabled).toBe(true);
      expect(cursor?.enabled).toBe(false);
    });

    test("includes path for each client", async () => {
      const items = await clientLs({ configPath });
      for (const item of items) {
        expect(item.path).toBeTruthy();
      }
    });
  });
});
