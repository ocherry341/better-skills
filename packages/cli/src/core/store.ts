import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { join } from "path";
import { getStorePath } from "../utils/paths.js";
import { hashDirectory } from "./hasher.js";
import { cpRecursive, linkSkill, type LinkOptions } from "./linker.js";

export interface StoreMetadata {
  storedAt: string;
}

const META_FILENAME = ".bsk-meta.json";

/** Get the path for a hash in the content-addressable store */
export function getHashPath(hash: string): string {
  return join(getStorePath(), hash);
}

/** Check if a hash exists in the store */
export async function has(hash: string): Promise<boolean> {
  try {
    await stat(getHashPath(hash));
    return true;
  } catch {
    return false;
  }
}

/** Read store metadata for a given hash, or null if not found */
export async function readStoreMeta(
  hash: string
): Promise<StoreMetadata | null> {
  const metaPath = join(getStorePath(), hash, META_FILENAME);
  try {
    const raw = await readFile(metaPath, "utf-8");
    return JSON.parse(raw) as StoreMetadata;
  } catch {
    return null;
  }
}

/**
 * Verify that a store entry is complete by re-hashing and comparing.
 * Returns false if the directory doesn't exist, is empty, or hash mismatches.
 */
export async function verifyStoreEntry(
  expectedHash: string
): Promise<boolean> {
  const hashPath = join(getStorePath(), expectedHash);
  try {
    const actualHash = await hashDirectory(hashPath);
    return actualHash === expectedHash;
  } catch {
    return false;
  }
}

/** Store skill files into the content-addressable store */
export async function store(
  hash: string,
  sourceDir: string
): Promise<string> {
  const base = getStorePath();
  const dest = join(base, hash);

  // Verify existing store entry integrity
  if (await verifyStoreEntry(hash)) {
    return dest;
  }

  // Remove incomplete entry if it exists
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cpRecursive(sourceDir, dest);

  // Write store metadata
  const meta: StoreMetadata = {
    storedAt: new Date().toISOString(),
  };
  await writeFile(join(dest, META_FILENAME), JSON.stringify(meta, null, 2) + "\n");

  return dest;
}

/** List all hashes in the store */
export async function list(): Promise<string[]> {
  const storePath = getStorePath();
  try {
    const entries = await readdir(storePath);
    return entries;
  } catch {
    return [];
  }
}

/** Remove a hash from the store */
export async function remove(hash: string): Promise<void> {
  const dest = join(getStorePath(), hash);
  await rm(dest, { recursive: true, force: true });
}

/**
 * Verify store entry integrity, then link to target.
 * Throws if the store entry is corrupted (hash mismatch).
 */
export async function verifiedLinkSkill(
  hash: string,
  targetDir: string,
  options: LinkOptions = {}
): Promise<void> {
  const base = getStorePath();
  const ok = await verifyStoreEntry(hash);
  if (!ok) {
    throw new Error(
      `Store entry ${hash.slice(0, 8)} is corrupted or missing. ` +
      `Run 'bsk store verify' to check, then re-add the skill.`
    );
  }
  const storeDir = join(base, hash);
  await linkSkill(storeDir, targetDir, options);
}
