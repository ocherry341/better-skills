import * as lockfile from "../core/lockfile.js";
import * as store from "../core/store.js";
import { resolve } from "../core/resolver.js";
import { fetch } from "../core/fetcher.js";
import { hashDirectory } from "../core/hasher.js";
import { linkSkill } from "../core/linker.js";
import { getSkillsPath } from "../utils/paths.js";
import { join } from "path";

export interface InstallOptions {
  global?: boolean;
  copy?: boolean;
}

/**
 * Install all skills from lockfile.
 * Read lock → For each: check store → fetch if missing → link
 */
export async function install(options: InstallOptions = {}): Promise<void> {
  const lock = await lockfile.read();

  const skillNames = Object.keys(lock.skills);
  if (skillNames.length === 0) {
    console.log("No skills in lockfile. Use 'better-skills add' to add skills.");
    return;
  }

  console.log(`Installing ${skillNames.length} skill(s)...`);
  const targetBase = getSkillsPath(options.global ?? false);

  for (const name of skillNames) {
    const entry = lock.skills[name];
    const hashPath = store.getHashPath(entry.computedHash);

    // Check if already in store
    if (!(await store.has(entry.computedHash))) {
      // Need to re-fetch
      console.log(`  Fetching ${name}...`);
      const descriptor = resolve(entry.source);
      const result = await fetch(descriptor);

      try {
        // Verify hash matches
        const hash = await hashDirectory(result.dir);
        if (hash !== entry.computedHash) {
          console.warn(
            `  ⚠ Hash mismatch for ${name}: expected ${entry.computedHash.slice(0, 8)}, got ${hash.slice(0, 8)}`
          );
          console.warn(`    Source may have changed. Run 'better-skills update' to update.`);
        }
        await store.store(hash, result.dir);
      } finally {
        await result.cleanup();
      }
    }

    // Link from store to target
    const targetDir = join(targetBase, name);
    await linkSkill(hashPath, targetDir, { copy: options.copy });
    console.log(`  ✓ ${name} (${entry.computedHash.slice(0, 8)})`);
  }

  console.log(`Done. ${skillNames.length} skill(s) installed.`);
}
