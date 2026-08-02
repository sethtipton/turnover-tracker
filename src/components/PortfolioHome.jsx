import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ShoppingCart,
} from "lucide-react";
import { getScopePath } from "../lib/routing";

export function PortfolioHome({
  workspaceName,
  properties,
  units,
  items,
  activityLog,
  busy,
  onOpenScope,
}) {
  const overview = useMemo(
    () => buildPortfolioOverview(properties, units, items, activityLog),
    [activityLog, items, properties, units],
  );

  if (properties.length === 0 && !busy) {
    return (
      <section className="portfolio-home portfolio-empty" aria-labelledby="portfolio-title">
        <p className="eyebrow">{workspaceName}</p>
        <h2 id="portfolio-title">No properties available</h2>
        <p>Your account does not currently have access to a property.</p>
      </section>
    );
  }

  return (
    <div className="portfolio-home" aria-busy={busy}>
      <header className="portfolio-intro">
        <div>
          <p className="eyebrow">{workspaceName}</p>
          <h2 id="portfolio-title">Property portfolio</h2>
        </div>
        <span className="portfolio-count">
          <Building2 size={18} aria-hidden="true" />
          {busy ? "Loading work..." : `${properties.length} ${properties.length === 1 ? "property" : "properties"}`}
        </span>
      </header>

      <dl className="portfolio-summary" aria-label="Portfolio work summary">
        <PortfolioMetric label="Open tasks" value={overview.totals.openTasks} busy={busy} />
        <PortfolioMetric label="Pending review" value={overview.totals.pending} busy={busy} tone="review" />
        <PortfolioMetric label="Shopping items" value={overview.totals.shopping} busy={busy} tone="shopping" />
      </dl>

      {overview.continueProperty && (
        <ContinuePanel
          summary={overview.continueProperty}
          busy={busy}
          onOpenScope={onOpenScope}
        />
      )}

      <section className="property-directory" aria-labelledby="property-directory-title">
        <div className="directory-heading">
          <div>
            <p className="eyebrow">Portfolio directory</p>
            <h2 id="property-directory-title">All properties</h2>
          </div>
        </div>
        <ul className="property-grid" role="list">
          {overview.properties.map((summary, index) => (
            <li key={summary.property.id}>
              <PropertyCard
                summary={summary}
                accentIndex={index}
                busy={busy}
                onOpenScope={onOpenScope}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ContinuePanel({ summary, busy, onOpenScope }) {
  const { property, continueUnit, latestActivity, progress, done, total, open, pending } = summary;
  const scopeLabel = continueUnit?.name || "Whole Property";

  return (
    <section className="portfolio-continue" aria-labelledby="continue-title">
      <PropertyVisual property={property} priority />
      <div className="continue-content">
        <p className="eyebrow">Continue working</p>
        <div>
          <h2 id="continue-title">{property.name}</h2>
          <p className="continue-scope">{scopeLabel}</p>
        </div>
        <p className="continue-activity">
          <Clock3 size={16} aria-hidden="true" />
          {busy ? "Loading recent activity..." : getActivityDescription(latestActivity)}
        </p>
        <div className="continue-progress">
          <ProgressBar value={done} total={total} label={`${property.name} completion`} />
          <span>{total > 0 ? `${progress}% complete` : "Ready for a walkthrough"}</span>
        </div>
        <div className="continue-counts" aria-label={`${property.name} work counts`}>
          <span><ClipboardCheck size={16} aria-hidden="true" /> {busy ? "-" : open} open</span>
          <span><AlertCircle size={16} aria-hidden="true" /> {busy ? "-" : pending} review</span>
        </div>
        <div className="continue-actions">
          <ScopeLink
            className="primary-link"
            property={property}
            unit={continueUnit}
            onOpenScope={onOpenScope}
          >
            Continue in {scopeLabel} <ArrowRight size={17} aria-hidden="true" />
          </ScopeLink>
          {continueUnit && (
            <ScopeLink className="secondary-link" property={property} onOpenScope={onOpenScope}>
              Whole Property
            </ScopeLink>
          )}
        </div>
      </div>
    </section>
  );
}

function PropertyCard({ summary, accentIndex, busy, onOpenScope }) {
  const { property, units, done, total, open, shopping, latestActivity } = summary;
  const status = getPropertyStatus(summary, busy);

  return (
    <article className={`property-card property-accent-${accentIndex % 4}`}>
      <PropertyVisual property={property} />
      <div className="property-card-body">
        <div className="property-card-heading">
          <h3>{property.name}</h3>
          <span className={`property-state property-state-${status.tone}`}>
            {status.tone === "done" && <CheckCircle2 size={14} aria-hidden="true" />}
            {status.tone === "review" && <AlertCircle size={14} aria-hidden="true" />}
            {status.label}
          </span>
        </div>
        <div className="property-progress-row">
          <ProgressBar value={done} total={total} label={`${property.name} completion`} />
          <span>{busy ? "Loading" : total > 0 ? `${done}/${total} done` : "No work logged"}</span>
        </div>
        <div className="property-counts" aria-label={`${property.name} work counts`}>
          <span><ClipboardCheck size={15} aria-hidden="true" /> {busy ? "-" : open} open</span>
          <span><ShoppingCart size={15} aria-hidden="true" /> {busy ? "-" : shopping} shopping</span>
        </div>
        <p className="property-latest">{busy ? "Loading activity..." : getActivityDescription(latestActivity)}</p>
        <nav className="property-scopes" aria-label={`Open ${property.name} scope`}>
          <ScopeLink property={property} onOpenScope={onOpenScope}>Whole Property</ScopeLink>
          {units.map((unit) => (
            <ScopeLink key={unit.id} property={property} unit={unit} onOpenScope={onOpenScope}>
              {unit.name}
            </ScopeLink>
          ))}
        </nav>
      </div>
    </article>
  );
}

function PropertyVisual({ property, priority = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageSrc = property.cover_image_url || property.image_url;
  const marker = getPropertyMarker(property.name);

  return (
    <div className="property-visual">
      {imageSrc && !imageFailed ? (
        <img
          src={imageSrc}
          alt={`Exterior of ${property.name}`}
          width="900"
          height="600"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="property-visual-fallback" aria-hidden="true">
          <Building2 size={42} strokeWidth={1.5} />
          <strong>{marker}</strong>
        </div>
      )}
    </div>
  );
}

function ScopeLink({ property, unit = null, onOpenScope, className = "", children }) {
  function handleClick(event) {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;

    event.preventDefault();
    onOpenScope(property.id, unit?.id || "");
  }

  return (
    <a className={className} href={getScopePath(property, unit)} onClick={handleClick}>
      {children}
    </a>
  );
}

function ProgressBar({ value, total, label }) {
  return (
    <progress aria-label={label} value={total > 0 ? value : 0} max={total > 0 ? total : 1}>
      {total > 0 ? `${Math.round((value / total) * 100)}%` : "0%"}
    </progress>
  );
}

function PortfolioMetric({ label, value, busy, tone = "open" }) {
  return (
    <div className={`portfolio-metric portfolio-metric-${tone}`}>
      <dt>{label}</dt>
      <dd>{busy ? "-" : value}</dd>
    </div>
  );
}

function buildPortfolioOverview(properties, units, items, activityLog) {
  const summaries = properties.map((property) => {
    const propertyItems = items.filter((item) => item.property_id === property.id && item.kind !== "dictation");
    const propertyActivity = activityLog.find((entry) => entry.property_id === property.id) || null;
    const latestItem = propertyItems.reduce((latest, item) => (
      !latest || new Date(item.updated_at) > new Date(latest.updated_at) ? item : latest
    ), null);
    const latestTimestamp = propertyActivity?.created_at || latestItem?.updated_at || null;
    const propertyUnits = units.filter((unit) => unit.property_id === property.id);
    const continueUnit = propertyActivity?.unit_id
      ? propertyUnits.find((unit) => unit.id === propertyActivity.unit_id) || null
      : null;
    const done = propertyItems.filter((item) => item.status === "done").length;
    const total = propertyItems.length;

    return {
      property,
      units: propertyUnits,
      latestActivity: propertyActivity || (latestItem ? {
        action: latestItem.status === "done" ? "completed" : "updated",
        label: latestItem.title,
        created_at: latestItem.updated_at,
      } : null),
      latestTimestamp,
      continueUnit,
      done,
      total,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
      open: propertyItems.filter((item) => item.status === "approved").length,
      pending: propertyItems.filter((item) => item.status === "pending-review").length,
      shopping: propertyItems.filter((item) => (
        item.material_type === "shopping" && item.status !== "done"
      )).length,
    };
  });

  const actionableItems = items.filter((item) => item.kind !== "dictation");
  const continueProperty = [...summaries]
    .filter((summary) => summary.latestTimestamp)
    .sort((left, right) => new Date(right.latestTimestamp) - new Date(left.latestTimestamp))[0]
    || summaries.find((summary) => summary.open > 0 || summary.pending > 0)
    || summaries[0]
    || null;

  return {
    properties: summaries,
    continueProperty,
    totals: {
      openTasks: actionableItems.filter((item) => item.kind === "task" && item.status === "approved").length,
      pending: actionableItems.filter((item) => item.status === "pending-review").length,
      shopping: actionableItems.filter((item) => (
        item.material_type === "shopping" && item.status !== "done"
      )).length,
    },
  };
}

function getPropertyStatus(summary, busy) {
  if (busy) return { tone: "loading", label: "Loading" };
  if (summary.pending > 0) return { tone: "review", label: `${summary.pending} to review` };
  if (summary.open > 0) return { tone: "open", label: `${summary.open} open` };
  if (summary.total > 0) return { tone: "done", label: "All done" };
  return { tone: "empty", label: "Ready" };
}

function getActivityDescription(activity) {
  if (!activity) return "No recent activity";
  const actionLabels = {
    completed: "Completed",
    created: "Added",
    deleted: "Removed",
    reopened: "Reopened",
    updated: "Updated",
    "status-changed": "Status changed",
    "attachment-added": "Added an attachment to",
    "attachment-removed": "Removed an attachment from",
  };
  const action = actionLabels[activity.action] || "Updated";
  return `${action} ${activity.label} ${formatRelativeTime(activity.created_at)}`;
}

function formatRelativeTime(value) {
  if (!value) return "";
  const elapsedSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(elapsedSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (absoluteSeconds < 60) return formatter.format(elapsedSeconds, "second");
  if (absoluteSeconds < 3600) return formatter.format(Math.round(elapsedSeconds / 60), "minute");
  if (absoluteSeconds < 86400) return formatter.format(Math.round(elapsedSeconds / 3600), "hour");
  if (absoluteSeconds < 604800) return formatter.format(Math.round(elapsedSeconds / 86400), "day");
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getPropertyMarker(name) {
  return name.match(/\d+/)?.[0] || name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}
