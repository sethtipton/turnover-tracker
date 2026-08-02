import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Hammer, Mic, ShoppingCart } from "lucide-react";
import "./App.css";
import { ActivityLog } from "./components/ActivityLog";
import { AppHeader } from "./components/AppHeader";
import { ItemColumn } from "./components/ItemColumn";
import { AccessGate, LandingPage } from "./components/LandingPage";
import { ReviewQueue } from "./components/ReviewQueue";
import {
  DictationInbox,
  EmptyUnitPanel,
  FiltersBar,
  QuickAddPanel,
  StatusMessage,
  SummaryGrid,
  UnitSelector,
} from "./components/WorkspacePanels";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { useUnitItems } from "./hooks/useUnitItems";
import { draftTasksFromDictation } from "./lib/ai";
import {
  addItem,
  getAttachmentUrl,
  getSession,
  loadUnits,
  loadWorkspace,
  signInWithGoogle,
  signOut,
  uploadAttachment,
  watchAuth,
} from "./lib/data";
import { getUnitIdFromCurrentPath, updateUnitPath } from "./lib/routing";
import { isSupabaseConfigured } from "./lib/supabase";

const emptyDraft = {
  title: "",
  note: "",
  kind: "task",
  material_type: "shopping",
};

function App() {
  const [session, setSession] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [accessError, setAccessError] = useState("");
  const [mediaUrls, setMediaUrls] = useState({});
  const [workMode, setWorkMode] = useState(false);
  const [dictationBusy, setDictationBusy] = useState(false);

  const {
    state: dictationState,
    level: audioLevel,
    recordings,
    start: startDictation,
    stop: stopDictation,
    removeRecording,
  } = useAudioRecorder({ unitId: selectedUnitId, onMessage: setMessage });

  const {
    items,
    activityLog,
    busy: itemsBusy,
    refresh: refreshUnitData,
    addWork,
    changeStatus,
    approveAll,
    saveItem,
    removeItem,
    uploadFiles,
    removeAttachment,
  } = useUnitItems({
    workspaceId: workspace?.id,
    unitId: selectedUnitId,
    onMessage: setMessage,
  });

  const busy = itemsBusy || dictationBusy;
  const userEmail = session?.user?.email?.toLowerCase();
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) || null;
  const selectedUnitRecordings = recordings.filter((recording) => recording.unitId === selectedUnitId);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getSession().then(setSession).catch((error) => setMessage(error.message));
    return watchAuth(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;

    async function loadInitialData() {
      setAccessError("");
      try {
        const workspaceData = await loadWorkspace();
        const unitData = await loadUnits(workspaceData.id);
        setWorkspace(workspaceData);
        setUnits(unitData);
        setSelectedUnitId(getUnitIdFromCurrentPath(unitData));
      } catch (error) {
        setAccessError(error.message);
      }
    }

    loadInitialData();
  }, [session]);

  useEffect(() => {
    function handlePopState() {
      setSelectedUnitId(getUnitIdFromCurrentPath(units));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [units]);

  useEffect(() => {
    document.title = selectedUnit ? `${selectedUnit.name} | Turnover Tracker` : "Turnover Tracker";
  }, [selectedUnit]);

  useEffect(() => {
    setMediaUrls({});
    if (!selectedUnitId) setWorkMode(false);
  }, [selectedUnitId]);

  useEffect(() => {
    const attachments = items.flatMap((item) => item.attachments || []);
    const missing = attachments.filter((attachment) => !mediaUrls[attachment.storage_path]);
    if (missing.length === 0 || !isSupabaseConfigured) return;

    let isMounted = true;
    Promise.all(
      missing.map(async (attachment) => [attachment.storage_path, await getAttachmentUrl(attachment.storage_path)]),
    )
      .then((urls) => {
        if (isMounted) setMediaUrls((current) => ({ ...current, ...Object.fromEntries(urls) }));
      })
      .catch((error) => setMessage(error.message));

    return () => {
      isMounted = false;
    };
  }, [items, mediaUrls]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        !normalizedQuery ||
        [item.title, item.note, item.category, item.kind, item.material_type]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [items, query, statusFilter]);

  const reviewItems = items.filter((item) => item.status === "pending-review" && item.kind !== "dictation");
  const activeItems = filteredItems.filter((item) => item.status !== "pending-review");
  const taskItems = workMode
    ? items.filter((item) => item.status === "approved" && item.kind === "task")
    : activeItems.filter((item) => item.kind === "task");
  const shoppingItems = activeItems.filter((item) => item.kind === "material" && item.material_type === "shopping");
  const collectItems = activeItems.filter((item) => item.kind === "material" && item.material_type === "collect");
  const recordingItems = activeItems.filter((item) => item.kind === "dictation");

  function handleUnitChange(unitId) {
    setSelectedUnitId(unitId);
    updateUnitPath(units.find((unit) => unit.id === unitId));
  }

  async function handleAddItem(event) {
    event.preventDefault();
    if (await addWork(draft)) setDraft(emptyDraft);
  }

  async function handleDeleteItem(item) {
    if (!window.confirm(`Delete "${item.title}" and its attachments?`)) return;
    await removeItem(item, `${item.title} deleted.`);
  }

  async function handleRejectItem(item) {
    if (!window.confirm(`Reject and permanently delete "${item.title}"?`)) return;
    await removeItem(item, `${item.title} rejected.`);
  }

  async function handleDeleteAttachment(attachment) {
    if (!window.confirm(`Remove attachment "${attachment.file_name}"?`)) return;
    await removeAttachment(attachment);
  }

  async function saveRecording(recording) {
    if (!workspace) return;
    const recordingUnit = units.find((unit) => unit.id === recording.unitId);
    if (!recordingUnit) {
      setMessage("The property for this recording is no longer available.");
      return;
    }

    setDictationBusy(true);
    try {
      const dictationItem = await addItem({
        workspace_id: workspace.id,
        unit_id: recording.unitId,
        title: "Dictated property update",
        category: "Dictation",
        note: "Raw recording saved. AI extraction queued.",
        kind: "dictation",
        status: "pending-review",
        sort_order: items.length + 1,
      });
      const attachment = await uploadAttachment({
        workspaceId: workspace.id,
        unitId: recording.unitId,
        itemId: dictationItem.id,
        file: recording.file,
        kind: "audio",
      });
      try {
        setMessage("Recording saved. Drafting pending tasks...");
        const draftResult = await draftTasksFromDictation({
          unitId: recording.unitId,
          dictationItemId: dictationItem.id,
          attachmentId: attachment.id,
        });
        const draftCount = draftResult?.items?.length || 0;
        setMessage(draftCount > 0
          ? `Created ${draftCount} pending review item${draftCount === 1 ? "" : "s"}.`
          : "Recording saved, but no draft items were found.");
      } catch (aiError) {
        setMessage(`Recording saved, but AI drafting could not run: ${aiError.message}`);
      }
      removeRecording(recording.id);
      if (recording.unitId === selectedUnitId) await refreshUnitData({ silent: true });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setDictationBusy(false);
    }
  }

  if (!isSupabaseConfigured) return <LandingPage onSignIn={signInWithGoogle} setupMissing />;
  if (!session) return <LandingPage onSignIn={signInWithGoogle} />;
  if (accessError) return <AccessGate email={userEmail} onSignOut={signOut} message={accessError} />;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <main className={`app-shell ${workMode ? "work-mode" : ""}`} id="main-content" tabIndex="-1">
        <div className="workspace-top">
          <AppHeader
            selectedUnit={selectedUnit}
            workMode={workMode}
            onToggleWorkMode={() => setWorkMode((current) => !current)}
            dictationState={dictationState}
            audioLevel={audioLevel}
            onStartDictation={startDictation}
            onStopDictation={stopDictation}
            onSignOut={signOut}
          />
          {!workMode && (
            <UnitSelector units={units} selectedUnitId={selectedUnitId} onChange={handleUnitChange} />
          )}
        </div>

        {selectedUnit ? <SummaryGrid items={items} /> : <EmptyUnitPanel />}

        {!workMode && selectedUnit && (
          <>
            <ReviewQueue
              items={reviewItems}
              busy={busy}
              onApprove={(item) => changeStatus(item, "approved")}
              onApproveAll={() => approveAll(reviewItems)}
              onItemChange={saveItem}
              onReject={handleRejectItem}
              onDeleteAttachment={handleDeleteAttachment}
              mediaUrls={mediaUrls}
            />
            <FiltersBar
              query={query}
              statusFilter={statusFilter}
              onQueryChange={setQuery}
              onStatusChange={setStatusFilter}
            />
            <DictationInbox
              recordings={selectedUnitRecordings}
              unitName={selectedUnit.name}
              onSave={saveRecording}
              onDelete={removeRecording}
            />
            <QuickAddPanel
              draft={draft}
              busy={busy}
              onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              onSubmit={handleAddItem}
            />
            <StatusMessage message={message} />
          </>
        )}

        {selectedUnit && (
          <div className="work-grid">
            {!workMode && (
              <div className="materials-row">
                <ItemColumn title="Shopping List" icon={<ShoppingCart size={18} aria-hidden="true" />} items={shoppingItems} onItemChange={saveItem} onStatus={changeStatus} onDelete={handleDeleteItem} onUpload={uploadFiles} onDeleteAttachment={handleDeleteAttachment} mediaUrls={mediaUrls} />
                <ItemColumn title="Collect / Bring" icon={<Hammer size={18} aria-hidden="true" />} items={collectItems} onItemChange={saveItem} onStatus={changeStatus} onDelete={handleDeleteItem} onUpload={uploadFiles} onDeleteAttachment={handleDeleteAttachment} mediaUrls={mediaUrls} />
              </div>
            )}
            <ItemColumn title="Tasks" icon={<ClipboardList size={18} aria-hidden="true" />} items={taskItems} onItemChange={saveItem} onStatus={changeStatus} onDelete={handleDeleteItem} onUpload={uploadFiles} onDeleteAttachment={handleDeleteAttachment} mediaUrls={mediaUrls} forceOpen={workMode} compact={workMode} />
            {!workMode && (
              <>
                <ItemColumn title="Recordings" icon={<Mic size={18} aria-hidden="true" />} items={recordingItems} onItemChange={saveItem} onStatus={changeStatus} onDelete={handleDeleteItem} onUpload={uploadFiles} onDeleteAttachment={handleDeleteAttachment} mediaUrls={mediaUrls} />
                <ActivityLog entries={activityLog} />
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}

export default App;
