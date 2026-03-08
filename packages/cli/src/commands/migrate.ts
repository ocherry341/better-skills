import { readdir, stat, mkdir } from "fs/promises";
import { join } from "path";
import { hashDirectory } from "../core/hasher.js";
import { linkSkill, cpRecursive } from "../core/linker.js";
import { readRegistry, registerSkill } from "../core/registry.js";
import {
  getGlobalSkillsPath,
  getRegistryPath,
  getStorePath,
  getProfilesPath,
  getActiveProfileFilePath,
} from "../utils/paths.js";
import { addSkillToProfile } from "./add.js";

export interface MigrateOptions {
  registryPath?: string;
  storePath?: string;
  skillsDir?: string;
  profilesDir?: string;
  activeFile?: string;
}

/**
 * Migrate unmanaged skills in ~/.agents/skills/ to bsk management.
 */
export async function migrate(options: MigrateOptions = {}): Promise<void> {
  const skillsDir = options.skillsDir ?? getGlobalSkillsPath();
  const registryPath = options.registryPath ?? getRegistryPath();
  const storePath = options.storePath ?? getStorePath();
  const profilesDir = options.profilesDir ?? getProfilesPath();
  const activeFile = options.activeFile ?? getActiveProfileFilePath();

  // 1. List skill directories
  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch {
    console.log("No skills directory found. Nothing to migrate.");
    return;
  }

  // Filter to directories only
  const skillNames: string[] = [];
  for (const name of entries) {
    try {
      const s = await stat(join(skillsDir, name));
      if (s.isDirectory()) skillNames.push(name);
    } catch {
      // skip
    }
  }

  if (skillNames.length === 0) {
    console.log("No skills found. Nothing to migrate.");
    return;
  }

  // 2. Find unmanaged skills
  const registry = await readRegistry(registryPath);
  const unmanaged = skillNames.filter((name) => !(name in registry.skills));

  if (unmanaged.length === 0) {
    console.log("All skills are already managed by bsk.");
    return;
  }

  // 3. Migrate each unmanaged skill
  let migrated = 0;
  for (const skillName of unmanaged) {
    const skillDir = join(skillsDir, skillName);

    try {
      // Hash
      const hash = await hashDirectory(skillDir);

      // Store (use storePath directly for testability)
      const hashPath = join(storePath, hash);
      try {
        await stat(hashPath);
      } catch {
        await mkdir(hashPath, { recursive: true });
        await cpRecursive(skillDir, hashPath);
      }

      // Re-link from store
      await linkSkill(hashPath, skillDir);

      // Register
      await registerSkill(skillName, hash, "local", registryPath, storePath);

      // Add to profile
      await addSkillToProfile({
        skillName,
        hash,
        source: "local",
        global: true,
        profilesDir,
        activeFile,
      });

      console.log(`Migrated: ${skillName} (${hash.slice(0, 8)})`);
      migrated++;
    } catch (err: any) {
      console.error(`Failed to migrate ${skillName}: ${err.message}`);
    }
  }

  console.log(`\nMigrated ${migrated} skill${migrated !== 1 ? "s" : ""}.`);

  // Sync to enabled client directories
  const { resolveClientDirs } = await import("../core/clients.js");
  const { linkToClients } = await import("../core/linker.js");
  const clientDirs = await resolveClientDirs();
  if (clientDirs.length > 0) {
    const registry = await readRegistry(registryPath);
    for (const [name, entry] of Object.entries(registry.skills)) {
      const storeDir = join(storePath, entry.hash);
      await linkToClients(name, storeDir, clientDirs);
    }
    console.log(`Synced ${Object.keys(registry.skills).length} skill(s) to ${clientDirs.length} client dir(s).`);
  }
}
