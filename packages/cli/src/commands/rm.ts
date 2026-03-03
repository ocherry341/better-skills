import { unlinkSkill } from "../core/linker.js";
import { getSkillsPath } from "../utils/paths.js";
import { stat } from "fs/promises";
import { join } from "path";

export interface RmOptions {
  global?: boolean;
}

/**
 * Remove a skill: check existence on disk → remove link (keep store)
 */
export async function rm(name: string, options: RmOptions = {}): Promise<void> {
  const targetBase = getSkillsPath(options.global ?? false);
  const targetDir = join(targetBase, name);

  // Check if skill directory exists
  try {
    await stat(targetDir);
  } catch {
    console.error(`Skill '${name}' not found.`);
    process.exit(1);
  }

  // Remove the linked directory
  console.log(`Removing ${targetDir}...`);
  await unlinkSkill(targetDir);

  console.log(`✓ Removed ${name}`);
}
