import { readdir } from "fs/promises";
import { getGlobalSkillsPath, getProjectSkillsPath } from "../utils/paths.js";

export interface StatusEntry {
  name: string;
  global: boolean;
  project: boolean;
}

export interface StatusOptions {
  globalDir?: string;
  projectDir?: string;
}

async function listDirNames(dir: string): Promise<Set<string>> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
  } catch {
    return new Set();
  }
}

/**
 * Collect active skills from both global and project directories.
 * Returns a sorted list of StatusEntry objects.
 */
export async function status(options: StatusOptions = {}): Promise<StatusEntry[]> {
  const globalDir = options.globalDir ?? getGlobalSkillsPath();
  const projectDir = options.projectDir ?? getProjectSkillsPath();

  const globalNames = await listDirNames(globalDir);
  const projectNames = await listDirNames(projectDir);

  const allNames = new Set([...globalNames, ...projectNames]);
  if (allNames.size === 0) return [];

  const entries: StatusEntry[] = [...allNames].sort().map((name) => ({
    name,
    global: globalNames.has(name),
    project: projectNames.has(name),
  }));

  return entries;
}

/**
 * Print the status table to stdout.
 */
export function printStatus(entries: StatusEntry[]): void {
  if (entries.length === 0) {
    console.log("No active skills.");
    return;
  }

  console.log("");
  console.log(`${"Name".padEnd(30)} ${"Global".padEnd(10)} ${"Project"}`);
  console.log("-".repeat(50));

  for (const entry of entries) {
    const globalMark = entry.global ? "✓" : "-";
    const projectMark = entry.project ? "✓" : "-";
    console.log(`${entry.name.padEnd(30)} ${globalMark.padEnd(10)} ${projectMark}`);
  }
  console.log("");
}
