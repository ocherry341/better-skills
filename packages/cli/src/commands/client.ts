import { stat } from "fs/promises";
import { join } from "path";
import {
  CLIENT_REGISTRY,
  VALID_CLIENT_IDS,
  readConfig,
  writeConfig,
  getClientSkillsDir,
} from "../core/clients.js";
import { readRegistry } from "../core/registry.js";
import { linkToClients, unlinkFromClients } from "../core/linker.js";

export interface ClientAddOptions {
  configPath: string;
  registryPath: string;
  storePath: string;
  skillsDir: string;
  /** Override client->dir mapping for testing */
  clientDirOverrides?: Record<string, string>;
}

/**
 * Enable one or more clients. Syncs existing managed skills to new client dirs.
 */
export async function clientAdd(
  clientIds: string[],
  opts: ClientAddOptions
): Promise<void> {
  // Validate
  for (const id of clientIds) {
    if (id === "agents") {
      throw new Error("'agents' is always enabled and cannot be added.");
    }
    if (!(id in CLIENT_REGISTRY)) {
      throw new Error(`Unknown client '${id}'. Valid clients: ${VALID_CLIENT_IDS.join(", ")}`);
    }
  }

  // Update config
  const config = await readConfig(opts.configPath);
  const merged = [...new Set([...config.clients, ...clientIds])];
  await writeConfig({ clients: merged }, opts.configPath);

  // Sync existing managed skills to new client dirs
  const registry = await readRegistry(opts.registryPath);
  const newIds = clientIds.filter((id) => !config.clients.includes(id));

  for (const id of newIds) {
    const clientDir = opts.clientDirOverrides?.[id] ?? getClientSkillsDir(id);
    for (const [name, entry] of Object.entries(registry.skills)) {
      const storeDir = join(opts.storePath, entry.hash);
      try {
        await stat(storeDir);
        await linkToClients(name, storeDir, [clientDir]);
        console.log(`  Linked ${name} → ${clientDir}`);
      } catch {
        // Hash missing from store, skip
      }
    }
  }

  console.log(`✓ Enabled client(s): ${clientIds.join(", ")}`);
}

export interface ClientRmOptions {
  configPath: string;
  registryPath: string;
  skillsDir: string;
  /** Override client->dir mapping for testing */
  clientDirOverrides?: Record<string, string>;
}

/**
 * Disable one or more clients. Removes managed skill links from client dirs.
 */
export async function clientRm(
  clientIds: string[],
  opts: ClientRmOptions
): Promise<void> {
  for (const id of clientIds) {
    if (id === "agents") {
      throw new Error("'agents' is always enabled and cannot be removed.");
    }
  }

  // Remove managed skill links from client dirs
  const registry = await readRegistry(opts.registryPath);
  for (const id of clientIds) {
    const clientDir = opts.clientDirOverrides?.[id] ?? getClientSkillsDir(id);
    for (const name of Object.keys(registry.skills)) {
      await unlinkFromClients(name, [clientDir]);
    }
  }

  // Update config
  const config = await readConfig(opts.configPath);
  const filtered = config.clients.filter((c) => !clientIds.includes(c));
  await writeConfig({ clients: filtered }, opts.configPath);

  console.log(`✓ Disabled client(s): ${clientIds.join(", ")}`);
}

export interface ClientLsOptions {
  configPath: string;
}

export interface ClientListItem {
  id: string;
  path: string;
  enabled: boolean;
}

/**
 * List all supported clients with their enabled status.
 */
export async function clientLs(opts: ClientLsOptions): Promise<ClientListItem[]> {
  const config = await readConfig(opts.configPath);
  return VALID_CLIENT_IDS.map((id) => ({
    id,
    path: CLIENT_REGISTRY[id].globalDir,
    enabled: config.clients.includes(id),
  }));
}
