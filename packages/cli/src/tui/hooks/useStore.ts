import { useState, useEffect } from "react";
import { storeVerify, type VerifyResult } from "../../commands/store-cmd.js";

export function useStore() {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const r = await storeVerify();
      if (!cancelled) {
        setResult(r);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return { result, loading, refresh: () => setRefreshKey((k) => k + 1) };
}
