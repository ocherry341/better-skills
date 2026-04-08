import { readdir, stat as fsStat } from "fs/promises";
import { join } from "path";
import { getStorePath, getRegistryPath, getProfilesPath, getActiveProfileFilePath } from "../utils/paths.js";
import { verifyStoreEntry, remove as removeStoreEntry, readStoreMeta } from "../core/store.js";
import { readRegistry, registerSkill } from "../core/registry.js";
import { readSkillMd } from "../utils/skill-md.js";
import { addSkillToProfile } from "./add.js";

export interface CorruptedEntry {
  hash: string;
  skills: string[];
}

export interface VerifyResult {
  total: number;
  ok: number;
  corrupted: CorruptedEntry[];
}

export interface StoreVerifyOptions {
  storePath?: string;
  registryPath?: string;
}

export async function storeVerify(options: StoreVerifyOptions = {}): Promise<VerifyResult> {
  const storePath = options.storePath ?? getStorePath();
  const registryPath = options.registryPath ?? getRegistryPath();

  let entries: string[];
  try {
    entries = await readdir(storePath);
  } catch {
    return { total: 0, ok: 0, corrupted: [] };
  }

  // Build hash → skill names lookup from registry
  const registry = await readRegistry(registryPath);
  const hashToSkills = new Map<string, string[]>();
  for (const [name, entry] of Object.entries(registry.skills)) {
    for (const ver of entry.versions) {
      const existing = hashToSkills.get(ver.hash) ?? [];
      existing.push(`${name}@v${ver.v}`);
      hashToSkills.set(ver.hash, existing);
    }
  }

  const corrupted: CorruptedEntry[] = [];
  let ok = 0;

  for (const hash of entries) {
    const valid = await verifyStoreEntry(hash, storePath);
    if (valid) {
      ok++;
    } else {
      corrupted.push({
        hash,
        skills: hashToSkills.get(hash) ?? [],
      });
    }
  }

  return { total: entries.length, ok, corrupted };
}

export interface StoreEntry {
  hash: string;
  skills: { name: string; v: number; source: string }[];
  size: number;
  orphanName?: string;
}

export interface StoreLsResult {
  entries: StoreEntry[];
}

export async function storeLs(options: { storePath?: string; registryPath?: string } = {}): Promise<StoreLsResult> {
  const storePath = options.storePath ?? getStorePath();
  const registryPath = options.registryPath ?? getRegistryPath();

  let hashes: string[];
  try {
    hashes = await readdir(storePath);
  } catch {
    return { entries: [] };
  }

  // Build hash → skill info lookup from registry
  const registry = await readRegistry(registryPath);
  const hashToSkills = new Map<string, { name: string; v: number; source: string }[]>();
  for (const [name, entry] of Object.entries(registry.skills)) {
    for (const ver of entry.versions) {
      const existing = hashToSkills.get(ver.hash) ?? [];
      existing.push({ name, v: ver.v, source: ver.source });
      hashToSkills.set(ver.hash, existing);
    }
  }

  const entries: StoreEntry[] = [];
  for (const hash of hashes.sort()) {
    // Calculate directory size
    let size = 0;
    try {
      const dirPath = join(storePath, hash);
      const files = await readdir(dirPath, { recursive: true });
      for (const file of files) {
        try {
          const s = await fsStat(join(dirPath, file));
          if (s.isFile()) size += s.size;
        } catch { /* skip */ }
      }
    } catch { /* skip */ }

    let orphanName: string | undefined;
    if (!hashToSkills.has(hash)) {
      try {
        const meta = await readSkillMd(join(storePath, hash));
        orphanName = meta.name;
      } catch { /* no SKILL.md or parse error */ }
    }

    entries.push({
      hash,
      skills: hashToSkills.get(hash) ?? [],
      size,
      orphanName,
    });
  }

  return { entries };
}

export interface StorePruneResult {
  pruned: number;
  prunedHashes: string[];
}

export async function storePrune(options: { storePath?: string; registryPath?: string } = {}): Promise<StorePruneResult> {
  const storePath = options.storePath ?? getStorePath();
  const registryPath = options.registryPath ?? getRegistryPath();

  const registry = await readRegistry(registryPath);
  const referencedHashes = new Set<string>();
  for (const entry of Object.values(registry.skills)) {
    for (const ver of entry.versions) {
      referencedHashes.add(ver.hash);
    }
  }

  let storeHashes: string[];
  try {
    storeHashes = await readdir(storePath);
  } catch {
    return { pruned: 0, prunedHashes: [] };
  }

  const orphans = storeHashes.filter((h) => !referencedHashes.has(h));
  const prunedHashes: string[] = [];

  for (const hash of orphans) {
    await removeStoreEntry(hash, storePath);
    prunedHashes.push(hash);
  }

  return { pruned: prunedHashes.length, prunedHashes };
}

export interface StoreAdoptResult {
  adopted: number;
}

export async function storeAdopt(options: {
  storePath?: string;
  registryPath?: string;
  profilesDir?: string;
  activeFile?: string;
} = {}): Promise<StoreAdoptResult> {
  const storePath = options.storePath ?? getStorePath();
  const registryPath = options.registryPath ?? getRegistryPath();
  const profilesDir = options.profilesDir ?? getProfilesPath();
  const activeFile = options.activeFile ?? getActiveProfileFilePath();

  const registry = await readRegistry(registryPath);

  let storeHashes: string[];
  try {
    storeHashes = await readdir(storePath);
  } catch {
    return { adopted: 0 };
  }

  const referencedHashes = new Set<string>();
  for (const entry of Object.values(registry.skills)) {
    for (const ver of entry.versions) {
      referencedHashes.add(ver.hash);
    }
  }

  const orphanHashes = storeHashes.filter((h) => !referencedHashes.has(h));
  if (orphanHashes.length === 0) return { adopted: 0 };

  const orphans: { hash: string; skillName: string; sortTime: number }[] = [];

  for (const hash of orphanHashes) {
    const hashDir = join(storePath, hash);

    let skillName: string;
    try {
      const meta = await readSkillMd(hashDir);
      skillName = meta.name;
    } catch {
      continue;
    }

    const storeMeta = await readStoreMeta(hash, storePath);
    let sortTime: number;
    if (storeMeta?.storedAt) {
      sortTime = new Date(storeMeta.storedAt).getTime();
    } else {
      try {
        const s = await fsStat(hashDir);
        sortTime = s.mtimeMs;
      } catch {
        sortTime = 0;
      }
    }

    orphans.push({ hash, skillName, sortTime });
  }

  orphans.sort((a, b) => a.sortTime - b.sortTime);

  let adopted = 0;
  for (const orphan of orphans) {
    const v = await registerSkill(
      orphan.skillName,
      orphan.hash,
      "local",
      registryPath,
      storePath
    );

    await addSkillToProfile({
      skillName: orphan.skillName,
      v,
      source: "local",
      global: true,
      profilesDir,
      activeFile,
    });

    adopted++;
  }

  return { adopted };
}
