import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { dirname, join } from "path";
import { getRegistryPath, getStorePath } from "../utils/paths.js";

export interface RegistryEntry {
  hash: string;
  source: string;
}

export interface Registry {
  skills: Record<string, RegistryEntry>;
}

/**
 * Read the global skills registry.
 * Missing file → empty registry. Corrupted JSON → warn + empty registry.
 */
export async function readRegistry(
  registryPath?: string
): Promise<Registry> {
  const filePath = registryPath ?? getRegistryPath();
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.skills === "object") {
      return parsed as Registry;
    }
    console.warn("⚠ Registry has unexpected structure, treating as empty.");
    return { skills: {} };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { skills: {} };
    }
    // Corrupted JSON or other read error
    console.warn("⚠ Could not read registry, treating as empty.");
    return { skills: {} };
  }
}

/**
 * Write the registry to disk.
 * Cleans entries where the hash no longer exists in the store.
 */
export async function writeRegistry(
  registry: Registry,
  registryPath?: string,
  storePath?: string
): Promise<void> {
  const filePath = registryPath ?? getRegistryPath();
  const storeBase = storePath ?? getStorePath();

  // Clean stale entries (hash missing from store)
  const cleaned: Record<string, RegistryEntry> = {};
  for (const [name, entry] of Object.entries(registry.skills)) {
    try {
      await stat(join(storeBase, entry.hash));
      cleaned[name] = entry;
    } catch {
      // Hash missing from store, skip entry
    }
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify({ skills: cleaned }, null, 2) + "\n"
  );
}

/**
 * Register a skill as managed by bsk.
 */
export async function registerSkill(
  name: string,
  hash: string,
  source: string,
  registryPath?: string,
  storePath?: string
): Promise<void> {
  const registry = await readRegistry(registryPath);
  registry.skills[name] = { hash, source };
  await writeRegistry(registry, registryPath, storePath);
}

/**
 * Unregister a skill (no longer managed by bsk).
 */
export async function unregisterSkill(
  name: string,
  registryPath?: string,
  storePath?: string
): Promise<void> {
  const registry = await readRegistry(registryPath);
  delete registry.skills[name];
  await writeRegistry(registry, registryPath, storePath);
}

/**
 * Check if a skill directory is managed by bsk.
 */
export async function isManaged(
  name: string,
  registryPath?: string
): Promise<boolean> {
  const registry = await readRegistry(registryPath);
  return name in registry.skills;
}
