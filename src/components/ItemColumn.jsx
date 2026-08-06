import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Archive, Check, ChevronDown, Paperclip, Pencil, Trash2 } from "lucide-react";
import { STATUS_LABELS } from "../lib/seed";

export function ItemColumn({
  title,
  icon,
  items,
  onItemChange,
  onStatus,
  onDelete,
  onUpload,
  onDeleteAttachment,
  onArchive,
  mediaUrls,
  forceOpen = false,
  compact = false,
  openRequest = 0,
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const panelId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-items`;
  const isOpen = forceOpen || !isCollapsed;
  const orderedItems = sortItemsForDisplay(items);

  useEffect(() => {
    if (openRequest > 0) setIsCollapsed(false);
  }, [openRequest]);

  function handleStatusChange(item, status) {
    runCompletionTransition(() => onStatus(item, status), status === "done");
  }

  function handleItemChange(item, patch) {
    const isNewlyDone = item.status !== "done" && patch.status === "done";
    runCompletionTransition(() => onItemChange(item, patch), isNewlyDone);
  }

  return (
    <section className={`panel item-column ${isOpen ? "" : "is-collapsed"} ${compact ? "compact" : ""}`} aria-labelledby={`${panelId}-title`}>
      <div className="panel-title">
        <h2 id={`${panelId}-title`}>
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
        <span aria-label={`${items.length} ${title.toLowerCase()} items`}>{items.length}</span>
      </div>
      <div id={panelId} hidden={!isOpen}>
        {items.length === 0 ? (
          <p className="empty">Nothing here yet.</p>
        ) : (
          <ul className="item-list" role="list">
            {orderedItems.map((item) => <ItemCard
              key={item.id}
              item={item}
              compact={compact}
              mediaUrls={mediaUrls}
              onItemChange={handleItemChange}
              onStatus={handleStatusChange}
              onDelete={onDelete}
              onUpload={onUpload}
              onDeleteAttachment={onDeleteAttachment}
              onArchive={onArchive}
            />)}
          </ul>
        )}
      </div>
    </section>
  );
}

function ItemCard({ item, compact, mediaUrls, onItemChange, onStatus, onDelete, onUpload, onDeleteAttachment, onArchive }) {
  const [editRequest, setEditRequest] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const itemTypeClass = item.kind === "material" ? `material-${item.material_type}` : "work-task";

  return (
    <li className={`item-card ${itemTypeClass} status-${item.status}`} style={{ viewTransitionName: `item-${item.id}` }}>
      <div className="item-main">
        <EditableItem
          item={item}
          editRequest={editRequest}
          onEditingChange={setIsEditing}
          onSave={onItemChange}
          onUpload={onUpload}
          onToggleCompletion={() => onStatus(item, item.status === "done" ? "approved" : "done")}
        />
      </div>
      {!compact && (
        <ItemActions
          item={item}
          isEditing={isEditing}
          onEdit={() => setEditRequest((current) => current + 1)}
          onStatus={onStatus}
          onDelete={onDelete}
          onArchive={onArchive}
        />
      )}
      {!compact && <AttachmentList attachments={item.attachments} mediaUrls={mediaUrls} onDelete={onDeleteAttachment} />}
    </li>
  );
}

function ItemActions({ item, isEditing, onEdit, onStatus, onDelete, onArchive }) {
  const statusId = `item-status-${item.id}`;

  return (
    <div className="item-actions">
      {!isEditing && (
        <button className="icon-button edit-title-button" type="button" onClick={onEdit} aria-label={`Edit ${item.title}`}>
          <Pencil size={16} aria-hidden="true" />
        </button>
      )}
      <button className="icon-button danger-icon-button" type="button" onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`}>
        <Trash2 size={17} aria-hidden="true" />
      </button>
      <label className="visually-hidden" htmlFor={statusId}>Status for {item.title}</label>
      <select
        className={`status-select status-select-${item.status}`}
        id={statusId}
        name={`status-${item.id}`}
        value={item.status}
        onChange={(event) => onStatus(item, event.target.value)}
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      {item.status === "done" && (
        <button
          className="icon-button archive-icon-button"
          type="button"
          onClick={() => onArchive(item)}
          aria-label={`Archive ${item.title}`}
          title="Archive completed item"
        >
          <Archive size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function EditableItem({ item, editRequest = 0, onEditingChange, onSave, onUpload, onToggleCompletion, showInlineEdit = false }) {
  const [draft, setDraft] = useState(() => getItemEditDraft(item));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setDraft(getItemEditDraft(item));
  }, [item]);

  useEffect(() => {
    if (editRequest === 0) return;
    setIsEditing(true);
    onEditingChange?.(true);
  }, [editRequest, onEditingChange]);

  function saveItem(event) {
    event?.preventDefault();
    const nextTitle = draft.title.trim();
    if (!nextTitle) return;
    onSave(item, { ...draft, title: nextTitle });
    setIsEditing(false);
    onEditingChange?.(false);
  }

  function cancelEdit() {
    setDraft(getItemEditDraft(item));
    setIsEditing(false);
    onEditingChange?.(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") cancelEdit();
  }

  function beginEdit() {
    setIsEditing(true);
    onEditingChange?.(true);
  }

  if (!isEditing) {
    return (
      <div className={onToggleCompletion ? "item-summary" : "item-summary without-completion"}>
        <div className={`${onToggleCompletion ? "item-title-row" : "item-title-row without-completion"}${showInlineEdit ? " has-inline-edit" : ""}`}>
          {onToggleCompletion && (
            <button
              className="check-button"
              type="button"
              onClick={onToggleCompletion}
              aria-label={item.status === "done" ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
              aria-pressed={item.status === "done"}
            >
              <Check size={15} aria-hidden="true" />
            </button>
          )}
          <div className="item-title-content">
            <h3>{item.title}</h3>
            {item.note && <p>{item.note}</p>}
          </div>
          {showInlineEdit && (
            <button className="icon-button edit-title-button" type="button" onClick={beginEdit} aria-label={`Edit ${item.title}`}>
              <Pencil size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const titleId = `edit-title-${item.id}`;
  const listId = `edit-list-${item.id}`;
  const statusId = `edit-status-${item.id}`;
  const noteId = `edit-note-${item.id}`;
  const attachmentId = `edit-attachment-${item.id}`;

  return (
    <form className="item-editor" onSubmit={saveItem} onKeyDown={handleKeyDown}>
      <label htmlFor={titleId}>
        <span>Title</span>
        <input
          id={titleId}
          name="title"
          className="item-title-input"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          maxLength="140"
          required
          autoFocus
        />
      </label>
      {item.kind === "material" && (
        <label htmlFor={listId}>
          <span>List</span>
          <select
            id={listId}
            name="materialType"
            value={draft.material_type || "shopping"}
            onChange={(event) => setDraft((current) => ({ ...current, material_type: event.target.value }))}
          >
            <option value="shopping">Shopping List</option>
            <option value="collect">Collect / Bring</option>
          </select>
        </label>
      )}
      <label htmlFor={statusId}>
        <span>Status</span>
        <select id={statusId} name="status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="editor-note" htmlFor={noteId}>
        <span>Note</span>
        <textarea id={noteId} name="note" value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} rows={3} maxLength="500" />
      </label>
      {onUpload && (
        <label className="attach-button editor-attachment" htmlFor={attachmentId}>
          <Paperclip size={15} aria-hidden="true" />
          Attach files
          <input
            id={attachmentId}
            name={`attachments-${item.id}`}
            type="file"
            accept="image/*,audio/*"
            multiple
            onChange={(event) => {
              onUpload(item, event.target.files, "file");
              event.target.value = "";
            }}
          />
        </label>
      )}
      <div className="title-edit-actions">
        <button type="submit">Save changes</button>
        <button className="ghost" type="button" onClick={cancelEdit}>Cancel</button>
      </div>
    </form>
  );
}

export function AttachmentList({ attachments = [], mediaUrls, onDelete }) {
  if (attachments.length === 0) return null;

  return (
    <ul className="attachments" role="list" aria-label="Attachments">
      {attachments.map((attachment) => (
        <li className="attachment" key={attachment.id}>
          <AttachmentPreview attachment={attachment} url={mediaUrls[attachment.storage_path]} />
          <button type="button" onClick={() => onDelete(attachment)} aria-label={`Remove attachment ${attachment.file_name}`}>Remove</button>
        </li>
      ))}
    </ul>
  );
}

function AttachmentPreview({ attachment, url }) {
  const isImage = attachment.mime_type?.startsWith("image/");
  const isAudio = attachment.mime_type?.startsWith("audio/");

  if (isImage && url) return <img src={url} alt={`Task attachment: ${attachment.file_name}`} loading="lazy" />;
  if (isAudio && url) return <audio src={url} controls aria-label={`Audio attachment: ${attachment.file_name}`} />;
  return <span>{attachment.file_name}</span>;
}

function getItemEditDraft(item) {
  return {
    title: item.title || "",
    note: item.note || "",
    material_type: item.material_type || "shopping",
    status: item.status || "approved",
  };
}

function sortItemsForDisplay(items) {
  return [...items].sort((first, second) => (
    Number(first.status === "done") - Number(second.status === "done")
  ));
}

function runCompletionTransition(update, shouldAnimate) {
  const canAnimate = shouldAnimate
    && document.startViewTransition
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!canAnimate) {
    update();
    return;
  }

  document.startViewTransition(() => {
    flushSync(update);
  });
}
