import { readdir } from "fs/promises";
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
