import { homedir } from "os";
import { join, resolve } from "path";

const HOME = homedir();

/** Global content-addressable store */
export function getStorePath(): string {
  return join(HOME, ".better-skills", "store");
}

/** Global skills target directory */
export function getGlobalSkillsPath(): string {
  return join(HOME, ".agents", "skills");
}

/** Project-local skills target directory */
export function getProjectSkillsPath(projectRoot?: string): string {
  const root = projectRoot ?? process.cwd();
  return join(root, ".agents", "skills");
}

/** Resolve the skills target path based on global flag */
export function getSkillsPath(global: boolean, projectRoot?: string): string {
  return global ? getGlobalSkillsPath() : getProjectSkillsPath(projectRoot);
}

/** Directory containing all profile JSON files */
export function getProfilesPath(): string {
  return join(HOME, ".better-skills", "profiles");
}

/** Path to a specific profile's JSON file */
export function getProfilePath(name: string): string {
  return join(getProfilesPath(), `${name}.json`);
}

/** File that stores the name of the active profile */
export function getActiveProfileFilePath(): string {
  return join(HOME, ".better-skills", "active-profile");
}

/** Temp directory for git clones */
export function getTempPath(): string {
  return join(HOME, ".better-skills", "tmp");
}

/** Resolve a potentially relative path to absolute */
export function resolveAbsolute(p: string): string {
  return resolve(p);
}
