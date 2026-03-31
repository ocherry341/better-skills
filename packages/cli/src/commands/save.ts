import { readdir, stat } from "fs/promises";
import { join } from "path";
import { hashDirectory } from "../core/hasher.js";
import { readRegistry, registerSkill, getLatestVersion } from "../core/registry.js";
import { store as storeSkill, verifiedLinkSkill, readStoreMeta } from "../core/store.js";
import { readSkillMd } from "../utils/skill-md.js";
import {
  getGlobalSkillsPath,
  getRegistryPath,
  getStorePath,
  getProfilesPath,
  getActiveProfileFilePath,
} from "../utils/paths.js";
import { addSkillToProfile } from "./add.js";

export interface SaveOptions {
  skillName?: string;
  adoptOrphans?: boolean;
  registryPath?: string;
  storePath?: string;
  skillsDir?: string;
  profilesDir?: string;
  activeFile?: string;
}

async function adoptOrphanEntries(options: SaveOptions): Promise<number> {
  const storePath = options.storePath ?? getStorePath();
  const registryPath = options.registryPath ?? getRegistryPath();
  const profilesDir = options.profilesDir ?? getProfilesPath();
  const activeFile = options.activeFile ?? getActiveProfileFilePath();

  const registry = await readRegistry(registryPath);

  let storeHashes: string[];
  try {
    storeHashes = await readdir(storePath);
  } catch {
    return 0;
  }

  const referencedHashes = new Set<string>();
  for (const entry of Object.values(registry.skills)) {
    for (const ver of entry.versions) {
      referencedHashes.add(ver.hash);
    }
  }

  const orphanHashes = storeHashes.filter((h) => !referencedHashes.has(h));
  if (orphanHashes.length === 0) return 0;

  const orphans: { hash: string; skillName: string; sortTime: number }[] = [];

  for (const hash of orphanHashes) {
    const hashDir = join(storePath, hash);

    let skillName: string;
    try {
      const meta = await readSkillMd(hashDir);
      skillName = meta.name;
    } catch {
      console.warn(`Skipping orphan ${hash.slice(0, 8)}: no valid SKILL.md`);
      continue;
    }

    const storeMeta = await readStoreMeta(hash, storePath);
    let sortTime: number;
    if (storeMeta?.storedAt) {
      sortTime = new Date(storeMeta.storedAt).getTime();
    } else {
      try {
        const s = await stat(hashDir);
        sortTime = s.mtimeMs;
      } catch {
        sortTime = 0;
      }
    }

    orphans.push({ hash, skillName, sortTime });
  }

  orphans.sort((a, b) => a.sortTime - b.sortTime);

  let adopted = 0;
  for (const orphan of orphans) {
    const v = await registerSkill(
      orphan.skillName,
      orphan.hash,
      "local",
      registryPath,
      storePath
    );

    await addSkillToProfile({
      skillName: orphan.skillName,
      v,
      source: "local",
      global: true,
      profilesDir,
      activeFile,
    });

    console.log(`Adopted: ${orphan.skillName} v${v} (${orphan.hash.slice(0, 8)})`);
    adopted++;
  }

  return adopted;
}

/**
 * Save new or changed skills from the skills directory to bsk management.
 * Hashes each skill, stores it, re-links, and registers a new version.
 */
export async function save(options: SaveOptions = {}): Promise<void> {
  // Mutual exclusion check
  if (options.adoptOrphans && options.skillName) {
    console.error("Cannot use --adopt-orphans with a specific skill name.");
    return;
  }

  if (options.adoptOrphans) {
    const adopted = await adoptOrphanEntries(options);
    if (adopted === 0) {
      console.log("No orphans found in store.");
    }
  }

  const skillsDir = options.skillsDir ?? getGlobalSkillsPath();
  const registryPath = options.registryPath ?? getRegistryPath();
  const storePath = options.storePath ?? getStorePath();
  const profilesDir = options.profilesDir ?? getProfilesPath();
  const activeFile = options.activeFile ?? getActiveProfileFilePath();

  // 1. Determine which skills to process
  let skillNames: string[];
  if (options.skillName) {
    try {
      const s = await stat(join(skillsDir, options.skillName));
      if (!s.isDirectory()) {
        console.error(`'${options.skillName}' is not a directory.`);
        return;
      }
      skillNames = [options.skillName];
    } catch {
      console.error(`Skill '${options.skillName}' not found in ${skillsDir}.`);
      return;
    }
  } else {
    try {
      const entries = await readdir(skillsDir);
      skillNames = [];
      for (const name of entries) {
        try {
          const s = await stat(join(skillsDir, name));
          if (s.isDirectory()) skillNames.push(name);
        } catch {
          // skip
        }
      }
    } catch {
      console.log("No skills directory found. Nothing to save.");
      return;
    }
  }

  if (skillNames.length === 0) {
    console.log("No skills found. Nothing to save.");
    return;
  }

  // 2. Process each skill
  const registry = await readRegistry(registryPath);
  let saved = 0;

  for (const skillName of skillNames) {
    const skillDir = join(skillsDir, skillName);

    try {
      // Hash current content
      const hash = await hashDirectory(skillDir);

      // Compare with latest version in registry
      const latest = getLatestVersion(registry, skillName);
      if (latest && latest.hash === hash) {
        // Hash matches latest — skip (idempotent)
        continue;
      }

      // Store
      const hashPath = await storeSkill(hash, skillDir, storePath);

      // Re-link from store
      await verifiedLinkSkill(hash, skillDir, {}, storePath);

      // Register new version
      const v = await registerSkill(skillName, hash, "local", registryPath, storePath);

      // Update registry in-memory for subsequent iterations
      if (!registry.skills[skillName]) {
        registry.skills[skillName] = { versions: [] };
      }
      if (!registry.skills[skillName].versions.find((ver) => ver.hash === hash)) {
        registry.skills[skillName].versions.push({
          v,
          hash,
          source: "local",
          addedAt: new Date().toISOString(),
        });
      }

      // Add to profile
      await addSkillToProfile({
        skillName,
        v,
        source: "local",
        global: true,
        profilesDir,
        activeFile,
      });

      console.log(`Saved: ${skillName} v${v} (${hash.slice(0, 8)})`);
      saved++;
    } catch (err: any) {
      console.error(`Failed to save ${skillName}: ${err.message}`);
    }
  }

  if (saved > 0) {
    console.log(`\nSaved ${saved} skill${saved !== 1 ? "s" : ""}.`);
  } else {
    console.log("All skills are up to date.");
  }

}
