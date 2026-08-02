import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Check, ChevronDown, Paperclip, Pencil, Trash2 } from "lucide-react";
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
  mediaUrls,
  forceOpen = false,
  compact = false,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const panelId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-items`;
  const isOpen = forceOpen || !isCollapsed;
  const orderedItems = sortItemsForDisplay(items);

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
            {orderedItems.map((item) => (
              <li
                className={`item-card status-${item.status}`}
                key={item.id}
                style={{ viewTransitionName: `item-${item.id}` }}
              >
                <div className="item-main">
                  <button
                    className="check-button"
                    type="button"
                    onClick={() => handleStatusChange(item, item.status === "done" ? "approved" : "done")}
                    aria-label={item.status === "done" ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
                    aria-pressed={item.status === "done"}
                  >
                    {item.status === "done" && <Check size={15} aria-hidden="true" />}
                  </button>
                  <EditableItem item={item} onSave={handleItemChange} />
                </div>
                {!compact && (
                  <ItemActions
                    item={item}
                    onStatus={handleStatusChange}
                    onDelete={onDelete}
                    onUpload={onUpload}
                  />
                )}
                {!compact && (
                  <AttachmentList
                    attachments={item.attachments}
                    mediaUrls={mediaUrls}
                    onDelete={onDeleteAttachment}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ItemActions({ item, onStatus, onDelete, onUpload }) {
  const statusId = `item-status-${item.id}`;
  const attachmentId = `item-attachment-${item.id}`;

  return (
    <div className="item-actions">
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
      <label className="attach-button" htmlFor={attachmentId}>
        <Paperclip size={15} aria-hidden="true" />
        Attach
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
      <button className="icon-button danger-icon-button" type="button" onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`}>
        <Trash2 size={17} aria-hidden="true" />
      </button>
    </div>
  );
}

export function EditableItem({ item, onSave, showEditLabel = false }) {
  const [draft, setDraft] = useState(() => getItemEditDraft(item));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setDraft(getItemEditDraft(item));
  }, [item]);

  function saveItem(event) {
    event?.preventDefault();
    const nextTitle = draft.title.trim();
    if (!nextTitle) return;
    onSave(item, { ...draft, title: nextTitle });
    setIsEditing(false);
  }

  function cancelEdit() {
    setDraft(getItemEditDraft(item));
    setIsEditing(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") cancelEdit();
  }

  if (!isEditing) {
    return (
      <div className={`item-summary ${showEditLabel ? "has-labeled-edit" : ""}`}>
        <div className={`item-title-row ${showEditLabel ? "has-labeled-edit" : ""}`}>
          <h3>{item.title}</h3>
          <button
            className={showEditLabel ? "ghost edit-item-button" : "icon-button edit-title-button"}
            type="button"
            onClick={() => setIsEditing(true)}
            aria-label={`Edit ${item.title}`}
          >
            <Pencil size={16} aria-hidden="true" />
            {showEditLabel && <span>Edit</span>}
          </button>
        </div>
        {item.note && <p>{item.note}</p>}
      </div>
    );
  }

  const titleId = `edit-title-${item.id}`;
  const listId = `edit-list-${item.id}`;
  const statusId = `edit-status-${item.id}`;
  const noteId = `edit-note-${item.id}`;

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
