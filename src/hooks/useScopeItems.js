import { useCallback, useEffect, useRef, useState } from "react";
import {
  addItem,
  deleteAttachment,
  deleteItem,
  loadActivityLog,
  loadItems,
  updateItem,
  updateItemsStatus,
  uploadAttachment,
  watchScopeData,
} from "../lib/data";
import { getAttachmentKind } from "../lib/media";
import { MATERIAL_LABELS } from "../lib/seed";

export function useScopeItems({ workspaceId, propertyId, unitId, onMessage, onItemAdded }) {
  const [items, setItems] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!propertyId) {
      requestIdRef.current += 1;
      setItems([]);
      setActivityLog([]);
      setBusy(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const scope = { propertyId, unitId: unitId || null };
    if (!silent) setBusy(true);
    try {
      const [nextItems, nextActivity] = await Promise.all([
        loadItems(scope),
        loadActivityLog(scope),
      ]);
      if (requestId !== requestIdRef.current) return;
      setItems(nextItems);
      setActivityLog(nextActivity);
    } catch (error) {
      if (requestId === requestIdRef.current) onMessage(error.message);
    } finally {
      if (!silent && requestId === requestIdRef.current) setBusy(false);
    }
  }, [onMessage, propertyId, unitId]);

  useEffect(() => {
    refresh();
    if (!propertyId) return undefined;
    return watchScopeData(
      { propertyId, unitId: unitId || null },
      () => refresh({ silent: true }),
    );
  }, [propertyId, refresh, unitId]);

  async function addWork(draft, imageFile = null) {
    const title = draft.title.trim();
    if (!title || !workspaceId || !propertyId) return false;

    return runMutation(async () => {
      const item = await addItem({
        workspace_id: workspaceId,
        property_id: propertyId,
        unit_id: unitId || null,
        title,
        category: draft.kind === "material" ? MATERIAL_LABELS[draft.material_type] : "Task",
        note: draft.note.trim(),
        kind: draft.kind,
        material_type: draft.kind === "material" ? draft.material_type : null,
        status: "approved",
        sort_order: getNextQueueSortOrder(items, draft),
      });
      if (imageFile) {
        try {
          await uploadAttachment({
            workspaceId,
            propertyId,
            unitId: unitId || null,
            itemId: item.id,
            file: imageFile,
            kind: getAttachmentKind(imageFile, "photo"),
          });
        } catch (error) {
          await deleteItem(item.id);
          throw error;
        }
      }
      const nextItem = { ...item, attachments: [] };
      setItems((current) => [...current, nextItem]);
      onItemAdded?.(nextItem);
      onMessage(`${title} added.`);
      return nextItem;
    });
  }

  async function changeStatus(item, status) {
    const previousItems = items;
    setItems((current) => current.map((candidate) => (
      candidate.id === item.id ? { ...candidate, status } : candidate
    )));

    return runMutation(async () => {
      await updateItem(item.id, {
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      });
      onMessage(status === "done"
        ? `${item.title} marked done.`
        : `${item.title} moved to ${getStatusLabel(status)}.`);
      return true;
    }, previousItems);
  }

  async function approveAll(reviewItems) {
    const ids = reviewItems.map((item) => item.id);
    if (ids.length === 0) return false;

    const previousItems = items;
    const idSet = new Set(ids);
    setItems((current) => current.map((item) => (
      idSet.has(item.id) ? { ...item, status: "approved" } : item
    )));

    return runMutation(async () => {
      await updateItemsStatus(ids, "approved");
      onMessage(`${ids.length} review item${ids.length === 1 ? "" : "s"} approved.`);
      return true;
    }, previousItems);
  }

  async function saveItem(item, patch) {
    const nextPatch = {
      title: patch.title?.trim(),
      note: patch.note?.trim() || "",
      status: patch.status,
      material_type: item.kind === "material" ? patch.material_type : null,
      category: item.kind === "material" ? MATERIAL_LABELS[patch.material_type] : item.category || "Task",
      completed_at: patch.status === "done" ? item.completed_at || new Date().toISOString() : null,
    };
    if (!nextPatch.title) return false;

    const previousItems = items;
    setItems((current) => current.map((candidate) => (
      candidate.id === item.id ? { ...candidate, ...nextPatch } : candidate
    )));

    return runMutation(async () => {
      await updateItem(item.id, nextPatch);
      onMessage(`${nextPatch.title} updated.`);
      return true;
    }, previousItems);
  }

  async function reorderItems(orderedIds) {
    if (orderedIds.length < 2) return false;

    const orderById = new Map(orderedIds.map((itemId, index) => [itemId, index + 1]));
    const previousItems = items;
    setItems((current) => current.map((item) => (
      orderById.has(item.id) ? { ...item, sort_order: orderById.get(item.id) } : item
    )));

    return runMutation(async () => {
      await Promise.all(orderedIds.map((itemId, index) => updateItem(itemId, { sort_order: index + 1 })));
      onMessage("Task order updated.");
      return true;
    }, previousItems);
  }

  async function removeItem(item, successMessage) {
    const previousItems = items;
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));

    return runMutation(async () => {
      for (const attachment of item.attachments || []) await deleteAttachment(attachment);
      await deleteItem(item.id);
      onMessage(successMessage);
      return true;
    }, previousItems);
  }

  async function archiveItem(item) {
    if (item.status !== "done") return false;

    const archivedAt = new Date().toISOString();
    const previousItems = items;
    setItems((current) => current.map((candidate) => (
      candidate.id === item.id ? { ...candidate, archived_at: archivedAt } : candidate
    )));

    return runMutation(async () => {
      await updateItem(item.id, { archived_at: archivedAt });
      onMessage(`${item.title} archived to Work History.`);
      return true;
    }, previousItems);
  }

  async function unarchiveItem(item) {
    const previousItems = items;
    setItems((current) => current.map((candidate) => (
      candidate.id === item.id ? { ...candidate, archived_at: null } : candidate
    )));

    return runMutation(async () => {
      await updateItem(item.id, { archived_at: null });
      onMessage(`${item.title} restored to active work.`);
      return true;
    }, previousItems);
  }

  async function uploadFiles(item, fileList, fallbackKind) {
    const files = [...fileList];
    if (files.length === 0 || !workspaceId) return false;

    return runMutation(async () => {
      for (const file of files) {
        await uploadAttachment({
          workspaceId,
          propertyId: item.property_id,
          unitId: item.unit_id,
          itemId: item.id,
          file,
          kind: getAttachmentKind(file, fallbackKind),
        });
      }
      onMessage(`${files.length} attachment${files.length === 1 ? "" : "s"} added to ${item.title}.`);
      return true;
    });
  }

  async function removeAttachment(attachment) {
    const previousItems = items;
    setItems((current) => current.map((item) => ({
      ...item,
      attachments: item.attachments?.filter((candidate) => candidate.id !== attachment.id) || [],
    })));

    return runMutation(async () => {
      await deleteAttachment(attachment);
      onMessage(`${attachment.file_name} removed.`);
      return true;
    }, previousItems);
  }

  async function runMutation(operation, rollbackItems) {
    setBusy(true);
    try {
      const result = await operation();
      await refresh({ silent: true });
      return result;
    } catch (error) {
      if (rollbackItems) setItems(rollbackItems);
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
    addWork,
    changeStatus,
    approveAll,
    saveItem,
    reorderItems,
    removeItem,
    archiveItem,
    unarchiveItem,
    uploadFiles,
    removeAttachment,
  };
}

function getStatusLabel(status) {
  return status === "pending-review" ? "pending review" : status;
}

function getNextQueueSortOrder(items, draft) {
  const matchingItems = items.filter((item) => (
    !item.archived_at
    && item.kind === draft.kind
    && (item.kind !== "material" || item.material_type === draft.material_type)
  ));
  const firstSortOrder = Math.min(0, ...matchingItems.map((item) => item.sort_order || 0));
  return firstSortOrder - 1;
}
