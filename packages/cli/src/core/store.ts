import { mkdir, readdir, rm, stat } from "fs/promises";
import { join } from "path";
import { getStorePath } from "../utils/paths.js";
import { hashDirectory } from "./hasher.js";
import { cpRecursive } from "./linker.js";

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

/**
 * Verify that a store entry is complete by re-hashing and comparing.
 * Returns false if the directory doesn't exist, is empty, or hash mismatches.
 */
export async function verifyStoreEntry(
  expectedHash: string,
  storePath?: string
): Promise<boolean> {
  const hashPath = join(storePath ?? getStorePath(), expectedHash);
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
  sourceDir: string,
  storePath?: string
): Promise<string> {
  const base = storePath ?? getStorePath();
  const dest = join(base, hash);

  // Verify existing store entry integrity
  if (await verifyStoreEntry(hash, base)) {
    return dest;
  }

  // Remove incomplete entry if it exists
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cpRecursive(sourceDir, dest);

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
  const dest = getHashPath(hash);
  await rm(dest, { recursive: true, force: true });
}
