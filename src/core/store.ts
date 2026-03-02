import { mkdir, readdir, rm, stat } from "fs/promises";
import { join } from "path";
import { getStorePath } from "../utils/paths.js";
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

/** Store skill files into the content-addressable store */
export async function store(hash: string, sourceDir: string): Promise<string> {
  const dest = getHashPath(hash);

  // Already stored
  if (await has(hash)) {
    return dest;
  }

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
