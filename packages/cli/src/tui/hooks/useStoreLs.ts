import { useState, useEffect } from "react";
import { storeLs, type StoreLsResult } from "../../commands/store-cmd.js";

export function useStoreLs(externalRefreshKey = 0) {
  const [result, setResult] = useState<StoreLsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const r = await storeLs();
      if (!cancelled) {
        setResult(r);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshKey, externalRefreshKey]);

  return { result, loading, refresh: () => setRefreshKey((k) => k + 1) };
}
