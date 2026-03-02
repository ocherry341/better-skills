import * as lockfile from "../core/lockfile.js";
import { unlinkSkill } from "../core/linker.js";
import { getSkillsPath } from "../utils/paths.js";
import { join } from "path";

export interface RmOptions {
  global?: boolean;
}

/**
 * Remove a skill: Remove link → remove from lock (keep store)
 */
export async function rm(name: string, options: RmOptions = {}): Promise<void> {
  const lock = await lockfile.read();

  if (!lock.skills[name]) {
    console.error(`Skill '${name}' not found in lockfile.`);
    process.exit(1);
  }

  // Remove the linked directory
  const targetBase = getSkillsPath(options.global ?? false);
  const targetDir = join(targetBase, name);
  console.log(`Removing ${targetDir}...`);
  await unlinkSkill(targetDir);

  // Remove from lockfile (keep in store for potential re-install)
  const updated = lockfile.removeSkill(lock, name);
  await lockfile.write(updated);

  console.log(`✓ Removed ${name}`);
}
