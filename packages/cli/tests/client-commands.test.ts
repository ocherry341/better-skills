import { describe, test, expect, beforeEach } from "bun:test";
import { writeFile, mkdir, readFile, stat, lstat, readlink, symlink } from "fs/promises";
import { join, dirname } from "path";
import { clientAdd, clientRm, clientLs } from "../src/commands/client.js";
import { readConfig, getClientSkillsDir } from "../src/core/clients.js";
import {
  cleanTestHome,
  getStorePath,
  getGlobalSkillsPath,
  getConfigPath,
  getProjectRoot,
  home,
} from "../src/utils/paths.js";

describe("client commands", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getStorePath(), { recursive: true });
    await mkdir(getGlobalSkillsPath(), { recursive: true });
  });

  describe("clientAdd", () => {
    test("fresh add creates symlink to agents dir", async () => {
      await clientAdd("claude");

      const config = await readConfig();
      expect(config.clients).toContain("claude");

      const clientDir = getClientSkillsDir("claude");
      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);

      const target = await readlink(clientDir);
      expect(target).toBe(getGlobalSkillsPath());
    });

    test("already correct symlink prints already enabled", async () => {
      const clientDir = getClientSkillsDir("claude");
      await mkdir(dirname(clientDir), { recursive: true });
      await symlink(getGlobalSkillsPath(), clientDir);

      await clientAdd("claude");

      // Still a symlink pointing to correct target
      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);
      const target = await readlink(clientDir);
      expect(target).toBe(getGlobalSkillsPath());

      // Config should still have client
      const config = await readConfig();
      expect(config.clients).toContain("claude");
    });

    test("symlink to wrong target throws error", async () => {
      const clientDir = getClientSkillsDir("claude");
      const wrongTarget = join(home(), "wrong-dir");
      await mkdir(wrongTarget, { recursive: true });
      await mkdir(dirname(clientDir), { recursive: true });
      await symlink(wrongTarget, clientDir);

      await expect(clientAdd("claude")).rejects.toThrow("symlink");
    });

    test("empty existing dir is replaced with symlink", async () => {
      const clientDir = getClientSkillsDir("claude");
      await mkdir(clientDir, { recursive: true });

      await clientAdd("claude");

      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);
      const target = await readlink(clientDir);
      expect(target).toBe(getGlobalSkillsPath());
    });

    test("existing dir with skills migrates to agents dir and creates symlink", async () => {
      const clientDir = getClientSkillsDir("claude");
      const skillDir = join(clientDir, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "# My Skill");

      await clientAdd("claude");

      // Skill should now be in agents dir
      const movedContent = await readFile(join(getGlobalSkillsPath(), "my-skill", "SKILL.md"), "utf-8");
      expect(movedContent).toBe("# My Skill");

      // Client dir should be a symlink
      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);
    });

    test("existing dir with conflicting skills throws error", async () => {
      const clientDir = getClientSkillsDir("claude");

      // Same skill name in both dirs
      await mkdir(join(clientDir, "my-skill"), { recursive: true });
      await writeFile(join(clientDir, "my-skill", "SKILL.md"), "# Client Version");

      await mkdir(join(getGlobalSkillsPath(), "my-skill"), { recursive: true });
      await writeFile(join(getGlobalSkillsPath(), "my-skill", "SKILL.md"), "# Agents Version");

      await expect(clientAdd("claude")).rejects.toThrow("conflict");

      // Client dir should still be a real directory (unchanged)
      const linkStat = await lstat(clientDir);
      expect(linkStat.isDirectory()).toBe(true);
      expect(linkStat.isSymbolicLink()).toBe(false);
    });

    test("rejects unknown client ID", async () => {
      await expect(clientAdd("bogus")).rejects.toThrow("Unknown client");
    });

    test("rejects agents as client", async () => {
      await expect(clientAdd("agents")).rejects.toThrow("always enabled");
    });

    test("creates project-level symlink for client with projectSubdir", async () => {
      await clientAdd("claude");

      const symlinkPath = join(getProjectRoot(), ".claude", "skills");
      const linkStat = await lstat(symlinkPath);
      expect(linkStat.isSymbolicLink()).toBe(true);

      const target = await readlink(symlinkPath);
      expect(target).toBe(join("..", ".agents", "skills"));
    });

    test("creates .agents/skills if it does not exist", async () => {
      await clientAdd("claude");

      const agentsSkills = join(getProjectRoot(), ".agents", "skills");
      const s = await stat(agentsSkills);
      expect(s.isDirectory()).toBe(true);
    });

    test("skips symlink if target already exists as real directory", async () => {
      const claudeSkills = join(getProjectRoot(), ".claude", "skills");
      await mkdir(claudeSkills, { recursive: true });
      await writeFile(join(claudeSkills, "existing.md"), "keep me");

      await clientAdd("claude");

      // Should still be a real directory, not a symlink
      const linkStat = await lstat(claudeSkills);
      expect(linkStat.isSymbolicLink()).toBe(false);
      expect(linkStat.isDirectory()).toBe(true);
    });

    test("is idempotent when symlink already correct", async () => {
      // Run twice
      await clientAdd("claude");
      await clientAdd("claude");

      const symlinkPath = join(getProjectRoot(), ".claude", "skills");
      const linkStat = await lstat(symlinkPath);
      expect(linkStat.isSymbolicLink()).toBe(true);
    });

    test("skips project symlink for client with null projectSubdir", async () => {
      await clientAdd("amp");

      // .amp/skills should NOT exist
      const ampSkills = join(getProjectRoot(), ".amp", "skills");
      await expect(stat(ampSkills)).rejects.toThrow();
    });

    test("handles copilot special path .github/skills", async () => {
      await clientAdd("copilot");

      const symlinkPath = join(getProjectRoot(), ".github", "skills");
      const linkStat = await lstat(symlinkPath);
      expect(linkStat.isSymbolicLink()).toBe(true);

      const target = await readlink(symlinkPath);
      expect(target).toBe(join("..", ".agents", "skills"));
    });
  });

  describe("clientRm", () => {
    test("removes client from config", async () => {
      await writeFile(getConfigPath(), JSON.stringify({ clients: ["claude", "cursor"] }));

      const clientDir = getClientSkillsDir("claude");
      await mkdir(dirname(clientDir), { recursive: true });
      await symlink(getGlobalSkillsPath(), clientDir);

      await clientRm("claude");

      const config = await readConfig();
      expect(config.clients).not.toContain("claude");
      expect(config.clients).toContain("cursor");
    });

    test("removes symlink on clientRm", async () => {
      await writeFile(getConfigPath(), JSON.stringify({ clients: ["claude"] }));

      const clientDir = getClientSkillsDir("claude");
      await mkdir(dirname(clientDir), { recursive: true });
      await symlink(getGlobalSkillsPath(), clientDir);

      await clientRm("claude");

      // Symlink should be gone
      await expect(lstat(clientDir)).rejects.toThrow();
      // But agents dir should still exist
      const s = await stat(getGlobalSkillsPath());
      expect(s.isDirectory()).toBe(true);
    });

    test("errors when globalDir is a real directory", async () => {
      await writeFile(getConfigPath(), JSON.stringify({ clients: ["claude"] }));

      // Create a real directory (legacy state, not a symlink)
      const clientDir = getClientSkillsDir("claude");
      await mkdir(join(clientDir, "my-skill"), { recursive: true });
      await writeFile(join(clientDir, "my-skill", "SKILL.md"), "test");

      await expect(clientRm("claude")).rejects.toThrow("real directory");

      // Directory should be untouched
      const s = await stat(join(clientDir, "my-skill", "SKILL.md"));
      expect(s.isFile()).toBe(true);
    });

    test("rejects agents removal", async () => {
      await expect(clientRm("agents")).rejects.toThrow("always enabled");
    });

    test("removes project-level symlink", async () => {
      const agentsSkills = join(getProjectRoot(), ".agents", "skills");
      await mkdir(agentsSkills, { recursive: true });

      // Create the symlink manually
      const claudeDir = join(getProjectRoot(), ".claude");
      await mkdir(claudeDir, { recursive: true });
      const symlinkPath = join(claudeDir, "skills");
      await symlink(join("..", ".agents", "skills"), symlinkPath);

      await writeFile(getConfigPath(), JSON.stringify({ clients: ["claude"] }));

      const clientDir = getClientSkillsDir("claude");
      await mkdir(dirname(clientDir), { recursive: true });
      await symlink(getGlobalSkillsPath(), clientDir);

      await clientRm("claude");

      await expect(lstat(symlinkPath)).rejects.toThrow();
    });

    test("does not remove real directory on clientRm project-level", async () => {
      const claudeSkills = join(getProjectRoot(), ".claude", "skills");
      await mkdir(claudeSkills, { recursive: true });
      await writeFile(join(claudeSkills, "keep.md"), "important");

      await writeFile(getConfigPath(), JSON.stringify({ clients: ["claude"] }));

      const clientDir = getClientSkillsDir("claude");
      await mkdir(dirname(clientDir), { recursive: true });
      await symlink(getGlobalSkillsPath(), clientDir);

      await clientRm("claude");

      // Real directory should still exist
      const s = await stat(claudeSkills);
      expect(s.isDirectory()).toBe(true);
    });

    test("no-op when globalDir does not exist", async () => {
      await writeFile(getConfigPath(), JSON.stringify({ clients: ["claude"] }));

      // Should not throw
      await clientRm("claude");

      const config = await readConfig();
      expect(config.clients).not.toContain("claude");
    });

    test("skips project removal for client with null projectSubdir", async () => {
      await writeFile(getConfigPath(), JSON.stringify({ clients: ["amp"] }));

      const clientDir = getClientSkillsDir("amp");
      await mkdir(dirname(clientDir), { recursive: true });
      await symlink(getGlobalSkillsPath(), clientDir);

      // Should not throw
      await clientRm("amp");
    });
  });

  describe("clientLs", () => {
    test("lists all clients with enabled status", async () => {
      await writeFile(getConfigPath(), JSON.stringify({ clients: ["claude"] }));

      const items = await clientLs();
      const claude = items.find((i) => i.id === "claude");
      const cursor = items.find((i) => i.id === "cursor");

      expect(claude?.enabled).toBe(true);
      expect(cursor?.enabled).toBe(false);
    });

    test("includes path for each client", async () => {
      const items = await clientLs();
      for (const item of items) {
        expect(item.path).toBeTruthy();
      }
    });
  });
});
