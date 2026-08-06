import { useEffect, useState } from "react";
import { ChevronDown, CirclePlus, Info, Mic, Plus, Search, Wrench, X } from "lucide-react";
import { formatBytes, formatDuration } from "../lib/media";
import { STATUS_LABELS } from "../lib/seed";

export function ScopeSelector({
  properties,
  units,
  selectedPropertyId,
  selectedUnitId,
  onPropertyChange,
  onUnitChange,
}) {
  const propertyUnits = units.filter((unit) => unit.property_id === selectedPropertyId);

  return (
    <section className="scope-select-bar" aria-label="Property and work scope">
      <label className="form-field" htmlFor="property-select">
        <span className="visually-hidden">Property</span>
        <select
          id="property-select"
          name="property"
          value={selectedPropertyId}
          onChange={(event) => onPropertyChange(event.target.value)}
        >
          <option value="">Select a property</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>{property.name}</option>
          ))}
        </select>
      </label>
      <label className="form-field" htmlFor="scope-select">
        <span className="visually-hidden">Scope</span>
        <select
          id="scope-select"
          name="scope"
          value={selectedUnitId}
          onChange={(event) => onUnitChange(event.target.value)}
          disabled={!selectedPropertyId}
        >
          <option value="">Whole Property</option>
          {propertyUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>{unit.name}</option>
          ))}
        </select>
      </label>
    </section>
  );
}

export function SummaryGrid({
  items,
  workMode,
  onToggleWorkMode,
  dictationState,
  audioLevel,
  onStartDictation,
  onStopDictation,
  query,
  statusFilter,
  onQueryChange,
  onStatusChange,
  onMetricClick,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pendingCount = items.filter((item) => item.status === "pending-review" && item.kind !== "dictation").length;
  const isRecording = dictationState === "recording";
  return (
    <section className="summary-grid" aria-label="Selected scope summary">
      <div className="summary-main">
        <div className="summary-metrics">
          <Metric tone="approved" label="Approved" value={items.filter((item) => item.kind === "task" && item.status === "approved").length} onClick={() => onMetricClick?.("approved")} />
          <Metric tone="review" label="Pending" value={pendingCount} onClick={() => onMetricClick?.("review")} />
          <Metric tone="shopping" label="Shopping" value={items.filter((item) => item.material_type === "shopping").length} onClick={() => onMetricClick?.("shopping")} />
        </div>
        <div className="summary-actions" aria-label="Task actions">
          {!workMode && (
            <div className="dictation-control">
              <button
                className={isRecording ? "recording" : ""}
                type="button"
                onClick={isRecording ? onStopDictation : onStartDictation}
                aria-describedby={isRecording ? "recording-status" : undefined}
              >
                <Mic size={18} aria-hidden="true" />
                {isRecording ? "Stop recording" : "Dictate Tasks"}
              </button>
              {isRecording && (
                <div className="audio-meter" role="progressbar" aria-label="Microphone input level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(audioLevel * 100)}>
                  <span style={{ transform: `scaleX(${Math.max(0.04, audioLevel)})` }} />
                </div>
              )}
              {isRecording && <span className="visually-hidden" id="recording-status">Recording is in progress.</span>}
            </div>
          )}
          <button className={workMode ? "work-mode-button active" : "work-mode-button"} type="button" onClick={onToggleWorkMode} aria-pressed={workMode}>
            <Wrench size={18} aria-hidden="true" />
            Work Mode
          </button>
          {!workMode && (
            <button
              className="filter-toggle"
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="task-search-controls"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              {filtersOpen ? <X size={17} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
              {filtersOpen ? "Close search" : "Search & filter"}
            </button>
          )}
        </div>
      </div>
      {!workMode && filtersOpen && (
        <FiltersBar
          query={query}
          statusFilter={statusFilter}
          onQueryChange={onQueryChange}
          onStatusChange={onStatusChange}
        />
      )}
    </section>
  );
}

export function EmptyScopePanel() {
  return (
    <section className="panel empty-scope-panel" aria-labelledby="empty-scope-title">
      <h2 id="empty-scope-title">Select a property</h2>
      <p>Choose a property, then view work for the whole property or one of its units.</p>
    </section>
  );
}

export function FiltersBar({ query, statusFilter, onQueryChange, onStatusChange }) {
  return (
    <div className="filter-disclosure">
      <form className="control-bar" id="task-search-controls" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="filter-field" htmlFor="task-search">
          <span className="visually-hidden">Search tasks, notes, and materials</span>
          <input
            id="task-search"
            name="search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search tasks, notes, materials..."
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        <label className="filter-field" htmlFor="status-filter">
          <span className="visually-hidden">Filter by status</span>
          <select
            id="status-filter"
            name="status"
            value={statusFilter}
            onChange={(event) => onStatusChange(event.target.value)}
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </form>
    </div>
  );
}

export function QuickAddPanel({ draft, busy, onDraftChange, onSubmit }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={`panel add-panel ${isOpen ? "is-open" : ""}`} aria-labelledby="add-work-title">
      <h2 id="add-work-title">
        <button
          className="add-work-toggle"
          type="button"
          aria-expanded={isOpen}
          aria-controls="add-work-content"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="add-work-toggle-label">
            <CirclePlus size={19} aria-hidden="true" />
            Add Work
          </span>
          <span className="add-work-toggle-meta">Task or material</span>
          <ChevronDown className="add-work-toggle-icon" size={18} aria-hidden="true" />
        </button>
      </h2>
      <div className="add-work-content" id="add-work-content" hidden={!isOpen}>
        <p>Create approved tasks, shopping items, or collect/bring reminders.</p>
        <form
          className={draft.kind === "material" ? "add-form has-material-type" : "add-form"}
          onSubmit={async (event) => {
            const added = await onSubmit(event);
            if (added) setIsOpen(false);
          }}
        >
          <label className="form-field" htmlFor="new-item-kind">
            <span>Type</span>
            <select
              id="new-item-kind"
              name="kind"
              value={draft.kind}
              onChange={(event) => onDraftChange({ kind: event.target.value })}
            >
              <option value="task">Task</option>
              <option value="material">Material</option>
            </select>
          </label>
          {draft.kind === "material" && (
            <label className="form-field" htmlFor="new-material-list">
              <span>List</span>
              <select
                id="new-material-list"
                name="materialType"
                value={draft.material_type}
                onChange={(event) => onDraftChange({ material_type: event.target.value })}
              >
                <option value="shopping">Shopping List</option>
                <option value="collect">Collect / Bring</option>
              </select>
            </label>
          )}
          <label className="form-field" htmlFor="new-item-title">
            <span>Item</span>
            <input
              id="new-item-title"
              name="title"
              value={draft.title}
              onChange={(event) => onDraftChange({ title: event.target.value })}
              placeholder="What needs to be done?"
              enterKeyHint="done"
              maxLength="140"
              required
            />
          </label>
          <label className="form-field" htmlFor="new-item-note">
            <span>Note <span className="optional-label">optional</span></span>
            <input
              id="new-item-note"
              name="note"
              value={draft.note}
              onChange={(event) => onDraftChange({ note: event.target.value })}
              placeholder="Add useful details"
              maxLength="500"
            />
          </label>
          <button disabled={busy} type="submit"><Plus size={17} aria-hidden="true" /> Add</button>
        </form>
      </div>
    </section>
  );
}

export function DictationInbox({ recordings, scopeName, onSave, onDelete }) {
  if (recordings.length === 0) return null;

  return (
    <section className="panel" aria-labelledby="dictation-inbox-title">
      <div className="panel-title">
        <h2 id="dictation-inbox-title">Dictation Inbox</h2>
        <span>{recordings.length} unsaved</span>
      </div>
      <ul className="recording-list" role="list">
        {recordings.map((recording) => (
          <li className="recording-card" key={recording.id}>
            <audio controls src={recording.url} aria-label={`Preview ${formatDuration(recording.durationMs)} dictation recording`} />
            <p>
              {formatDuration(recording.durationMs)} / {formatBytes(recording.size)}
              {recording.mimeType ? ` / ${recording.mimeType}` : ""}
              {typeof recording.peakLevel === "number" ? ` / mic ${Math.round(recording.peakLevel * 100)}%` : ""}
            </p>
            <div className="recording-actions">
              <button type="button" onClick={() => onSave(recording)}>Save to {scopeName}</button>
              <button className="ghost" type="button" onClick={() => onDelete(recording.id)}>Delete recording</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StatusMessage({ message, onDismiss }) {
  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => onDismiss?.(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  return (
    <div className="status-announcer" aria-live="polite" aria-atomic="true">
      {message && (
        <p className="message" key={message}>
          <Info size={17} aria-hidden="true" />
          <span>{message}</span>
          <button className="icon-button status-dismiss-button" type="button" onClick={() => onDismiss?.("")} aria-label="Dismiss message">
            <X size={16} aria-hidden="true" />
          </button>
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, tone, onClick }) {
  const isInteractive = value > 0 && Boolean(onClick);
  const Component = isInteractive ? "button" : "span";

  return (
    <Component
      className={`metric metric-${tone}${isInteractive ? " is-interactive" : ""}`}
      {...(isInteractive ? { type: "button", onClick, "aria-label": `Show ${value} ${label.toLowerCase()} items` } : {})}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </Component>
  );
}
