import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ClipboardList, Hammer, Mic, ShoppingCart } from "lucide-react";
import "./App.css";
import { ActivityLog } from "./components/ActivityLog";
import { AppFooter } from "./components/AppFooter";
import { AppHeader } from "./components/AppHeader";
import { ItemColumn } from "./components/ItemColumn";
import { AccessGate, LandingPage } from "./components/LandingPage";
import { MaintenanceQrRoute } from "./components/MaintenanceQrRoute";
import { MaintenanceWorkspace } from "./components/MaintenanceWorkspace";
import { PeopleAccess } from "./components/PeopleAccess";
import { PortfolioHome } from "./components/PortfolioHome";
import { ListingViewSwitch, ListingWorkspace, PublicSite } from "./components/PublicListings";
import { ReviewQueue } from "./components/ReviewQueue";
import { TenantMaintenanceAccess, TenantMaintenanceApp } from "./components/TenantMaintenanceApp";
import {
  DictationInbox,
  QuickAddPanel,
  ScopeSelector,
  StatusMessage,
  SummaryGrid,
} from "./components/WorkspacePanels";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { usePortfolioOverview } from "./hooks/usePortfolioOverview";
import { useScopeItems } from "./hooks/useScopeItems";
import { draftListingField } from "./lib/ai";
import { loadTenantUnits, submitMaintenanceRequest } from "./lib/maintenance";
import {
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
  watchAuth,
} from "./lib/data";
import {
  getMaintenanceQrTokenFromCurrentPath,
  getScopeFromCurrentPath,
  isMaintenanceQrRoute,
  isMaintenanceRoute,
  restoreAuthReturnPath,
  updateMaintenancePath,
  updateScopePath,
} from "./lib/routing";
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
  const [workspaceUserId, setWorkspaceUserId] = useState("");
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const openRequests = { tasks: 0, shopping: 0, collect: 0, review: 0 };
  const [addWorkOpen, setAddWorkOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [accessError, setAccessError] = useState("");
  const [mediaUrls, setMediaUrls] = useState({});
  const unavailableMediaPathsRef = useRef(new Set());
  const pendingMediaPathsRef = useRef(new Set());
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
  const [publicListingsBusy, setPublicListingsBusy] = useState(true);
  const [publicListingsError, setPublicListingsError] = useState("");
  const [tenantUnits, setTenantUnits] = useState([]);
  const [tenantUserId, setTenantUserId] = useState("");
  const [maintenanceOpen, setMaintenanceOpen] = useState(() => isMaintenanceRoute());
  const [maintenancePreview, setMaintenancePreview] = useState(null);

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
    reorderItems,
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
  const sessionUserId = session?.user?.id || "";
  const workspaceReady = Boolean(sessionUserId && workspaceUserId === sessionUserId);
  const tenantReady = Boolean(sessionUserId && tenantUserId === sessionUserId && tenantUnits.length > 0);
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
    if (!isSupabaseConfigured || session === undefined) return undefined;

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
    if (!sessionUserId || !restoreAuthReturnPath()) return;
    setMaintenanceOpen(isMaintenanceRoute());
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionUserId) {
      setWorkspace(null);
      setWorkspaceUserId("");
      setProperties([]);
      setUnits([]);
      setSelectedPropertyId("");
      setSelectedUnitId("");
      setTenantUnits([]);
      setTenantUserId("");
      setMaintenanceOpen(false);
      return undefined;
    }

    let isMounted = true;

    async function loadInitialData() {
      setAccessError("");
      setWorkspaceUserId("");
      setTenantUserId("");
      try {
        let workspaceData;
        try {
          workspaceData = await loadWorkspace();
        } catch (workspaceError) {
          // Workspace members and property admins do not need tenant-unit
          // data. Only fall back to the tenant RPC when workspace access is
          // absent, which avoids an expected-missing tenant feature request
          // for regular administrators during staged database deployment.
          const tenantData = await loadTenantUnits();
          if (!isMounted) return;
          if (tenantData.length > 0) {
            setWorkspace(null);
            setTenantUnits(tenantData);
            setTenantUserId(sessionUserId);
            return;
          }
          throw workspaceError;
        }
        const [propertyResult, unitResult, memberResult, visibilityResult] = await Promise.allSettled([
          loadProperties(workspaceData.id),
          loadUnits(workspaceData.id),
          loadWorkspaceMembers(workspaceData.id),
          loadPropertyVisibilityPreferences(workspaceData.id, sessionUserId),
        ]);
        if (propertyResult.status !== "fulfilled") throw propertyResult.reason;
        if (unitResult.status !== "fulfilled") throw unitResult.reason;
        const propertyData = propertyResult.value;
        const unitData = unitResult.value;
        // A property admin is intentionally not a workspace member. They can
        // still open the scoped maintenance console; owner-only controls stay
        // unavailable when workspace membership cannot be read.
        const memberData = memberResult.status === "fulfilled" ? memberResult.value : [];
        const visibilityData = visibilityResult.status === "fulfilled" ? visibilityResult.value : [];
        const isOwner = memberData.some((member) => (
          member.email === userEmail && member.role === "owner"
        ));
        const propertyMemberData = isOwner
          ? await loadPropertyMembers(workspaceData.id)
          : [];
        const routeScope = getScopeFromCurrentPath(propertyData, unitData);
        if (!isMounted) return;

        setWorkspace(workspaceData);
        setProperties(propertyData);
        setUnits(unitData);
        setWorkspaceMembers(memberData);
        setPropertyMembers(propertyMemberData);
        setPropertyVisibility(visibilityData);
        setTenantUnits([]);
        setSelectedPropertyId(routeScope.propertyId);
        setSelectedUnitId(routeScope.unitId);
        setWorkspaceUserId(sessionUserId);

        if (routeScope.propertyId) {
          updateScopePath(
            propertyData.find((property) => property.id === routeScope.propertyId),
            unitData.find((unit) => unit.id === routeScope.unitId),
            { replace: true },
          );
        }
      } catch (error) {
        if (isMounted) setAccessError(error.message);
      }
    }

    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, [sessionUserId, userEmail]);

  useEffect(() => {
    function handlePopState() {
      if (isMaintenanceRoute()) {
        setMaintenanceOpen(true);
        return;
      }
      setMaintenanceOpen(false);
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
    const missingByPath = new Map();
    for (const attachment of attachments) {
      if (
        !mediaUrls[attachment.storage_path]
        && !unavailableMediaPathsRef.current.has(attachment.storage_path)
        && !pendingMediaPathsRef.current.has(attachment.storage_path)
      ) {
        missingByPath.set(attachment.storage_path, attachment);
      }
    }
    const missing = [...missingByPath.values()];
    if (missing.length === 0 || !isSupabaseConfigured) return;

    let isMounted = true;
    missing.forEach((attachment) => pendingMediaPathsRef.current.add(attachment.storage_path));
    Promise.allSettled(
      missing.map(async (attachment) => [attachment.storage_path, await getAttachmentUrl(attachment.storage_path)]),
    )
      .then((results) => {
        const urls = [];
        results.forEach((result, index) => {
          pendingMediaPathsRef.current.delete(missing[index].storage_path);
          if (result.status === "fulfilled") urls.push(result.value);
          else unavailableMediaPathsRef.current.add(missing[index].storage_path);
        });
        if (isMounted && urls.length > 0) setMediaUrls((current) => ({ ...current, ...Object.fromEntries(urls) }));
      });

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

  function handleToggleAddWork() {
    setAddWorkOpen((current) => !current);
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
      return updated;
    } catch (error) {
      setMessage(error.message);
      throw error;
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
      return updated;
    } catch (error) {
      setMessage(error.message);
      throw error;
    } finally {
      setListingBusy(false);
    }
  }

  async function handleSuggestListingField(unitId, field) {
    if (!selectedProperty) throw new Error("Select a property before drafting listing copy.");

    setListingBusy(true);
    try {
      const result = await draftListingField({
        propertyId: selectedProperty.id,
        unitId,
        field,
      });
      if (typeof result?.suggestion !== "string" || !result.suggestion.trim()) {
        throw new Error("AI returned an empty suggestion.");
      }
      const fieldLabel = {
        listing_headline: "headline",
        listing_description: "description",
        amenities: "amenities",
      }[field] || "listing field";
      setMessage(`AI suggested a ${fieldLabel}.`);
      return result;
    } catch (error) {
      setMessage(`AI could not suggest listing copy: ${error.message}`);
      throw error;
    } finally {
      setListingBusy(false);
    }
  }

  function handleListingViewChange(nextView) {
    if (nextView === listingView) return;
    setListingView(nextView);
    if (nextView !== "tasks") setWorkMode(false);
  }

  async function handleAddItem(event) {
    event.preventDefault();
    const added = await addWork(draft);
    if (added) setDraft(emptyDraft);
    return added;
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
      setMessage("Recording saved. Processing the maintenance intake...");
      await submitMaintenanceRequest({
        workspaceId: workspace.id,
        propertyId: recording.propertyId,
        unitId: recording.unitId || null,
        user: session.user,
        audioFile: recording.file,
        sourceType: "admin-walkthrough",
        title: "Admin walkthrough intake",
        visibility: "admin",
      });
      setMessage("Walkthrough processed. Review its case files and pending work in Maintenance requests.");
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
        {!compact && <ReviewQueue
          items={reviewItems}
          busy={busy}
          onApprove={(item) => changeStatus(item, "approved")}
          onApproveAll={() => approveAll(reviewItems)}
          onItemChange={saveItem}
          onReject={handleRejectItem}
          onDeleteAttachment={handleDeleteAttachment}
          mediaUrls={mediaUrls}
          openRequest={openRequests.review}
        />}
        {!compact && (
          <div className="materials-row">
            <ItemColumn title="Shopping List" tone="shopping" icon={<ShoppingCart size={18} aria-hidden="true" />} items={shoppingItems} onItemChange={saveItem} onStatus={changeStatus} onDelete={handleDeleteItem} onUpload={uploadFiles} onDeleteAttachment={handleDeleteAttachment} onArchive={archiveItem} mediaUrls={mediaUrls} openRequest={openRequests.shopping} />
            <ItemColumn title="Collect / Bring" tone="collect" icon={<Hammer size={18} aria-hidden="true" />} items={collectItems} onItemChange={saveItem} onStatus={changeStatus} onDelete={handleDeleteItem} onUpload={uploadFiles} onDeleteAttachment={handleDeleteAttachment} onArchive={archiveItem} mediaUrls={mediaUrls} openRequest={openRequests.collect} />
          </div>
        )}
        <ItemColumn title="Tasks" tone="task" icon={<ClipboardList size={18} aria-hidden="true" />} items={taskItems} onItemChange={saveItem} onStatus={changeStatus} onDelete={handleDeleteItem} onUpload={uploadFiles} onDeleteAttachment={handleDeleteAttachment} onArchive={archiveItem} mediaUrls={mediaUrls} forceOpen={compact} compact={compact} openRequest={openRequests.tasks} reorderable={!compact && !query && statusFilter === "all"} onReorder={reorderItems} />
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
  if (session === undefined) return <AppBootScreen />;
  if (isMaintenanceQrRoute()) return <MaintenanceQrRoute token={getMaintenanceQrTokenFromCurrentPath()} user={session?.user} onSignIn={signInWithGoogle} onSignOut={signOut} />;
  if (!session && isMaintenanceRoute()) return <TenantMaintenanceAccess onSignIn={signInWithGoogle} />;
  if (!session) return <PublicSite listings={publicListings} busy={publicListingsBusy} error={publicListingsError} onSignIn={signInWithGoogle} />;
  if (tenantReady && !workspace && isMaintenanceRoute()) return <TenantMaintenanceApp user={session.user} tenantUnits={tenantUnits} onSignOut={signOut} />;
  if (tenantReady && !workspace) return <PublicSite listings={publicListings} busy={publicListingsBusy} error={publicListingsError} authenticated user={session.user} tenantUnits={tenantUnits} onSignOut={signOut} />;
  if (accessError) return <AccessGate email={userEmail} onSignOut={signOut} message={accessError} />;
  if (!workspaceReady) return <AppBootScreen label="Loading workspace..." />;
  if (maintenancePreview) {
    if (maintenancePreview.mode === "public") {
      const previewListing = publicListings.find((listing) => listing.unit_id === maintenancePreview.unit.unit_id);
      return <PublicSite listings={publicListings} busy={false} error="" authenticated user={session.user} tenantUnits={[maintenancePreview.unit]} tenantPreview previewRoute={previewListing ? { propertySlug: previewListing.property_slug, unitSlug: previewListing.unit_slug } : undefined} onExitPreview={() => setMaintenancePreview(null)} />;
    }
    return <TenantMaintenanceApp user={session.user} tenantUnits={[maintenancePreview.unit]} preview onExitPreview={() => setMaintenancePreview(null)} />;
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <main className={`app-shell ${workMode ? "work-mode" : ""}`} id="main-content" tabIndex="-1">
        <div className="workspace-top">
          <AppHeader
            property={peopleAccessOpen ? null : selectedProperty}
            scopeTitle={peopleAccessOpen
              ? "People & Access"
              : selectedProperty
                ? selectedUnit?.name || "Whole Property"
                : getPortfolioTitle(userDisplayName, visibleProperties.length)}
            peopleAccessOpen={peopleAccessOpen}
            scopeSelector={!peopleAccessOpen && !maintenanceOpen && !workMode ? (
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

        {maintenanceOpen ? (
          <MaintenanceWorkspace
            user={session.user}
            workspace={workspace}
            properties={properties}
            units={units}
            initialPropertyId={selectedPropertyId}
            initialUnitId={selectedUnitId}
            onPreview={setMaintenancePreview}
            onClose={() => {
              setMaintenanceOpen(false);
              updateScopePath(selectedProperty, selectedUnit, { replace: true });
            }}
          />
        ) : peopleAccessOpen ? (
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
            <StatusMessage message={message} onDismiss={setMessage} />
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
                <StatusMessage message={message} onDismiss={setMessage} />
              </>
            ) : null}

            {selectedProperty && listingView !== "tasks" && !workMode && (
              <>
              <ListingWorkspace
                key={listingView}
                property={selectedProperty}
                units={units}
                selectedUnit={selectedUnit}
                view={listingView}
                busy={listingBusy}
                onSaveProperty={handleSaveListingProperty}
                onSaveUnit={handleSaveListingUnit}
                onSuggestListingField={handleSuggestListingField}
                animated
                />
                <StatusMessage message={message} onDismiss={setMessage} />
              </>
            )}

            {!workMode && selectedProperty && listingView === "tasks" && (
              <section className="listing-workspace listing-workspace-enter task-workspace" aria-label="Tasks workspace">
                <SummaryGrid
                  workMode={workMode}
                  onToggleWorkMode={() => {
                    setWorkMode((current) => !current);
                    setListingView("tasks");
                  }}
                  dictationState={dictationState}
                  audioLevel={audioLevel}
                  onStartDictation={startDictation}
                  onStopDictation={stopDictation}
                  query={query}
                  statusFilter={statusFilter}
                  onQueryChange={setQuery}
                  onStatusChange={setStatusFilter}
                  onAddWork={handleToggleAddWork}
                  addWorkOpen={addWorkOpen}
                />
                <QuickAddPanel
                  draft={draft}
                  busy={busy}
                  onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                  onSubmit={handleAddItem}
                  isOpen={addWorkOpen}
                  onClose={() => setAddWorkOpen(false)}
                />
                <DictationInbox
                  recordings={selectedScopeRecordings}
                  scopeName={selectedScopeTitle}
                  onSave={saveRecording}
                  onDelete={removeRecording}
                />
                <StatusMessage message={message} onDismiss={setMessage} />
                {renderWorkGrid(false)}
              </section>
            )}

            {selectedProperty && workMode && renderWorkGrid(true)}
          </>
        )}
      </main>
      <AppFooter
        authenticated
        onAuthAction={signOut}
        isWorkspaceOwner={isWorkspaceOwner}
        peopleAccessOpen={peopleAccessOpen}
        onTogglePeopleAccess={handleTogglePeopleAccess}
        maintenanceOpen={maintenanceOpen}
        onToggleMaintenance={() => {
          setMaintenanceOpen((current) => {
            const next = !current;
            if (next) updateMaintenancePath();
            else updateScopePath(selectedProperty, selectedUnit, { replace: true });
            return next;
          });
          setPeopleAccessOpen(false);
          setWorkMode(false);
        }}
        canOpenMaintenance={Boolean(workspace)}
      />
    </>
  );
}

function AppBootScreen({ label = "Loading..." }) {
  return (
    <main className="app-boot-screen" id="main-content" tabIndex="-1">
      <p role="status">{label}</p>
    </main>
  );
}

function getUserDisplayName(user) {
  const profileName = user?.user_metadata?.full_name || user?.user_metadata?.name;
  if (profileName?.trim()) return profileName.trim();

  const emailUsername = user?.email?.split("@")[0]?.trim();
  return emailUsername || "Signed-in user";
}

function getPortfolioTitle(name, propertyCount) {
  const possessiveName = name.endsWith("s") ? `${name}'` : `${name}'s`;
  return `${possessiveName} ${propertyCount} ${propertyCount === 1 ? "Property" : "Properties"}`;
}

export default App;
