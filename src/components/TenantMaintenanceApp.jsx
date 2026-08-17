import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileAudio, Mic, Send, Wrench, X } from "lucide-react";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import {
  REQUEST_STATUS_LABELS,
  addMaintenanceInformation,
  getMaintenanceAttachmentUrl,
  loadMaintenanceRequests,
  loadTenantMaintenanceDetail,
  submitMaintenanceRequest,
} from "../lib/maintenance";
import { formatBytes, formatDuration } from "../lib/media";
import { AppFooter } from "./AppFooter";

export function TenantMaintenanceAccess({ onSignIn }) {
  return <main className="tenant-access" id="tenant-maintenance-content" tabIndex="-1"><p className="eyebrow">Tree City Rentals</p><h1>Maintenance requests</h1><p>Sign in with the Google account connected to your rental home to report a maintenance issue or check a request.</p><button type="button" onClick={onSignIn}>Sign in to maintenance requests</button></main>;
}

export function TenantMaintenanceDialog({ open, onClose, user, tenantUnits, preview = false }) {
  const dialogRef = useRef(null);
  const [selectedMembershipId, setSelectedMembershipId] = useState(tenantUnits[0]?.membership_id || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedUnit = tenantUnits.find((unit) => unit.membership_id === selectedMembershipId) || tenantUnits[0];

  useEffect(() => {
    if (!tenantUnits.some((unit) => unit.membership_id === selectedMembershipId)) {
      setSelectedMembershipId(tenantUnits[0]?.membership_id || "");
    }
  }, [selectedMembershipId, tenantUnits]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();

    if ("closedBy" in HTMLDialogElement.prototype) return undefined;
    function closeOnBackdrop(event) {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const clickedInside = bounds.top <= event.clientY && event.clientY <= bounds.bottom
        && bounds.left <= event.clientX && event.clientX <= bounds.right;
      if (!clickedInside) dialog.close();
    }
    dialog.addEventListener("click", closeOnBackdrop);
    return () => dialog.removeEventListener("click", closeOnBackdrop);
  }, [open]);

  async function handleSubmit({ description, audioFile, photoFiles }) {
    if (!selectedUnit) return;
    setBusy(true);
    setMessage("");
    try {
      await submitMaintenanceRequest({
        workspaceId: selectedUnit.workspace_id,
        propertyId: selectedUnit.property_id,
        unitId: selectedUnit.unit_id,
        tenantMembershipId: preview ? null : selectedUnit.membership_id,
        user,
        description,
        audioFile,
        photoFiles,
        sourceType: preview ? "admin-test" : undefined,
        visibility: "tenant",
      });
      setMessage(preview ? "Test request received. It was saved to the selected unit’s case files." : "Request received. We’ll review it and keep you updated.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialogRef} className="tenant-maintenance-dialog" closedby="any" aria-labelledby="tenant-dialog-title" onClose={onClose}><header><div><p className="eyebrow">Resident support</p><h2 id="tenant-dialog-title">Report a maintenance problem</h2><p>We’ll send this directly to the property team for your rental home.</p></div><button className="dialog-close" type="button" onClick={() => dialogRef.current?.close()}><X size={19} aria-hidden="true" /><span className="visually-hidden">Close maintenance request form</span></button></header>{tenantUnits.length > 1 ? <fieldset className="tenant-dialog-unit-picker"><legend>Rental home</legend>{tenantUnits.map((unit) => <label key={unit.membership_id}><input type="radio" name="dialog-tenant-unit" value={unit.membership_id} checked={unit.membership_id === selectedMembershipId} onChange={() => setSelectedMembershipId(unit.membership_id)} /><span>{unit.property_name} · {unit.unit_name}</span></label>)}</fieldset> : selectedUnit ? <p className="tenant-dialog-scope">For {selectedUnit.property_name} · {selectedUnit.unit_name}</p> : null}{selectedUnit && <TenantRequestComposer title="Describe the issue" propertyId={selectedUnit.property_id} unitId={selectedUnit.unit_id} busy={busy} onSubmit={handleSubmit} submitLabel="Submit request" />}{message && <p className="message" role="status">{message}</p>}<p className="tenant-dialog-route-note">You can also visit the maintenance-request link provided by your property team.</p></dialog>;
}

export function TenantMaintenanceApp({ user, tenantUnits, preview = false, onExitPreview, onSignOut }) {
  const [selectedMembershipId, setSelectedMembershipId] = useState(tenantUnits[0]?.membership_id || "");
  const [requests, setRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [detail, setDetail] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedUnit = tenantUnits.find((unit) => unit.membership_id === selectedMembershipId) || tenantUnits[0];

  const refresh = useCallback(async ({ keepSelection = true } = {}) => {
    try {
      const next = await loadMaintenanceRequests({ workspaceId: preview ? selectedUnit?.workspace_id : undefined, tenant: true });
      const scoped = preview
        ? next.filter((request) => request.unit_id === selectedUnit?.unit_id && request.source_type === "admin-test")
        : next;
      setRequests(scoped);
      if (scoped.length === 0) setDetail(null);
      setSelectedRequestId((currentId) => (
        keepSelection && scoped.some((request) => request.id === currentId)
          ? currentId
          : scoped[0]?.id || ""
      ));
    } catch (error) {
      setMessage(error.message);
    }
  }, [preview, selectedUnit?.unit_id, selectedUnit?.workspace_id]);

  useEffect(() => {
    refresh({ keepSelection: false });
  }, [refresh]);

  useEffect(() => {
    if (!selectedRequestId) return undefined;
    let active = true;
    loadTenantMaintenanceDetail(selectedRequestId)
      .then((nextDetail) => { if (active) setDetail(nextDetail); })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [selectedRequestId]);

  async function handleSubmit({ description, audioFile, photoFiles }) {
    if (!selectedUnit) return;
    setBusy(true);
    try {
      const request = await submitMaintenanceRequest({
        workspaceId: selectedUnit.workspace_id,
        propertyId: selectedUnit.property_id,
        unitId: selectedUnit.unit_id,
        tenantMembershipId: preview ? null : selectedUnit.membership_id,
        user,
        description,
        audioFile,
        photoFiles,
        sourceType: preview ? "admin-test" : undefined,
        visibility: "tenant",
      });
      setMessage("Request received. We’ll review it and keep you updated.");
      await refresh({ keepSelection: false });
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
      await addMaintenanceInformation({
        request: detail.request,
        user,
        content: description,
        audioFile,
        photoFiles,
        visibility: "tenant",
      });
      setMessage("Additional information sent.");
      await refresh();
      setDetail(await loadTenantMaintenanceDetail(detail.request.id));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <a className="skip-link" href="#tenant-maintenance-content">Skip to maintenance requests</a>
      <main className="tenant-shell" id="tenant-maintenance-content" tabIndex="-1">
        <header className="tenant-header">
          <div>
            <p className="eyebrow">Tree City Rentals</p>
            <h1>Maintenance requests</h1>
            <p>Tell us what’s happening. Photos and voice messages are welcome.</p>
          </div>
          {preview && <span className="tenant-preview-badge">Admin preview</span>}
        </header>

        {tenantUnits.length > 1 && (
          <fieldset className="tenant-unit-picker">
            <legend>Rental home</legend>
            {tenantUnits.map((unit) => (
              <label key={unit.membership_id}>
                <input type="radio" name="tenant-unit" value={unit.membership_id} checked={unit.membership_id === selectedMembershipId} onChange={() => setSelectedMembershipId(unit.membership_id)} />
                <span>{unit.property_name} · {unit.unit_name}</span>
              </label>
            ))}
          </fieldset>
        )}

        {selectedUnit && <TenantRequestComposer title="Report a maintenance problem" propertyId={selectedUnit.property_id} unitId={selectedUnit.unit_id} busy={busy} onSubmit={handleSubmit} submitLabel="Submit request" hideTitle={preview} hideDescriptionLabel={preview} />}

        <section className="tenant-request-area" aria-labelledby="my-requests-title">
          <div className="tenant-request-list">
            <h2 id="my-requests-title">My requests</h2>
            {requests.length === 0 ? <p className="empty">No requests yet.</p> : (
              <ul role="list">
                {requests.map((request) => (
                  <li key={request.id}>
                    <button type="button" className={request.id === selectedRequestId ? "active" : ""} onClick={() => setSelectedRequestId(request.id)}>
                      <span>{request.title}</span>
                      <small>{REQUEST_STATUS_LABELS[request.status] || "Received"}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <TenantCaseFile detail={detail} busy={busy} onAddInformation={handleAddInformation} message={message} emptyMessage={requests.length === 0 ? "No requests yet. New requests will appear here after you submit them." : "Select a request to view its status."} />
        </section>
      </main>
      <AppFooter authenticated onAuthAction={preview ? onExitPreview : onSignOut} authActionLabel={preview ? "Return to maintenance workspace" : undefined} />
    </>
  );
}

function TenantCaseFile({ detail, busy, onAddInformation, message, emptyMessage }) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    const attachments = detail?.attachments || [];
    const missing = attachments.filter((attachment) => !urls[attachment.storage_path]);
    if (missing.length === 0) return;
    Promise.all(missing.map(async (attachment) => [attachment.storage_path, await getMaintenanceAttachmentUrl(attachment.storage_path)]))
      .then((entries) => setUrls((current) => ({ ...current, ...Object.fromEntries(entries) })))
      .catch(() => {});
  }, [detail, urls]);

  if (!detail) return <section className="tenant-case-file tenant-case-empty"><Wrench size={24} aria-hidden="true" /><p>{emptyMessage}</p>{message && <p className="message" role="status">{message}</p>}</section>;
  const { request, entries, attachments } = detail;
  return (
    <section className="tenant-case-file" aria-labelledby="tenant-case-title">
      <header>
        <p className={`tenant-status tenant-status-${request.status}`}>{REQUEST_STATUS_LABELS[request.status] || "Received"}</p>
        <h2 id="tenant-case-title">{request.title}</h2>
        <time dateTime={request.created_at}>Submitted {formatDate(request.created_at)}</time>
      </header>
      <div className="tenant-case-history">
        {entries.map((entry) => (
          <article key={entry.id}>
            <p>{entry.transcript || entry.content || (entry.entry_type === "audio" ? "Voice message" : "Photo added")}</p>
            <time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
          </article>
        ))}
      </div>
      <RequestAttachmentList attachments={attachments} urls={urls} />
      {request.status !== "resolved" && <TenantRequestComposer title="Add information" propertyId={request.property_id} unitId={request.unit_id} busy={busy} onSubmit={onAddInformation} submitLabel="Send update" compact />}
      {message && <p className="message" role="status">{message}</p>}
    </section>
  );
}

export function TenantRequestComposer({ title, propertyId, unitId, busy, onSubmit, submitLabel, compact = false, hideTitle = false, hideDescriptionLabel = false }) {
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]);
  const { state, recordings, start, stop, removeRecording } = useAudioRecorder({ propertyId, unitId, onMessage: () => {} });
  const recording = recordings[0] || null;
  const isRecording = state === "recording";

  async function handleSubmit(event) {
    event.preventDefault();
    if (!description.trim() && !recording && photos.length === 0) return;
    await onSubmit({ description, audioFile: recording?.file || null, photoFiles: photos });
    setDescription("");
    setPhotos([]);
    if (recording) removeRecording(recording.id);
  }

  return (
    <section className={`tenant-composer ${compact ? "compact" : ""}`} aria-label={hideTitle ? title : undefined} aria-labelledby={hideTitle ? undefined : `${title.toLowerCase().replaceAll(" ", "-")}-title`}>
      {!hideTitle && <h2 id={`${title.toLowerCase().replaceAll(" ", "-")}-title`}>{title}</h2>}
      <form onSubmit={handleSubmit}>
        <label htmlFor={`${title}-description`}>
          <span className={hideDescriptionLabel ? "visually-hidden" : ""}>{compact ? "What else would you like us to know?" : "Describe what’s happening"}</span>
          <textarea id={`${title}-description`} name="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={compact ? 3 : 5} maxLength="2000" placeholder="For example: the bathroom fan is suddenly very loud." />
        </label>
        <div className="tenant-media-actions">
          <button type="button" className={isRecording ? "recording" : ""} onClick={isRecording ? stop : start} disabled={!propertyId}>
            <Mic size={17} aria-hidden="true" /> {isRecording ? "Stop recording" : "Record voice message"}
          </button>
          <label className="tenant-upload-button" htmlFor={`${title}-photos`}>
            <Camera size={17} aria-hidden="true" /> Add photos
            <input id={`${title}-photos`} type="file" accept="image/*" multiple onChange={(event) => setPhotos([...event.target.files])} />
          </label>
        </div>
        {recording && <div className="tenant-recording"><FileAudio size={17} aria-hidden="true" /><span>Voice message ready · {formatDuration(recording.durationMs)} · {formatBytes(recording.size)}</span><button type="button" onClick={() => removeRecording(recording.id)}>Remove</button></div>}
        {photos.length > 0 && <p className="tenant-file-count">{photos.length} photo{photos.length === 1 ? "" : "s"} ready to send.</p>}
        <button type="submit" disabled={busy}><Send size={17} aria-hidden="true" /> {busy ? "Sending…" : submitLabel}</button>
      </form>
    </section>
  );
}

export function RequestAttachmentList({ attachments, urls }) {
  if (attachments.length === 0) return null;
  return <ul className="tenant-request-attachments" role="list">{attachments.map((attachment) => (
    <li key={attachment.id}>
      {attachment.mime_type?.startsWith("image/") && urls[attachment.storage_path]
        ? <img src={urls[attachment.storage_path]} alt={attachment.file_name} loading="lazy" />
        : attachment.mime_type?.startsWith("audio/") && urls[attachment.storage_path]
          ? <audio controls src={urls[attachment.storage_path]} aria-label={`Voice message: ${attachment.file_name}`} />
          : <span>{attachment.file_name}</span>}
    </li>
  ))}</ul>;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
