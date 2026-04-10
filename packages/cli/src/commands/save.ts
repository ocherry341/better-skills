import { readdir, stat } from "fs/promises";
import { join } from "path";
import { hashDirectory } from "../core/hasher.js";
import { readRegistry, registerSkill, getLatestVersion } from "../core/registry.js";
import { store as storeSkill, verifiedLinkSkill } from "../core/store.js";
import { getGlobalSkillsPath } from "../utils/paths.js";
import { addSkillToProfile } from "./add.js";

export interface SaveOptions {
  skillName?: string;
}

/**
 * Save new or changed skills from the skills directory to bsk management.
 * Hashes each skill, stores it, re-links, and registers a new version.
 */
export async function save(options: SaveOptions = {}): Promise<void> {
  const skillsDir = getGlobalSkillsPath();

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
  const registry = await readRegistry();
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
      const hashPath = await storeSkill(hash, skillDir);

      // Re-link from store
      await verifiedLinkSkill(hash, skillDir, {});

      // Register new version
      const v = await registerSkill(skillName, hash, "local");

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
