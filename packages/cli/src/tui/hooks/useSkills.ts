import { useState, useEffect } from "react";
import { ls } from "../../commands/ls.js";
import { readRegistry, getLatestVersion } from "../../core/registry.js";
import { getGlobalSkillsPath, getProjectSkillsPath } from "../../utils/paths.js";
import { join } from "path";
import { readFile } from "fs/promises";

export interface SkillDetail {
  name: string;
  global: boolean;
  project: boolean;
  version?: number;
  hash?: string;
  source?: string;
  addedAt?: string;
  skillMdContent?: string;
}

export interface UseSkillsResult {
  skills: SkillDetail[];
  loading: boolean;
  refresh: () => void;
}

export function useSkills(): UseSkillsResult {
  const [skills, setSkills] = useState<SkillDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const entries = await ls();
        const registry = await readRegistry();

        const details: SkillDetail[] = await Promise.all(
          entries.map(async (entry) => {
            const latest = getLatestVersion(registry, entry.name);
            let skillMdContent: string | undefined;

            const dir = entry.global
              ? join(getGlobalSkillsPath(), entry.name)
              : join(getProjectSkillsPath(), entry.name);
            try {
              skillMdContent = await readFile(join(dir, "SKILL.md"), "utf-8");
            } catch {
              // No SKILL.md
            }

            return {
              name: entry.name,
              global: entry.global,
              project: entry.project,
              version: latest?.v,
              hash: latest?.hash,
              source: latest?.source,
              addedAt: latest?.addedAt,
              skillMdContent,
            };
          })
        );

        if (!cancelled) {
          setSkills(details);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSkills([]);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return {
    skills,
    loading,
    refresh: () => setRefreshKey((k) => k + 1),
  };
}
