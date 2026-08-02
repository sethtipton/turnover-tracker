import { Check, CheckCheck, ShoppingCart, Trash2, Wrench } from "lucide-react";
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
}) {
  if (items.length === 0) return null;

  return (
    <section className="panel review-queue" aria-labelledby="review-queue-title" aria-describedby="review-queue-description">
      <div className="review-queue-header">
        <div>
          <p className="eyebrow">Needs a decision</p>
          <h2 id="review-queue-title">Review Queue <span>{items.length}</span></h2>
          <p id="review-queue-description">Check dictated work before it moves into the active lists.</p>
        </div>
        <button type="button" onClick={onApproveAll} disabled={busy}>
          <CheckCheck size={18} aria-hidden="true" />
          Approve all
        </button>
      </div>
      <ul className="review-list" role="list">
        {items.map((item) => (
          <li className="review-card" key={item.id}>
            <div className="review-item-kind">
              {item.kind === "material" ? <ShoppingCart size={16} aria-hidden="true" /> : <Wrench size={16} aria-hidden="true" />}
              {getReviewItemLabel(item)}
            </div>
            <EditableItem item={item} onSave={onItemChange} />
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
