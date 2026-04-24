import { mkdtempSync } from "fs";
import { homedir, tmpdir } from "os";
import { join, resolve } from "path";

// Bun's os.homedir() ignores runtime changes to $HOME, so read the env var directly.
// Under NODE_ENV=test (set automatically by `bun test`), return a per-process
// temp directory so tests never touch the real home.
let _testHome: string | undefined;

export function home(): string {
  if (process.env.NODE_ENV === "test") {
    _testHome ??= mkdtempSync(join(tmpdir(), "bsk-test-home-"));
    return _testHome;
  }
  return process.env.HOME ?? homedir();
}

/** Project root directory (for project-level skills) */
export function getProjectRoot(): string {
  if (process.env.NODE_ENV === "test") {
    return join(home(), "project");
  }
  return process.cwd();
}

/** Relative subdirectory for project-level skills (e.g. for symlink targets) */
export const PROJECT_SKILLS_SUBDIR = join(".agents", "skills");

/** Root of the bsk data directory */
export function getBskDir(): string {
  return join(home(), ".better-skills");
}

/** Global content-addressable store */
export function getStorePath(): string {
  return join(home(), ".better-skills", "store");
}

/** Global skills target directory */
export function getGlobalSkillsPath(): string {
  return join(home(), ".agents", "skills");
}

export interface ProjectSkillsPathInput {
  nodeEnv: string | undefined;
  homeDir: string;
  cwd: string;
}

/** Pure project-local skills path resolver for tests and production wrapper. */
export function getProjectSkillsPathFor(input: ProjectSkillsPathInput): string | null {
  if (input.nodeEnv === "test") {
    return join(input.homeDir, "project", PROJECT_SKILLS_SUBDIR);
  }

  if (resolve(input.cwd) === resolve(input.homeDir)) {
    return null;
  }

  return join(input.cwd, PROJECT_SKILLS_SUBDIR);
}

/** Project-local skills target directory */
export function getProjectSkillsPath(): string | null {
  return getProjectSkillsPathFor({
    nodeEnv: process.env.NODE_ENV,
    homeDir: home(),
    cwd: getProjectRoot(),
  });
}

/** Resolve the skills target path based on global flag */
export function getSkillsPath(global: boolean): string {
  if (global) {
    return getGlobalSkillsPath();
  }

  const projectPath = getProjectSkillsPath();
  if (!projectPath) {
    throw new Error("No project context in current directory.");
  }

  return projectPath;
}

/** Directory containing all profile JSON files */
export function getProfilesPath(): string {
  return join(home(), ".better-skills", "profiles");
}

/** Path to a specific profile's JSON file */
export function getProfilePath(name: string): string {
  return join(getProfilesPath(), `${name}.json`);
}

/** File that stores the name of the active profile */
export function getActiveProfileFilePath(): string {
  return join(home(), ".better-skills", "active-profile");
}

/** Registry file tracking managed global skills */
export function getRegistryPath(): string {
  return join(home(), ".better-skills", "registry.json");
}

/** Global config file */
export function getConfigPath(): string {
  return join(home(), ".better-skills", "config.json");
}

/** Temp directory for git clones */
export function getTempPath(): string {
  return join(tmpdir(), "better-skills");
}

/** Reset the test home directory. Call in beforeEach to isolate tests. */
export async function cleanTestHome(): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("cleanTestHome() must only be called in test environment");
  }
  const target = resolve(home());
  if (target === "/home" || target === homedir()) {
    throw new Error(`cleanTestHome() refusing to rm dangerous path: ${target}`);
  }
  const { rm, mkdir } = await import("fs/promises");
  await rm(target, { recursive: true, force: true });
  await mkdir(home(), { recursive: true });
}
