import { useState, useEffect } from "react";
import { listProfiles, getActiveProfileName, readProfile } from "../../core/profile.js";
import { readRegistry } from "../../core/registry.js";
import { getProfilesPath } from "../../utils/paths.js";
import { join } from "path";

export interface ProfileSkillVersionInfo {
  v: number;
  hash: string;
  source: string;
  addedAt: string;
}

export interface ProfileSummary {
  name: string;
  active: boolean;
  skillCount: number;
  skills: {
    skillName: string;
    v: number;
    source: string;
    hash?: string;
    allVersions: ProfileSkillVersionInfo[];
  }[];
}

export function useProfiles(externalRefreshKey = 0) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [registrySkillNames, setRegistrySkillNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const profilesDir = getProfilesPath();
      const names = await listProfiles();
      const activeName = await getActiveProfileName();

      // Load registry (needed for both version info and skill names)
      let registry: Awaited<ReturnType<typeof readRegistry>> = { skills: {} };
      try {
        registry = await readRegistry();
      } catch {
        // Registry may not exist yet
      }

      const summaries: ProfileSummary[] = await Promise.all(
        names.map(async (name) => {
          try {
            const profile = await readProfile(join(profilesDir, `${name}.json`));
            return {
              name,
              active: name === activeName,
              skillCount: profile.skills.length,
              skills: profile.skills.map((s) => {
                const regEntry = registry.skills[s.skillName];
                const currentVersion = regEntry?.versions.find((ver) => ver.v === s.v);
                const allVersions: ProfileSkillVersionInfo[] = regEntry
                  ? regEntry.versions.map((ver) => ({
                      v: ver.v,
                      hash: ver.hash,
                      source: ver.source,
                      addedAt: ver.addedAt,
                    }))
                  : [];
                return {
                  skillName: s.skillName,
                  v: s.v,
                  source: s.source,
                  hash: currentVersion?.hash,
                  allVersions,
                };
              }),
            };
          } catch {
            return { name, active: name === activeName, skillCount: 0, skills: [] };
          }
        })
      );

      const regNames = Object.keys(registry.skills).sort();

      if (!cancelled) {
        setProfiles(summaries);
        setRegistrySkillNames(regNames);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshKey, externalRefreshKey]);

  return { profiles, registrySkillNames, loading, refresh: () => setRefreshKey((k) => k + 1) };
}
