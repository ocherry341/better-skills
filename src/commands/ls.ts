import * as lockfile from "../core/lockfile.js";
import { getSkillsPath } from "../utils/paths.js";
import { readdir, stat } from "fs/promises";
import { join } from "path";

export interface LsOptions {
  global?: boolean;
}

/**
 * List installed skills.
 * Read lock + scan target dir → table output
 */
export async function ls(options: LsOptions = {}): Promise<void> {
  const lock = await lockfile.read();
  const targetBase = getSkillsPath(options.global ?? false);

  const lockSkills = Object.keys(lock.skills);

  if (lockSkills.length === 0) {
    console.log("No skills installed.");
    return;
  }

  // Check which are actually linked
  const rows: Array<{ name: string; source: string; hash: string; linked: boolean }> = [];

  for (const name of lockSkills) {
    const entry = lock.skills[name];
    const targetDir = join(targetBase, name);
    let linked = false;
    try {
      await stat(targetDir);
      linked = true;
    } catch {}

    rows.push({
      name,
      source: entry.source,
      hash: entry.computedHash.slice(0, 8),
      linked,
    });
  }

  // Simple table output
  console.log("");
  console.log(
    `${"Name".padEnd(25)} ${"Source".padEnd(35)} ${"Hash".padEnd(10)} ${"Status"}`
  );
  console.log("-".repeat(80));

  for (const row of rows) {
    const status = row.linked ? "linked" : "not linked";
    console.log(
      `${row.name.padEnd(25)} ${row.source.padEnd(35)} ${row.hash.padEnd(10)} ${status}`
    );
  }
  console.log("");
}
