import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { homedir } from "os";
import { getConfigPath } from "../utils/paths.js";

const HOME = homedir();

/**
 * Built-in client registry: client ID -> global skills directory path.
 * Does NOT include "agents" — that's always-on and handled separately.
 */
export const CLIENT_REGISTRY: Record<string, string> = {
  claude: join(HOME, ".claude", "skills"),
  cursor: join(HOME, ".cursor", "skills"),
  opencode: join(HOME, ".config", "opencode", "skills"),
  gemini: join(HOME, ".gemini", "skills"),
  copilot: join(HOME, ".copilot", "skills"),
  roo: join(HOME, ".roo", "skills"),
  goose: join(HOME, ".config", "goose", "skills"),
  amp: join(HOME, ".config", "amp", "skills"),
};

export const VALID_CLIENT_IDS = Object.keys(CLIENT_REGISTRY);

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
      const valid = parsed.clients.filter(
        (c: unknown) => typeof c === "string" && c in CLIENT_REGISTRY
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
    (c) => c in CLIENT_REGISTRY
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
  const dir = CLIENT_REGISTRY[clientId];
  if (!dir) {
    throw new Error(
      `Unknown client '${clientId}'. Valid clients: ${VALID_CLIENT_IDS.join(", ")}`
    );
  }
  return dir;
}

/**
 * Resolve all enabled client directories from config.
 * Returns absolute paths (does NOT include ~/.agents/skills/).
 */
export async function resolveClientDirs(configPath?: string): Promise<string[]> {
  const clients = await getEnabledClients(configPath);
  return clients.map((c) => CLIENT_REGISTRY[c]);
}
