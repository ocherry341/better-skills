import { lstat, mkdir, readdir, readlink, rename, rm, stat, symlink } from "fs/promises";
import { dirname, join } from "path";
import {
  getClientRegistry,
  VALID_CLIENT_IDS,
  readConfig,
  writeConfig,
  getClientSkillsDir,
  getClientProjectSubdir,
} from "../core/clients.js";
import { save } from "./save.js";

export interface ClientAddOptions {
  configPath: string;
  registryPath: string;
  storePath: string;
  skillsDir: string;
  /** Override client->dir mapping for testing */
  clientDirOverrides?: Record<string, string>;
  /** Project root for creating project-level symlinks */
  projectRoot?: string;
  /** Override for the global skills path (testing) */
  globalSkillsDir?: string;
}

/**
 * Enable a client by symlinking its skills directory to ~/.agents/skills/.
 * Migrates existing skills if the client dir already has content.
 */
export async function clientAdd(
  clientId: string,
  opts: ClientAddOptions
): Promise<void> {
  // 1. Validate
  if (clientId === "agents") {
    throw new Error("'agents' is always enabled and cannot be added.");
  }
  if (!VALID_CLIENT_IDS.includes(clientId)) {
    throw new Error(`Unknown client '${clientId}'. Valid clients: ${VALID_CLIENT_IDS.join(", ")}`);
  }

  // 2. Resolve directories
  const globalDir = opts.clientDirOverrides?.[clientId] ?? getClientSkillsDir(clientId);
  const agentsDir = opts.globalSkillsDir ?? opts.skillsDir;

  // Ensure agentsDir exists
  await mkdir(agentsDir, { recursive: true });

  // 3. Check globalDir state
  try {
    const st = await lstat(globalDir);

    if (st.isSymbolicLink()) {
      const target = await readlink(globalDir);
      if (target === agentsDir) {
        // Already correct symlink
        console.log(`${clientId} is already enabled (symlink exists).`);
      } else {
        throw new Error(
          `${globalDir} is a symlink to ${target}, not ${agentsDir}. Remove it manually first.`
        );
      }
    } else if (st.isDirectory()) {
      // Check if empty
      const entries = await readdir(globalDir);
      const subdirs = [];
      for (const name of entries) {
        try {
          const s = await stat(join(globalDir, name));
          if (s.isDirectory()) subdirs.push(name);
        } catch {
          // skip non-stat-able entries
        }
      }

      if (subdirs.length === 0 && entries.length === 0) {
        // Empty directory — remove and create symlink
        await rm(globalDir, { recursive: true, force: true });
        await createSymlink(agentsDir, globalDir);
      } else {
        // Has content — check for conflicts and migrate
        const agentsEntries = await safeReaddir(agentsDir);
        const conflicts = subdirs.filter((name) => agentsEntries.includes(name));

        if (conflicts.length > 0) {
          throw new Error(
            `Cannot migrate: skills [${conflicts.join(", ")}] exist in both ${globalDir} and ${agentsDir}. Resolve conflicts manually.`
          );
        }

        // Move each subdir to agentsDir
        for (const name of subdirs) {
          try {
            await rename(join(globalDir, name), join(agentsDir, name));
          } catch (err: any) {
            if (err.code === "EXDEV") {
              // Cross-device: copy + remove
              const { cpRecursive } = await import("../core/linker.js");
              await cpRecursive(join(globalDir, name), join(agentsDir, name));
              await rm(join(globalDir, name), { recursive: true, force: true });
            } else {
              throw err;
            }
          }
          console.log(`  Migrated ${name} → ${agentsDir}`);
        }

        // Save migrated skills to store/registry
        await save({
          skillsDir: agentsDir,
          registryPath: opts.registryPath,
          storePath: opts.storePath,
        });

        // Remove now-empty globalDir and create symlink
        await rm(globalDir, { recursive: true, force: true });
        await createSymlink(agentsDir, globalDir);
      }
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      // Does not exist — create symlink
      await createSymlink(agentsDir, globalDir);
    } else {
      throw err;
    }
  }

  // 6. Update config
  const config = await readConfig(opts.configPath);
  const merged = [...new Set([...config.clients, clientId])];
  await writeConfig({ clients: merged }, opts.configPath);

  // 7. Project-level symlink logic
  if (opts.projectRoot) {
    const subdir = getClientProjectSubdir(clientId);
    if (subdir) {
      const symlinkPath = join(opts.projectRoot, subdir);
      const agentsSkillsDir = join(opts.projectRoot, ".agents", "skills");

      await mkdir(agentsSkillsDir, { recursive: true });

      try {
        const st = await lstat(symlinkPath);
        if (st.isSymbolicLink()) {
          const existing = await readlink(symlinkPath);
          if (existing === join("..", ".agents", "skills")) {
            // Correct symlink already exists — skip
          }
        } else if (st.isDirectory()) {
          console.warn(`  ⚠ ${subdir} already exists as a directory, skipping symlink`);
        }
      } catch {
        // Does not exist — create it
        await mkdir(dirname(symlinkPath), { recursive: true });
        await symlink(join("..", ".agents", "skills"), symlinkPath);
        console.log(`  Symlinked ${subdir} → .agents/skills`);
      }
    }
  }

  console.log(`✓ Enabled client: ${clientId}`);
}

async function createSymlink(target: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await symlink(target, path);
  console.log(`  Symlinked ${path} → ${target}`);
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
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
 * Disable a client. If its skills dir is a symlink, removes it.
 * If it's a real directory, errors and asks user to migrate first.
 */
export async function clientRm(
  clientId: string,
  opts: ClientRmOptions
): Promise<void> {
  if (clientId === "agents") {
    throw new Error("'agents' is always enabled and cannot be removed.");
  }

  const globalDir = opts.clientDirOverrides?.[clientId] ?? getClientSkillsDir(clientId);

  // Check globalDir state
  try {
    const st = await lstat(globalDir);
    if (st.isSymbolicLink()) {
      // Just remove the symlink — skills remain in ~/.agents/skills/
      await rm(globalDir);
    } else if (st.isDirectory()) {
      // Real directory — refuse to delete, ask user to migrate first
      throw new Error(
        `${globalDir} is a real directory, not a symlink. Run 'bsk client add ${clientId}' first to migrate it.`
      );
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
    // Does not exist — no-op
  }

  // Update config
  const config = await readConfig(opts.configPath);
  const filtered = config.clients.filter((c) => c !== clientId);
  await writeConfig({ clients: filtered }, opts.configPath);

  // Remove project-level symlinks
  if (opts.projectRoot) {
    const subdir = getClientProjectSubdir(clientId);
    if (subdir) {
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

  console.log(`✓ Disabled client: ${clientId}`);
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
  const registry = getClientRegistry();
  return VALID_CLIENT_IDS.map((id) => ({
    id,
    path: registry[id].globalDir,
    projectSubdir: registry[id].projectSubdir,
    enabled: config.clients.includes(id),
  }));
}
