import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, CirclePlus, FileAudio, ListChecks, Mic, RefreshCw, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { addItem, deleteItem, loadItems, uploadAttachment } from "../lib/data";
import {
  REQUEST_STATUS_LABELS,
  addMaintenanceInformation,
  approveMaintenanceItem,
  getMaintenanceAttachmentUrl,
  loadAdminMaintenanceDetail,
  loadMaintenanceRequests,
  processMaintenanceRequest,
  rejectMaintenanceItem,
  reopenMaintenanceRequest,
  resolveMaintenanceRequest,
  submitMaintenanceRequest,
} from "../lib/maintenance";
import { formatBytes, formatDuration, getAttachmentKind } from "../lib/media";
import { MATERIAL_LABELS } from "../lib/seed";
import { MaintenanceQrControls } from "./MaintenanceQrControls";
import { QuickAddPanel } from "./WorkspacePanels";

const emptyQuickAddDraft = {
  title: "",
  note: "",
  kind: "task",
  material_type: "shopping",
};

export function MaintenanceWorkspace({ user, workspace, properties, units, initialPropertyId, initialUnitId, onClose, onPreview }) {
  const [selectedPropertyId, setSelectedPropertyId] = useState(initialPropertyId || properties[0]?.id || "");
  const [selectedUnitId, setSelectedUnitId] = useState(initialUnitId || "");
  const [requests, setRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const propertyUnits = useMemo(() => units.filter((unit) => unit.property_id === selectedPropertyId), [selectedPropertyId, units]);
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);
  const openRequests = requests.filter((request) => request.status !== "resolved");
  const resolvedRequests = requests.filter((request) => request.status === "resolved");

  useEffect(() => {
    if (selectedUnitId && !propertyUnits.some((unit) => unit.id === selectedUnitId)) setSelectedUnitId("");
  }, [propertyUnits, selectedUnitId]);

  const refresh = useCallback(async ({ retain = true } = {}) => {
    try {
      const all = await loadMaintenanceRequests({ workspaceId: workspace.id });
      const scoped = all.filter((request) => (
        (!selectedPropertyId || request.property_id === selectedPropertyId)
        && (!selectedUnitId || request.unit_id === selectedUnitId)
      ));
      setRequests(scoped);
      if (scoped.length === 0) setDetail(null);
      const preferredRequests = scoped.filter((request) => request.status !== "resolved");
      setSelectedRequestId((currentId) => (
        retain && scoped.some((request) => request.id === currentId)
          ? currentId
          : preferredRequests[0]?.id || scoped[0]?.id || ""
      ));
    } catch (error) {
      setMessage(error.message);
    }
  }, [selectedPropertyId, selectedUnitId, workspace.id]);

  useEffect(() => { refresh({ retain: false }); }, [refresh]);
  useEffect(() => {
    if (!selectedRequestId) return undefined;
    let active = true;
    loadAdminMaintenanceDetail(selectedRequestId)
      .then((nextDetail) => { if (active) setDetail(nextDetail); })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [selectedRequestId]);

  async function handleNewRequest({ description, audioFile, photoFiles }) {
    if (!selectedProperty) return;
    setBusy(true);
    try {
      const request = await submitMaintenanceRequest({
        workspaceId: workspace.id,
        propertyId: selectedProperty.id,
        unitId: selectedUnitId || null,
        user,
        description,
        audioFile,
        photoFiles,
        sourceType: audioFile ? "admin-walkthrough" : "admin-text",
        title: audioFile ? "Admin walkthrough intake" : undefined,
        visibility: "admin",
      });
      setMessage("Intake saved and AI processing started.");
      await refresh({ retain: false });
      setSelectedRequestId(request.id);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddInformation({ description, audioFile, photoFiles }) {
    if (!detail?.request) return;
    setBusy(true);
    try {
      await addMaintenanceInformation({ request: detail.request, user, content: description, audioFile, photoFiles, visibility: "admin" });
      setMessage("Information saved and a new analysis started.");
      setDetail(await loadAdminMaintenanceDetail(detail.request.id));
      await refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleItemAction(item, action) {
    setBusy(true);
    try {
      if (action === "approve") await approveMaintenanceItem(item.id);
      else await rejectMaintenanceItem(item.id);
      setDetail(await loadAdminMaintenanceDetail(detail.request.id));
      await refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!detail?.request) return;
    setBusy(true);
    try {
      await processMaintenanceRequest(detail.request.id, { forceRetry: true });
      setDetail(await loadAdminMaintenanceDetail(detail.request.id));
      await refresh();
      setMessage("Analysis retry completed.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCaseResolution(action) {
    if (!detail?.request) return;
    if (action === "resolve" && !window.confirm("Close this case? The tenant will see it as resolved.")) return;
    setBusy(true);
    try {
      if (action === "resolve") {
        await resolveMaintenanceRequest(detail.request.id);
        setDetail(null);
        setSelectedRequestId("");
        setMessage("Case closed. The tenant can now see it as resolved.");
        await refresh({ retain: false });
      } else {
        await reopenMaintenanceRequest(detail.request.id);
        setMessage("Case reopened for review.");
        setDetail(await loadAdminMaintenanceDetail(detail.request.id));
        await refresh();
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function openPreview(mode) {
    onPreview?.({
      mode,
      propertyId: selectedPropertyId,
      unitId: selectedUnitId || propertyUnits[0]?.id || "",
    });
  }

  return (
    <section className="maintenance-workspace" aria-labelledby="maintenance-title">
      <header className="maintenance-header">
        <div>
          <p className="eyebrow">Property maintenance</p>
          <h2 id="maintenance-title"><Sparkles size={22} aria-hidden="true" /> Maintenance case files</h2>
          <p>Use Maintenance to keep repair requests and walkthrough findings organized in one place. Tenants can submit an issue with a note, photos, or a voice message from their maintenance link; each submission becomes a case file they can revisit to see its status. Property admins can review the request, add internal details, approve or ignore AI-suggested tasks and materials, and close the case when the issue is resolved. For on-site inspections, open Start a maintenance report, record a walkthrough, and let the app split distinct observations into reviewable cases; use the Tasks tab for everyday work that does not need a tenant-facing case file.</p>
        </div>
        <div className="maintenance-header-actions">
          <button className="ghost" type="button" onClick={() => openPreview("tenant")} disabled={!selectedPropertyId || propertyUnits.length === 0}><ShieldCheck size={17} aria-hidden="true" /> Preview signed-in tenant</button>
          <button className="ghost" type="button" onClick={onClose}><ArrowLeft size={17} aria-hidden="true" /> Return to property workspace</button>
        </div>
      </header>

      <section className="maintenance-filter-bar" aria-label="Maintenance request scope">
        <label htmlFor="maintenance-property"><span>Property</span><select id="maintenance-property" value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)}>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label>
        <label htmlFor="maintenance-unit"><span>Unit or scope</span><select id="maintenance-unit" value={selectedUnitId} onChange={(event) => setSelectedUnitId(event.target.value)}><option value="">Whole property / all scopes</option>{propertyUnits.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></label>
      </section>

      {selectedProperty && (
        <details className="admin-intake-disclosure">
          <summary>Start a maintenance request</summary>
          <AdminRequestComposer propertyId={selectedProperty.id} unitId={selectedUnitId} workspaceId={workspace.id} busy={busy} onSubmit={handleNewRequest} onMessage={setMessage} />
        </details>
      )}
      <div className="maintenance-content-grid">
        <nav className="maintenance-case-list" aria-label="Maintenance requests">
          <h3>Open case files</h3>
          {openRequests.length === 0 ? <p className="empty">No open maintenance requests in this scope.</p> : <CaseFileList requests={openRequests} selectedRequestId={selectedRequestId} properties={properties} units={units} onSelect={setSelectedRequestId} />}
          {resolvedRequests.length > 0 && <details className="resolved-case-list"><summary>Resolved cases ({resolvedRequests.length})</summary><CaseFileList requests={resolvedRequests} selectedRequestId={selectedRequestId} properties={properties} units={units} onSelect={setSelectedRequestId} /></details>}
        </nav>
        <AdminCaseFile detail={detail} properties={properties} units={units} busy={busy} onRetry={retry} onResolve={handleCaseResolution} onItemAction={handleItemAction} onAddInformation={handleAddInformation} message={message} />
      </div>
      {selectedProperty && <MaintenanceQrControls property={selectedProperty} selectedUnit={propertyUnits.find((unit) => unit.id === selectedUnitId) || null} propertyUnits={propertyUnits} />}
    </section>
  );
}

function getRequestScopeLabel(request, properties, units) {
  const propertyName = properties.find((property) => property.id === request.property_id)?.name || "Property";
  const unitName = request.unit_id
    ? units.find((unit) => unit.id === request.unit_id)?.name || "Unit"
    : "Whole property";
  return `${propertyName} · ${unitName}`;
}

function CaseFileList({ requests, selectedRequestId, properties, units, onSelect }) {
  return <ul role="list">{requests.map((request) => <li key={request.id}><button type="button" className={request.id === selectedRequestId ? "active" : ""} onClick={() => onSelect(request.id)}><span>{request.title}</span><small className="case-file-scope">{getRequestScopeLabel(request, properties, units)}</small><small>{REQUEST_STATUS_LABELS[request.status] || request.status}</small></button></li>)}</ul>;
}

function AdminRequestComposer({ propertyId, unitId, workspaceId, busy, onSubmit, onMessage }) {
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddDraft, setQuickAddDraft] = useState(emptyQuickAddDraft);
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const { state, recordings, start, stop, removeRecording } = useAudioRecorder({ propertyId, unitId, onMessage: () => {} });
  const recording = recordings[0];
  async function submit(event) {
    event.preventDefault();
    if (!description.trim() && !recording && photos.length === 0) return;
    await onSubmit({ description, audioFile: recording?.file || null, photoFiles: photos });
    setDescription("");
    setPhotos([]);
    if (recording) removeRecording(recording.id);
  }

  async function addQuickWork(event, imageFile) {
    event.preventDefault();
    const title = quickAddDraft.title.trim();
    if (!title) return false;

    setQuickAddBusy(true);
    try {
      const existingItems = await loadItems({ propertyId, unitId: unitId || null });
      const item = await addItem({
        workspace_id: workspaceId,
        property_id: propertyId,
        unit_id: unitId || null,
        title,
        note: quickAddDraft.note.trim(),
        kind: quickAddDraft.kind,
        category: quickAddDraft.kind === "material" ? MATERIAL_LABELS[quickAddDraft.material_type] : "Task",
        material_type: quickAddDraft.kind === "material" ? quickAddDraft.material_type : null,
        status: "approved",
        sort_order: existingItems.length + 1,
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
      setQuickAddDraft(emptyQuickAddDraft);
      onMessage(`${title} added.`);
      return true;
    } catch (error) {
      onMessage(error.message);
      return false;
    } finally {
      setQuickAddBusy(false);
    }
  }

  return <section className="admin-intake" aria-label="Create a maintenance request">
    <div className="admin-intake-overview">
      <button type="button" className={state === "recording" ? "recording" : ""} onClick={state === "recording" ? stop : start}><Mic size={17} aria-hidden="true" /> {state === "recording" ? "Stop recording" : "Record walkthrough"}</button>
      <p>Creates a permanent case file for the selected property or unit. A voice walkthrough can still split into multiple cases.</p>
      <details className="admin-walkthrough-help">
        <summary>How to use a walkthrough</summary>
      <p>Use this during a property walkthrough. Record your observations as you go, including maintenance issues and anything needed to address them. After you submit the recording, distinct issues are organized into separate case files with reviewable task, shopping, and collect/bring suggestions.</p></details>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="admin-intake-description">
          <span>What should we know? <small>Optional - record a walkthrough or add photos instead.</small></span>
          <textarea id="admin-intake-description" name="description" value={description} onChange={(event) => setDescription(event.target.value)} rows="3" maxLength="4000" placeholder="Example: The bathroom fan is rattling and the faucet drips." />
        </label>
        <div className="admin-intake-actions">
          <label className="tenant-upload-button" htmlFor="admin-intake-photos">Add photos<input id="admin-intake-photos" name="photos" type="file" accept="image/*" multiple onChange={(event) => setPhotos([...event.target.files])} /></label>
          <button type="button" className="ghost" onClick={() => setQuickAddOpen((open) => !open)} aria-expanded={quickAddOpen} aria-controls="maintenance-quick-add"><CirclePlus size={17} aria-hidden="true" /> Add 1 Task or Material</button>
          <button type="submit" disabled={busy}><Sparkles size={17} aria-hidden="true" /> {busy ? "Creating…" : "Create request and analyze"}</button>
        </div>
        {recording && <p className="tenant-recording"><FileAudio size={17} aria-hidden="true" /> Recording ready · {formatDuration(recording.durationMs)} · {formatBytes(recording.size)} <button type="button" onClick={() => removeRecording(recording.id)}>Remove</button></p>}{photos.length > 0 && <p className="tenant-file-count">{photos.length} photo{photos.length === 1 ? "" : "s"} ready.</p>}
      </form>
      <div id="maintenance-quick-add" hidden={!quickAddOpen}>
        <QuickAddPanel draft={quickAddDraft} busy={quickAddBusy} onDraftChange={(patch) => setQuickAddDraft((current) => ({ ...current, ...patch }))} onSubmit={addQuickWork} isOpen onClose={() => setQuickAddOpen(false)} />
      </div>
      </section>;
}

function AdminCaseFile({ detail, properties, units, busy, onRetry, onResolve, onItemAction, onAddInformation, message }) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    const missing = (detail?.attachments || []).filter((attachment) => !urls[attachment.storage_path]);
    if (missing.length === 0) return;
    Promise.all(missing.map(async (attachment) => [attachment.storage_path, await getMaintenanceAttachmentUrl(attachment.storage_path)]))
      .then((entries) => setUrls((current) => ({ ...current, ...Object.fromEntries(entries) })))
      .catch(() => {});
  }, [detail, urls]);

  if (!detail) return <section className="maintenance-case-file maintenance-case-empty"><ListChecks size={25} aria-hidden="true" /><p>Select a case file to inspect its history and proposed work.</p>{message && <p className="message" role="status">{message}</p>}</section>;
  const { request, entries, analyses, items, events } = detail;
  const submitterType = request.tenant_membership_id ? "Tenant" : "Administrator";
  const hasDistinctDescription = request.original_description?.trim()
    && request.original_description.trim().toLocaleLowerCase() !== request.title?.trim().toLocaleLowerCase();
  const isResolved = request.status === "resolved";
  return <section className="maintenance-case-file" aria-labelledby="case-file-title"><header><div><p className={`tenant-status tenant-status-${request.status}`}>{REQUEST_STATUS_LABELS[request.status] || request.status}</p><h3 id="case-file-title">{request.title}</h3>{hasDistinctDescription && <p>{request.original_description}</p>}</div><div className="case-file-actions">{!isResolved && <button className="ghost" type="button" onClick={onRetry} disabled={busy}><RefreshCw size={16} aria-hidden="true" /> {request.processing_status === "failed" ? "Retry analysis" : "Reanalyze"}</button>}<button className="ghost" type="button" onClick={() => onResolve(isResolved ? "reopen" : "resolve")} disabled={busy}>{isResolved ? "Reopen case" : "Close case"}</button></div></header><dl className="case-metadata"><div><dt>Property &amp; unit</dt><dd>{getRequestScopeLabel(request, properties, units)}</dd></div><div><dt>Submitted by</dt><dd>{submitterType}</dd></div><div><dt>Contact email</dt><dd>{request.submitter_email ? <a href={`mailto:${request.submitter_email}`}>{request.submitter_email}</a> : "Not provided"}</dd></div><div><dt>Source</dt><dd>{getRequestSourceLabel(request.source_type)}</dd></div><div><dt>Submitted</dt><dd><time dateTime={request.created_at}>{formatCaseDate(request.created_at)}</time></dd></div></dl>{request.processing_error && <p className="maintenance-error" role="alert">{request.processing_error}</p>}<section className="case-section"><h4>Case history</h4><ol className="case-timeline">{entries.map((entry) => <li key={entry.id}><strong>{entry.entry_type === "audio" ? "Voice recording" : entry.entry_type === "photo" ? "Photo added" : entry.author_type === "tenant" ? "Tenant information" : "Information added"}</strong><p>{entry.transcript || entry.content || "Media attached"}</p></li>)}</ol></section>{!isResolved && <AdminAdditionalInfo request={request} busy={busy} onSubmit={onAddInformation} />}{analyses.map((analysis, index) => <AnalysisCard key={analysis.id} analysis={analysis} items={items.filter((item) => item.maintenance_analysis_id === analysis.id)} busy={busy} onItemAction={onItemAction} defaultOpen={index === 0} />)}<details className="case-section case-history-details"><summary>Request history</summary><ol className="case-timeline compact">{events.map((event) => <li key={event.id}><strong>{event.label}</strong><time dateTime={event.created_at}>{formatCaseDate(event.created_at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></li>)}</ol></details>{message && <p className="message" role="status">{message}</p>}</section>;
}

function getRequestSourceLabel(sourceType) {
  return {
    "tenant-text": "Tenant typed request",
    "tenant-audio": "Tenant voice request",
    "tenant-qr": "Tenant QR request",
    "admin-text": "Admin typed request",
    "admin-audio": "Admin voice request",
    "admin-qr": "Admin QR request",
    "admin-walkthrough": "Admin walkthrough",
    "admin-walkthrough-split": "Split from admin walkthrough",
    "admin-test": "Admin tenant-view test",
  }[sourceType] || sourceType;
}

function formatCaseDate(value, options = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(value));
}

function AdminAdditionalInfo({ request, busy, onSubmit }) {
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState([]);
  const { state, recordings, start, stop, removeRecording } = useAudioRecorder({ propertyId: request.property_id, unitId: request.unit_id, onMessage: () => {} });
  const recording = recordings[0];
  async function submit(event) { event.preventDefault(); if (!content.trim() && !recording && photos.length === 0) return; await onSubmit({ description: content, audioFile: recording?.file || null, photoFiles: photos }); setContent(""); setPhotos([]); if (recording) removeRecording(recording.id); }
  return <form className="case-additional-info" onSubmit={submit}><label htmlFor="case-note"><span>Add internal information</span><textarea id="case-note" value={content} onChange={(event) => setContent(event.target.value)} rows="2" maxLength="2000" /></label><div><button type="button" className={state === "recording" ? "recording" : "ghost"} onClick={state === "recording" ? stop : start}><Mic size={16} aria-hidden="true" /> {state === "recording" ? "Stop" : "Voice note"}</button><label className="tenant-upload-button" htmlFor="case-photos">Photos<input id="case-photos" type="file" accept="image/*" multiple onChange={(event) => setPhotos([...event.target.files])} /></label><button type="submit" disabled={busy}>Save and reanalyze</button></div>{recording && <p className="tenant-file-count">Voice note ready. <button type="button" onClick={() => removeRecording(recording.id)}>Remove</button></p>}</form>;
}

function AnalysisCard({ analysis, items, busy, onItemAction, defaultOpen }) {
  const output = analysis.structured_output || {};
  return <details className="analysis-card" open={defaultOpen}><summary aria-labelledby={`analysis-${analysis.id}`}><span><span className="eyebrow">{analysis.analysis_kind === "intake" ? "Walkthrough intake" : `AI analysis #${analysis.sequence_number}`}</span><span className="analysis-card-title" id={`analysis-${analysis.id}`} role="heading" aria-level="4">{analysis.processing_status === "completed" ? "Immutable analysis" : `Processing ${analysis.processing_status}`}</span></span><time dateTime={analysis.completed_at || analysis.created_at}>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(analysis.completed_at || analysis.created_at))}</time></summary><div className="analysis-card-content">{analysis.processing_status === "failed" && <p className="maintenance-error">{analysis.error_message}</p>}{analysis.processing_status === "completed" && <><p>{output.summary}</p>{output.clarifying_questions?.length > 0 && <FactList title="Questions for the submitter" values={output.clarifying_questions} />}{output.unknowns?.length > 0 && <FactList title="Material unknowns" values={output.unknowns} />}{output.possible_causes?.length > 0 && <FactList title="Possible causes" values={output.possible_causes.map((cause) => `${cause.text} (${cause.confidence})`)} />}{output.relevant_history?.length > 0 && <RelevantHistory values={output.relevant_history} />}{items.length > 0 && <div className="analysis-proposals"><h5>Proposed work</h5><ul role="list">{items.map((item) => <li key={item.id}><div><strong>{item.title}</strong><p>{item.note}</p><small>{item.kind === "material" ? item.material_type === "collect" ? "Collect / Bring" : "Shopping List" : "Task"}</small></div>{item.status === "pending-review" ? <span><button type="button" onClick={() => onItemAction(item, "approve")} disabled={busy}><Check size={16} aria-hidden="true" /> Approve</button><button className="danger-button" type="button" onClick={() => onItemAction(item, "reject")} disabled={busy}><Trash2 size={16} aria-hidden="true" /> Reject</button></span> : <span className="proposal-status">{item.status === "done" ? "Completed" : "Approved"}</span>}</li>)}</ul></div>}</>}</div></details>;
}

function FactList({ title, values }) {
  return <div className="analysis-facts"><h5>{title}</h5><ul role="list">{values.map((value) => <li key={value}>{value}</li>)}</ul></div>;
}

function RelevantHistory({ values }) {
  return <section className="analysis-history" aria-label="Relevant history used for this analysis"><h5>Relevant history</h5><ul role="list">{values.map((history) => <li key={`${history.source_type}-${history.source_id}`}><div><strong>{history.summary}</strong><p>{history.relevance}</p></div><small>{history.source_type.replaceAll("_", " ")} · {history.scope === "unit" ? "This unit" : "Property-wide"}{history.occurred_at ? ` · ${formatCaseDate(history.occurred_at, { month: "short", day: "numeric", year: "numeric" })}` : ""}</small></li>)}</ul></section>;
}
