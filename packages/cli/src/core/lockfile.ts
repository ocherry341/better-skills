import { readFile, writeFile } from "fs/promises";
import { z } from "zod";
import { getLockfilePath } from "../utils/paths.js";

export const SkillEntrySchema = z.object({
  source: z.string(),
  sourceType: z.enum(["github", "git", "local"]),
  computedHash: z.string(),
});

export const LockfileSchema = z.object({
  version: z.number(),
  skills: z.record(z.string(), SkillEntrySchema),
});

export type SkillEntry = z.infer<typeof SkillEntrySchema>;
export type Lockfile = z.infer<typeof LockfileSchema>;

const CURRENT_VERSION = 1;

/** Create an empty lockfile */
export function createEmpty(): Lockfile {
  return { version: CURRENT_VERSION, skills: {} };
}

/** Read and parse the lockfile, returning empty if not found */
export async function read(projectRoot?: string): Promise<Lockfile> {
  const path = getLockfilePath(projectRoot);
  try {
    const content = await readFile(path, "utf-8");
    const data = JSON.parse(content);
    return LockfileSchema.parse(data);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return createEmpty();
    }
    throw err;
  }
}

/** Write the lockfile to disk */
export async function write(lockfile: Lockfile, projectRoot?: string): Promise<void> {
  const path = getLockfilePath(projectRoot);
  const content = JSON.stringify(lockfile, null, 2) + "\n";
  await writeFile(path, content, "utf-8");
}

/** Add or update a skill entry in the lockfile */
export function setSkill(
  lockfile: Lockfile,
  name: string,
  entry: SkillEntry
): Lockfile {
  return {
    ...lockfile,
    skills: {
      ...lockfile.skills,
      [name]: entry,
    },
  };
}

/** Remove a skill entry from the lockfile */
export function removeSkill(lockfile: Lockfile, name: string): Lockfile {
  const { [name]: _, ...rest } = lockfile.skills;
  return { ...lockfile, skills: rest };
}
