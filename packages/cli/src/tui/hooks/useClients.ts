import { useState, useEffect } from "react";
import { getClientRegistry, VALID_CLIENT_IDS, getEnabledClients } from "../../core/clients.js";
import { getGlobalSkillsPath } from "../../utils/paths.js";

export interface ClientInfo {
  id: string;
  path: string;
  enabled: boolean;
  alwaysOn: boolean;
}

export function useClients(externalRefreshKey = 0) {
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const enabled = await getEnabledClients();
      const enabledSet = new Set(enabled);

      const registry = getClientRegistry();
      const list: ClientInfo[] = [
        { id: "agents", path: getGlobalSkillsPath(), enabled: true, alwaysOn: true },
        ...VALID_CLIENT_IDS.map((id) => ({
          id,
          path: registry[id].globalDir,
          enabled: enabledSet.has(id),
          alwaysOn: false,
        })),
      ];

      if (!cancelled) {
        setClients(list);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshKey, externalRefreshKey]);

  return { clients, loading, refresh: () => setRefreshKey((k) => k + 1) };
}
