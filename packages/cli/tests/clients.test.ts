import { describe, test, expect, beforeEach } from "bun:test";
import { readFile, writeFile, mkdir } from "fs/promises";
import {
  getClientRegistry,
  readConfig,
  writeConfig,
  getEnabledClients,
  getClientSkillsDir,
  getClientProjectSubdir,
} from "../src/core/clients.js";
import { cleanTestHome, getConfigPath, getBskDir } from "../src/utils/paths.js";

describe("clients", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getBskDir(), { recursive: true });
  });

  describe("getClientRegistry", () => {
    test("contains all known clients", () => {
      const registry = getClientRegistry();
      expect(registry).toHaveProperty("claude");
      expect(registry).toHaveProperty("cursor");
      expect(registry).toHaveProperty("opencode");
      expect(registry).toHaveProperty("gemini");
      expect(registry).toHaveProperty("copilot");
      expect(registry).toHaveProperty("roo");
      expect(registry).toHaveProperty("goose");
      expect(registry).toHaveProperty("amp");
    });

    test("does not contain agents (implicit)", () => {
      const registry = getClientRegistry();
      expect(registry).not.toHaveProperty("agents");
    });
  });

  describe("readConfig", () => {
    test("returns empty clients when file missing", async () => {
      const config = await readConfig();
      expect(config).toEqual({ clients: [] });
    });

    test("reads valid config", async () => {
      await writeFile(getConfigPath(), JSON.stringify({ clients: ["claude", "cursor"] }));
      const config = await readConfig();
      expect(config).toEqual({ clients: ["claude", "cursor"] });
    });

    test("returns empty clients for corrupted JSON", async () => {
      await writeFile(getConfigPath(), "not json {{{");
      const config = await readConfig();
      expect(config).toEqual({ clients: [] });
    });
  });

  describe("writeConfig", () => {
    test("writes config to disk", async () => {
      await writeConfig({ clients: ["claude"] });
      const raw = await readFile(getConfigPath(), "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed).toEqual({ clients: ["claude"] });
    });

    test("filters out invalid client IDs", async () => {
      await writeConfig({ clients: ["claude", "invalid-client"] as any });
      const config = await readConfig();
      expect(config.clients).toEqual(["claude"]);
    });

    test("deduplicates client IDs", async () => {
      await writeConfig({ clients: ["claude", "claude"] });
      const config = await readConfig();
      expect(config.clients).toEqual(["claude"]);
    });

    test("filters out agents from stored config", async () => {
      await writeConfig({ clients: ["agents", "claude"] as any });
      const config = await readConfig();
      expect(config.clients).toEqual(["claude"]);
    });
  });

  describe("getEnabledClients", () => {
    test("returns empty array when no config", async () => {
      const clients = await getEnabledClients();
      expect(clients).toEqual([]);
    });

    test("returns configured clients", async () => {
      await writeConfig({ clients: ["claude", "cursor"] });
      const clients = await getEnabledClients();
      expect(clients).toEqual(["claude", "cursor"]);
    });
  });

  describe("getClientSkillsDir", () => {
    test("returns path for known client", () => {
      const dir = getClientSkillsDir("claude");
      expect(dir).toMatch(/\.claude\/skills$/);
    });

    test("throws for unknown client", () => {
      expect(() => getClientSkillsDir("unknown")).toThrow();
    });
  });

  describe("getClientProjectSubdir", () => {
    test("returns subdir for claude", () => {
      const subdir = getClientProjectSubdir("claude");
      expect(subdir).toMatch(/\.claude\/skills$/);
    });

    test("returns null for amp", () => {
      const subdir = getClientProjectSubdir("amp");
      expect(subdir).toBeNull();
    });

    test("returns .github/skills for copilot", () => {
      const subdir = getClientProjectSubdir("copilot");
      expect(subdir).toMatch(/\.github\/skills$/);
    });

    test("throws for unknown client", () => {
      expect(() => getClientProjectSubdir("unknown")).toThrow();
    });
  });
});
