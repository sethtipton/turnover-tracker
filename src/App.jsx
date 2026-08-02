import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ClipboardList, Hammer, Mic, ShoppingCart } from "lucide-react";
import "./App.css";
import { ActivityLog } from "./components/ActivityLog";
import { AppHeader } from "./components/AppHeader";
import { ItemColumn } from "./components/ItemColumn";
import { AccessGate, LandingPage } from "./components/LandingPage";
import { PortfolioHome } from "./components/PortfolioHome";
import { ReviewQueue } from "./components/ReviewQueue";
import {
  DictationInbox,
  FiltersBar,
  QuickAddPanel,
  ScopeSelector,
  StatusMessage,
  SummaryGrid,
} from "./components/WorkspacePanels";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { usePortfolioOverview } from "./hooks/usePortfolioOverview";
import { useScopeItems } from "./hooks/useScopeItems";
import { draftTasksFromDictation } from "./lib/ai";
import {
  addItem,
  getAttachmentUrl,
  getSession,
  loadProperties,
  loadUnits,
  loadWorkspace,
  signInWithGoogle,
  signOut,
  uploadAttachment,
  watchAuth,
} from "./lib/data";
import { getScopeFromCurrentPath, updateScopePath } from "./lib/routing";
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
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
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
  } = useAudioRecorder({
    propertyId: selectedPropertyId,
    unitId: selectedUnitId,
    onMessage: setMessage,
  });

  const {
    items,
    activityLog,
    busy: itemsBusy,
    refresh: refreshScopeData,
    addWork,
    changeStatus,
    approveAll,
    saveItem,
    removeItem,
    uploadFiles,
    removeAttachment,
  } = useScopeItems({
    workspaceId: workspace?.id,
    propertyId: selectedPropertyId,
    unitId: selectedUnitId,
    onMessage: setMessage,
  });

  const {
    items: portfolioItems,
    activityLog: portfolioActivity,
    busy: portfolioBusy,
  } = usePortfolioOverview({
    workspaceId: workspace?.id,
    enabled: Boolean(workspace?.id && !selectedPropertyId),
    onMessage: setMessage,
  });

  const busy = itemsBusy || dictationBusy;
  const userEmail = session?.user?.email?.toLowerCase();
  const userDisplayName = getUserDisplayName(session?.user);
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId) || null;
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) || null;
  const selectedScopeTitle = selectedProperty
    ? `${selectedProperty.name} / ${selectedUnit?.name || "Whole Property"}`
    : "";
  const selectedScopeRecordings = recordings.filter((recording) => (
    recording.propertyId === selectedPropertyId
    && (recording.unitId || "") === selectedUnitId
  ));

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
        const [propertyData, unitData] = await Promise.all([
          loadProperties(workspaceData.id),
          loadUnits(workspaceData.id),
        ]);
        const routeScope = getScopeFromCurrentPath(propertyData, unitData);
        setWorkspace(workspaceData);
        setProperties(propertyData);
        setUnits(unitData);
        setSelectedPropertyId(routeScope.propertyId);
        setSelectedUnitId(routeScope.unitId);

        if (routeScope.propertyId) {
          updateScopePath(
            propertyData.find((property) => property.id === routeScope.propertyId),
            unitData.find((unit) => unit.id === routeScope.unitId),
            { replace: true },
          );
        }
      } catch (error) {
        setAccessError(error.message);
      }
    }

    loadInitialData();
  }, [session]);

  useEffect(() => {
    function handlePopState() {
      const routeScope = getScopeFromCurrentPath(properties, units);
      setSelectedPropertyId(routeScope.propertyId);
      setSelectedUnitId(routeScope.unitId);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [properties, units]);

  useEffect(() => {
    document.title = selectedScopeTitle ? `${selectedScopeTitle} | Turnover Tracker` : "Turnover Tracker";
  }, [selectedScopeTitle]);

  useEffect(() => {
    setMediaUrls({});
    if (!selectedPropertyId) setWorkMode(false);
  }, [selectedPropertyId, selectedUnitId]);

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

  function handlePropertyChange(propertyId) {
    handleOpenScope(propertyId, "");
  }

  function handleUnitChange(unitId) {
    handleOpenScope(selectedPropertyId, unitId);
  }

  function handleOpenScope(propertyId, unitId = "") {
    const property = properties.find((candidate) => candidate.id === propertyId) || null;
    const unit = units.find((candidate) => (
      candidate.id === unitId && candidate.property_id === propertyId
    )) || null;
    function updateScope() {
      flushSync(() => {
        setSelectedPropertyId(property?.id || "");
        setSelectedUnitId(unit?.id || "");
      });
      window.scrollTo(0, 0);
      updateScopePath(property, unit);
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduceMotion) {
      updateScope();
      requestAnimationFrame(focusAppTitle);
      return;
    }

    const transition = document.startViewTransition(updateScope);
    transition.finished.finally(focusAppTitle);
  }

  function focusAppTitle() {
    document.querySelector("#app-title")?.focus({ preventScroll: true });
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
    const recordingProperty = properties.find((property) => property.id === recording.propertyId);
    const recordingUnit = recording.unitId
      ? units.find((unit) => unit.id === recording.unitId && unit.property_id === recording.propertyId)
      : null;
    if (!recordingProperty || (recording.unitId && !recordingUnit)) {
      setMessage("The property scope for this recording is no longer available.");
      return;
    }

    setDictationBusy(true);
    try {
      const dictationItem = await addItem({
        workspace_id: workspace.id,
        property_id: recording.propertyId,
        unit_id: recording.unitId || null,
        title: "Dictated property update",
        category: "Dictation",
        note: "Raw recording saved. AI extraction queued.",
        kind: "dictation",
        status: "pending-review",
        sort_order: items.length + 1,
      });
      const attachment = await uploadAttachment({
        workspaceId: workspace.id,
        propertyId: recording.propertyId,
        unitId: recording.unitId,
        itemId: dictationItem.id,
        file: recording.file,
        kind: "audio",
      });
      try {
        setMessage("Recording saved. Drafting pending tasks...");
        const draftResult = await draftTasksFromDictation({
          propertyId: recording.propertyId,
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
      if (
        recording.propertyId === selectedPropertyId
        && (recording.unitId || "") === selectedUnitId
      ) {
        await refreshScopeData({ silent: true });
      }
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
            property={selectedProperty}
            scopeTitle={selectedScopeTitle}
            hasSelectedProperty={Boolean(selectedProperty)}
            workMode={workMode}
            onToggleWorkMode={() => setWorkMode((current) => !current)}
            dictationState={dictationState}
            audioLevel={audioLevel}
            onStartDictation={startDictation}
            onStopDictation={stopDictation}
            onSignOut={signOut}
            scopeSelector={!workMode && selectedProperty ? (
              <ScopeSelector
                properties={properties}
                units={units}
                selectedPropertyId={selectedPropertyId}
                selectedUnitId={selectedUnitId}
                onPropertyChange={handlePropertyChange}
                onUnitChange={handleUnitChange}
              />
            ) : null}
          />
        </div>

        {selectedProperty ? (
          <SummaryGrid items={items} />
        ) : (
          <>
            <PortfolioHome
              displayName={userDisplayName}
              properties={properties}
              units={units}
              items={portfolioItems}
              activityLog={portfolioActivity}
              busy={!workspace || portfolioBusy}
              onOpenScope={handleOpenScope}
            />
            <StatusMessage message={message} />
          </>
        )}

        {!workMode && selectedProperty && (
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
              recordings={selectedScopeRecordings}
              scopeName={selectedScopeTitle}
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

        {selectedProperty && (
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

function getUserDisplayName(user) {
  const profileName = user?.user_metadata?.full_name || user?.user_metadata?.name;
  if (profileName?.trim()) return profileName.trim();

  const emailUsername = user?.email?.split("@")[0]?.trim();
  return emailUsername || "Signed-in user";
}

export default App;
