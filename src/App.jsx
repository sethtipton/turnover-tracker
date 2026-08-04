import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ClipboardList, Hammer, Mic, ShoppingCart } from "lucide-react";
import "./App.css";
import { ActivityLog } from "./components/ActivityLog";
import { AppFooter } from "./components/AppFooter";
import { AppHeader } from "./components/AppHeader";
import { ItemColumn } from "./components/ItemColumn";
import { AccessGate, LandingPage } from "./components/LandingPage";
import { PeopleAccess } from "./components/PeopleAccess";
import { PortfolioHome } from "./components/PortfolioHome";
import { ListingViewSwitch, ListingWorkspace, PublicSite } from "./components/PublicListings";
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
  loadPropertyMembers,
  loadPropertyVisibilityPreferences,
  loadPublicListings,
  loadProperties,
  loadUnits,
  loadWorkspace,
  loadWorkspaceMembers,
  setPropertyMemberAccess,
  setPropertyVisibilityPreference,
  signInWithGoogle,
  signOut,
  updateProperty,
  updateUnit,
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
  const [session, setSession] = useState(undefined);
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
  const [peopleAccessOpen, setPeopleAccessOpen] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [propertyMembers, setPropertyMembers] = useState([]);
  const [propertyVisibility, setPropertyVisibility] = useState([]);
  const [accessBusy, setAccessBusy] = useState(false);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [dictationBusy, setDictationBusy] = useState(false);
  const [listingView, setListingView] = useState("tasks");
  const [listingBusy, setListingBusy] = useState(false);
  const [publicListings, setPublicListings] = useState([]);
  const [publicListingsBusy, setPublicListingsBusy] = useState(false);
  const [publicListingsError, setPublicListingsError] = useState("");

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
    archiveItem,
    unarchiveItem,
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
    updatePortfolioItem,
    removePortfolioItem,
  } = usePortfolioOverview({
    workspaceId: workspace?.id,
    enabled: Boolean(workspace?.id && !selectedPropertyId),
    onMessage: setMessage,
  });

  const busy = itemsBusy || dictationBusy || listingBusy;
  const userEmail = session?.user?.email?.toLowerCase();
  const userDisplayName = getUserDisplayName(session?.user);
  const isWorkspaceOwner = workspaceMembers.some((member) => (
    member.email === userEmail && member.role === "owner"
  ));
  const ownerAccessPropertyIds = new Set(
    isWorkspaceOwner
      ? properties
        .filter((property) => !propertyMembers.some((member) => (
          member.property_id === property.id && member.email === userEmail
        )))
        .map((property) => property.id)
      : [],
  );
  const hiddenPropertyIds = useMemo(
    () => new Set(propertyVisibility
      .filter((preference) => !preference.is_visible_on_home)
      .map((preference) => preference.property_id)),
    [propertyVisibility],
  );
  const visibleProperties = useMemo(
    () => properties.filter((property) => !hiddenPropertyIds.has(property.id)),
    [hiddenPropertyIds, properties],
  );
  const selectorProperties = useMemo(
    () => properties.filter((property) => (
      !hiddenPropertyIds.has(property.id) || property.id === selectedPropertyId
    )),
    [hiddenPropertyIds, properties, selectedPropertyId],
  );
  const visiblePropertyIds = useMemo(
    () => new Set(visibleProperties.map((property) => property.id)),
    [visibleProperties],
  );
  const visiblePortfolioItems = useMemo(
    () => portfolioItems.filter((item) => visiblePropertyIds.has(item.property_id)),
    [portfolioItems, visiblePropertyIds],
  );
  const visiblePortfolioActivity = useMemo(
    () => portfolioActivity.filter((entry) => visiblePropertyIds.has(entry.property_id)),
    [portfolioActivity, visiblePropertyIds],
  );
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
    if (!isSupabaseConfigured || session !== null) return undefined;

    let isMounted = true;
    setPublicListingsBusy(true);
    setPublicListingsError("");
    loadPublicListings()
      .then((data) => {
        if (isMounted) setPublicListings(data);
      })
      .catch((error) => {
        if (isMounted) setPublicListingsError(error.message);
      })
      .finally(() => {
        if (isMounted) setPublicListingsBusy(false);
      });

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;

    async function loadInitialData() {
      setAccessError("");
      try {
        const workspaceData = await loadWorkspace();
        const [propertyData, unitData, memberData, visibilityData] = await Promise.all([
          loadProperties(workspaceData.id),
          loadUnits(workspaceData.id),
          loadWorkspaceMembers(workspaceData.id),
          loadPropertyVisibilityPreferences(workspaceData.id, session.user.id),
        ]);
        const isOwner = memberData.some((member) => (
          member.email === session.user.email?.toLowerCase() && member.role === "owner"
        ));
        const propertyMemberData = isOwner
          ? await loadPropertyMembers(workspaceData.id)
          : [];
        const routeScope = getScopeFromCurrentPath(propertyData, unitData);
        setWorkspace(workspaceData);
        setProperties(propertyData);
        setUnits(unitData);
        setWorkspaceMembers(memberData);
        setPropertyMembers(propertyMemberData);
        setPropertyVisibility(visibilityData);
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
    setListingView("tasks");
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
      if (item.archived_at) return false;
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

  const activeScopeItems = items.filter((item) => !item.archived_at);
  const archivedItems = items.filter((item) => item.archived_at);
  const reviewItems = activeScopeItems.filter((item) => item.status === "pending-review" && item.kind !== "dictation");
  const activeItems = filteredItems.filter((item) => item.status !== "pending-review");
  const taskItems = workMode
    ? activeScopeItems.filter((item) => item.status === "approved" && item.kind === "task")
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

  function handleTogglePeopleAccess() {
    setPeopleAccessOpen((current) => !current);
    setWorkMode(false);
  }

  async function handleSavePropertyAccess(email, propertyIds) {
    if (!workspace) return;

    setAccessBusy(true);
    try {
      await setPropertyMemberAccess({
        workspaceId: workspace.id,
        email,
        propertyIds,
      });
      setPropertyMembers(await loadPropertyMembers(workspace.id));
      setMessage(`Access for ${email} updated.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAccessBusy(false);
    }
  }

  async function handleSetPropertyVisibility(propertyId, isVisibleOnHome) {
    if (!workspace || !session?.user) return;

    setVisibilityBusy(true);
    try {
      await setPropertyVisibilityPreference({
        workspaceId: workspace.id,
        userId: session.user.id,
        propertyId,
        isVisibleOnHome,
      });
      setPropertyVisibility((current) => [
        ...current.filter((preference) => preference.property_id !== propertyId),
        { property_id: propertyId, is_visible_on_home: isVisibleOnHome },
      ]);
      const propertyName = properties.find((property) => property.id === propertyId)?.name || "Property";
      setMessage(`${propertyName} ${isVisibleOnHome ? "shown on" : "hidden from"} your homepage.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setVisibilityBusy(false);
    }
  }

  async function handleSaveListingProperty(patch) {
    if (!selectedProperty) return;
    setListingBusy(true);
    try {
      const updated = await updateProperty(selectedProperty.id, patch);
      setProperties((current) => current.map((property) => (
        property.id === updated.id ? updated : property
      )));
      setMessage("Property listing details saved.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setListingBusy(false);
    }
  }

  async function handleSaveListingUnit(unitId, patch) {
    setListingBusy(true);
    try {
      const updated = await updateUnit(unitId, patch);
      setUnits((current) => current.map((unit) => (
        unit.id === updated.id ? updated : unit
      )));
      setMessage(updated.listing_published && ["available", "coming-soon"].includes(updated.listing_status)
        ? "Listing saved and live on Tree City Rentals."
        : "Listing saved. It is not currently public.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setListingBusy(false);
    }
  }

  function handleListingViewChange(nextView) {
    setListingView(nextView);
    if (nextView !== "tasks") setWorkMode(false);
  }

  async function handleAddItem(event) {
    event.preventDefault();
    if (await addWork(draft)) setDraft(emptyDraft);
  }

  async function handleDeleteItem(item) {
    if (!window.confirm(`Delete "${item.title}" and its attachments?`)) return;
    await removeItem(item, `${item.title} deleted.`);
  }

  async function handlePortfolioItemChange(item, patch) {
    const nextTitle = patch.title?.trim() || item.title;
    const nextStatus = patch.status || item.status;
    const completedAt = nextStatus === "done"
      ? item.completed_at || new Date().toISOString()
      : null;
    const successMessage = nextStatus === "approved" && item.status === "pending-review"
      ? `${nextTitle} approved.`
      : nextStatus === "done"
        ? `${nextTitle} marked done.`
        : `${nextTitle} updated.`;

    return updatePortfolioItem(item, {
      ...patch,
      title: nextTitle,
      completed_at: completedAt,
    }, successMessage);
  }

  async function handleDeletePortfolioItem(item) {
    if (!window.confirm(`Delete "${item.title}" and its attachments?`)) return false;
    return removePortfolioItem(item, `${item.title} deleted.`);
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

  function renderWorkGrid(compact) {
    return (
      <div className="work-grid">
        {!compact && (
          <div className="materials-row">
            <ItemColumn title="Shopping List" icon={<ShoppingCart size={18} aria-hidden="true" />} items={shoppingItems} onItemChange={saveItem} onStatus={changeStatus} onDelete={handleDeleteItem} onUpload={uploadFiles} onDeleteAttachment={handleDeleteAttachment} onArchive={archiveItem} mediaUrls={mediaUrls} />
            <ItemColumn title="Collect / Bring" icon={<Hammer size={18} aria-hidden="true" />} items={collectItems} onItemChange={saveItem} onStatus={changeStatus} onDelete={handleDeleteItem} onUpload={uploadFiles} onDeleteAttachment={handleDeleteAttachment} onArchive={archiveItem} mediaUrls={mediaUrls} />
          </div>
        )}
        <ItemColumn title="Tasks" icon={<ClipboardList size={18} aria-hidden="true" />} items={taskItems} onItemChange={saveItem} onStatus={changeStatus} onDelete={handleDeleteItem} onUpload={uploadFiles} onDeleteAttachment={handleDeleteAttachment} onArchive={archiveItem} mediaUrls={mediaUrls} forceOpen={compact} compact={compact} />
        {!compact && (
          <>
            <ItemColumn title="Recordings" icon={<Mic size={18} aria-hidden="true" />} items={recordingItems} onItemChange={saveItem} onStatus={changeStatus} onDelete={handleDeleteItem} onUpload={uploadFiles} onDeleteAttachment={handleDeleteAttachment} onArchive={archiveItem} mediaUrls={mediaUrls} />
            <ActivityLog entries={activityLog} archivedItems={archivedItems} busy={busy} onUnarchive={unarchiveItem} />
          </>
        )}
      </div>
    );
  }

  if (!isSupabaseConfigured) return <LandingPage onSignIn={signInWithGoogle} setupMissing />;
  if (session === undefined) return <PublicSite listings={[]} busy error="" onSignIn={signInWithGoogle} />;
  if (!session) return <PublicSite listings={publicListings} busy={publicListingsBusy} error={publicListingsError} onSignIn={signInWithGoogle} />;
  if (accessError) return <AccessGate email={userEmail} onSignOut={signOut} message={accessError} />;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <main className={`app-shell ${workMode ? "work-mode" : ""}`} id="main-content" tabIndex="-1">
        <div className="workspace-top">
          <AppHeader
            property={peopleAccessOpen ? null : selectedProperty}
            scopeTitle={peopleAccessOpen ? "People & Access" : selectedScopeTitle}
            hasSelectedProperty={Boolean(selectedProperty) && !peopleAccessOpen}
            isWorkspaceOwner={isWorkspaceOwner}
            peopleAccessOpen={peopleAccessOpen}
            onTogglePeopleAccess={handleTogglePeopleAccess}
            scopeSelector={!peopleAccessOpen && !workMode && selectedProperty ? (
              <ScopeSelector
                properties={selectorProperties}
                units={units}
                selectedPropertyId={selectedPropertyId}
                selectedUnitId={selectedUnitId}
                onPropertyChange={handlePropertyChange}
                onUnitChange={handleUnitChange}
              />
            ) : null}
          />
        </div>

        {peopleAccessOpen ? (
          <>
            <PeopleAccess
              members={workspaceMembers}
              properties={properties}
              propertyMembers={propertyMembers}
              busy={accessBusy}
              currentUserEmail={userEmail}
              visiblePropertyIds={visiblePropertyIds}
              visibilityBusy={visibilityBusy}
              onClose={() => setPeopleAccessOpen(false)}
              onSave={handleSavePropertyAccess}
              onSetPropertyVisibility={handleSetPropertyVisibility}
            />
            <StatusMessage message={message} />
          </>
        ) : (
          <>
            {selectedProperty && !workMode && (
              <ListingViewSwitch view={listingView} onViewChange={handleListingViewChange} />
            )}

            {selectedProperty && workMode ? (
              <SummaryGrid
                items={activeScopeItems}
                workMode={workMode}
                onToggleWorkMode={() => {
                  setWorkMode((current) => !current);
                  setListingView("tasks");
                }}
                dictationState={dictationState}
                audioLevel={audioLevel}
                onStartDictation={startDictation}
                onStopDictation={stopDictation}
              />
            ) : !selectedProperty ? (
              <>
                <PortfolioHome
                  displayName={userDisplayName}
                  properties={visibleProperties}
                  units={units}
                  items={visiblePortfolioItems}
                  activityLog={visiblePortfolioActivity}
                  busy={!workspace || portfolioBusy}
                  ownerAccessPropertyIds={ownerAccessPropertyIds}
                  onOpenScope={handleOpenScope}
                  onItemChange={handlePortfolioItemChange}
                  onDeleteItem={handleDeletePortfolioItem}
                />
                <StatusMessage message={message} />
              </>
            ) : null}

            {selectedProperty && listingView !== "tasks" && !workMode && (
              <>
                <ListingWorkspace
                  property={selectedProperty}
                  units={units}
                  selectedUnit={selectedUnit}
                  view={listingView}
                  busy={listingBusy}
                  onSaveProperty={handleSaveListingProperty}
                  onSaveUnit={handleSaveListingUnit}
                />
                <StatusMessage message={message} />
              </>
            )}

            {!workMode && selectedProperty && listingView === "tasks" && (
              <section className="listing-workspace task-workspace" aria-label="Tasks workspace">
                <SummaryGrid
                  items={activeScopeItems}
                  workMode={workMode}
                  onToggleWorkMode={() => {
                    setWorkMode((current) => !current);
                    setListingView("tasks");
                  }}
                  dictationState={dictationState}
                  audioLevel={audioLevel}
                  onStartDictation={startDictation}
                  onStopDictation={stopDictation}
                />
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
                {renderWorkGrid(false)}
              </section>
            )}

            {selectedProperty && workMode && renderWorkGrid(true)}
          </>
        )}
      </main>
      <AppFooter authenticated onAuthAction={signOut} />
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
