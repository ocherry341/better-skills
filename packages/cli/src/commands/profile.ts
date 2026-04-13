import { stat, readdir, unlink, rm, mkdir } from "fs/promises";
import { join, basename } from "path";
import { unlinkSkill } from "../core/linker.js";
import { verifiedLinkSkill } from "../core/store.js";
import {
  type Profile,
  type ProfileSkillEntry,
  readProfile,
  writeProfile,
  listProfiles,
  getActiveProfileName,
  setActiveProfileName,
} from "../core/profile.js";
import { registerSkill, readRegistry, resolveVersion } from "../core/registry.js";
import { hashDirectory } from "../core/hasher.js";
import { resolve as resolveSource, toSourceString, type SourceDescriptor } from "../core/resolver.js";
import { fetch } from "../core/fetcher.js";
import * as store from "../core/store.js";
import { readSkillMd } from "../utils/skill-md.js";
import { restoreSkillsFromProfile } from "../core/restore.js";
import {
  getProfilesPath,
  getGlobalSkillsPath,
  getStorePath,
  getProjectSkillsPath,
} from "../utils/paths.js";

export interface ProfileCreateInternalOptions {
  fromExisting?: boolean;
}

/**
 * Create a new profile. Optionally snapshot current skills directory.
 */
export async function profileCreate(
  name: string,
  opts: ProfileCreateInternalOptions
): Promise<void> {
  const profilesDir = getProfilesPath();
  const filePath = join(profilesDir, `${name}.json`);

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
    const skillsDir = getGlobalSkillsPath();
    try {
      const entries = await readdir(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = join(skillsDir, entry.name);
        skills.push({
          skillName: entry.name,
          v: 0,
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
  await setActiveProfileName(name);

  console.log(`✓ Created profile '${name}' with ${skills.length} skill(s)`);
}

export interface ProfileListItem {
  name: string;
  active: boolean;
}

/**
 * List all profiles, marking the active one.
 */
export async function profileLs(): Promise<ProfileListItem[]> {
  const names = await listProfiles();
  const activeName = await getActiveProfileName();

  return names.sort().map((name) => ({
    name,
    active: name === activeName,
  }));
}

/**
 * Show details of a specific profile.
 */
export async function profileShow(
  name: string
): Promise<Profile> {
  const filePath = join(getProfilesPath(), `${name}.json`);
  return readProfile(filePath);
}

export interface ProfileUseInternalOptions {
  hardlink?: boolean;
}

/**
 * Switch to a profile: clear managed skills, preserve unmanaged, re-link from store.
 */
export async function profileUse(
  name: string,
  opts: ProfileUseInternalOptions
): Promise<void> {
  const filePath = join(getProfilesPath(), `${name}.json`);
  const profile = await readProfile(filePath);

  await restoreSkillsFromProfile(profile, {
    global: true,
    hardlink: opts.hardlink,
  });

  await setActiveProfileName(name);
  console.log(`✓ Switched to profile '${name}' (${profile.skills.length} skill(s))`);
}

export interface ProfileAddInternalOptions {
  profileName?: string;
  hardlink?: boolean;
  name?: string;
}

/**
 * Parse a source that may contain a version specifier: "skill-name@version"
 * Returns { skillName, versionSpec } if it's a registry reference, null otherwise.
 */
function parseRegistryRef(source: string): { skillName: string; versionSpec: string } | null {
  // If source contains / or . or starts with http, it's a fetch source, not a registry ref
  if (source.includes("/") || source.startsWith(".") || source.startsWith("http")) {
    return null;
  }
  const atIdx = source.indexOf("@");
  if (atIdx > 0) {
    return { skillName: source.slice(0, atIdx), versionSpec: source.slice(atIdx + 1) };
  }
  // Bare name without @: could be a registry skill with @latest
  return { skillName: source, versionSpec: "latest" };
}

/**
 * Add a skill to a specific profile.
 * If the target profile is active, also links to the global skills directory.
 * Supports version specifiers: "skill-name@latest", "skill-name@v2", "skill-name@previous"
 */
export async function profileAdd(
  source: string,
  opts: ProfileAddInternalOptions
): Promise<void> {
  // 1. Resolve target profile
  const profilesDir = getProfilesPath();
  const skillsDir = getGlobalSkillsPath();
  const activeName = await getActiveProfileName();
  const targetName = opts.profileName ?? activeName;
  if (!targetName) {
    throw new Error("No active profile. Specify --profile <name> or create a profile first.");
  }

  const filePath = join(profilesDir, `${targetName}.json`);
  const profile = await readProfile(filePath);

  // 2. Try to resolve as registry reference first
  const ref = parseRegistryRef(source);
  if (ref) {
    const registry = await readRegistry();
    if (registry.skills[ref.skillName]) {
      const version = resolveVersion(registry, ref.skillName, ref.versionSpec);
      if (!version) {
        throw new Error(`Version '${ref.versionSpec}' not found for skill '${ref.skillName}'.`);
      }

      const skillName = opts.name ?? ref.skillName;
      profile.skills = profile.skills.filter((s) => s.skillName !== skillName);
      profile.skills.push({
        skillName,
        v: version.v,
        source: version.source,
        addedAt: new Date().toISOString(),
      });
      await writeProfile(filePath, profile);

      // Link if active
      const isActive = targetName === activeName;
      if (isActive) {
        const targetDir = join(skillsDir, skillName);
        await verifiedLinkSkill(version.hash, targetDir, { hardlink: opts.hardlink });
      }

      console.log(`✓ Added ${skillName} v${version.v} (${version.hash.slice(0, 8)}) to profile '${targetName}'`);
      if (!isActive) {
        console.log(`  (not linked — '${targetName}' is not the active profile)`);
      }
      return;
    }
  }

  // 3. Fall through to fetch path for external sources
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

    // 6. Register and record in profile
    const v = await registerSkill(skillName, hash, toSourceString(descriptor));
    profile.skills = profile.skills.filter((s) => s.skillName !== skillName);
    profile.skills.push({
      skillName,
      v,
      source: toSourceString(descriptor),
      addedAt: new Date().toISOString(),
    });
    await writeProfile(filePath, profile);

    // 7. Link if target is the active profile
    const isActive = targetName === activeName;
    if (isActive) {
      const targetDir = join(skillsDir, skillName);
      console.log(`Linking to ${targetDir}...`);
      const storeDir = store.getHashPath(hash);
      await verifiedLinkSkill(hash, targetDir, { hardlink: opts.hardlink });
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
  profileName?: string;
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
  const activeName = await getActiveProfileName();
  const targetName = opts.profileName ?? activeName;
  if (!targetName) {
    throw new Error("No active profile. Specify --profile <name> or create a profile first.");
  }

  const filePath = join(getProfilesPath(), `${targetName}.json`);
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
    const targetDir = join(getGlobalSkillsPath(), skillName);
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

/**
 * Delete a profile. Refuses to delete the active profile.
 */
export async function profileDelete(
  name: string
): Promise<void> {
  const profilesDir = getProfilesPath();
  const filePath = join(profilesDir, `${name}.json`);

  // Validate profile exists
  await readProfile(filePath);

  // Refuse if active
  const activeName = await getActiveProfileName();
  if (name === activeName) {
    throw new Error(`Cannot delete active profile '${name}'. Switch to another profile first with 'profile use'.`);
  }

  await unlink(filePath);
  console.log(`✓ Deleted profile '${name}'`);
}

/**
 * Rename a profile. Updates active-profile marker if renaming the active profile.
 */
export async function profileRename(
  oldName: string,
  newName: string
): Promise<void> {
  const profilesDir = getProfilesPath();
  const oldPath = join(profilesDir, `${oldName}.json`);
  const newPath = join(profilesDir, `${newName}.json`);

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
  const activeName = await getActiveProfileName();
  if (oldName === activeName) {
    await setActiveProfileName(newName);
  }

  console.log(`✓ Renamed profile '${oldName}' → '${newName}'`);
}

/**
 * Clone a profile as a new profile with the same skills.
 */
export async function profileClone(
  sourceName: string,
  targetName: string
): Promise<void> {
  const profilesDir = getProfilesPath();
  const sourcePath = join(profilesDir, `${sourceName}.json`);
  const targetPath = join(profilesDir, `${targetName}.json`);

  // Validate source exists
  const source = await readProfile(sourcePath);

  // Validate target does not exist
  try {
    await stat(targetPath);
    throw new Error(`Profile '${targetName}' already exists.`);
  } catch (err: any) {
    if (err.message?.includes("already exists")) throw err;
    // File doesn't exist — good
  }

  const clone: Profile = {
    name: targetName,
    skills: source.skills.map((s) => ({ ...s })),
  };
  await writeProfile(targetPath, clone);

  console.log(`✓ Cloned profile '${sourceName}' → '${targetName}'`);
}

export interface ProfileApplyInternalOptions {
  replace?: boolean;
}

/**
 * Deploy a profile's skills to the project-level .agents/skills/ directory.
 * In merge mode (default), existing project skills are preserved.
 * In replace mode, all existing project skills are removed first.
 */
export async function profileApply(
  name: string,
  opts: ProfileApplyInternalOptions
): Promise<void> {
  const filePath = join(getProfilesPath(), `${name}.json`);
  const profile = await readProfile(filePath);

  if (profile.skills.length === 0) {
    console.log(`Profile '${name}' has no skills to apply.`);
    return;
  }

  const registry = await readRegistry();
  const projectSkillsDir = getProjectSkillsPath();

  if (opts.replace) {
    await rm(projectSkillsDir, { recursive: true, force: true });
  }

  await mkdir(projectSkillsDir, { recursive: true });

  let applied = 0;
  let skipped = 0;

  for (const skill of profile.skills) {
    const targetDir = join(projectSkillsDir, skill.skillName);

    if (!opts.replace) {
      try {
        await stat(targetDir);
        console.log(`  Skipping ${skill.skillName} (already exists in project)`);
        skipped++;
        continue;
      } catch {
        // Doesn't exist — proceed to copy
      }
    }

    const entry = registry.skills[skill.skillName];
    const version = entry?.versions.find((ver) => ver.v === skill.v);
    if (!version) {
      console.warn(`⚠ Skill '${skill.skillName}' v${skill.v} not found in registry, skipping.`);
      skipped++;
      continue;
    }

    await verifiedLinkSkill(version.hash, targetDir, {});
    applied++;
  }

  console.log(`✓ Applied profile '${name}' to project (${applied} copied, ${skipped} skipped)`);
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
