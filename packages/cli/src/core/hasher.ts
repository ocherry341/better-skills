import { createHash } from "crypto";
import { readFile, readdir, stat } from "fs/promises";
import { join, relative } from "path";

/**
 * Collect all file paths in a directory recursively, sorted alphabetically.
 */
async function collectFiles(dir: string, base?: string): Promise<string[]> {
  const root = base ?? dir;
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden dirs like .git
      if (entry.name.startsWith(".")) continue;
      files.push(...(await collectFiles(fullPath, root)));
    } else {
      files.push(relative(root, fullPath));
    }
  }

  return files.sort();
}

/**
 * Compute a deterministic SHA-256 hash for a skill directory.
 *
 * Algorithm:
 * 1. Sort all file paths alphabetically
 * 2. For each file: hash "{relative_path}\0{file_content}"
 * 3. Final SHA-256 of all combined hashes
 */
export async function hashDirectory(dir: string): Promise<string> {
  const files = await collectFiles(dir);

  if (files.length === 0) {
    throw new Error(`No files found in directory: ${dir}`);
  }

  const fileHashes: string[] = [];

  for (const filePath of files) {
    const content = await readFile(join(dir, filePath));
    const hash = createHash("sha256");
    hash.update(`${filePath}\0`);
    hash.update(content);
    fileHashes.push(hash.digest("hex"));
  }

  const finalHash = createHash("sha256");
  for (const h of fileHashes) {
    finalHash.update(h);
  }

  return finalHash.digest("hex");
}
