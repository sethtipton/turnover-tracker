import { useCallback, useEffect, useRef, useState } from "react";
import { loadPortfolioOverview, watchPortfolioData } from "../lib/data";

export function usePortfolioOverview({ workspaceId, enabled, onMessage }) {
  const [items, setItems] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!workspaceId || !enabled) {
      requestIdRef.current += 1;
      setItems([]);
      setActivityLog([]);
      setBusy(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    if (!silent) setBusy(true);
    try {
      const overview = await loadPortfolioOverview(workspaceId);
      if (requestId !== requestIdRef.current) return;
      setItems(overview.items);
      setActivityLog(overview.activityLog);
    } catch (error) {
      if (requestId === requestIdRef.current) onMessage(error.message);
    } finally {
      if (!silent && requestId === requestIdRef.current) setBusy(false);
    }
  }, [enabled, onMessage, workspaceId]);

  useEffect(() => {
    refresh();
    if (!enabled || !workspaceId) return undefined;

    let refreshTimer;
    const stopWatching = watchPortfolioData(workspaceId, () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => refresh({ silent: true }), 150);
    });

    return () => {
      window.clearTimeout(refreshTimer);
      stopWatching();
    };
  }, [enabled, refresh, workspaceId]);

  return { items, activityLog, busy, refresh };
}
