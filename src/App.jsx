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
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const userEmail = session?.user?.email?.toLowerCase();
  const isAllowed = Boolean(userEmail && ALLOWED_EMAILS.includes(userEmail));
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) || units[0];

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
        setSelectedUnitId((current) => current || unitData[0]?.id || "");
      } catch (error) {
        setMessage(error.message);
      } finally {
        setBusy(false);
      }
    }

    loadInitialData();
  }, [session, isAllowed]);

  useEffect(() => {
    if (!selectedUnitId || !workspace) return;

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
    ? items.filter((item) => item.status === "approved" && (item.kind === "task" || item.kind === "dictation"))
    : visibleItems.filter((item) => item.kind === "task" || item.kind === "dictation");
  const shoppingItems = visibleItems.filter((item) => item.kind === "material" && item.material_type === "shopping");
  const collectItems = visibleItems.filter((item) => item.kind === "material" && item.material_type === "collect");
  const pendingCount = items.filter((item) => item.status === "pending-review").length;
  const doneCount = items.filter((item) => item.status === "done").length;

  async function reloadSelectedItems() {
    if (!selectedUnitId) return;
    setItems(await loadItems(selectedUnitId));
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `dictation-${Date.now()}.webm`, { type: blob.type });
        setRecordings((current) => [{ id: crypto.randomUUID(), file, url: URL.createObjectURL(blob), unitId: selectedUnitId }, ...current]);
        stream.getTracks().forEach((track) => track.stop());
        setDictationState("idle");
        setMessage("Dictation saved locally for now. AI task creation will be wired after auth, database, and storage are stable.");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setDictationState("recording");
      setMessage("");
    } catch (error) {
      setMessage(error.message);
      setDictationState("idle");
    }
  }

  async function stopDictation() {
    mediaRecorderRef.current?.stop();
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
          <h1>{selectedUnit?.name || "Select a unit"}</h1>
        </div>
        <div className="header-actions">
          {!workMode && (
            <button className={dictationState === "recording" ? "recording" : ""} type="button" onClick={dictationState === "recording" ? stopDictation : startDictation}>
              <Mic size={18} />
              {dictationState === "recording" ? "Stop" : "Dictate Tasks"}
            </button>
          )}
          <button className={workMode ? "work-mode-button active" : "work-mode-button"} type="button" onClick={() => setWorkMode((current) => !current)} aria-pressed={workMode}>
            <ClipboardList size={17} />
            Work Mode
          </button>
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
            onChange={(event) => setSelectedUnitId(event.target.value)}
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </select>
        </section>
      )}

      <section className="summary-grid" aria-label="Unit summary">
        <Metric label="Approved" value={items.filter((item) => item.status === "approved").length} />
        <Metric label="Pending Review" value={pendingCount} />
        <Metric label="Done" value={doneCount} />
        <Metric label="Shopping" value={items.filter((item) => item.material_type === "shopping").length} />
      </section>

      {!workMode && (
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

      {!workMode && recordings.length > 0 && (
        <section className="panel">
          <div className="panel-title">
            <h2>Dictation Inbox</h2>
            <span>{recordings.length} unsaved</span>
          </div>
          <div className="recording-list">
            {recordings.map((recording) => (
              <article className="recording-card" key={recording.id}>
                <audio controls src={recording.url} />
                <div className="recording-actions">
                  <button type="button" onClick={() => saveRecording(recording)}>Save to {selectedUnit?.name}</button>
                  <button className="ghost" type="button" onClick={() => setRecordings((current) => current.filter((item) => item.id !== recording.id))}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {!workMode && (
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

      <section className="work-grid">
        {!workMode && (
          <div className="materials-row">
            <ItemColumn title="Shopping List" icon={<ShoppingCart size={18} />} items={shoppingItems} onItemChange={handleItemChange} onStatus={handleStatusChange} onDelete={handleDeleteItem} onUpload={handleFileUpload} onDeleteAttachment={handleDeleteAttachment} mediaUrls={mediaUrls} />
            <ItemColumn title="Collect / Bring" icon={<Hammer size={18} />} items={collectItems} onItemChange={handleItemChange} onStatus={handleStatusChange} onDelete={handleDeleteItem} onUpload={handleFileUpload} onDeleteAttachment={handleDeleteAttachment} mediaUrls={mediaUrls} />
          </div>
        )}
        <ItemColumn title="Tasks" icon={<ClipboardList size={18} />} items={taskItems} onItemChange={handleItemChange} onStatus={handleStatusChange} onDelete={handleDeleteItem} onUpload={handleFileUpload} onDeleteAttachment={handleDeleteAttachment} mediaUrls={mediaUrls} forceOpen={workMode} compact={workMode} />
      </section>
    </main>
  );
}

function getAttachmentKind(file, fallback = "file") {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("audio/")) return "audio";
  return fallback;
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
            <span>451 Upstairs</span>
            <span>Pending Review: 3</span>
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
