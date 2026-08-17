import { useEffect, useState } from "react";
import { ChevronDown, CirclePlus, ImagePlus, Info, Mic, Plus, Search, Wrench, X } from "lucide-react";
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
        <ChevronDown className="scope-select-icon" size={18} aria-hidden="true" />
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
        <ChevronDown className="scope-select-icon" size={18} aria-hidden="true" />
      </label>
    </section>
  );
}

export function SummaryGrid({
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
  onAddWork,
  addWorkOpen,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isRecording = dictationState === "recording";

  function toggleFilters() {
    if (!filtersOpen) onAddWork(false);
    setFiltersOpen((current) => !current);
  }

  function toggleAddWork() {
    setFiltersOpen(false);
    onAddWork();
  }

  return (
    <section className="summary-grid" aria-label="Selected scope summary">
      <div className="summary-toolbar">
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
            {workMode ? "Turn off work mode" : "Work Mode"}
          </button>
          {!workMode && (
            <button
              className="filter-toggle"
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="task-search-controls"
              onClick={toggleFilters}
            >
              {filtersOpen ? <X size={17} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
              {filtersOpen ? "Close search" : "Search & filter"}
            </button>
          )}
          {!workMode && (
            <button
              className="summary-add-button"
              type="button"
              aria-expanded={addWorkOpen}
              aria-controls="add-work-panel"
              onClick={toggleAddWork}
            >
              <CirclePlus size={17} aria-hidden="true" /> Add
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

export function QuickAddPanel({
  variant = "default",
  draft,
  busy,
  onDraftChange,
  onSubmit,
  isOpen,
  onClose,
  inline = false,
  panelId = "add-work-panel",
  presetKind = "",
  presetMaterialType = "",
}) {
  const [imageFile, setImageFile] = useState(null);
  const [imageInputKey, setImageInputKey] = useState(0);
  const isMaintenanceQuickAdd = variant === "maintenance";
  const showKindChoices = !presetKind;
  const showMaterialChoices = draft.kind === "material" && !presetMaterialType;
  const itemLabel = draft.kind === "material" ? "Material" : isMaintenanceQuickAdd || inline ? "Task" : "Item";
  const itemPlaceholder = draft.kind === "material"
    ? draft.material_type === "collect"
      ? "What needs to be collected or brought?"
      : "What needs to be purchased?"
    : "What needs to be done?";

  return (
    <section className={`panel add-panel${inline ? " column-quick-add" : ""}`} id={panelId} aria-label={inline ? `Add ${itemLabel.toLowerCase()}` : undefined} aria-labelledby={inline || isMaintenanceQuickAdd ? undefined : "add-work-title"} hidden={!isOpen}>
      <div className="add-work-content" id="add-work-content">
        {!inline && !isMaintenanceQuickAdd && <div className="add-work-heading">
          <div>
            <h2 id="add-work-title">Add tasks or materials</h2>
          </div>
          <button className="icon-button add-work-close" type="button" onClick={onClose} aria-label="Close add">
            <X size={17} aria-hidden="true" />
          </button>
        </div>}
        <form
          className={`add-form${draft.kind === "material" ? " has-material-type" : ""}${presetKind ? " has-preset-type" : ""}`}
          onSubmit={async (event) => {
            const added = await onSubmit(event, imageFile);
            if (added) {
              setImageFile(null);
              setImageInputKey((current) => current + 1);
              onClose?.();
            }
          }}
        >
          {showKindChoices && (
            <fieldset className="form-field add-choice-field">
              <legend>{isMaintenanceQuickAdd ? "Add a" : "Type"}</legend>
              <div className="add-choice-options">
                <label className="add-choice-option" htmlFor="new-item-kind-task">
                  <input
                    id="new-item-kind-task"
                    name="kind"
                    type="radio"
                    value="task"
                    checked={draft.kind === "task"}
                    onChange={(event) => onDraftChange({ kind: event.target.value })}
                  />
                  <span>Task</span>
                </label>
                <label className="add-choice-option" htmlFor="new-item-kind-material">
                  <input
                    id="new-item-kind-material"
                    name="kind"
                    type="radio"
                    value="material"
                    checked={draft.kind === "material"}
                    onChange={(event) => onDraftChange({ kind: event.target.value })}
                  />
                  <span>Material</span>
                </label>
              </div>
            </fieldset>
          )}
          {showMaterialChoices && (
            <fieldset className="form-field add-choice-field">
              <legend>List</legend>
              <div className="add-choice-options">
                <label className="add-choice-option" htmlFor="new-material-list-shopping">
                  <input
                    id="new-material-list-shopping"
                    name="materialType"
                    type="radio"
                    value="shopping"
                    checked={draft.material_type === "shopping"}
                    onChange={(event) => onDraftChange({ material_type: event.target.value })}
                  />
                  <span>Shopping List</span>
                </label>
                <label className="add-choice-option" htmlFor="new-material-list-collect">
                  <input
                    id="new-material-list-collect"
                    name="materialType"
                    type="radio"
                    value="collect"
                    checked={draft.material_type === "collect"}
                    onChange={(event) => onDraftChange({ material_type: event.target.value })}
                  />
                  <span>Collect / Bring</span>
                </label>
              </div>
            </fieldset>
          )}
          <label className="form-field" htmlFor="new-item-title">
            <span>{itemLabel}</span>
            <input
              id="new-item-title"
              name="title"
              value={draft.title}
              onChange={(event) => onDraftChange({ title: event.target.value })}
              placeholder={itemPlaceholder}
              enterKeyHint="done"
              maxLength="140"
              required
              autoFocus={inline}
            />
          </label>
          <label className="form-field" htmlFor="new-item-note">
            <span>{isMaintenanceQuickAdd ? "Details" : "Note"} <span className="optional-label">optional</span></span>
            <input
              id="new-item-note"
              name="note"
              value={draft.note}
              onChange={(event) => onDraftChange({ note: event.target.value })}
              placeholder={isMaintenanceQuickAdd ? "Add location, size, color, model, quantity, or other useful details." : "Add useful details"}
              maxLength="500"
            />
          </label>
          <label className={`add-image-button${imageFile ? " is-selected" : ""}`} htmlFor="new-item-image" title={imageFile ? `${imageFile.name} selected` : "Attach photo"}>
            <ImagePlus size={18} aria-hidden="true" />
            <span>Add Image</span>
            <input
              key={imageInputKey}
              id="new-item-image"
              name="image"
              type="file"
              accept="image/*"
              onChange={(event) => setImageFile(event.target.files?.[0] || null)}
            />
          </label>
          <div className="add-form-actions">
            <button disabled={busy} type="submit"><Plus size={17} aria-hidden="true" /> {isMaintenanceQuickAdd ? `Add ${draft.kind}` : "Add"}</button>
          </div>
        </form>
      </div>
    </section>
  );
}

export function DictationInbox({ recordings, scopeName, onSave, onDelete }) {
  if (recordings.length === 0) return null;

  return (
    <section className="panel dictation-inbox-title" aria-labelledby="dictation-inbox-title">
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
