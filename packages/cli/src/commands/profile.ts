import { stat, readdir, mkdir as fsMkdir, unlink } from "fs/promises";
import { join, basename } from "path";
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
import { isManaged, registerSkill } from "../core/registry.js";
import { hashDirectory } from "../core/hasher.js";
import { resolve as resolveSource, toSourceString, type SourceDescriptor } from "../core/resolver.js";
import { fetch } from "../core/fetcher.js";
import * as store from "../core/store.js";
import { readSkillMd } from "../utils/skill-md.js";

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
  registryPath?: string;
}

/**
 * Switch to a profile: clear managed skills, preserve unmanaged, re-link from store.
 */
export async function profileUse(
  name: string,
  opts: ProfileUseInternalOptions
): Promise<void> {
  const filePath = join(opts.profilesDir, `${name}.json`);
  const profile = await readProfile(filePath);

  // Clear only managed skills; preserve unmanaged
  try {
    const existing = await readdir(opts.skillsDir, { withFileTypes: true });
    for (const entry of existing) {
      if (!entry.isDirectory()) continue;
      const managed = await isManaged(entry.name, opts.registryPath);
      if (managed) {
        await unlinkSkill(join(opts.skillsDir, entry.name));
      } else {
        console.warn(`⚠ Skipping unmanaged skill '${entry.name}'`);
      }
    }
  } catch {
    // Directory doesn't exist, will be created by linkSkill
  }

  await fsMkdir(opts.skillsDir, { recursive: true });

  // Link each skill from store and register
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
    await registerSkill(skill.skillName, skill.hash, skill.source, opts.registryPath, opts.storePath);
  }

  // Update active profile
  await setActiveProfileName(opts.activeFile, name);

  console.log(`✓ Switched to profile '${name}' (${profile.skills.length} skill(s))`);
}

export interface ProfileAddInternalOptions {
  profilesDir: string;
  activeFile: string;
  skillsDir: string;
  storePath: string;
  profileName?: string;
  copy?: boolean;
  name?: string;
  registryPath?: string;
}

/**
 * Add a skill to a specific profile.
 * If the target profile is active, also links to the global skills directory.
 */
export async function profileAdd(
  source: string,
  opts: ProfileAddInternalOptions
): Promise<void> {
  // 1. Resolve target profile
  const activeName = await getActiveProfileName(opts.activeFile);
  const targetName = opts.profileName ?? activeName;
  if (!targetName) {
    throw new Error("No active profile. Specify --profile <name> or create a profile first.");
  }

  const filePath = join(opts.profilesDir, `${targetName}.json`);
  const profile = await readProfile(filePath);

  // 2. Resolve → Fetch → Hash → Store
  console.log(`Resolving ${source}...`);
  const descriptor = resolveSource(source);

  console.log(`Fetching from ${descriptor.type} source...`);
  const result = await fetch(descriptor);

  try {
    // 3. Determine skill name
    let skillName: string;
    if (opts.name) {
      skillName = opts.name;
    } else {
      try {
        const meta = await readSkillMd(result.dir);
        skillName = meta.name;
      } catch {
        skillName = deriveNameFromSource(descriptor);
      }
    }

    // 4. Hash
    console.log(`Hashing ${skillName}...`);
    const hash = await hashDirectory(result.dir);

    // 5. Store
    console.log(`Storing ${hash.slice(0, 8)}...`);
    await store.store(hash, result.dir);

    // 6. Record in profile
    profile.skills = profile.skills.filter((s) => s.skillName !== skillName);
    profile.skills.push({
      skillName,
      hash,
      source: toSourceString(descriptor),
      addedAt: new Date().toISOString(),
    });
    await writeProfile(filePath, profile);

    // 7. Link if target is the active profile + register
    const isActive = targetName === activeName;
    if (isActive) {
      const targetDir = join(opts.skillsDir, skillName);
      console.log(`Linking to ${targetDir}...`);
      const storeDir = store.getHashPath(hash);
      await linkSkill(storeDir, targetDir, { copy: opts.copy });
      await registerSkill(skillName, hash, toSourceString(descriptor), opts.registryPath, opts.storePath);
    }

    console.log(`✓ Added ${skillName} (${hash.slice(0, 8)}) to profile '${targetName}'`);
    if (!isActive) {
      console.log(`  (not linked — '${targetName}' is not the active profile)`);
    }
  } finally {
    await result.cleanup();
  }
}

export interface ProfileRmInternalOptions {
  profilesDir: string;
  activeFile: string;
  skillsDir: string;
  profileName?: string;
  registryPath?: string;
}

/**
 * Remove a skill from a specific profile.
 * If the target profile is active, also unlinks from the global skills directory.
 */
export async function profileRm(
  skillName: string,
  opts: ProfileRmInternalOptions
): Promise<void> {
  // 1. Resolve target profile
  const activeName = await getActiveProfileName(opts.activeFile);
  const targetName = opts.profileName ?? activeName;
  if (!targetName) {
    throw new Error("No active profile. Specify --profile <name> or create a profile first.");
  }

  const filePath = join(opts.profilesDir, `${targetName}.json`);
  const profile = await readProfile(filePath);

  // 2. Check skill exists in profile
  const exists = profile.skills.some((s) => s.skillName === skillName);
  if (!exists) {
    throw new Error(`Skill '${skillName}' not found in profile '${targetName}'.`);
  }

  // 3. Remove from profile
  profile.skills = profile.skills.filter((s) => s.skillName !== skillName);
  await writeProfile(filePath, profile);

  // 4. Unlink + unregister if target is the active profile
  const isActive = targetName === activeName;
  if (isActive) {
    const targetDir = join(opts.skillsDir, skillName);
    try {
      await stat(targetDir);
      console.log(`Removing ${targetDir}...`);
      await unlinkSkill(targetDir);
    } catch {
      // Skill dir doesn't exist on disk — already removed, just update profile
    }
  }

  console.log(`✓ Removed ${skillName} from profile '${targetName}'`);
  if (!isActive) {
    console.log(`  (no unlink needed — '${targetName}' is not the active profile)`);
  }
}

export interface ProfileDeleteInternalOptions {
  profilesDir: string;
  activeFile: string;
}

/**
 * Delete a profile. Refuses to delete the active profile.
 */
export async function profileDelete(
  name: string,
  opts: ProfileDeleteInternalOptions
): Promise<void> {
  const filePath = join(opts.profilesDir, `${name}.json`);

  // Validate profile exists
  await readProfile(filePath);

  // Refuse if active
  const activeName = await getActiveProfileName(opts.activeFile);
  if (name === activeName) {
    throw new Error(`Cannot delete active profile '${name}'. Switch to another profile first with 'profile use'.`);
  }

  await unlink(filePath);
  console.log(`✓ Deleted profile '${name}'`);
}

export interface ProfileRenameInternalOptions {
  profilesDir: string;
  activeFile: string;
}

/**
 * Rename a profile. Updates active-profile marker if renaming the active profile.
 */
export async function profileRename(
  oldName: string,
  newName: string,
  opts: ProfileRenameInternalOptions
): Promise<void> {
  const oldPath = join(opts.profilesDir, `${oldName}.json`);
  const newPath = join(opts.profilesDir, `${newName}.json`);

  // Validate old exists
  const profile = await readProfile(oldPath);

  // Validate new does not exist
  try {
    await stat(newPath);
    throw new Error(`Profile '${newName}' already exists.`);
  } catch (err: any) {
    if (err.message?.includes("already exists")) throw err;
    // File doesn't exist — good
  }

  // Write new, delete old
  profile.name = newName;
  await writeProfile(newPath, profile);
  await unlink(oldPath);

  // Update active marker if needed
  const activeName = await getActiveProfileName(opts.activeFile);
  if (oldName === activeName) {
    await setActiveProfileName(opts.activeFile, newName);
  }

  console.log(`✓ Renamed profile '${oldName}' → '${newName}'`);
}

function deriveNameFromSource(desc: SourceDescriptor): string {
  switch (desc.type) {
    case "github":
      if (desc.subdir) {
        return basename(desc.subdir);
      }
      return desc.repo;
    case "git": {
      const match = desc.url.match(/\/([^/]+?)(?:\.git)?$/);
      return match?.[1] ?? "unnamed-skill";
    }
    case "local":
      return basename(desc.path);
  }
}
