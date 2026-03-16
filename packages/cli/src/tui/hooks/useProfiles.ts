import { useState, useEffect } from "react";
import { listProfiles, getActiveProfileName, readProfile } from "../../core/profile.js";
import { getProfilesPath, getActiveProfileFilePath } from "../../utils/paths.js";
import { join } from "path";

export interface ProfileSummary {
  name: string;
  active: boolean;
  skillCount: number;
  skills: { skillName: string; v: number; source: string }[];
}

export function useProfiles(externalRefreshKey = 0) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const profilesDir = getProfilesPath();
      const activeFile = getActiveProfileFilePath();
      const names = await listProfiles(profilesDir);
      const activeName = await getActiveProfileName(activeFile);

      const summaries: ProfileSummary[] = await Promise.all(
        names.map(async (name) => {
          try {
            const profile = await readProfile(join(profilesDir, `${name}.json`));
            return {
              name,
              active: name === activeName,
              skillCount: profile.skills.length,
              skills: profile.skills.map((s) => ({
                skillName: s.skillName,
                v: s.v,
                source: s.source,
              })),
            };
          } catch {
            return { name, active: name === activeName, skillCount: 0, skills: [] };
          }
        })
      );

      if (!cancelled) {
        setProfiles(summaries);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshKey, externalRefreshKey]);

  return { profiles, loading, refresh: () => setRefreshKey((k) => k + 1) };
}
