import { stat, readdir, rm, mkdir } from "fs/promises";
import { join, dirname, basename } from "path";
import { getActiveProfileName, readProfile } from "../core/profile.js";
import { restoreSkillsFromProfile } from "../core/restore.js";
import { readConfig, ensureClientSymlink } from "../core/clients.js";
import {
  getProfilesPath,
  getActiveProfileFilePath,
  getStorePath,
  getRegistryPath,
  getConfigPath,
} from "../utils/paths.js";

export interface SyncRestoreOptions {
  profilesDir: string;
  activeFile: string;
  skillsDir: string;
  storePath: string;
  registryPath?: string;
  configPath?: string;
  hardlink?: boolean;
  clientDirOverrides?: Record<string, string>;
}

export async function syncRestore(opts: SyncRestoreOptions): Promise<void> {
  // 1. Get active profile
  const activeName = await getActiveProfileName(opts.activeFile);
  if (!activeName) {
    throw new Error("No active profile found. Run 'bsk profile use <name>' first.");
  }

  // 2. Read profile
  const profilePath = join(opts.profilesDir, `${activeName}.json`);
  const profile = await readProfile(profilePath);

  // 3. Restore skills
  const result = await restoreSkillsFromProfile(profile, {
    skillsDir: opts.skillsDir,
    storePath: opts.storePath,
    registryPath: opts.registryPath,
    hardlink: opts.hardlink,
  });

  // 4. Rebuild client symlinks
  const config = await readConfig(opts.configPath);
  let clientsLinked = 0;
  for (const clientId of config.clients) {
    const clientDir = opts.clientDirOverrides?.[clientId] ?? undefined;
    const status = await ensureClientSymlink(clientId, opts.skillsDir, clientDir);
    if (status === "created" || status === "exists") {
      clientsLinked++;
    }
  }

  // 5. Print summary
  console.log(
    `✓ Restored ${result.restored.length} skill(s)` +
    (result.skipped.length > 0 ? ` (${result.skipped.length} skipped)` : "") +
    `. ${clientsLinked} client(s) linked.`
  );
}

export interface SyncExportOptions {
  output?: string;
  bskDir: string;
}

export async function syncExport(opts: SyncExportOptions): Promise<void> {
  // Verify bskDir exists
  try {
    await stat(opts.bskDir);
  } catch {
    throw new Error(`bsk directory not found at ${opts.bskDir}. Nothing to export.`);
  }

  // Resolve output path
  const today = new Date().toISOString().slice(0, 10);
  const output = opts.output ?? `better-skills-backup-${today}.tar.gz`;

  // Create tar.gz
  const parent = dirname(opts.bskDir);
  const dirName = basename(opts.bskDir);
  const proc = Bun.spawn(["tar", "czf", output, "--exclude=.git", "-C", parent, dirName]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`tar failed with exit code ${exitCode}`);
  }

  const fileStat = await stat(output);
  const sizeKB = (fileStat.size / 1024).toFixed(1);
  console.log(`✓ Exported to ${output} (${sizeKB} KB)`);
}

export interface SyncImportOptions {
  yes?: boolean;
  hardlink?: boolean;
  bskDir: string;
  skillsDir: string;
  configPath?: string;
  registryPath?: string;
  clientDirOverrides?: Record<string, string>;
}

export async function syncImport(
  file: string,
  opts: SyncImportOptions
): Promise<void> {
  // 1. Verify input file exists
  try {
    await stat(file);
  } catch {
    throw new Error(`Archive file not found: ${file}`);
  }

  // 2. Check if bskDir has content
  let hasContent = false;
  try {
    const entries = await readdir(opts.bskDir);
    hasContent = entries.length > 0;
  } catch {
    // doesn't exist — fine
  }

  if (hasContent && !opts.yes) {
    throw new Error(
      `${opts.bskDir} is not empty. Use --yes to overwrite, or remove it manually first.`
    );
  }

  // 3. Remove bskDir contents
  if (hasContent) {
    await rm(opts.bskDir, { recursive: true, force: true });
  }

  // 4. Extract archive
  const parent = dirname(opts.bskDir);
  await mkdir(parent, { recursive: true });
  const proc = Bun.spawn(["tar", "xzf", file, "-C", parent]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`tar extract failed with exit code ${exitCode}`);
  }

  console.log(`✓ Imported from ${file}`);

  // 5. Auto-restore
  const profilesDir = getProfilesPath();
  const activeFile = getActiveProfileFilePath();
  const storePath = getStorePath();
  const registryPath = opts.registryPath ?? getRegistryPath();
  const configPath = opts.configPath ?? getConfigPath();

  try {
    await syncRestore({
      profilesDir,
      activeFile,
      skillsDir: opts.skillsDir,
      storePath,
      registryPath,
      configPath,
      hardlink: opts.hardlink,
      clientDirOverrides: opts.clientDirOverrides,
    });
  } catch (err: any) {
    console.warn(`⚠ Auto-restore skipped: ${err.message}`);
    console.warn("  Run 'bsk sync restore' manually after setting up a profile.");
  }
}

/**
 * Open a shell in the bsk data directory.
 * If shellCmd is provided (for testing), runs that command instead of an interactive shell.
 * Returns stdout when shellCmd is provided.
 */
export async function bskCd(
  bskDir: string,
  shellCmd?: string[]
): Promise<string | void> {
  try {
    await stat(bskDir);
  } catch {
    throw new Error(`bsk directory not found at ${bskDir}.`);
  }

  if (shellCmd) {
    // Testing mode: run a specific command and return output
    const proc = Bun.spawn(shellCmd, {
      cwd: bskDir,
      stdout: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim();
  }

  // Interactive mode: spawn a shell
  const shell = process.env.SHELL ?? "/bin/sh";
  console.log(`Opening shell in ${bskDir}...`);
  console.log(`(Type 'exit' to return)`);
  const proc = Bun.spawn([shell], {
    cwd: bskDir,
    stdio: ["inherit", "inherit", "inherit"],
  });
  await proc.exited;
}
