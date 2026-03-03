import { resolve, toSourceString, type SourceDescriptor } from "../core/resolver.js";
import { fetch } from "../core/fetcher.js";
import { hashDirectory } from "../core/hasher.js";
import * as store from "../core/store.js";
import { linkSkill } from "../core/linker.js";
import { getSkillsPath } from "../utils/paths.js";
import { readSkillMd } from "../utils/skill-md.js";
import { join, basename } from "path";

export interface AddOptions {
  global?: boolean;
  copy?: boolean;
  name?: string;
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

    // 6. Link
    const targetBase = getSkillsPath(options.global ?? false);
    const targetDir = join(targetBase, skillName);
    console.log(`Linking to ${targetDir}...`);
    await linkSkill(store.getHashPath(hash), targetDir, { copy: options.copy });

    console.log(`✓ Added ${skillName} (${hash.slice(0, 8)})`);
  } finally {
    await result.cleanup();
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
