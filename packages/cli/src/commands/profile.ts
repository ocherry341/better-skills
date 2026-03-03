import { stat, readdir, mkdir as fsMkdir } from "fs/promises";
import { join } from "path";
import { linkSkill, unlinkSkill } from "../core/linker.js";
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

export interface ProfileUseInternalOptions {
  profilesDir: string;
  activeFile: string;
  skillsDir: string;
  storePath: string;
  copy?: boolean;
}

/**
 * Switch to a profile: clear skills dir, re-link all skills from store.
 */
export async function profileUse(
  name: string,
  opts: ProfileUseInternalOptions
): Promise<void> {
  const filePath = join(opts.profilesDir, `${name}.json`);
  const profile = await readProfile(filePath);

  // Clear existing skills directory
  try {
    const existing = await readdir(opts.skillsDir, { withFileTypes: true });
    for (const entry of existing) {
      if (entry.isDirectory()) {
        await unlinkSkill(join(opts.skillsDir, entry.name));
      }
    }
  } catch {
    // Directory doesn't exist, will be created by linkSkill
  }

  await fsMkdir(opts.skillsDir, { recursive: true });

  // Link each skill from store
  for (const skill of profile.skills) {
    const storeDir = join(opts.storePath, skill.hash);
    try {
      await stat(storeDir);
    } catch {
      console.warn(`⚠ Skill '${skill.skillName}' (${skill.hash.slice(0, 8)}) not found in store, skipping.`);
      continue;
    }
    const targetDir = join(opts.skillsDir, skill.skillName);
    await linkSkill(storeDir, targetDir, { copy: opts.copy });
  }

  // Update active profile
  await setActiveProfileName(opts.activeFile, name);

  console.log(`✓ Switched to profile '${name}' (${profile.skills.length} skill(s))`);
}
