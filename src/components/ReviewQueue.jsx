import { useEffect, useState } from "react";
import { Check, CheckCheck, ChevronDown, ShoppingCart, Trash2, Wrench } from "lucide-react";
import { AttachmentList, EditableItem } from "./ItemColumn";

export function ReviewQueue({
  items,
  busy,
  onApprove,
  onApproveAll,
  onItemChange,
  onReject,
  onDeleteAttachment,
  mediaUrls,
  openRequest = 0,
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    if (openRequest > 0) setIsCollapsed(false);
  }, [openRequest]);

  if (items.length === 0) return null;

  const isOpen = !isCollapsed;

  return (
    <section className={`panel review-queue${isOpen ? "" : " is-collapsed"}`} aria-labelledby="review-queue-title" aria-describedby={isOpen ? "review-queue-description" : undefined}>
      <div className="panel-title">
        <h2 id="review-queue-title">
          <button className="panel-toggle" type="button" aria-expanded={isOpen} aria-controls="review-queue-items" onClick={() => setIsCollapsed((current) => !current)}>
            <ChevronDown className="panel-toggle-icon" size={17} aria-hidden="true" />
            <span>Review Queue</span>
          </button>
        </h2>
        <span aria-label={`${items.length} pending review items`}>{items.length}</span>
      </div>
      {isOpen && <div className="review-queue-header">
        <p id="review-queue-description">Check dictated work before it moves into the active lists.</p>
        <button type="button" onClick={onApproveAll} disabled={busy}>
          <CheckCheck size={18} aria-hidden="true" />
          Approve all
        </button>
      </div>}
      <ul className="review-list" id="review-queue-items" role="list" hidden={!isOpen}>
        {items.map((item) => (
          <li className="review-card" key={item.id}>
            <div className="review-item-kind">
              {item.kind === "material" ? <ShoppingCart size={16} aria-hidden="true" /> : <Wrench size={16} aria-hidden="true" />}
              {getReviewItemLabel(item)}
            </div>
            <EditableItem item={item} onSave={onItemChange} showInlineEdit />
            <AttachmentList attachments={item.attachments} mediaUrls={mediaUrls} onDelete={onDeleteAttachment} />
            <div className="review-actions">
              <button type="button" onClick={() => onApprove(item)} disabled={busy}>
                <Check size={17} aria-hidden="true" />
                Approve
              </button>
              <button className="danger-button" type="button" onClick={() => onReject(item)} disabled={busy}>
                <Trash2 size={17} aria-hidden="true" />
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function getReviewItemLabel(item) {
  if (item.kind !== "material") return "Task";
  return item.material_type === "collect" ? "Collect / Bring" : "Shopping List";
}
