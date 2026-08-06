import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  ClipboardCheck,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import { PortfolioDrilldown } from "./PortfolioDrilldown";
import {
  getPropertyImage,
  getPropertyImageTransitionName,
  getPropertyTitleTransitionName,
} from "../lib/propertyImages";
import { getScopePath } from "../lib/routing";

export function PortfolioHome({
  properties,
  units,
  items,
  activityLog,
  busy,
  ownerAccessPropertyIds,
  onOpenScope,
  onItemChange,
  onDeleteItem,
}) {
  const [activePanel, setActivePanel] = useState("");
  const [renderedPanel, setRenderedPanel] = useState("tasks");
  const overview = useMemo(
    () => buildPortfolioOverview(properties, units, items, activityLog),
    [activityLog, items, properties, units],
  );

  function togglePanel(nextPanel) {
    if (nextPanel) setRenderedPanel(nextPanel);
    setActivePanel(nextPanel);
  }

  if (properties.length === 0 && !busy) {
    return (
      <section className="portfolio-home portfolio-empty" aria-label="Portfolio">
        <h2>No properties available</h2>
        <p>Your account does not currently have access to a property.</p>
      </section>
    );
  }

  return (
    <div className="portfolio-home" aria-busy={busy}>
      <div className="portfolio-workspace">
        <section className="portfolio-summary" aria-label="Portfolio work summary">
          <PortfolioMetric label="Open" value={overview.totals.openTasks} busy={busy} panel="tasks" activePanel={activePanel} onToggle={togglePanel} />
          <PortfolioMetric label="Pending" value={overview.totals.pending} busy={busy} tone="review" panel="review" activePanel={activePanel} onToggle={togglePanel} />
          <PortfolioMetric label="Shopping" value={overview.totals.shopping} busy={busy} tone="shopping" panel="shopping" activePanel={activePanel} onToggle={togglePanel} />
          <PortfolioMetric label="Collect" value={overview.totals.collect} busy={busy} tone="collect" panel="collect" activePanel={activePanel} onToggle={togglePanel} />
        </section>

        <div className={`portfolio-drilldown-shell${activePanel ? " is-open" : ""}`} aria-hidden={!activePanel} inert={activePanel ? undefined : ""}>
          <PortfolioDrilldown
            panel={renderedPanel}
            properties={properties}
            units={units}
            items={items}
            busy={busy}
            onOpenScope={onOpenScope}
            onItemChange={onItemChange}
            onDeleteItem={onDeleteItem}
          />
        </div>
      </div>

      {overview.continueProperty && (
        <ContinuePanel
          summary={overview.continueProperty}
          busy={busy}
          onOpenScope={onOpenScope}
        />
      )}

      <section className="property-directory" aria-label="All properties">
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

function getScopeButtonLabel(scope) {
  if (!scope.unit) return "Property";
  if (scope.label === "UP") return "Up";
  if (scope.label === "DOWN") return "Down";
  return scope.label;
}

function ContinuePanel({ summary, busy, onOpenScope }) {
  const { property, continueUnit, progress, done, total, open, pending, latestActivity } = summary;
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
        {latestActivity && (
          <p className="continue-last-touched">
            Last touched {formatRelativeTime(latestActivity.created_at)}{latestActivity.actor_email ? ` by ${formatActorName(latestActivity.actor_email)}` : ""}
          </p>
        )}
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
              Property <ArrowRight size={17} aria-hidden="true" />
            </ScopeLink>
          )}
        </div>
      </div>
    </section>
  );
}

function PropertyCard({ summary, busy, isOwnerAccess, onOpenScope }) {
  const { property, scopes, done, total, open, shopping } = summary;

  return (
    <article className={isOwnerAccess ? "property-card owner-access" : "property-card"}>
      <div className="property-card-media">
        <PropertyVisual
          property={property}
          transitionName={getPropertyImageTransitionName(property.id)}
        />
        <div className="property-card-summary">
          <div className="property-card-heading">
            <h3 style={{ viewTransitionName: getPropertyTitleTransitionName(property.id) }}>
              {property.name}
            </h3>
            {isOwnerAccess && (
              <span className="property-owner-access" aria-label="Available through workspace owner access">
                <ShieldCheck size={14} aria-hidden="true" /> Admin access
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
        </div>
      </div>
      <div className="property-card-body">
        <nav className="property-scopes" aria-label={`Open ${property.name} scope`}>
          {scopes.map((scope) => (
            <ScopeLink
              key={scope.unit?.id || "whole-property"}
              property={property}
              unit={scope.unit}
              onOpenScope={onOpenScope}
            >
              <span className="property-scope-label">{getScopeButtonLabel(scope)}</span>
              {(scope.open > 0 || scope.pending > 0 || scope.shopping > 0 || scope.collect > 0 || scope.listed) && (
                <span className="property-scope-states">
                  {scope.open > 0 && (
                    <span className="property-state property-state-open" aria-label={`${scope.open} open tasks`}>
                      {scope.open}
                    </span>
                  )}
                  {scope.pending > 0 && (
                    <span className="property-state property-state-review" aria-label={`${scope.pending} tasks to review`}>
                      {scope.pending}
                    </span>
                  )}
                  {scope.shopping > 0 && (
                    <span className="property-state property-state-shopping" aria-label={`${scope.shopping} shopping items`}>
                      {scope.shopping}
                    </span>
                  )}
                  {scope.collect > 0 && (
                    <span className="property-state property-state-collect" aria-label={`${scope.collect} collect items`}>
                      {scope.collect}
                    </span>
                  )}
                  {scope.listed && (
                    <span className="property-state property-state-listed">
                      Listed
                    </span>
                  )}
                </span>
              )}
              <ArrowRight className="property-scope-arrow" size={16} aria-hidden="true" />
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

function PortfolioMetric({ label, value, busy, tone = "open", panel, activePanel, onToggle }) {
  const isActive = activePanel === panel;

  return (
    <button
      className={`portfolio-metric portfolio-metric-${tone}${isActive ? " active" : ""}`}
      type="button"
      aria-expanded={isActive}
      aria-controls="portfolio-work-drilldown"
      onClick={() => onToggle(isActive ? "" : panel)}
    >
      <strong>{busy ? "-" : value}</strong>
      <span>{label}</span>
    </button>
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
      buildScopeSummary(null, "Whole Property", propertyItems),
      ...propertyUnits.map((unit) => buildScopeSummary(unit, unit.name, propertyItems)),
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
      latestActivity: propertyActivity,
      continueUnit,
      done,
      total,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
      open: propertyItems.filter((item) => item.kind === "task" && item.status === "approved").length,
      pending: propertyItems.filter((item) => item.status === "pending-review").length,
      shopping: propertyItems.filter((item) => (
        item.kind === "material" && item.material_type === "shopping" && item.status !== "done"
      )).length,
      collect: propertyItems.filter((item) => (
        item.kind === "material" && item.material_type === "collect" && item.status !== "done"
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
        item.kind === "material" && item.material_type === "shopping" && item.status !== "done"
      )).length,
      collect: actionableItems.filter((item) => (
        item.kind === "material" && item.material_type === "collect" && item.status !== "done"
      )).length,
    },
  };
}

function formatActorName(email) {
  const username = email.split("@")[0] || "";
  return username
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || email;
}

function formatRelativeTime(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function buildScopeSummary(unit, label, propertyItems) {
  const scopeItems = propertyItems.filter((item) => (unit ? item.unit_id === unit.id : !item.unit_id));
  const listed = Boolean(unit?.listing_published && ["available", "coming-soon"].includes(unit.listing_status));

  return {
    unit,
    label,
    open: scopeItems.filter((item) => item.kind === "task" && item.status === "approved").length,
    pending: scopeItems.filter((item) => item.status === "pending-review").length,
    shopping: scopeItems.filter((item) => (
      item.kind === "material" && item.material_type === "shopping" && item.status !== "done"
    )).length,
    collect: scopeItems.filter((item) => (
      item.kind === "material" && item.material_type === "collect" && item.status !== "done"
    )).length,
    listed,
  };
}

function getPropertyMarker(name) {
  return name.match(/^\d+(?:\/\d+)*/)?.[0]
    || name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}
