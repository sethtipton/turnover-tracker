import { useState } from "react";
import { ChevronDown, History } from "lucide-react";

export function ActivityLog({ entries }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const panelId = "property-activity-log";

  return (
    <section className={`panel activity-panel ${isCollapsed ? "is-collapsed" : ""}`}>
      <div className="panel-title">
        <h2>
          <button
            className="panel-toggle"
            type="button"
            aria-expanded={!isCollapsed}
            aria-controls={panelId}
            onClick={() => setIsCollapsed((current) => !current)}
          >
            <ChevronDown className="panel-toggle-icon" size={17} aria-hidden="true" />
            <History size={18} aria-hidden="true" />
            <span>Work History</span>
          </button>
        </h2>
        <span aria-label={`${entries.length} history entries`}>{entries.length}</span>
      </div>
      <div id={panelId} hidden={isCollapsed}>
        {entries.length === 0 ? (
          <p className="empty">Completed work and task changes will appear here.</p>
        ) : (
          <ol className="activity-list">
            {entries.map((entry) => (
              <li className={`activity-entry activity-${entry.action}`} key={entry.id}>
                <span className="activity-marker" aria-hidden="true" />
                <div>
                  <p><strong>{getActionLabel(entry.action)}</strong> {entry.label}</p>
                  <p>{getActorLabel(entry.actor_email)}</p>
                </div>
                <time dateTime={entry.created_at}>{formatActivityDate(entry.created_at)}</time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function getActionLabel(action) {
  const labels = {
    created: "Created",
    updated: "Updated",
    completed: "Completed",
    reopened: "Reopened",
    "status-changed": "Changed status of",
    deleted: "Deleted",
    "attachment-added": "Attached a file to",
    "attachment-removed": "Removed a file from",
  };
  return labels[action] || "Updated";
}

function getActorLabel(email) {
  if (!email) return "System";
  return email.split("@")[0];
}

function formatActivityDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
