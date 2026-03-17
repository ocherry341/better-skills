import { unlinkSkill, unlinkFromClients } from "../core/linker.js";
import { resolveClientDirs } from "../core/clients.js";
import { getSkillsPath, getProfilesPath, getActiveProfileFilePath, getRegistryPath, getStorePath } from "../utils/paths.js";
import { readProfile, writeProfile, listProfiles, getActiveProfileName } from "../core/profile.js";
import { unregisterSkill } from "../core/registry.js";
import { stat } from "fs/promises";
import { join } from "path";

export interface RmOptions {
  global?: boolean;
  registryPath?: string;
  profilesDir?: string;
  storePath?: string;
}

/**
 * Remove a skill: check existence on disk → remove link → clean registry + all profiles
 */
export async function rm(name: string, options: RmOptions = {}): Promise<void> {
  const targetBase = getSkillsPath(options.global ?? false);
  const targetDir = join(targetBase, name);

  // Check if skill directory exists
  try {
    await stat(targetDir);
  } catch {
    throw new Error(`Skill '${name}' not found.`);
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

  // Clean registry entry (global only)
  if (options.global) {
    await unregisterSkill(
      name,
      options.registryPath ?? getRegistryPath(),
      options.storePath ?? getStorePath()
    );
  }

  // Remove from ALL profiles (global only)
  if (options.global) {
    const profilesDir = options.profilesDir ?? getProfilesPath();
    const profileNames = await listProfiles(profilesDir);
    for (const pName of profileNames) {
      const filePath = join(profilesDir, `${pName}.json`);
      try {
        const profile = await readProfile(filePath);
        const before = profile.skills.length;
        profile.skills = profile.skills.filter((s) => s.skillName !== name);
        if (profile.skills.length < before) {
          await writeProfile(filePath, profile);
        }
      } catch {
        // Skip unreadable profiles
      }
    }
  }

  console.log(`✓ Removed ${name}`);
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
