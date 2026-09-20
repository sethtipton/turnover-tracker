import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Mic, ShieldAlert, Square, Wrench } from "lucide-react";
import { inspectPublicMaintenanceCapability, submitPublicMaintenanceRequest } from "../lib/maintenance";
import { isMaintenanceQrToken } from "../lib/maintenanceQr";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { formatDuration } from "../lib/media";

const MAX_PHOTOS = 5;

export function MaintenanceQrRoute({ token }) {
  const [state, setState] = useState({ kind: "loading", scope: null });

  useEffect(() => {
    let active = true;
    setState({ kind: "loading", scope: null });

    async function inspect() {
      if (!isMaintenanceQrToken(token)) {
        if (active) setState({ kind: "invalid", scope: null });
        return;
      }
      try {
        const scope = await inspectPublicMaintenanceCapability(token);
        if (active) setState({ kind: "ready", scope });
      } catch {
        if (active) setState({ kind: "invalid", scope: null });
      }
    }

    inspect();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    document.title = "Maintenance request | Tree City Rentals";
  }, []);

  return (
    <>
      <a className="skip-link" href="#maintenance-qr-content">Skip to maintenance request</a>
      <main className="tenant-qr-shell" id="maintenance-qr-content" tabIndex="-1">
        <header className="tenant-qr-header">
          <p className="eyebrow">Tree City Rentals</p>
          <h1><Wrench size={25} aria-hidden="true" /><span>Submit a maintenance request</span></h1>
        </header>

        {state.kind === "loading" && <section className="tenant-qr-card" aria-live="polite"><p>Checking this maintenance link…</p></section>}

        {state.kind === "invalid" && (
          <section className="tenant-qr-card tenant-qr-empty" aria-labelledby="maintenance-link-unavailable">
            <ShieldAlert size={28} aria-hidden="true" />
            <h2 id="maintenance-link-unavailable">This maintenance link is unavailable.</h2>
            <p>Please scan the QR code posted in your rental again or contact your property team.</p>
          </section>
        )}

        {state.kind === "ready" && state.scope && <PublicMaintenanceForm token={token} scope={state.scope} />}
      </main>
    </>
  );
}

function PublicMaintenanceForm({ token, scope }) {
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recorderMessage, setRecorderMessage] = useState("");
  const [receipt, setReceipt] = useState(null);
  const successRef = useRef(null);
  const pendingSubmission = useRef(null);
  const sendingRef = useRef(false);
  const [hasPendingSubmission, setHasPendingSubmission] = useState(false);
  const { state: recordingState, recordings, start, stop, removeRecording } = useAudioRecorder({ enabled: true, onMessage: setRecorderMessage });
  const recording = recordings[0] || null;
  const isRecording = recordingState === "recording";
  const recordingBusy = recordingState !== "idle";
  const homeName = scope.unitName.trim().toLowerCase() === "main unit"
    ? scope.propertyName
    : `${scope.propertyName} · ${scope.unitName}`;
  const recordingStatus = isRecording ? "Recording" : recordingState === "finalizing"
    ? "Finishing recording…" : recordingState === "requesting"
      ? "Opening microphone…" : recording ? "Voice message ready" : "";
  const recordingError = recorderMessage.startsWith("Recording ready") ? "" : recorderMessage;

  useEffect(() => {
    if (receipt) successRef.current?.focus();
  }, [receipt]);

  function handlePhotos(event) {
    const selected = [...event.target.files];
    if (selected.length > MAX_PHOTOS) {
      setError(`Please choose no more than ${MAX_PHOTOS} photos.`);
      setPhotos(selected.slice(0, MAX_PHOTOS));
      return;
    }
    setError("");
    setPhotos(selected);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (sendingRef.current || recordingBusy) return;
    if (!description.trim() && !recording && photos.length === 0) {
      setError("Describe the issue or add a photo or voice recording before sending.");
      return;
    }
    sendingRef.current = true;
    setBusy(true);
    setError("");
    try {
      // Keep the exact same payload and ID until the server confirms receipt.
      // An interrupted response is not evidence that the request wasn't saved.
      pendingSubmission.current ||= {
        token,
        submissionId: crypto.randomUUID(),
        website: new FormData(event.currentTarget).get("website") || "",
        description: description.trim(),
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        photoFiles: photos,
        audioFile: recording?.file || null,
        audioDurationMs: recording?.durationMs || 0,
      };
      setHasPendingSubmission(true);
      await submitPublicMaintenanceRequest(pendingSubmission.current);
      setReceipt(pendingSubmission.current);
    } catch (submissionError) {
      if ([400, 404, 429].includes(submissionError.status)) {
        pendingSubmission.current = null;
        setHasPendingSubmission(false);
      }
      setError(submissionError.message || "We couldn’t send that request. Please try again.");
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <section className="tenant-qr-card tenant-qr-empty maintenance-success" tabIndex="-1" ref={successRef} aria-labelledby="maintenance-success-title">
        <CheckCircle2 size={32} aria-hidden="true" />
        <h2 id="maintenance-success-title">Your request was received.</h2>
        <p>Your request has been saved for review. You can close this page.</p>
        <dl className="maintenance-receipt">
          <div><dt>Rental home</dt><dd>{homeName}</dd></div>
          {receipt.description && <div><dt>Your request</dt><dd className="maintenance-receipt-description">{receipt.description}</dd></div>}
          {receipt.photoFiles.length > 0 && <div><dt>Photos</dt><dd>{receipt.photoFiles.length} attached</dd></div>}
          {receipt.audioFile && <div><dt>Voice message</dt><dd>{formatDuration(receipt.audioDurationMs)} recording attached</dd></div>}
          {receipt.contactName && <div><dt>Name</dt><dd>{receipt.contactName}</dd></div>}
          {receipt.contactEmail && <div><dt>Email</dt><dd>{receipt.contactEmail}</dd></div>}
          {receipt.contactPhone && <div><dt>Phone</dt><dd>{receipt.contactPhone}</dd></div>}
        </dl>
      </section>
    );
  }

  return (
    <>
      <section className="tenant-qr-card tenant-qr-scope" aria-labelledby="maintenance-qr-unit">
        <p className="eyebrow">Your rental home</p>
        <h2 id="maintenance-qr-unit">{homeName}</h2>
        <p>Your request will go to your property manager for review.</p>
      </section>

      <section className="tenant-composer public-maintenance-composer" aria-labelledby="public-maintenance-form-title">
        <h2 id="public-maintenance-form-title">What’s happening?</h2>
        <form onSubmit={handleSubmit}>
          <fieldset disabled={busy || hasPendingSubmission} className="public-maintenance-inputs">
          <legend className="visually-hidden">Request details</legend>
          <label htmlFor="public-maintenance-description">
            <span>Describe the issue</span>
            <textarea id="public-maintenance-description" name="description" value={description} onChange={(event) => { setDescription(event.target.value); setError(""); }} rows="5" maxLength="4000" placeholder="For example: the bathroom fan is suddenly very loud." aria-describedby="public-maintenance-description-help" />
          </label>
          <p id="public-maintenance-description-help" className="field-hint">Add a description, photos, or a voice recording. Please include anything urgent, such as an active leak.</p>

          <div className="public-voice-message" data-state={recordingState}>
            {recordingStatus && <p className="public-recording-status">
              {isRecording ? <span className="public-recording-dot" aria-hidden="true" /> : !recordingBusy && <CheckCircle2 size={18} aria-hidden="true" />}
              <span role="status">{recordingStatus}</span>
              {isRecording ? <RecordingTimer /> : !recordingBusy && recording && <span>· {formatDuration(recording.durationMs)}</span>}
            </p>}
            {recording && !recordingBusy && <audio controls preload="metadata" src={recording.url} aria-label="Play your voice message" />}
            <div className="public-recording-controls">
            <button type="button" className={isRecording ? "recording" : ""} onClick={() => { setRecorderMessage(""); if (isRecording) stop(); else start(); }} disabled={busy || (recordingBusy && !isRecording)}>
              {isRecording ? <Square size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />} {isRecording ? "Stop recording" : recordingState === "finalizing" ? "Finishing recording…" : recordingState === "requesting" ? "Opening microphone…" : recording ? "Record again" : "Record voice message"}
            </button>
            {recording && !recordingBusy && <button className="ghost" type="button" onClick={() => { recordings.forEach(({ id }) => removeRecording(id)); setRecorderMessage(""); }} disabled={busy}>Remove</button>}
            </div>
            {recording && !recordingBusy && recording.peakLevel < 0.015 && <p className="field-hint" role="status">The microphone picked up very little sound. Play your message to check it before sending.</p>}
            {recordingError && <p className="maintenance-error" role="alert">{recordingError}</p>}
          </div>
          <div className="tenant-media-actions">
            <label className="tenant-upload-button" htmlFor="public-maintenance-photos">
              <Camera size={17} aria-hidden="true" /> Add photos
              <input id="public-maintenance-photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple onChange={handlePhotos} disabled={busy} />
            </label>
          </div>
          {photos.length > 0 && <p className="tenant-file-count">{photos.length} photo{photos.length === 1 ? "" : "s"} ready to send.</p>}

          <fieldset className="public-contact-fields">
            <legend>How should we contact you? <span>Optional</span></legend>
            <label htmlFor="public-maintenance-name"><span>Name</span><input id="public-maintenance-name" name="name" type="text" value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength="120" autoComplete="name" /></label>
            <label htmlFor="public-maintenance-email"><span>Email</span><input id="public-maintenance-email" name="email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength="254" autoComplete="email" inputMode="email" /></label>
            <label htmlFor="public-maintenance-phone"><span>Phone</span><input id="public-maintenance-phone" name="phone" type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength="50" autoComplete="tel" inputMode="tel" /></label>
          </fieldset>
          <input className="visually-hidden" tabIndex="-1" autoComplete="off" name="website" aria-hidden="true" />
          </fieldset>
          {error && <p className="maintenance-error" role="alert">{error}</p>}
          {error && hasPendingSubmission && <p className="field-hint">Your details are preserved. Retry to finish this same request.</p>}
          <button type="submit" disabled={busy || recordingBusy}>{busy ? "Sending request…" : hasPendingSubmission ? "Retry request" : "Submit request"}</button>
          {recordingBusy && <p className="field-hint" role="status">{isRecording ? "Stop recording before submitting your request." : "Wait for the recording to be ready before submitting."}</p>}
          {busy && <p className="field-hint" role="status">Uploading attachments and sending your request…</p>}
        </form>
      </section>
    </>
  );
}

function RecordingTimer() {
  const [startedAt] = useState(Date.now);
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return <span className="public-recording-timer" aria-label="Elapsed recording time">· {formatDuration(Math.floor(elapsedMs / 1000) * 1000)}</span>;
}
