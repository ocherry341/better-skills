import { resolve, toSourceString, type SourceDescriptor } from "../core/resolver.js";
import { fetch } from "../core/fetcher.js";
import { hashDirectory } from "../core/hasher.js";
import * as store from "../core/store.js";
import { linkSkill, linkToClients } from "../core/linker.js";
import { resolveClientDirs, getClientSkillsDir } from "../core/clients.js";
import { getSkillsPath, getProfilesPath, getActiveProfileFilePath, getRegistryPath, getStorePath } from "../utils/paths.js";
import { readSkillMd } from "../utils/skill-md.js";
import { readProfile, writeProfile, getActiveProfileName, setActiveProfileName } from "../core/profile.js";
import { registerSkill, isManaged } from "../core/registry.js";
import { stat } from "fs/promises";
import { join, basename } from "path";

export interface AddOptions {
  global?: boolean;
  copy?: boolean;
  name?: string;
  force?: boolean;
  registryPath?: string;
  /** Override which clients to link to (undefined = use config) */
  clients?: string[];
  /** Skip all client linking */
  noClients?: boolean;
  /** Path to config file (for testing) */
  configPath?: string;
}

/**
 * Add a skill: Resolve → Fetch → Hash → Store → Link
 */
export async function add(source: string, options: AddOptions = {}): Promise<void> {
  // 1. Resolve source
  console.log(`Resolving ${source}...`);
  const descriptor = resolve(source);

  // 2. Fetch
  console.log(`Fetching from ${descriptor.type} source...`);
  const result = await fetch(descriptor);

  try {
    // 3. Determine skill name
    let skillName: string;
    if (options.name) {
      skillName = options.name;
    } else {
      try {
        const meta = await readSkillMd(result.dir);
        skillName = meta.name;
      } catch {
        // Fall back to repo name or directory name
        skillName = deriveNameFromSource(descriptor);
      }
    }

    // 4. Hash
    console.log(`Hashing ${skillName}...`);
    const hash = await hashDirectory(result.dir);

    // 5. Store
    console.log(`Storing ${hash.slice(0, 8)}...`);
    await store.store(hash, result.dir);

    // 6. Conflict detection (global only)
    const targetBase = getSkillsPath(options.global ?? false);
    const targetDir = join(targetBase, skillName);
    const registryPath = options.registryPath ?? getRegistryPath();

    if (options.global) {
      const exists = await dirExists(targetDir);
      if (exists) {
        const managed = await isManaged(skillName, registryPath);
        if (!managed && !options.force) {
          throw new Error(
            `Skill '${skillName}' exists but is not managed by bsk. Use --force to overwrite.`
          );
        }
      }
    }

    // 7. Link
    console.log(`Linking to ${targetDir}...`);
    await linkSkill(store.getHashPath(hash), targetDir, { copy: options.copy });

    // 7b. Link to client directories (global only)
    if (options.global && !options.noClients) {
      let clientDirs: string[];
      if (options.clients?.length) {
        clientDirs = options.clients.map((c) => getClientSkillsDir(c));
      } else {
        clientDirs = await resolveClientDirs(options.configPath);
      }
      if (clientDirs.length > 0) {
        await linkToClients(skillName, store.getHashPath(hash), clientDirs, { copy: options.copy });
      }
    }

    console.log(`✓ Added ${skillName} (${hash.slice(0, 8)})`);

    // 8. Register in registry (global only)
    if (options.global) {
      const sourceStr = toSourceString(descriptor);
      await registerSkill(skillName, hash, sourceStr, registryPath, getStorePath());
    }

    // 9. Record in active profile (only for global skills)
    await addSkillToProfile({
      skillName,
      hash,
      source: toSourceString(descriptor),
      global: options.global ?? false,
    });
  } finally {
    await result.cleanup();
  }
}

export interface AddToProfileOptions {
  skillName: string;
  hash: string;
  source: string;
  global: boolean;
  profilesDir?: string;
  activeFile?: string;
}

/**
 * Record a skill addition in the active profile.
 * Auto-creates a "default" profile when no active profile exists.
 */
export async function addSkillToProfile(opts: AddToProfileOptions): Promise<void> {
  if (!opts.global) return;

  const activeFile = opts.activeFile ?? getActiveProfileFilePath();
  const profilesDir = opts.profilesDir ?? getProfilesPath();
  let activeName = await getActiveProfileName(activeFile);

  if (!activeName) {
    // Auto-create default profile
    activeName = "default";
    const filePath = join(profilesDir, `${activeName}.json`);
    await writeProfile(filePath, { name: activeName, skills: [] });
    await setActiveProfileName(activeFile, activeName);
    console.log("Created default profile.");
  }

  const filePath = join(profilesDir, `${activeName}.json`);
  let profile;
  try {
    profile = await readProfile(filePath);
  } catch {
    return; // Profile file missing, skip
  }

  // Remove existing entry with same name (update scenario)
  profile.skills = profile.skills.filter((s) => s.skillName !== opts.skillName);
  profile.skills.push({
    skillName: opts.skillName,
    hash: opts.hash,
    source: opts.source,
    addedAt: new Date().toISOString(),
  });

  await writeProfile(filePath, profile);
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

function deriveNameFromSource(desc: SourceDescriptor): string {
  switch (desc.type) {
    case "github":
      if (desc.subdir) {
        return basename(desc.subdir);
      }
      return desc.repo;
    case "git":
      // Extract repo name from URL
      const match = desc.url.match(/\/([^/]+?)(?:\.git)?$/);
      return match?.[1] ?? "unnamed-skill";
    case "local":
      return basename(desc.path);
  }
}
