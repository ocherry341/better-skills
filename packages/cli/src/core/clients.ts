import { readFile, writeFile, mkdir, lstat, readlink, symlink } from "fs/promises";
import { dirname, join } from "path";
import { getConfigPath, home } from "../utils/paths.js";

export interface ClientEntry {
  globalDir: string;
  projectSubdir: string | null;
}

/**
 * Built-in client registry: client ID -> ClientEntry.
 * Does NOT include "agents" — that's always-on and handled separately.
 */
export function getClientRegistry(): Record<string, ClientEntry> {
  const h = home();
  return {
    claude:   { globalDir: join(h, ".claude", "skills"),                 projectSubdir: join(".claude", "skills") },
    cursor:   { globalDir: join(h, ".cursor", "skills"),                 projectSubdir: join(".cursor", "skills") },
    opencode: { globalDir: join(h, ".config", "opencode", "skills"),     projectSubdir: join(".opencode", "skills") },
    gemini:   { globalDir: join(h, ".gemini", "skills"),                 projectSubdir: join(".gemini", "skills") },
    copilot:  { globalDir: join(h, ".copilot", "skills"),                projectSubdir: join(".github", "skills") },
    roo:      { globalDir: join(h, ".roo", "skills"),                    projectSubdir: join(".roo", "skills") },
    goose:    { globalDir: join(h, ".config", "goose", "skills"),        projectSubdir: join(".goose", "skills") },
    amp:      { globalDir: join(h, ".config", "amp", "skills"),          projectSubdir: null },
  };
}

export const VALID_CLIENT_IDS = ["claude", "cursor", "opencode", "gemini", "copilot", "roo", "goose", "amp"];

export interface Config {
  clients: string[];
}

/**
 * Read the global config file.
 * Missing or corrupted -> empty config.
 */
export async function readConfig(configPath?: string): Promise<Config> {
  const filePath = configPath ?? getConfigPath();
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.clients)) {
      // Filter to valid client IDs only
      const valid: string[] = parsed.clients.filter(
        (c: unknown): c is string => typeof c === "string" && VALID_CLIENT_IDS.includes(c)
      );
      return { clients: [...new Set(valid)] };
    }
    return { clients: [] };
  } catch {
    return { clients: [] };
  }
}

/**
 * Write config to disk.
 * Filters invalid IDs, deduplicates, and excludes "agents".
 */
export async function writeConfig(
  config: Config,
  configPath?: string
): Promise<void> {
  const filePath = configPath ?? getConfigPath();
  const valid = config.clients.filter(
    (c) => VALID_CLIENT_IDS.includes(c)
  );
  const deduped = [...new Set(valid)];

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify({ clients: deduped }, null, 2) + "\n"
  );
}

/**
 * Get enabled client IDs from config (does NOT include "agents").
 */
export async function getEnabledClients(configPath?: string): Promise<string[]> {
  const config = await readConfig(configPath);
  return config.clients;
}

/**
 * Get the global skills directory path for a client ID.
 * Throws for unknown client IDs.
 */
export function getClientSkillsDir(clientId: string): string {
  const registry = getClientRegistry();
  const entry = registry[clientId];
  if (!entry) {
    throw new Error(
      `Unknown client '${clientId}'. Valid clients: ${VALID_CLIENT_IDS.join(", ")}`
    );
  }
  return entry.globalDir;
}

/**
 * Get the project-level subdirectory for a client ID.
 * Returns null if the client has no project-level path.
 */
export function getClientProjectSubdir(clientId: string): string | null {
  const registry = getClientRegistry();
  const entry = registry[clientId];
  if (!entry) {
    throw new Error(
      `Unknown client '${clientId}'. Valid clients: ${VALID_CLIENT_IDS.join(", ")}`
    );
  }
  return entry.projectSubdir;
}

export async function ensureClientSymlink(
  clientId: string,
  agentsDir: string,
  clientDirOverride?: string
): Promise<"created" | "exists" | "skipped"> {
  const globalDir = clientDirOverride ?? getClientSkillsDir(clientId);

  try {
    const st = await lstat(globalDir);
    if (st.isSymbolicLink()) {
      const target = await readlink(globalDir);
      if (target === agentsDir) {
        return "exists";
      }
      console.warn(`⚠ ${globalDir} symlinks to ${target}, not ${agentsDir}. Run 'bsk client add ${clientId}' to fix.`);
      return "skipped";
    }
    if (st.isDirectory()) {
      console.warn(`⚠ ${globalDir} is a real directory. Run 'bsk client add ${clientId}' to migrate.`);
      return "skipped";
    }
    return "skipped";
  } catch (err: any) {
    if (err.code === "ENOENT") {
      await mkdir(dirname(globalDir), { recursive: true });
      await symlink(agentsDir, globalDir);
      return "created";
    }
    throw err;
  }
}
