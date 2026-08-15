import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Camera, Check, ChevronDown, ChevronRight, CirclePlus, FileAudio, ListChecks, Mic, RefreshCw, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
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
  setMaintenanceAttachmentCaseLinks,
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

export function MaintenanceWorkspace({ user, workspace, properties, units, initialPropertyId, initialUnitId, onPreview }) {
  const [selectedPropertyId, setSelectedPropertyId] = useState(initialPropertyId || properties[0]?.id || "");
  const [selectedUnitId, setSelectedUnitId] = useState(initialUnitId || "");
  const [requests, setRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showMaintenanceOverview, setShowMaintenanceOverview] = useState(false);

  const propertyUnits = useMemo(() => units.filter((unit) => unit.property_id === selectedPropertyId), [selectedPropertyId, units]);
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);
  const selectedUnit = propertyUnits.find((unit) => unit.id === selectedUnitId);
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

  async function handleAttachmentLinks(attachmentId, maintenanceRequestIds) {
    setBusy(true);
    try {
      await setMaintenanceAttachmentCaseLinks({ attachmentId, maintenanceRequestIds });
      await refresh();
      setMessage("Photo links updated.");
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
          <h2 id="maintenance-title"><Sparkles size={22} aria-hidden="true" /> Maintenance case files <button className="maintenance-title-toggle" type="button" aria-expanded={showMaintenanceOverview} aria-controls="maintenance-overview" onClick={() => setShowMaintenanceOverview((current) => !current)}><ChevronDown size={20} aria-hidden="true" /><span className="visually-hidden">{showMaintenanceOverview ? "Hide" : "Show"} maintenance overview</span></button></h2>
          <div id="maintenance-overview" hidden={!showMaintenanceOverview}>
            <p>Use Maintenance to keep repair requests and walkthrough findings organized in one place. Tenants can submit an issue with a note, photos, or a voice message from their maintenance link; each submission becomes a case file they can revisit to see its status. Property admins can review the request, add internal details, approve or ignore AI-suggested tasks and materials, and close the case when the issue is resolved. For on-site inspections, open Start a maintenance report, record a walkthrough, and let the app split distinct observations into reviewable cases; use the Tasks tab for everyday work that does not need a tenant-facing case file.</p>
            <button className="ghost" type="button" onClick={() => openPreview("tenant")} disabled={!selectedPropertyId || propertyUnits.length === 0}><ShieldCheck size={17} aria-hidden="true" /> Preview tenant form <ArrowRight size={17} aria-hidden="true" /></button>
          </div>
        </div>
      </header>

      <section className="maintenance-filter-bar" aria-label="Maintenance request scope">
        <label htmlFor="maintenance-property"><span>Property</span><select id="maintenance-property" value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)}>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label>
        <label htmlFor="maintenance-unit"><span>Unit or scope</span><select id="maintenance-unit" value={selectedUnitId} onChange={(event) => setSelectedUnitId(event.target.value)}><option value="">Whole property / all scopes</option>{propertyUnits.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></label>
      </section>

      {selectedProperty && (
        <div className="maintenance-intake-actions">
          <details className="admin-intake-disclosure">
            <summary><ChevronRight className="admin-intake-disclosure-icon" size={20} aria-hidden="true" /><span className="admin-intake-disclosure-copy"><span>Add maintenance to</span><span className="admin-intake-context">{selectedProperty.name} · {selectedUnit?.name || "Whole property"}</span></span></summary>
            <AdminRequestComposer propertyId={selectedProperty.id} unitId={selectedUnitId} workspaceId={workspace.id} busy={busy} onSubmit={handleNewRequest} onMessage={setMessage} />
          </details>
        </div>
      )}
      <div className="maintenance-content-grid">
        <nav className="maintenance-case-list" aria-label="Maintenance requests">
          <h3>Open case files</h3>
          {openRequests.length === 0 ? <p className="empty">No open maintenance requests in this scope.</p> : <CaseFileList requests={openRequests} selectedRequestId={selectedRequestId} properties={properties} units={units} onSelect={setSelectedRequestId} />}
          {resolvedRequests.length > 0 && <details className="resolved-case-list"><summary>Resolved cases ({resolvedRequests.length})</summary><CaseFileList requests={resolvedRequests} selectedRequestId={selectedRequestId} properties={properties} units={units} onSelect={setSelectedRequestId} /></details>}
        </nav>
        <AdminCaseFile detail={detail} properties={properties} units={units} busy={busy} onRetry={retry} onResolve={handleCaseResolution} onItemAction={handleItemAction} onAddInformation={handleAddInformation} onAttachmentLinksChange={handleAttachmentLinks} message={message} />
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
    await onSubmit({ description: recording ? "" : description, audioFile: recording?.file || null, photoFiles: photos });
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

  return <section className="admin-intake" aria-label="Add maintenance">
      <header className="admin-intake-heading">
        <div>
          <p>Capture one issue or several. We&apos;ll organize what you submit into separate maintenance cases for review.</p>
        </div>
      </header>
      <ol className="admin-intake-workflow" aria-label="Maintenance intake workflow">
        <li><strong>Capture</strong><span>Notes, photos, or voice</span></li>
        <li><strong>Organize</strong><span>Observations become cases</span></li>
        <li><strong>Review</strong><span>Check suggested work</span></li>
        <li><strong>Approve</strong><span>Add only what you want done</span></li>
      </ol>
      <details className="admin-intake-choice admin-quick-add" name="admin-maintenance-method" open={quickAddOpen} onToggle={(event) => setQuickAddOpen(event.currentTarget.open)}>
        <summary><span className="admin-intake-choice-icons"><ChevronRight className="admin-intake-choice-icon" size={20} aria-hidden="true" /></span><span><strong>Quick add</strong><small>Already know exactly what needs to be done or purchased? Add it directly.</small></span><CirclePlus className="admin-intake-choice-workflow-icon" size={19} aria-hidden="true" /></summary>
        <div id="maintenance-quick-add">
          <QuickAddPanel variant="maintenance" draft={quickAddDraft} busy={quickAddBusy} onDraftChange={(patch) => setQuickAddDraft((current) => ({ ...current, ...patch }))} onSubmit={addQuickWork} isOpen onClose={() => setQuickAddOpen(false)} />
        </div>
      </details>
      <details className="admin-intake-choice admin-walkthrough-option" name="admin-maintenance-method">
        <summary><span className="admin-intake-choice-icons"><ChevronRight className="admin-intake-choice-icon" size={20} aria-hidden="true" /></span><span><strong>Walkthrough</strong><small>Record, describe, or photograph what you found.</small></span><Mic className="admin-intake-choice-workflow-icon" size={19} aria-hidden="true" /></summary>
        <div className="admin-intake-choice-content">
          <div className="admin-walkthrough-capture">
            <p>Talk through issues as you move through the property. One recording can cover multiple rooms or repairs.</p>
            <button type="button" className={state === "recording" ? "recording" : ""} onClick={state === "recording" ? stop : start}><Mic size={17} aria-hidden="true" /> {state === "recording" ? "Stop recording" : "Record a walkthrough"}</button>
            <details className="admin-walkthrough-help">
              <summary>Tips for better walkthroughs</summary>
              <ul className="admin-walkthrough-steps">
                <li>Start each observation with its location, then describe what you see, hear, smell, or notice.</li>
                <li>Mention urgency, access needs, tools, parts, or materials when useful.</li>
                <li>Say “next issue” or pause briefly between unrelated observations.</li>
              </ul>
              <p>One recording can cover a room, unit, or entire property. Long recordings may need to be split if the audio file exceeds 50 MB.</p>
            </details>
          </div>
          <form className="admin-maintenance-form" id="admin-maintenance-form" onSubmit={submit}>
            {!recording ? <label className="admin-intake-field" htmlFor="admin-intake-description">
              <span>Describe what you found <small className="optional-label">Optional</small></span>
              <small className="field-hint" id="admin-intake-description-help">Add one issue or several. Unrelated observations can be separated into individual maintenance cases after submission.</small>
              <textarea id="admin-intake-description" name="description" value={description} onChange={(event) => setDescription(event.target.value)} rows="3" maxLength="4000" aria-describedby="admin-intake-description-help" placeholder="Bathroom fan rattles when running. Faucet drips at the base." />
            </label> : <p className="field-hint">Your walkthrough is ready. Add photos if useful, then create the maintenance request.</p>}
          </form>
          <div className="admin-intake-media">
            <p className="admin-intake-photo-help" id="admin-intake-photo-help">Photos stay with this maintenance intake. During review, you can link each photo to one or more generated case files. Image files only; multiple photos are supported.</p>
            <label className="tenant-upload-button" htmlFor="admin-intake-photos"><Camera size={17} aria-hidden="true" /> Add photos<input id="admin-intake-photos" name="photos" type="file" accept="image/*" multiple aria-describedby="admin-intake-photo-help" onChange={(event) => setPhotos([...event.target.files])} /></label>
            {recording && <p className="tenant-recording"><FileAudio size={17} aria-hidden="true" /> Recording ready · {formatDuration(recording.durationMs)} · {formatBytes(recording.size)} <button type="button" onClick={() => removeRecording(recording.id)}>Remove</button></p>}
            {photos.length > 0 && <p className="tenant-file-count">{photos.length} photo{photos.length === 1 ? "" : "s"} attached.</p>}
          </div>
          <div className="admin-intake-submit">
            <p>We&apos;ll organize the submission and suggest follow-up work for you to review.</p>
            <button type="submit" form="admin-maintenance-form" disabled={busy}><Sparkles size={17} aria-hidden="true" /> {busy ? "Creating…" : "Create maintenance request"}</button>
          </div>
        </div>
      </details>
      </section>;
}

function AdminCaseFile({ detail, busy, onRetry, onResolve, onItemAction, onAddInformation, onAttachmentLinksChange, message }) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    const missing = [...(detail?.attachments || []), ...(detail?.linkedAttachments || [])].filter((attachment) => !urls[attachment.storage_path]);
    if (missing.length === 0) return;
    Promise.all(missing.map(async (attachment) => [attachment.storage_path, await getMaintenanceAttachmentUrl(attachment.storage_path)]))
      .then((entries) => setUrls((current) => ({ ...current, ...Object.fromEntries(entries) })))
      .catch(() => {});
  }, [detail, urls]);

  if (!detail) return <section className="maintenance-case-file maintenance-case-empty"><ListChecks size={25} aria-hidden="true" /><p>Select a case file to inspect its history and proposed work.</p>{message && <p className="message" role="status">{message}</p>}</section>;
  const { request, entries, attachments, attachmentLinks, childRequests, linkedAttachments, analyses, items, events } = detail;
  const submitterType = request.source_type === "qr-public" ? "QR visitor" : request.tenant_membership_id ? "Tenant" : "Administrator";
  const contactEmail = request.reporter_email || request.submitter_email;
  const contactName = request.reporter_name || null;
  const contactPhone = request.reporter_phone || null;
  const hasDistinctDescription = request.original_description?.trim()
    && request.original_description.trim().toLocaleLowerCase() !== request.title?.trim().toLocaleLowerCase();
  const isResolved = request.status === "resolved";
  const sourceLabel = getRequestSourceLabel(request.source_type);
  return <section className="maintenance-case-file" aria-labelledby="case-file-title">
    <header>
      <div>
        <p className={`tenant-status tenant-status-${request.status}`}>{REQUEST_STATUS_LABELS[request.status] || request.status}</p>
        <h3 id="case-file-title">{request.title}</h3>
        {hasDistinctDescription && <p>{request.original_description}</p>}
        <div className="case-ticket-footer">
          <p><span>Submitted by</span> <strong>{submitterType}</strong></p>
          {(contactName || contactEmail || contactPhone) && <p><span>Contact</span> {contactName && <strong>{contactName}</strong>}{contactEmail && <a href={`mailto:${contactEmail}`}>{contactEmail}</a>}{contactPhone && <a href={`tel:${contactPhone}`}>{contactPhone}</a>}</p>}
          <p>{sourceLabel} <span aria-hidden="true">·</span> <time dateTime={request.created_at}>{formatCaseDate(request.created_at)}</time></p>
        </div>
      </div>
      <div className="case-file-actions">
        {!isResolved && <button className="ghost" type="button" onClick={onRetry} disabled={busy}><RefreshCw size={16} aria-hidden="true" /> {request.processing_status === "failed" ? "Retry analysis" : "Reanalyze"}</button>}
        <button className="ghost" type="button" onClick={() => onResolve(isResolved ? "reopen" : "resolve")} disabled={busy}>{isResolved ? "Reopen case" : "Close case"}</button>
      </div>
    </header>
    {request.processing_error && <p className="maintenance-error" role="alert">{request.processing_error}</p>}
    {request.source_type === "admin-walkthrough" && <WalkthroughPhotoLinks attachments={attachments} attachmentLinks={attachmentLinks} childRequests={childRequests} urls={urls} busy={busy} onChange={onAttachmentLinksChange} />}
    {request.parent_request_id && <LinkedWalkthroughPhotos attachments={linkedAttachments} urls={urls} />}
    <section className="case-section"><h4>Case history</h4><ol className="case-timeline">{entries.map((entry) => <li key={entry.id}><strong>{entry.entry_type === "audio" ? "Voice recording" : entry.entry_type === "photo" ? "Photo added" : entry.author_type === "tenant" ? "Tenant information" : "Information added"}</strong><p>{entry.transcript || entry.content || "Media attached"}</p></li>)}</ol></section>
    {!isResolved && <AdminAdditionalInfo request={request} busy={busy} onSubmit={onAddInformation} />}
    {analyses.map((analysis, index) => <AnalysisCard key={analysis.id} analysis={analysis} items={items.filter((item) => item.maintenance_analysis_id === analysis.id)} busy={busy} onItemAction={onItemAction} defaultOpen={index === 0} />)}
    <details className="case-section case-history-details"><summary>Request history</summary><ol className="case-timeline compact">{events.map((event) => <li key={event.id}><strong>{event.label}</strong><time dateTime={event.created_at}>{formatCaseDate(event.created_at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></li>)}</ol></details>
    {message && <p className="message" role="status">{message}</p>}
  </section>;
}

function WalkthroughPhotoLinks({ attachments, attachmentLinks, childRequests, urls, busy, onChange }) {
  const photos = attachments.filter((attachment) => attachment.kind === "photo");
  if (photos.length === 0 || childRequests.length === 0) return null;
  return <section className="case-section walkthrough-photo-links" aria-labelledby="walkthrough-photo-links-title"><h4 id="walkthrough-photo-links-title">Link walkthrough photos</h4><p>Photos stay with this walkthrough. Select each generated case that the photo supports.</p><ul role="list">{photos.map((photo) => { const selected = new Set(attachmentLinks.filter((link) => link.attachment_id === photo.id).map((link) => link.maintenance_request_id)); return <li key={photo.id}>{urls[photo.storage_path] && <img src={urls[photo.storage_path]} alt={photo.file_name} />}<fieldset><legend>{photo.file_name}</legend>{childRequests.map((child) => <label key={child.id}><input type="checkbox" checked={selected.has(child.id)} disabled={busy} onChange={(event) => onChange(photo.id, event.target.checked ? [...selected, child.id] : [...selected].filter((id) => id !== child.id))} /> {child.title}</label>)}</fieldset></li>; })}</ul></section>;
}

function LinkedWalkthroughPhotos({ attachments, urls }) {
  if (attachments.length === 0) return null;
  return <section className="case-section linked-walkthrough-photos" aria-labelledby="linked-walkthrough-photos-title"><h4 id="linked-walkthrough-photos-title">Linked walkthrough photos</h4><div>{attachments.map((attachment) => urls[attachment.storage_path] ? <a href={urls[attachment.storage_path]} target="_blank" rel="noreferrer" key={attachment.id}><img src={urls[attachment.storage_path]} alt={attachment.file_name} /></a> : null)}</div></section>;
}

function getRequestSourceLabel(sourceType) {
  return {
    "qr-public": "Public QR request",
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
