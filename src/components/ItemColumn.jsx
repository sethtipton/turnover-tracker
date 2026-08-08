import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Archive, ArrowDown, ArrowUp, Check, ChevronDown, Paperclip, Pencil, Trash2 } from "lucide-react";
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
  reorderable = false,
  onReorder,
  tone = "",
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [draggingId, setDraggingId] = useState("");
  const [dragOverId, setDragOverId] = useState("");
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

  const reorderableItems = orderedItems.filter((item) => item.status !== "done");

  function applyOrder(nextItems) {
    if (nextItems.every((item, index) => item.id === reorderableItems[index]?.id)) return;
    onReorder?.(nextItems.map((item) => item.id));
  }

  function moveItem(itemId, direction) {
    const index = reorderableItems.findIndex((item) => item.id === itemId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= reorderableItems.length) return;
    const nextItems = [...reorderableItems];
    [nextItems[index], nextItems[destination]] = [nextItems[destination], nextItems[index]];
    applyOrder(nextItems);
  }

  function handleDrop(event, targetId) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId("");
    setDragOverId("");
    if (!sourceId || sourceId === targetId) return;

    const sourceIndex = reorderableItems.findIndex((item) => item.id === sourceId);
    const targetIndex = reorderableItems.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextItems = [...reorderableItems];
    const [movedItem] = nextItems.splice(sourceIndex, 1);
    nextItems.splice(targetIndex, 0, movedItem);
    applyOrder(nextItems);
  }

  return (
    <section className={`panel item-column ${tone ? `item-column-${tone}` : ""} ${isOpen ? "" : "is-collapsed"} ${compact ? "compact" : ""}`} aria-labelledby={`${panelId}-title`}>
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
              canReorder={reorderable && item.status !== "done"}
              isDragging={draggingId === item.id}
              isDragOver={dragOverId === item.id && draggingId !== item.id}
              canMoveUp={reorderableItems[0]?.id !== item.id}
              canMoveDown={reorderableItems.at(-1)?.id !== item.id}
              onMoveUp={() => moveItem(item.id, -1)}
              onMoveDown={() => moveItem(item.id, 1)}
              onDragStart={(event) => {
                setDraggingId(item.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverId(item.id);
              }}
              onDragLeave={() => setDragOverId((current) => (current === item.id ? "" : current))}
              onDrop={(event) => handleDrop(event, item.id)}
              onDragEnd={() => {
                setDraggingId("");
                setDragOverId("");
              }}
            />)}
          </ul>
        )}
      </div>
    </section>
  );
}

function ItemCard({
  item,
  compact,
  mediaUrls,
  onItemChange,
  onStatus,
  onDelete,
  onUpload,
  onDeleteAttachment,
  onArchive,
  canReorder,
  isDragging,
  isDragOver,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) {
  const [editRequest, setEditRequest] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const itemTypeClass = item.kind === "material" ? `material-${item.material_type}` : "work-task";

  return (
    <li
      className={`item-card ${itemTypeClass} status-${item.status}${canReorder ? " is-reorderable" : ""}${isDragging ? " is-dragging" : ""}${isDragOver ? " is-drag-over" : ""}`}
      style={{ viewTransitionName: `item-${item.id}` }}
      draggable={canReorder}
      onDragStart={canReorder ? onDragStart : undefined}
      onDragOver={canReorder ? onDragOver : undefined}
      onDragLeave={canReorder ? onDragLeave : undefined}
      onDrop={canReorder ? onDrop : undefined}
      onDragEnd={canReorder ? onDragEnd : undefined}
    >
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
          canReorder={canReorder}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      )}
      {!compact && <AttachmentList attachments={item.attachments} mediaUrls={mediaUrls} onDelete={onDeleteAttachment} />}
    </li>
  );
}

function ItemActions({ item, isEditing, onEdit, onStatus, onDelete, onArchive, canReorder, canMoveUp, canMoveDown, onMoveUp, onMoveDown }) {
  const statusId = `item-status-${item.id}`;

  return (
    <div className="item-actions">
      {canReorder && (
        <>
          <button className="icon-button item-move-button" type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label={`Move ${item.title} up`}>
            <ArrowUp size={16} aria-hidden="true" />
          </button>
          <button className="icon-button item-move-button" type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label={`Move ${item.title} down`}>
            <ArrowDown size={16} aria-hidden="true" />
          </button>
        </>
      )}
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
  return [...items].sort((first, second) => {
    const statusDifference = Number(first.status === "done") - Number(second.status === "done");
    if (statusDifference !== 0) return statusDifference;

    const orderDifference = (first.sort_order || 0) - (second.sort_order || 0);
    if (orderDifference !== 0) return orderDifference;

    return new Date(first.created_at).getTime() - new Date(second.created_at).getTime();
  });
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
