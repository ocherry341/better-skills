import { copyFile, link, mkdir, readdir, rm, stat } from "fs/promises";
import { join } from "path";

export interface LinkOptions {
  /** Use file copy instead of hard links */
  copy?: boolean;
}

/**
 * Copy all files from src to dest recursively.
 * Used both for store ingestion and --copy mode linking.
 */
export async function cpRecursive(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      // Skip .git directories
      if (entry.name === ".git") continue;
      await cpRecursive(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * Hard link all files from src to dest recursively.
 * Directory structure is recreated (hard links are file-only).
 */
async function hardLinkRecursive(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === ".git") continue;
      await hardLinkRecursive(srcPath, destPath);
    } else {
      try {
        await link(srcPath, destPath);
      } catch (err: any) {
        // If hard link fails (cross-device), fall back to copy
        if (err.code === "EXDEV") {
          await copyFile(srcPath, destPath);
        } else {
          throw err;
        }
      }
    }
  }
}

/**
 * Link skill from store to target directory.
 * Default: hard links. With --copy: file copy.
 */
export async function linkSkill(
  storeDir: string,
  targetDir: string,
  options: LinkOptions = {}
): Promise<void> {
  // Clean existing target
  await rm(targetDir, { recursive: true, force: true });

  if (options.copy) {
    await cpRecursive(storeDir, targetDir);
  } else {
    await hardLinkRecursive(storeDir, targetDir);
  }
}

/**
 * Remove a linked skill directory.
 */
export async function unlinkSkill(targetDir: string): Promise<void> {
  await rm(targetDir, { recursive: true, force: true });
}
