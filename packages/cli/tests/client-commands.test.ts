import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, readFile, stat } from "fs/promises";
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
    test("adds client to config", async () => {
      await clientAdd(["claude"], {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
      });

      const config = await readConfig(configPath);
      expect(config.clients).toContain("claude");
    });

    test("adds multiple clients", async () => {
      await clientAdd(["claude", "cursor"], {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
      });

      const config = await readConfig(configPath);
      expect(config.clients).toContain("claude");
      expect(config.clients).toContain("cursor");
    });

    test("syncs existing skills to new client", async () => {
      // Set up a managed skill in the store and registry
      const hash = "abc123def456";
      const skillStore = join(storeDir, hash);
      await mkdir(skillStore, { recursive: true });
      await writeFile(join(skillStore, "SKILL.md"), "---\nname: my-skill\n---\n# Test");

      // Register it
      await writeFile(
        registryPath,
        JSON.stringify({ skills: { "my-skill": { hash, source: "test/repo" } } })
      );

      // Link to agents dir
      const agentSkillDir = join(skillsDir, "my-skill");
      await mkdir(agentSkillDir, { recursive: true });
      await writeFile(join(agentSkillDir, "SKILL.md"), "---\nname: my-skill\n---\n# Test");

      // Now add a client — should sync existing skill
      const clientSkillsBase = join(baseDir, "claude-skills");
      await clientAdd(["claude"], {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientSkillsBase },
      });

      // Verify skill was linked to client dir
      const content = await readFile(join(clientSkillsBase, "my-skill", "SKILL.md"), "utf-8");
      expect(content).toContain("my-skill");
    });

    test("rejects unknown client ID", async () => {
      await expect(
        clientAdd(["bogus"], {
          configPath,
          registryPath,
          storePath: storeDir,
          skillsDir,
        })
      ).rejects.toThrow("Unknown client");
    });

    test("rejects agents as client", async () => {
      await expect(
        clientAdd(["agents"], {
          configPath,
          registryPath,
          storePath: storeDir,
          skillsDir,
        })
      ).rejects.toThrow("always enabled");
    });
  });

  describe("clientRm", () => {
    test("removes client from config", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude", "cursor"] }));

      await clientRm(["claude"], {
        configPath,
        registryPath,
        skillsDir,
      });

      const config = await readConfig(configPath);
      expect(config.clients).not.toContain("claude");
      expect(config.clients).toContain("cursor");
    });

    test("removes managed skill links from client dir", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      // Create a skill in the client dir
      const clientSkillsBase = join(baseDir, "claude-skills");
      const clientSkillDir = join(clientSkillsBase, "my-skill");
      await mkdir(clientSkillDir, { recursive: true });
      await writeFile(join(clientSkillDir, "SKILL.md"), "test");

      // Register in registry so it's managed
      await writeFile(
        registryPath,
        JSON.stringify({ skills: { "my-skill": { hash: "abc", source: "test" } } })
      );

      await clientRm(["claude"], {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { claude: clientSkillsBase },
      });

      await expect(stat(clientSkillDir)).rejects.toThrow();
    });

    test("rejects agents removal", async () => {
      await expect(
        clientRm(["agents"], {
          configPath,
          registryPath,
          skillsDir,
        })
      ).rejects.toThrow("always enabled");
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
