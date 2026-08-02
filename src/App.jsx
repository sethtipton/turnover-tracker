import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ClipboardList,
  Hammer,
  LogOut,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import "./App.css";
import { draftTasksFromDictation } from "./lib/ai";
import {
  addItem,
  deleteAttachment,
  deleteItem,
  getAttachmentUrl,
  getSession,
  loadItems,
  loadUnits,
  loadWorkspace,
  signInWithGoogle,
  signOut,
  updateItem,
  uploadAttachment,
  watchAuth,
} from "./lib/data";
import { ALLOWED_EMAILS, MATERIAL_LABELS, STATUS_LABELS } from "./lib/seed";
import { isSupabaseConfigured } from "./lib/supabase";

const AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];

const emptyDraft = {
  title: "",
  note: "",
  kind: "task",
  material_type: "shopping",
};

const basePath = normalizeBasePath(import.meta.env.BASE_URL);

function App() {
  const [session, setSession] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mediaUrls, setMediaUrls] = useState({});
  const [dictationState, setDictationState] = useState("idle");
  const [recordings, setRecordings] = useState([]);
  const [workMode, setWorkMode] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const audioFrameRef = useRef(null);
  const audioPeakRef = useRef(0);

  const userEmail = session?.user?.email?.toLowerCase();
  const isAllowed = Boolean(userEmail && ALLOWED_EMAILS.includes(userEmail));
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) || null;

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    getSession().then(setSession).catch((error) => setMessage(error.message));
    return watchAuth(setSession);
  }, []);

  useEffect(() => {
    if (!session || !isAllowed) return;

    async function loadInitialData() {
      setBusy(true);
      try {
        const workspaceData = await loadWorkspace();
        const unitData = await loadUnits(workspaceData.id);
        setWorkspace(workspaceData);
        setUnits(unitData);
        setSelectedUnitId(getUnitIdFromCurrentPath(unitData));
      } catch (error) {
        setMessage(error.message);
      } finally {
        setBusy(false);
      }
    }

    loadInitialData();
  }, [session, isAllowed]);

  useEffect(() => {
    return () => {
      stopAudioMonitor(audioContextRef, audioFrameRef, audioPeakRef, setAudioLevel);
      mediaRecorderRef.current?.stream?.getTracks?.().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    function handlePopState() {
      setSelectedUnitId(getUnitIdFromCurrentPath(units));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [units]);

  useEffect(() => {
    if (!selectedUnitId || !workspace) {
      setItems([]);
      setMediaUrls({});
      setWorkMode(false);
      return;
    }

    async function refreshItems() {
      setBusy(true);
      try {
        setItems(await loadItems(selectedUnitId));
      } catch (error) {
        setMessage(error.message);
      } finally {
        setBusy(false);
      }
    }

    refreshItems();
  }, [selectedUnitId, workspace]);

  useEffect(() => {
    const attachments = items.flatMap((item) => item.attachments || []);
    const missing = attachments.filter((attachment) => !mediaUrls[attachment.storage_path]);
    if (missing.length === 0 || !isSupabaseConfigured) return;

    let isMounted = true;
    Promise.all(
      missing.map(async (attachment) => [attachment.storage_path, await getAttachmentUrl(attachment.storage_path)]),
    )
      .then((urls) => {
        if (!isMounted) return;
        setMediaUrls((current) => ({ ...current, ...Object.fromEntries(urls) }));
      })
      .catch((error) => setMessage(error.message));

    return () => {
      isMounted = false;
    };
  }, [items, mediaUrls]);

  const visibleItems = useMemo(() => {
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

  const taskItems = workMode
    ? items.filter((item) => item.status === "approved" && item.kind === "task")
    : visibleItems.filter((item) => item.kind === "task");
  const shoppingItems = visibleItems.filter((item) => item.kind === "material" && item.material_type === "shopping");
  const collectItems = visibleItems.filter((item) => item.kind === "material" && item.material_type === "collect");
  const recordingItems = visibleItems.filter((item) => item.kind === "dictation");
  const pendingCount = items.filter((item) => item.status === "pending-review").length;
  const doneCount = items.filter((item) => item.status === "done").length;

  async function reloadSelectedItems() {
    if (!selectedUnitId) return;
    setItems(await loadItems(selectedUnitId));
  }

  function handleUnitChange(unitId) {
    setSelectedUnitId(unitId);
    updateUnitPath(units.find((unit) => unit.id === unitId));
  }

  async function handleAddItem(event) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title || !workspace || !selectedUnitId) return;

    setBusy(true);
    try {
      await addItem({
        workspace_id: workspace.id,
        unit_id: selectedUnitId,
        title,
        category: draft.kind === "material" ? MATERIAL_LABELS[draft.material_type] : "Task",
        note: draft.note.trim(),
        kind: draft.kind,
        material_type: draft.kind === "material" ? draft.material_type : null,
        status: "approved",
        sort_order: items.length + 1,
      });
      setDraft(emptyDraft);
      await reloadSelectedItems();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(item, status) {
    setItems((current) => current.map((candidate) => (candidate.id === item.id ? { ...candidate, status } : candidate)));
    try {
      await updateItem(item.id, {
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      });
      await reloadSelectedItems();
    } catch (error) {
      setMessage(error.message);
      await reloadSelectedItems();
    }
  }

  async function handleItemChange(item, patch) {
    const nextPatch = {
      title: patch.title?.trim(),
      note: patch.note?.trim() || "",
      status: patch.status,
      material_type: item.kind === "material" ? patch.material_type : null,
      category: item.kind === "material" ? MATERIAL_LABELS[patch.material_type] : item.category || "Task",
      completed_at: patch.status === "done" ? item.completed_at || new Date().toISOString() : null,
    };

    if (!nextPatch.title) return;

    setItems((current) => current.map((candidate) => (candidate.id === item.id ? { ...candidate, ...nextPatch } : candidate)));
    try {
      await updateItem(item.id, nextPatch);
      await reloadSelectedItems();
    } catch (error) {
      setMessage(error.message);
      await reloadSelectedItems();
    }
  }

  async function handleDeleteItem(item) {
    setBusy(true);
    try {
      for (const attachment of item.attachments || []) {
        await deleteAttachment(attachment);
      }
      await deleteItem(item.id);
      await reloadSelectedItems();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFileUpload(item, fileList, kind) {
    const files = [...fileList];
    if (files.length === 0 || !workspace) return;

    setBusy(true);
    try {
      for (const file of files) {
        await uploadAttachment({ workspaceId: workspace.id, unitId: item.unit_id, itemId: item.id, file, kind: getAttachmentKind(file, kind) });
      }
      await reloadSelectedItems();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAttachment(attachment) {
    setBusy(true);
    try {
      await deleteAttachment(attachment);
      await reloadSelectedItems();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function startDictation() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage("Voice recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const startedAt = Date.now();
      audioPeakRef.current = 0;
      chunksRef.current = [];
      startAudioMonitor(stream, setAudioLevel, audioContextRef, audioFrameRef, audioPeakRef);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const durationMs = Date.now() - startedAt;
        const peakLevel = stopAudioMonitor(audioContextRef, audioFrameRef, audioPeakRef, setAudioLevel);
        stream.getTracks().forEach((track) => track.stop());
        setDictationState("idle");
        mediaRecorderRef.current = null;

        if (blob.size < 512) {
          setMessage("Recording was empty. Check microphone permission and try again.");
          return;
        }

        const extension = getAudioExtension(blob.type);
        const file = new File([blob], `dictation-${Date.now()}.${extension}`, { type: blob.type });
        setRecordings((current) => [{
          id: crypto.randomUUID(),
          file,
          url: URL.createObjectURL(blob),
          unitId: selectedUnitId,
          durationMs,
          size: blob.size,
          mimeType: blob.type,
          peakLevel,
        }, ...current]);
        setMessage(peakLevel < 0.015 ? "Recording ready, but no mic input was detected. Check your input device before saving." : "Recording ready. Play it back before saving if you want to confirm audio.");
      };
      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setDictationState("recording");
      setMessage("");
    } catch (error) {
      stopAudioMonitor(audioContextRef, audioFrameRef, audioPeakRef, setAudioLevel);
      setMessage(error.message);
      setDictationState("idle");
    }
  }

  async function stopDictation() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
  }

  async function saveRecording(recording) {
    if (!workspace || !selectedUnitId) return;
    setBusy(true);
    try {
      const dictationItem = await addItem({
        workspace_id: workspace.id,
        unit_id: selectedUnitId,
        title: "Dictated property update",
        category: "Dictation",
        note: "Raw recording saved. AI extraction queued.",
        kind: "dictation",
        status: "pending-review",
        sort_order: items.length + 1,
      });
      const attachment = await uploadAttachment({
        workspaceId: workspace.id,
        unitId: selectedUnitId,
        itemId: dictationItem.id,
        file: recording.file,
        kind: "audio",
      });
      try {
        setMessage("Recording saved. Drafting pending tasks...");
        const draftResult = await draftTasksFromDictation({
          unitId: selectedUnitId,
          dictationItemId: dictationItem.id,
          attachmentId: attachment.id,
        });
        const draftCount = draftResult?.items?.length || 0;
        setMessage(draftCount > 0 ? `Created ${draftCount} pending review item${draftCount === 1 ? "" : "s"}.` : "Recording saved, but no draft items were found.");
      } catch (aiError) {
        setMessage(`Recording saved, but AI drafting could not run: ${aiError.message}`);
      }
      setRecordings((current) => current.filter((item) => item.id !== recording.id));
      await reloadSelectedItems();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) {
    return <LandingPage onSignIn={signInWithGoogle} setupMissing />;
  }

  if (!session) {
    return <LandingPage onSignIn={signInWithGoogle} />;
  }

  if (!isAllowed) {
    return (
      <main className="gate">
        <ShieldCheck size={34} />
        <h1>Access is limited</h1>
        <p>{userEmail} is signed in, but this workspace is only open to approved Tipton Rentals users.</p>
        <button type="button" onClick={signOut}>Sign out</button>
      </main>
    );
  }

  return (
    <main className={`app-shell ${workMode ? "work-mode" : ""}`}>
      <header className="app-header">
        <div>
          <p className="eyebrow">Turnover Tracker</p>
          <h1>{selectedUnit?.name || "Turnover Tracker"}</h1>
        </div>
        <div className="header-actions">
          {!workMode && selectedUnit && (
            <div className="dictation-control">
              <button className={dictationState === "recording" ? "recording" : ""} type="button" onClick={dictationState === "recording" ? stopDictation : startDictation}>
                <Mic size={18} />
                {dictationState === "recording" ? "Stop" : "Dictate Tasks"}
              </button>
              {dictationState === "recording" && (
                <div className="audio-meter" aria-label="Microphone input level">
                  <span style={{ transform: `scaleX(${Math.max(0.04, audioLevel)})` }} />
                </div>
              )}
            </div>
          )}
          {selectedUnit && (
            <button className={workMode ? "work-mode-button active" : "work-mode-button"} type="button" onClick={() => setWorkMode((current) => !current)} aria-pressed={workMode}>
              <ClipboardList size={17} />
              Work Mode
            </button>
          )}
          {!workMode && (
            <button className="ghost" type="button" onClick={signOut}>
              <LogOut size={17} />
              Sign out
            </button>
          )}
        </div>
      </header>

      {!workMode && (
        <section className="unit-select-bar" aria-label="Units">
          <label htmlFor="unit-select">Property</label>
          <select
            id="unit-select"
            name="unit"
            value={selectedUnitId}
            onChange={(event) => handleUnitChange(event.target.value)}
          >
            <option value="">Select a property</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </select>
        </section>
      )}

      {selectedUnit ? (
        <section className="summary-grid" aria-label="Unit summary">
          <Metric label="Approved" value={items.filter((item) => item.status === "approved").length} />
          <Metric label="Pending Review" value={pendingCount} />
          <Metric label="Done" value={doneCount} />
          <Metric label="Shopping" value={items.filter((item) => item.material_type === "shopping").length} />
        </section>
      ) : (
        <section className="panel empty-unit-panel">
          <h2>Select a property</h2>
          <p>Choose a property above to view its tasks, shopping list, collect/bring items, and recordings.</p>
        </section>
      )}

      {!workMode && selectedUnit && (
        <section className="control-bar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, notes, materials..." />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </section>
      )}

      {!workMode && selectedUnit && recordings.length > 0 && (
        <section className="panel">
          <div className="panel-title">
            <h2>Dictation Inbox</h2>
            <span>{recordings.length} unsaved</span>
          </div>
          <div className="recording-list">
            {recordings.map((recording) => (
              <article className="recording-card" key={recording.id}>
                <audio controls src={recording.url} />
                <p>
                  {formatDuration(recording.durationMs)} / {formatBytes(recording.size)}
                  {recording.mimeType ? ` / ${recording.mimeType}` : ""}
                  {typeof recording.peakLevel === "number" ? ` / mic ${Math.round(recording.peakLevel * 100)}%` : ""}
                </p>
                <div className="recording-actions">
                  <button type="button" onClick={() => saveRecording(recording)}>Save to {selectedUnit?.name}</button>
                  <button className="ghost" type="button" onClick={() => setRecordings((current) => current.filter((item) => item.id !== recording.id))}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {!workMode && selectedUnit && (
        <section className="panel add-panel">
          <div>
            <h2>Add Work</h2>
            <p>Create approved tasks, shopping items, or collect/bring reminders.</p>
          </div>
          <form className={draft.kind === "material" ? "add-form has-material-type" : "add-form"} onSubmit={handleAddItem}>
            <select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}>
              <option value="task">Task</option>
              <option value="material">Material</option>
            </select>
            {draft.kind === "material" && (
              <select value={draft.material_type} onChange={(event) => setDraft((current) => ({ ...current, material_type: event.target.value }))}>
                <option value="shopping">Shopping List</option>
                <option value="collect">Collect / Bring</option>
              </select>
            )}
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="+ Quick add item..." />
            <input value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note" />
            <button disabled={busy || !selectedUnitId} type="submit"><Plus size={17} /> Add</button>
          </form>
        </section>
      )}

      {!workMode && message && (
        <p className="message"><AlertCircle size={17} /> {message}</p>
      )}

      {selectedUnit && (
        <section className="work-grid">
          {!workMode && (
            <div className="materials-row">
              <ItemColumn title="Shopping List" icon={<ShoppingCart size={18} />} items={shoppingItems} onItemChange={handleItemChange} onStatus={handleStatusChange} onDelete={handleDeleteItem} onUpload={handleFileUpload} onDeleteAttachment={handleDeleteAttachment} mediaUrls={mediaUrls} />
              <ItemColumn title="Collect / Bring" icon={<Hammer size={18} />} items={collectItems} onItemChange={handleItemChange} onStatus={handleStatusChange} onDelete={handleDeleteItem} onUpload={handleFileUpload} onDeleteAttachment={handleDeleteAttachment} mediaUrls={mediaUrls} />
            </div>
          )}
          <ItemColumn title="Tasks" icon={<ClipboardList size={18} />} items={taskItems} onItemChange={handleItemChange} onStatus={handleStatusChange} onDelete={handleDeleteItem} onUpload={handleFileUpload} onDeleteAttachment={handleDeleteAttachment} mediaUrls={mediaUrls} forceOpen={workMode} compact={workMode} />
          {!workMode && (
            <ItemColumn title="Recordings" icon={<Mic size={18} />} items={recordingItems} onItemChange={handleItemChange} onStatus={handleStatusChange} onDelete={handleDeleteItem} onUpload={handleFileUpload} onDeleteAttachment={handleDeleteAttachment} mediaUrls={mediaUrls} />
          )}
        </section>
      )}
    </main>
  );
}

function getAttachmentKind(file, fallback = "file") {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("audio/")) return "audio";
  return fallback;
}

function normalizeBasePath(path) {
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

function getUnitSlug(unit) {
  return unit.name
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function getCurrentUnitSlug() {
  const path = window.location.pathname;
  if (!path.startsWith(basePath)) return "";
  return decodeURIComponent(path.slice(basePath.length).replace(/^\/+|\/+$/g, ""));
}

function getUnitIdFromCurrentPath(units) {
  const routeSlug = getCurrentUnitSlug().toLowerCase();
  if (!routeSlug) return "";
  return units.find((unit) => getUnitSlug(unit).toLowerCase() === routeSlug)?.id || "";
}

function updateUnitPath(unit) {
  const nextPath = unit ? `${basePath}${encodeURIComponent(getUnitSlug(unit))}` : basePath;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentPath === nextPath) return;
  window.history.pushState({}, "", nextPath);
}

function getSupportedAudioMimeType() {
  return AUDIO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

function getAudioExtension(mimeType) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function startAudioMonitor(stream, setAudioLevel, audioContextRef, audioFrameRef, audioPeakRef) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const audioContext = new AudioContextClass();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  const source = audioContext.createMediaStreamSource(stream);
  const samples = new Uint8Array(analyser.fftSize);
  source.connect(analyser);
  audioContextRef.current = audioContext;

  let lastUpdate = 0;
  function tick(timestamp) {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }

    const rms = Math.sqrt(sum / samples.length);
    const level = Math.min(1, rms * 8);
    audioPeakRef.current = Math.max(audioPeakRef.current, level);
    if (timestamp - lastUpdate > 90) {
      setAudioLevel(level);
      lastUpdate = timestamp;
    }

    audioFrameRef.current = requestAnimationFrame(tick);
  }

  audioFrameRef.current = requestAnimationFrame(tick);
}

function stopAudioMonitor(audioContextRef, audioFrameRef, audioPeakRef, setAudioLevel) {
  const peakLevel = audioPeakRef.current;
  if (audioFrameRef.current) {
    cancelAnimationFrame(audioFrameRef.current);
    audioFrameRef.current = null;
  }

  audioContextRef.current?.close?.();
  audioContextRef.current = null;
  audioPeakRef.current = 0;
  setAudioLevel(0);
  return peakLevel;
}

function formatDuration(durationMs = 0) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function LandingPage({ onSignIn, setupMissing = false }) {
  return (
    <main className="landing">
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Rental turnover command center</p>
          <h1>Walk the unit. Dictate the mess. Leave with a plan.</h1>
          <p>
            A simple family workspace for rental flips: tasks, shopping, collect/bring reminders,
            photos, audio, and a pending-review flow for future AI-created work.
          </p>
          <button type="button" onClick={onSignIn} disabled={setupMissing}>Sign in with Google</button>
          {setupMissing && <p className="setup-note">Supabase environment variables are not configured yet.</p>}
        </div>
        <div className="hero-board" aria-label="Product preview">
          <div className="board-topline">
            <span>No property selected</span>
            <span>Pick a unit</span>
          </div>
          <div className="preview-row done"><Check size={16} /> Patch hallway wall</div>
          <div className="preview-row">Buy white silicone caulk</div>
          <div className="preview-row">Collect drill, ladder, hinge jig</div>
          <div className="dictate-preview"><Mic size={18} /> Dictate Tasks</div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ItemColumn({ title, icon, items, onItemChange, onStatus, onDelete, onUpload, onDeleteAttachment, mediaUrls, forceOpen = false, compact = false }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const panelId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-items`;
  const isOpen = forceOpen || !isCollapsed;

  return (
    <section className={`panel item-column ${isOpen ? "" : "is-collapsed"} ${compact ? "compact" : ""}`}>
      <div className="panel-title">
        <h2>
          <button
            className="panel-toggle"
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={() => {
              if (!forceOpen) setIsCollapsed((current) => !current);
            }}
          >
            <ChevronDown className="panel-toggle-icon" size={17} aria-hidden="true" />
            {icon}
            <span>{title}</span>
          </button>
        </h2>
        <span>{items.length}</span>
      </div>
      <div className="item-list" id={panelId} hidden={!isOpen}>
        {items.length === 0 ? (
          <p className="empty">Nothing here yet.</p>
        ) : (
          items.map((item) => (
            <article className={`item-card status-${item.status}`} key={item.id}>
              <div className="item-main">
                <button className="check-button" type="button" onClick={() => onStatus(item, item.status === "done" ? "approved" : "done")} aria-label={`Toggle ${item.title}`}>
                  {item.status === "done" && <Check size={15} />}
                </button>
                <div>
                  <EditableItem item={item} onSave={onItemChange} compact={compact} />
                </div>
              </div>
              {!compact && (
                <div className="item-actions">
                  <select value={item.status} onChange={(event) => onStatus(item, event.target.value)}>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <label className="attach-button">
                    <Paperclip size={15} />
                    Attach
                    <input type="file" accept="image/*,audio/*" multiple onChange={(event) => onUpload(item, event.target.files, "file")} />
                  </label>
                  <button className="icon-button" type="button" onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
              {!compact && item.attachments?.length > 0 && (
                <div className="attachments">
                  {item.attachments.map((attachment) => (
                    <Attachment key={attachment.id} attachment={attachment} url={mediaUrls[attachment.storage_path]} onDelete={onDeleteAttachment} />
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function EditableItem({ item, onSave, compact = false }) {
  const [draft, setDraft] = useState(() => getItemEditDraft(item));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setDraft(getItemEditDraft(item));
  }, [item]);

  function saveItem(event) {
    event?.preventDefault();
    const nextTitle = draft.title.trim();
    if (!nextTitle) {
      setDraft(getItemEditDraft(item));
      return;
    }
    onSave(item, {
      ...draft,
      title: nextTitle,
    });
    setIsEditing(false);
  }

  function cancelEdit() {
    setDraft(getItemEditDraft(item));
    setIsEditing(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      saveItem(event);
    }

    if (event.key === "Escape") {
      cancelEdit();
    }
  }

  if (!isEditing) {
    return (
      <div className="item-summary">
        <div className="item-title-row">
          <h3>{item.title}</h3>
          <button className="icon-button edit-title-button" type="button" onClick={() => setIsEditing(true)} aria-label={`Edit ${item.title}`}>
            <Pencil size={14} />
          </button>
        </div>
        {!compact && item.note && <p>{item.note}</p>}
      </div>
    );
  }

  return (
    <form className="item-editor" onSubmit={saveItem}>
      <label>
        <span>Title</span>
        <input
          className="item-title-input"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          onKeyDown={handleKeyDown}
          aria-label={`Edit title for ${item.title}`}
          autoFocus
        />
      </label>
      {item.kind === "material" && (
        <label>
          <span>List</span>
          <select
            value={draft.material_type || "shopping"}
            onChange={(event) => setDraft((current) => ({ ...current, material_type: event.target.value }))}
          >
            <option value="shopping">Shopping List</option>
            <option value="collect">Collect / Bring</option>
          </select>
        </label>
      )}
      <label>
        <span>Status</span>
        <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="editor-note">
        <span>Note</span>
        <textarea value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} rows={3} />
      </label>
      <div className="title-edit-actions">
        <button type="submit">Save</button>
        <button className="ghost" type="button" onClick={cancelEdit}>Cancel</button>
      </div>
    </form>
  );
}

function getItemEditDraft(item) {
  return {
    title: item.title || "",
    note: item.note || "",
    material_type: item.material_type || "shopping",
    status: item.status || "approved",
  };
}

function Attachment({ attachment, url, onDelete }) {
  const isImage = attachment.mime_type?.startsWith("image/");
  const isAudio = attachment.mime_type?.startsWith("audio/");
  return (
    <div className="attachment">
      {isImage && url && <img src={url} alt={attachment.file_name} />}
      {isAudio && url && <audio src={url} controls />}
      {!isImage && !isAudio && <span>{attachment.file_name}</span>}
      <button type="button" onClick={() => onDelete(attachment)}>Remove</button>
    </div>
  );
}

export default App;
