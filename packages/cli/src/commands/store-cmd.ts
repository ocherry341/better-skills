import { readdir, stat as fsStat } from "fs/promises";
import { join } from "path";
import { getStorePath, getRegistryPath } from "../utils/paths.js";
import { verifyStoreEntry } from "../core/store.js";
import { readRegistry } from "../core/registry.js";

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

    entries.push({
      hash,
      skills: hashToSkills.get(hash) ?? [],
      size,
    });
  }

  return { entries };
}
