import { readdir, mkdir, stat } from "fs/promises";
import { join } from "path";
import { unlinkSkill } from "./linker.js";
import { verifiedLinkSkill } from "./store.js";
import { type Profile } from "./profile.js";
import { isManaged, registerSkill, readRegistry } from "./registry.js";

export interface RestoreResult {
  restored: string[];
  skipped: string[];
  unmanaged: string[];
}

export interface RestoreOptions {
  skillsDir: string;
  storePath: string;
  registryPath?: string;
  hardlink?: boolean;
}

export async function restoreSkillsFromProfile(
  profile: Profile,
  opts: RestoreOptions
): Promise<RestoreResult> {
  const result: RestoreResult = { restored: [], skipped: [], unmanaged: [] };

  // Clear only managed skills from skills dir; preserve unmanaged
  try {
    const existing = await readdir(opts.skillsDir, { withFileTypes: true });
    for (const entry of existing) {
      if (!entry.isDirectory()) continue;
      const managed = await isManaged(entry.name, opts.registryPath);
      if (managed) {
        await unlinkSkill(join(opts.skillsDir, entry.name));
      } else {
        result.unmanaged.push(entry.name);
        console.warn(`⚠ Skipping unmanaged skill '${entry.name}'`);
      }
    }
  } catch {
    // Directory doesn't exist, will be created below
  }

  await mkdir(opts.skillsDir, { recursive: true });

  const registry = await readRegistry(opts.registryPath);

  for (const skill of profile.skills) {
    const entry = registry.skills[skill.skillName];
    const version = entry?.versions.find((ver) => ver.v === skill.v);
    if (!version) {
      result.skipped.push(skill.skillName);
      console.warn(`⚠ Skill '${skill.skillName}' v${skill.v} not found in registry, skipping.`);
      continue;
    }
    const storeDir = join(opts.storePath, version.hash);
    try {
      await stat(storeDir);
    } catch {
      result.skipped.push(skill.skillName);
      console.warn(`⚠ Skill '${skill.skillName}' (${version.hash.slice(0, 8)}) not found in store, skipping.`);
      continue;
    }
    const targetDir = join(opts.skillsDir, skill.skillName);
    await verifiedLinkSkill(version.hash, targetDir, { hardlink: opts.hardlink }, opts.storePath);
    await registerSkill(skill.skillName, version.hash, skill.source, opts.registryPath, opts.storePath);
    result.restored.push(skill.skillName);
  }

  return result;
}
