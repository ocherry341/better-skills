import { readdir } from "fs/promises";
import { getGlobalSkillsPath, getProjectSkillsPath } from "../utils/paths.js";
import { readRegistry } from "../core/registry.js";

export interface LsEntry {
  name: string;
  global: boolean;
  project: boolean;
}

export interface LsAllEntry {
  name: string;
  hash: string;
  source: string;
  v: number;
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
 * Returns a sorted list of LsEntry objects.
 */
export async function ls(): Promise<LsEntry[]> {
  const globalDir = getGlobalSkillsPath();
  const projectDir = getProjectSkillsPath();

  const globalNames = await listDirNames(globalDir);
  const projectNames = await listDirNames(projectDir);

  const allNames = new Set([...globalNames, ...projectNames]);
  if (allNames.size === 0) return [];

  const entries: LsEntry[] = [...allNames].sort().map((name) => ({
    name,
    global: globalNames.has(name),
    project: projectNames.has(name),
  }));

  return entries;
}

/**
 * Print the ls table to stdout.
 */
export function printLs(entries: LsEntry[]): void {
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

/**
 * List all skills registered (managed) by bsk.
 */
export async function lsAll(): Promise<LsAllEntry[]> {
  const registry = await readRegistry();
  const entries = Object.entries(registry.skills);
  if (entries.length === 0) return [];

  return entries
    .map(([name, entry]) => {
      const latest = entry.versions.reduce((best, v) => (v.v > best.v ? v : best));
      return { name, hash: latest.hash, source: latest.source, v: latest.v };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Print the lsAll table to stdout.
 */
export function printLsAll(entries: LsAllEntry[]): void {
  if (entries.length === 0) {
    console.log("No managed skills.");
    return;
  }

  console.log("");
  console.log(`${"Name".padEnd(30)} ${"Version".padEnd(10)} ${"Hash".padEnd(12)} ${"Source"}`);
  console.log("-".repeat(80));

  for (const entry of entries) {
    console.log(`${entry.name.padEnd(30)} ${"v" + entry.v.toString().padEnd(9)} ${entry.hash.slice(0, 8).padEnd(12)} ${entry.source}`);
  }
  console.log("");
}
