import { lstat, mkdir, readlink, rm, stat, symlink } from "fs/promises";
import { dirname, join } from "path";
import {
  CLIENT_REGISTRY,
  VALID_CLIENT_IDS,
  readConfig,
  writeConfig,
  getClientSkillsDir,
  getClientProjectSubdir,
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
  /** Project root for creating project-level symlinks. If provided, creates .<client>/skills → ../.agents/skills */
  projectRoot?: string;
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
      if (entry.versions.length === 0) continue;
      const latest = entry.versions.reduce((best, v) => (v.v > best.v ? v : best));
      const storeDir = join(opts.storePath, latest.hash);
      try {
        await stat(storeDir);
        await linkToClients(name, storeDir, [clientDir]);
        console.log(`  Linked ${name} → ${clientDir}`);
      } catch {
        // Hash missing from store, skip
      }
    }
  }

  // Create project-level symlinks
  if (opts.projectRoot) {
    for (const id of clientIds) {
      const subdir = getClientProjectSubdir(id);
      if (!subdir) continue;

      const symlinkPath = join(opts.projectRoot, subdir);
      const agentsSkillsDir = join(opts.projectRoot, ".agents", "skills");

      // Ensure .agents/skills exists
      await mkdir(agentsSkillsDir, { recursive: true });

      // Check if target already exists
      try {
        const st = await lstat(symlinkPath);
        if (st.isSymbolicLink()) {
          // Already a symlink — check if it points to the right place
          const existing = await readlink(symlinkPath);
          if (existing === join("..", ".agents", "skills")) {
            continue; // Correct symlink already exists
          }
        }
        if (st.isDirectory()) {
          console.warn(`  ⚠ ${subdir} already exists as a directory, skipping symlink`);
          continue;
        }
      } catch {
        // Does not exist — good, we'll create it
      }

      // Create parent directory (e.g. .claude/)
      await mkdir(dirname(symlinkPath), { recursive: true });
      await symlink(join("..", ".agents", "skills"), symlinkPath);
      console.log(`  Symlinked ${subdir} → .agents/skills`);
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
  /** Project root for removing project-level symlinks */
  projectRoot?: string;
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

  // Remove project-level symlinks
  if (opts.projectRoot) {
    for (const id of clientIds) {
      const subdir = getClientProjectSubdir(id);
      if (!subdir) continue;

      const symlinkPath = join(opts.projectRoot, subdir);
      try {
        const st = await lstat(symlinkPath);
        if (st.isSymbolicLink()) {
          await rm(symlinkPath);
          console.log(`  Removed symlink ${subdir}`);
        }
        // If it's a real directory, leave it alone
      } catch {
        // Does not exist, nothing to do
      }
    }
  }

  console.log(`✓ Disabled client(s): ${clientIds.join(", ")}`);
}

export interface ClientLsOptions {
  configPath: string;
}

export interface ClientListItem {
  id: string;
  path: string;
  projectSubdir: string | null;
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
    projectSubdir: CLIENT_REGISTRY[id].projectSubdir,
    enabled: config.clients.includes(id),
  }));
}
