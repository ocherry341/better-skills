import { readFile } from "fs/promises";
import { join } from "path";

export interface SkillMetadata {
  name: string;
  description?: string;
  version?: string;
  [key: string]: unknown;
}

/**
 * Parse YAML-like frontmatter from SKILL.md
 * Expects format:
 * ---
 * name: my-skill
 * description: Some description
 * ---
 */
export function parseFrontmatter(content: string): SkillMetadata {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("No YAML frontmatter found in SKILL.md");
  }

  const yaml = match[1];
  const metadata: Record<string, string> = {};

  for (const line of yaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    metadata[key] = value;
  }

  if (!metadata.name) {
    throw new Error("SKILL.md frontmatter must include 'name'");
  }

  return metadata as unknown as SkillMetadata;
}

/** Read and parse SKILL.md from a directory */
export async function readSkillMd(dir: string): Promise<SkillMetadata> {
  const content = await readFile(join(dir, "SKILL.md"), "utf-8");
  return parseFrontmatter(content);
}

/** Check if a directory contains a SKILL.md */
export async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    await readFile(join(dir, "SKILL.md"));
    return true;
  } catch {
    return false;
  }
}
