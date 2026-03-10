import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  CLIENT_REGISTRY,
  readConfig,
  writeConfig,
  getEnabledClients,
  getClientSkillsDir,
  getClientProjectSubdir,
  resolveClientDirs,
} from "../src/core/clients.js";

describe("clients", () => {
  let baseDir: string;
  let configPath: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "clients-test-"));
    configPath = join(baseDir, "config.json");
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  describe("CLIENT_REGISTRY", () => {
    test("contains all known clients", () => {
      expect(CLIENT_REGISTRY).toHaveProperty("claude");
      expect(CLIENT_REGISTRY).toHaveProperty("cursor");
      expect(CLIENT_REGISTRY).toHaveProperty("opencode");
      expect(CLIENT_REGISTRY).toHaveProperty("gemini");
      expect(CLIENT_REGISTRY).toHaveProperty("copilot");
      expect(CLIENT_REGISTRY).toHaveProperty("roo");
      expect(CLIENT_REGISTRY).toHaveProperty("goose");
      expect(CLIENT_REGISTRY).toHaveProperty("amp");
    });

    test("does not contain agents (implicit)", () => {
      expect(CLIENT_REGISTRY).not.toHaveProperty("agents");
    });
  });

  describe("readConfig", () => {
    test("returns empty clients when file missing", async () => {
      const config = await readConfig(configPath);
      expect(config).toEqual({ clients: [] });
    });

    test("reads valid config", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude", "cursor"] }));
      const config = await readConfig(configPath);
      expect(config).toEqual({ clients: ["claude", "cursor"] });
    });

    test("returns empty clients for corrupted JSON", async () => {
      await writeFile(configPath, "not json {{{");
      const config = await readConfig(configPath);
      expect(config).toEqual({ clients: [] });
    });
  });

  describe("writeConfig", () => {
    test("writes config to disk", async () => {
      await writeConfig({ clients: ["claude"] }, configPath);
      const raw = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed).toEqual({ clients: ["claude"] });
    });

    test("filters out invalid client IDs", async () => {
      await writeConfig({ clients: ["claude", "invalid-client"] as any }, configPath);
      const config = await readConfig(configPath);
      expect(config.clients).toEqual(["claude"]);
    });

    test("deduplicates client IDs", async () => {
      await writeConfig({ clients: ["claude", "claude"] }, configPath);
      const config = await readConfig(configPath);
      expect(config.clients).toEqual(["claude"]);
    });

    test("filters out agents from stored config", async () => {
      await writeConfig({ clients: ["agents", "claude"] as any }, configPath);
      const config = await readConfig(configPath);
      expect(config.clients).toEqual(["claude"]);
    });
  });

  describe("getEnabledClients", () => {
    test("returns empty array when no config", async () => {
      const clients = await getEnabledClients(configPath);
      expect(clients).toEqual([]);
    });

    test("returns configured clients", async () => {
      await writeConfig({ clients: ["claude", "cursor"] }, configPath);
      const clients = await getEnabledClients(configPath);
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

  describe("resolveClientDirs", () => {
    test("returns dirs for enabled clients", async () => {
      await writeConfig({ clients: ["claude", "cursor"] }, configPath);
      const dirs = await resolveClientDirs(configPath);
      expect(dirs).toHaveLength(2);
      expect(dirs[0]).toMatch(/\.claude\/skills$/);
      expect(dirs[1]).toMatch(/\.cursor\/skills$/);
    });

    test("returns empty array when no clients configured", async () => {
      const dirs = await resolveClientDirs(configPath);
      expect(dirs).toEqual([]);
    });
  });
});
