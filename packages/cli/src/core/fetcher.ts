import { mkdir, readdir, rm, cp, stat } from "fs/promises";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { type SourceDescriptor, toGitUrl } from "./resolver.js";
import { getTempPath } from "../utils/paths.js";
import { hasSkillMd } from "../utils/skill-md.js";

const execFileAsync = promisify(execFile);

export interface FetchResult {
  /** Path to the fetched skill directory (in temp) */
  dir: string;
  /** Cleanup function to remove temp files */
  cleanup: () => Promise<void>;
}

/** Execute a shell command and return stdout */
async function exec(cmd: string[]): Promise<string> {
  const [bin, ...args] = cmd;
  const { stdout } = await execFileAsync(bin, args);
  return stdout;
}

/** Shallow clone a git repo into a temp directory */
async function gitClone(url: string, dest: string): Promise<void> {
  try {
    await exec(["git", "clone", "--depth", "1", url, dest]);
  } catch (err: any) {
    const stderr = err.stderr ?? "";
    if (stderr.includes("not found")) {
      throw new Error(`Failed to clone repository: ${url}\nRepository not found. Check the URL and your access permissions.`);
    }
    throw new Error(`Failed to clone repository: ${url}\n${stderr.trim() || err.message}`);
  }
}

/**
 * Discover skill directories within a cloned repo.
 * A skill directory is one that contains a SKILL.md file.
 * Returns paths relative to the search root.
 */
async function discoverSkills(dir: string): Promise<string[]> {
  const skills: string[] = [];

  // Check if the root itself is a skill
  if (await hasSkillMd(dir)) {
    skills.push(dir);
    return skills;
  }

  // Check immediate subdirectories
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const subdir = join(dir, entry.name);
    if (await hasSkillMd(subdir)) {
      skills.push(subdir);
    }
  }

  return skills;
}

/** Fetch a skill from a source descriptor */
export async function fetch(source: SourceDescriptor): Promise<FetchResult> {
  if (source.type === "local") {
    // For local sources, just reference the path directly (no temp)
    const resolvedPath = resolve(source.path);
    return {
      dir: resolvedPath,
      cleanup: async () => {},
    };
  }

  // Git-based sources (github or git)
  const tmpBase = getTempPath();
  await mkdir(tmpBase, { recursive: true });
  const tmpDir = join(tmpBase, randomUUID());

  const url = toGitUrl(source);
  await gitClone(url, tmpDir);

  // Determine the skill directory
  let skillDir: string;

  if (source.type === "github" && source.subdir) {
    skillDir = join(tmpDir, source.subdir);
    // Verify it exists
    try {
      await stat(skillDir);
    } catch {
      throw new Error(`Subdirectory not found: ${source.subdir}`);
    }
  } else {
    // Auto-discover skills or use root
    const discovered = await discoverSkills(tmpDir);
    if (discovered.length === 0) {
      // Use the repo root as the skill
      skillDir = tmpDir;
    } else if (discovered.length === 1) {
      skillDir = discovered[0];
    } else {
      // Multiple skills found — for now, use the first one
      // TODO: In the future, allow the user to choose or add all
      skillDir = discovered[0];
    }
  }

  return {
    dir: skillDir,
    cleanup: async () => {
      await rm(tmpDir, { recursive: true, force: true });
    },
  };
}

/**
 * Fetch a skill and return multiple discovered skills.
 * Used for repos that contain multiple skills.
 */
export async function fetchAll(source: SourceDescriptor): Promise<{
  skills: string[];
  cleanup: () => Promise<void>;
}> {
  if (source.type === "local") {
    const resolvedPath = resolve(source.path);
    const discovered = await discoverSkills(resolvedPath);
    return {
      skills: discovered.length > 0 ? discovered : [resolvedPath],
      cleanup: async () => {},
    };
  }

  const tmpBase = getTempPath();
  await mkdir(tmpBase, { recursive: true });
  const tmpDir = join(tmpBase, randomUUID());

  const url = toGitUrl(source);
  await gitClone(url, tmpDir);

  let searchDir = tmpDir;
  if (source.type === "github" && source.subdir) {
    searchDir = join(tmpDir, source.subdir);
  }

  const discovered = await discoverSkills(searchDir);

  return {
    skills: discovered.length > 0 ? discovered : [searchDir],
    cleanup: async () => {
      await rm(tmpDir, { recursive: true, force: true });
    },
  };
}
