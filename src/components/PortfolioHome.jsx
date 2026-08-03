import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import {
  getPropertyImage,
  getPropertyImageTransitionName,
  getPropertyTitleTransitionName,
} from "../lib/propertyImages";
import { getScopePath } from "../lib/routing";

export function PortfolioHome({
  displayName,
  properties,
  units,
  items,
  activityLog,
  busy,
  ownerAccessPropertyIds,
  onOpenScope,
}) {
  const overview = useMemo(
    () => buildPortfolioOverview(properties, units, items, activityLog),
    [activityLog, items, properties, units],
  );

  if (properties.length === 0 && !busy) {
    return (
      <section className="portfolio-home portfolio-empty" aria-labelledby="portfolio-title">
        <h2 id="portfolio-title">No properties available</h2>
        <p>Your account does not currently have access to a property.</p>
      </section>
    );
  }

  return (
    <div className="portfolio-home" aria-busy={busy}>
      <header className="portfolio-intro">
        <h2 id="portfolio-title">
          {getPossessiveName(displayName)} {properties.length} {properties.length === 1 ? "Property" : "Properties"}
        </h2>
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
          {overview.properties.map((summary) => (
            <li key={summary.property.id}>
              <PropertyCard
                summary={summary}
                busy={busy}
                isOwnerAccess={ownerAccessPropertyIds.has(summary.property.id)}
                onOpenScope={onOpenScope}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function getPossessiveName(name) {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function getScopeButtonLabel(scope) {
  if (!scope.unit) return "Property";
  if (scope.label === "UP") return "Up";
  if (scope.label === "DOWN") return "Down";
  return scope.label;
}

function ContinuePanel({ summary, busy, onOpenScope }) {
  const { property, continueUnit, progress, done, total, open, pending } = summary;
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
            {continueUnit ? `Continue in ${scopeLabel}` : "Continue to Property"} <ArrowRight size={17} aria-hidden="true" />
          </ScopeLink>
          {continueUnit && (
            <ScopeLink className="secondary-link" property={property} onOpenScope={onOpenScope}>
              Property
            </ScopeLink>
          )}
        </div>
      </div>
    </section>
  );
}

function PropertyCard({ summary, busy, isOwnerAccess, onOpenScope }) {
  const { property, scopes, done, total, open, shopping } = summary;
  const status = getPropertyStatus(summary, busy);

  return (
    <article className={isOwnerAccess ? "property-card owner-access" : "property-card"}>
      <PropertyVisual
        property={property}
        transitionName={getPropertyImageTransitionName(property.id)}
      />
      <div className="property-card-body">
        <div className="property-card-heading">
          <h3 style={{ viewTransitionName: getPropertyTitleTransitionName(property.id) }}>
            {property.name}
          </h3>
          {isOwnerAccess ? (
            <span className="property-owner-access" aria-label="Available through workspace owner access">
              <ShieldCheck size={14} aria-hidden="true" /> Admin access
            </span>
          ) : status && (
            <span className={`property-state property-state-${status.tone}`}>
              {status.tone === "done" && <CheckCircle2 size={14} aria-hidden="true" />}
              {status.tone === "review" && <AlertCircle size={14} aria-hidden="true" />}
              {status.label}
            </span>
          )}
        </div>
        <div className="property-progress-row">
          {(busy || total > 0) && <span>{busy ? "Loading" : `${done}/${total}`}</span>}
          <ProgressBar value={done} total={total} label={`${property.name} completion`} />
        </div>
        <div className="property-counts" aria-label={`${property.name} work counts`}>
          <span><ClipboardCheck size={15} aria-hidden="true" /> {busy ? "-" : open} open</span>
          <span><ShoppingCart size={15} aria-hidden="true" /> {busy ? "-" : shopping} shopping</span>
        </div>
        <nav className="property-scopes" aria-label={`Open ${property.name} scope`}>
          {scopes.map((scope) => (
            <ScopeLink
              key={scope.unit?.id || "whole-property"}
              property={property}
              unit={scope.unit}
              onOpenScope={onOpenScope}
            >
              <span className="property-scope-label">{getScopeButtonLabel(scope)}</span>
              {scope.pending > 0 && (
                <span className="property-state property-state-review">
                  <AlertCircle size={14} aria-hidden="true" />
                  {scope.pending} to review
                </span>
              )}
            </ScopeLink>
          ))}
        </nav>
      </div>
    </article>
  );
}

function PropertyVisual({ property, priority = false, transitionName }) {
  const [failedImageSrc, setFailedImageSrc] = useState("");
  const imageSrc = getPropertyImage(property.name);
  const imageAvailable = imageSrc && failedImageSrc !== imageSrc;
  const marker = getPropertyMarker(property.name);

  return (
    <div
      className="property-visual"
      style={transitionName ? { viewTransitionName: transitionName } : undefined}
    >
      {imageAvailable ? (
        <img
          src={imageSrc}
          alt={`Exterior of ${property.name}`}
          width="1024"
          height="768"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onError={() => setFailedImageSrc(imageSrc)}
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
    const scopes = [
      {
        unit: null,
        label: "Whole Property",
        pending: propertyItems.filter((item) => !item.unit_id && item.status === "pending-review").length,
      },
      ...propertyUnits.map((unit) => ({
        unit,
        label: unit.name,
        pending: propertyItems.filter((item) => (
          item.unit_id === unit.id && item.status === "pending-review"
        )).length,
      })),
    ];
    const continueUnit = propertyActivity?.unit_id
      ? propertyUnits.find((unit) => unit.id === propertyActivity.unit_id) || null
      : null;
    const done = propertyItems.filter((item) => item.status === "done").length;
    const total = propertyItems.length;

    return {
      property,
      scopes,
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
  if (summary.open > 0) return { tone: "open", label: `${summary.open} open` };
  if (summary.total > 0 && summary.done === summary.total) return { tone: "done", label: "All done" };
  return null;
}

function getPropertyMarker(name) {
  return name.match(/^\d+(?:\/\d+)*/)?.[0]
    || name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}
