import { getSkillsPath } from "../utils/paths.js";
import { readdir } from "fs/promises";

export interface LsOptions {
  global?: boolean;
}

/**
 * List installed skills by scanning the skills directory.
 */
export async function ls(options: LsOptions = {}): Promise<void> {
  const targetBase = getSkillsPath(options.global ?? false);

  let entries: string[];
  try {
    const dirEntries = await readdir(targetBase, { withFileTypes: true });
    entries = dirEntries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    entries = [];
  }

  if (entries.length === 0) {
    console.log("No skills installed.");
    return;
  }

  console.log("");
  console.log(`${"Name".padEnd(30)} ${"Location"}`);
  console.log("-".repeat(70));

  for (const name of entries.sort()) {
    const fullPath = `${targetBase}/${name}`;
    console.log(`${name.padEnd(30)} ${fullPath}`);
  }
  console.log("");
}
