import * as lockfile from "../core/lockfile.js";
import { resolve } from "../core/resolver.js";
import { fetch } from "../core/fetcher.js";
import { hashDirectory } from "../core/hasher.js";

/**
 * Check for available updates: Fetch latest → compare hash → report
 */
export async function check(): Promise<void> {
  const lock = await lockfile.read();
  const skillNames = Object.keys(lock.skills);

  if (skillNames.length === 0) {
    console.log("No skills in lockfile.");
    return;
  }

  console.log(`Checking ${skillNames.length} skill(s) for updates...`);
  let updatesAvailable = 0;

  for (const name of skillNames) {
    const entry = lock.skills[name];
    const descriptor = resolve(entry.source);

    const result = await fetch(descriptor);

    try {
      const newHash = await hashDirectory(result.dir);

      if (newHash === entry.computedHash) {
        console.log(`  ✓ ${name} is up to date`);
      } else {
        console.log(
          `  ↑ ${name} has updates (${entry.computedHash.slice(0, 8)} → ${newHash.slice(0, 8)})`
        );
        updatesAvailable++;
      }
    } finally {
      await result.cleanup();
    }
  }

  if (updatesAvailable === 0) {
    console.log("\nAll skills are up to date.");
  } else {
    console.log(`\n${updatesAvailable} update(s) available. Run 'better-skills update' to update.`);
  }
}
