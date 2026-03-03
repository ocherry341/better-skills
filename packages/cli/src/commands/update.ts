import * as lockfile from "../core/lockfile.js";
import * as store from "../core/store.js";
import { resolve } from "../core/resolver.js";
import { fetch } from "../core/fetcher.js";
import { hashDirectory } from "../core/hasher.js";
import { linkSkill } from "../core/linker.js";
import { getSkillsPath } from "../utils/paths.js";
import { join } from "path";

export interface UpdateOptions {
  global?: boolean;
  copy?: boolean;
}

/**
 * Update all skills: Re-fetch each → compare hash → update changed
 */
export async function update(options: UpdateOptions = {}): Promise<void> {
  const lock = await lockfile.read();
  const skillNames = Object.keys(lock.skills);

  if (skillNames.length === 0) {
    console.log("No skills in lockfile.");
    return;
  }

  console.log(`Checking ${skillNames.length} skill(s) for updates...`);
  const targetBase = getSkillsPath(options.global ?? false);
  let updatedCount = 0;
  let currentLock = lock;

  for (const name of skillNames) {
    const entry = currentLock.skills[name];
    const descriptor = resolve(entry.source);

    console.log(`  Checking ${name}...`);
    const result = await fetch(descriptor);

    try {
      const newHash = await hashDirectory(result.dir);

      if (newHash === entry.computedHash) {
        console.log(`  ✓ ${name} is up to date`);
        continue;
      }

      // Store new version
      console.log(`  ↑ Updating ${name} (${entry.computedHash.slice(0, 8)} → ${newHash.slice(0, 8)})...`);
      await store.store(newHash, result.dir);

      // Re-link
      const targetDir = join(targetBase, name);
      await linkSkill(store.getHashPath(newHash), targetDir, { copy: options.copy });

      // Update lock
      currentLock = lockfile.setSkill(currentLock, name, {
        ...entry,
        computedHash: newHash,
      });
      updatedCount++;
    } finally {
      await result.cleanup();
    }
  }

  await lockfile.write(currentLock);

  if (updatedCount === 0) {
    console.log("All skills are up to date.");
  } else {
    console.log(`Updated ${updatedCount} skill(s).`);
  }
}
