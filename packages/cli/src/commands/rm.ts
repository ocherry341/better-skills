import { unlinkSkill, unlinkFromClients } from "../core/linker.js";
import { resolveClientDirs } from "../core/clients.js";
import { getSkillsPath, getProfilesPath, getActiveProfileFilePath } from "../utils/paths.js";
import { readProfile, writeProfile, getActiveProfileName } from "../core/profile.js";
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

  // Remove from client directories (global only)
  if (options.global) {
    const clientDirs = await resolveClientDirs();
    if (clientDirs.length > 0) {
      await unlinkFromClients(name, clientDirs);
    }
  }

  console.log(`✓ Removed ${name}`);

  // Remove from active profile (only for global skills)
  await removeSkillFromProfile({ skillName: name, global: options.global ?? false });
}

export interface RemoveFromProfileOptions {
  skillName: string;
  global: boolean;
  profilesDir?: string;
  activeFile?: string;
}

/**
 * Remove a skill entry from the active profile.
 * No-op if no active profile exists.
 */
export async function removeSkillFromProfile(opts: RemoveFromProfileOptions): Promise<void> {
  if (!opts.global) return;

  const activeFile = opts.activeFile ?? getActiveProfileFilePath();
  const profilesDir = opts.profilesDir ?? getProfilesPath();
  const activeName = await getActiveProfileName(activeFile);
  if (!activeName) return;

  const filePath = join(profilesDir, `${activeName}.json`);
  let profile;
  try {
    profile = await readProfile(filePath);
  } catch {
    return;
  }

  profile.skills = profile.skills.filter((s) => s.skillName !== opts.skillName);
  await writeProfile(filePath, profile);
}
