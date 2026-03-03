import { stat, readdir } from "fs/promises";
import { join } from "path";
import {
  type Profile,
  type ProfileSkillEntry,
  readProfile,
  writeProfile,
  listProfiles,
  getActiveProfileName,
  setActiveProfileName,
} from "../core/profile.js";
import { hashDirectory } from "../core/hasher.js";

export interface ProfileCreateInternalOptions {
  profilesDir: string;
  activeFile: string;
  skillsDir: string;
  fromExisting?: boolean;
}

/**
 * Create a new profile. Optionally snapshot current skills directory.
 */
export async function profileCreate(
  name: string,
  opts: ProfileCreateInternalOptions
): Promise<void> {
  const filePath = join(opts.profilesDir, `${name}.json`);

  // Check if already exists
  try {
    await stat(filePath);
    throw new Error(`Profile '${name}' already exists.`);
  } catch (err: any) {
    if (err.message?.includes("already exists")) throw err;
    // File doesn't exist — good, proceed
  }

  const skills: ProfileSkillEntry[] = [];

  if (opts.fromExisting) {
    // Snapshot current skills directory
    try {
      const entries = await readdir(opts.skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = join(opts.skillsDir, entry.name);
        const hash = await hashDirectory(skillDir);
        skills.push({
          skillName: entry.name,
          hash,
          source: "unknown",
          addedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Skills dir doesn't exist — create empty profile
    }
  }

  const profile: Profile = { name, skills };
  await writeProfile(filePath, profile);
  await setActiveProfileName(opts.activeFile, name);

  console.log(`✓ Created profile '${name}' with ${skills.length} skill(s)`);
}

export interface ProfileLsInternalOptions {
  profilesDir: string;
  activeFile: string;
}

export interface ProfileListItem {
  name: string;
  active: boolean;
}

/**
 * List all profiles, marking the active one.
 */
export async function profileLs(
  opts: ProfileLsInternalOptions
): Promise<ProfileListItem[]> {
  const names = await listProfiles(opts.profilesDir);
  const activeName = await getActiveProfileName(opts.activeFile);

  return names.sort().map((name) => ({
    name,
    active: name === activeName,
  }));
}

export interface ProfileShowInternalOptions {
  profilesDir: string;
}

/**
 * Show details of a specific profile.
 */
export async function profileShow(
  name: string,
  opts: ProfileShowInternalOptions
): Promise<Profile> {
  const filePath = join(opts.profilesDir, `${name}.json`);
  return readProfile(filePath);
}
