import { stat, rm } from "fs/promises";
import { join } from "path";
import { cpRecursive, unlinkSkill } from "../core/linker.js";
import { hashDirectory } from "../core/hasher.js";
import * as store from "../core/store.js";
import { verifiedLinkSkill } from "../core/store.js";
import { registerSkill } from "../core/registry.js";
import { getGlobalSkillsPath, getProjectSkillsPath, getRegistryPath, getStorePath } from "../utils/paths.js";
import { addSkillToProfile } from "./add.js";

export interface MvToProjectOptions {
  globalSkillsDir?: string;
  projectSkillsDir?: string;
  force?: boolean;
}

export async function mvToProject(
  name: string,
  options: MvToProjectOptions = {}
): Promise<void> {
  const globalDir = options.globalSkillsDir ?? getGlobalSkillsPath();
  const projectDir = options.projectSkillsDir ?? getProjectSkillsPath();
  const sourceDir = join(globalDir, name);
  const targetDir = join(projectDir, name);

  // 1. Verify source exists
  if (!(await dirExists(sourceDir))) {
    throw new Error(`Skill '${name}' not found in global skills directory.`);
  }

  // 2. Check target doesn't exist (unless --force)
  if (await dirExists(targetDir)) {
    if (!options.force) {
      throw new Error(
        `Skill '${name}' already exists in project. Use --force to overwrite.`
      );
    }
    await rm(targetDir, { recursive: true, force: true });
  }

  // 3. Copy files (unmanaged)
  await cpRecursive(sourceDir, targetDir);

  console.log(`✓ Copied ${name} to project (unmanaged)`);
}

export interface MvToGlobalOptions {
  globalSkillsDir?: string;
  projectSkillsDir?: string;
  force?: boolean;
  hardlink?: boolean;
  registryPath?: string;
  storePath?: string;
}

export async function mvToGlobal(
  name: string,
  options: MvToGlobalOptions = {}
): Promise<void> {
  const projectDir = options.projectSkillsDir ?? getProjectSkillsPath();
  const globalDir = options.globalSkillsDir ?? getGlobalSkillsPath();
  const sourceDir = join(projectDir, name);
  const targetDir = join(globalDir, name);
  const registryPath = options.registryPath ?? getRegistryPath();
  const storePath = options.storePath ?? getStorePath();

  // 1. Verify source exists
  if (!(await dirExists(sourceDir))) {
    throw new Error(`Skill '${name}' not found in project skills directory.`);
  }

  // 2. Check target doesn't exist (unless --force)
  if (await dirExists(targetDir)) {
    if (!options.force) {
      throw new Error(
        `Skill '${name}' already exists in global. Use --force to overwrite.`
      );
    }
  }

  // 3. Hash → Store → Link → Register → Profile (like add from local)
  console.log(`Hashing ${name}...`);
  const hash = await hashDirectory(sourceDir);

  console.log(`Storing ${hash.slice(0, 8)}...`);
  await store.store(hash, sourceDir, storePath);

  console.log(`Linking to ${targetDir}...`);
  await verifiedLinkSkill(hash, targetDir, { hardlink: options.hardlink }, storePath);

  // Register
  const v = await registerSkill(name, hash, "local", registryPath, storePath);

  // Add to active profile
  await addSkillToProfile({
    skillName: name,
    v,
    source: "local",
    global: true,
  });

  // 4. Remove project copy
  await unlinkSkill(sourceDir);

  console.log(`✓ Moved ${name} to global (${hash.slice(0, 8)})`);
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
