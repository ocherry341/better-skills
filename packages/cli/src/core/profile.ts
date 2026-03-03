import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import { z } from "zod";
import { dirname } from "path";

export const ProfileSkillEntrySchema = z.object({
  skillName: z.string(),
  hash: z.string(),
  source: z.string(),
  addedAt: z.string(),
});

export const ProfileSchema = z.object({
  name: z.string(),
  skills: z.array(ProfileSkillEntrySchema),
});

export type ProfileSkillEntry = z.infer<typeof ProfileSkillEntrySchema>;
export type Profile = z.infer<typeof ProfileSchema>;

/** Read and validate a profile JSON file */
export async function readProfile(filePath: string): Promise<Profile> {
  const raw = await readFile(filePath, "utf-8");
  return ProfileSchema.parse(JSON.parse(raw));
}

/** Write a profile to a JSON file */
export async function writeProfile(filePath: string, profile: Profile): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(profile, null, 2) + "\n");
}

/** List all profile names in a profiles directory */
export async function listProfiles(profilesDir: string): Promise<string[]> {
  try {
    const entries = await readdir(profilesDir);
    return entries
      .filter((e) => e.endsWith(".json"))
      .map((e) => e.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

/** Get the active profile name, or null if none set */
export async function getActiveProfileName(activeFile: string): Promise<string | null> {
  try {
    const name = (await readFile(activeFile, "utf-8")).trim();
    return name || null;
  } catch {
    return null;
  }
}

/** Set the active profile name */
export async function setActiveProfileName(activeFile: string, name: string): Promise<void> {
  await mkdir(dirname(activeFile), { recursive: true });
  await writeFile(activeFile, name + "\n");
}
