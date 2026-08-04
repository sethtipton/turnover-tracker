import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteAttachment,
  deleteItem,
  loadPortfolioOverview,
  updateItem,
  watchPortfolioData,
} from "../lib/data";

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

  async function updatePortfolioItem(item, patch, successMessage) {
    const previousItems = items;
    setItems((current) => current.map((candidate) => (
      candidate.id === item.id ? { ...candidate, ...patch } : candidate
    )));

    setBusy(true);
    try {
      await updateItem(item.id, patch);
      onMessage(successMessage);
      await refresh({ silent: true });
      return true;
    } catch (error) {
      setItems(previousItems);
      onMessage(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removePortfolioItem(item, successMessage) {
    const previousItems = items;
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));

    setBusy(true);
    try {
      for (const attachment of item.attachments || []) await deleteAttachment(attachment);
      await deleteItem(item.id);
      onMessage(successMessage);
      await refresh({ silent: true });
      return true;
    } catch (error) {
      setItems(previousItems);
      onMessage(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    items,
    activityLog,
    busy,
    refresh,
    updatePortfolioItem,
    removePortfolioItem,
  };
}
