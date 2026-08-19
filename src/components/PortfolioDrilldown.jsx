import { ArrowRight, Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AttachmentList } from "./ItemColumn";
import { getScopePath } from "../lib/routing";

const PANEL_CONFIG = {
  tasks: {
    title: "Open",
    empty: "No open tasks right now.",
    matches: (item) => item.kind === "task" && item.status === "approved",
    action: { label: "Mark done", status: "done" },
  },
  review: {
    title: "Pending",
    empty: "No tasks need review right now.",
    matches: (item) => item.kind !== "dictation" && item.status === "pending-review",
    action: { label: "Approve", status: "approved" },
  },
  shopping: {
    title: "Shopping",
    combinedTitle: "Combined Shopping List",
    empty: "No shopping items right now.",
    matches: (item) => item.kind === "material" && item.material_type === "shopping" && item.status !== "done",
    action: { label: "Mark done", status: "done" },
  },
  collect: {
    title: "Collect",
    combinedTitle: "Combined Collect / Bring List",
    empty: "No collect or bring items right now.",
    matches: (item) => item.kind === "material" && item.material_type === "collect" && item.status !== "done",
    action: { label: "Mark done", status: "done" },
  },
};

export function PortfolioDrilldown({
  panel,
  properties,
  units,
  items,
  busy,
  onOpenScope,
  onItemChange,
  onDeleteItem,
  mediaUrls,
}) {
  const config = PANEL_CONFIG[panel];
  const groups = useMemo(
    () => getPortfolioGroups(properties, units, items, config.matches),
    [config, items, properties, units],
  );

  return (
    <section className={`portfolio-drilldown portfolio-drilldown-${panel}`} id="portfolio-work-drilldown" aria-label={`${config.title} items`}>
      {groups.length === 0 ? (
        <p className="empty">{config.empty}</p>
      ) : (
        <>
          <div className="portfolio-drilldown-groups">
            {groups.map((group) => (
              <PropertyItemGroup
                key={group.property.id}
                group={group}
                collapsible={panel === "tasks" || panel === "review" || panel === "shopping" || panel === "collect"}
                action={config.action}
                busy={busy}
                onOpenScope={onOpenScope}
                onItemChange={onItemChange}
                onDeleteItem={onDeleteItem}
                mediaUrls={mediaUrls}
              />
            ))}
          </div>
          {config.combinedTitle && (
            <ShoppingRunList panel={panel} title={config.combinedTitle} groups={groups} busy={busy} onItemChange={onItemChange} />
          )}
        </>
      )}
    </section>
  );
}

function ShoppingRunList({ panel, title, groups, busy, onItemChange }) {
  const [completingId, setCompletingId] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const entries = groups.flatMap((group) => group.items.map((entry) => ({
    ...entry,
    property: group.property,
  })));

  async function markDone(item) {
    setCompletingId(item.id);
    await onItemChange(item, { status: "done" });
    setCompletingId("");
  }

  return (
    <section className={`shopping-run shopping-run-${panel}`} aria-labelledby={`${panel}-run-title`}>
      <h3 id={`${panel}-run-title`}>
        <button
          className="shopping-run-toggle"
          type="button"
          aria-expanded={isOpen}
          aria-controls={`${panel}-run-items`}
          onClick={() => setIsOpen((current) => !current)}
        >
          <ChevronDown size={17} aria-hidden="true" />
          <span>{title}</span>
          <strong>{entries.length}</strong>
        </button>
      </h3>
      <div className="shopping-run-content" id={`${panel}-run-items`} hidden={!isOpen}>
        <p className="shopping-run-instructions">Use this while shopping. Click to mark done.</p>
        <ul className="shopping-run-list" role="list">
          {entries.map(({ item, property, unit }) => (
            <li key={item.id}>
              <label className="shopping-run-item">
                <input
                  type="checkbox"
                  checked={completingId === item.id}
                  disabled={busy || Boolean(completingId)}
                  onChange={() => markDone(item)}
                  aria-label={`Mark ${item.title} done`}
                />
                <span className="shopping-run-copy">
                  <strong>{item.title}</strong>
                  <span>{property.name} · {unit?.name || "Property"}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PropertyItemGroup({ group, collapsible, action, busy, onOpenScope, onItemChange, onDeleteItem, mediaUrls }) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = `portfolio-group-items-${group.property.id}`;
  const scopeGroups = group.units.length > 0
    ? getScopeGroups(group)
    : null;

  return (
    <section className={`portfolio-item-group${collapsible && !isOpen ? " is-collapsed" : ""}`} aria-labelledby={`portfolio-group-${group.property.id}`}>
      <div className="portfolio-item-group-heading">
        {collapsible ? (
          <h3 id={`portfolio-group-${group.property.id}`}>
            <button
              className="portfolio-item-group-heading-toggle"
              type="button"
              aria-expanded={isOpen}
              aria-controls={contentId}
              onClick={() => setIsOpen((current) => !current)}
            >
              <ChevronDown size={17} aria-hidden="true" />
              {group.property.name}
            </button>
          </h3>
        ) : (
          <h3 id={`portfolio-group-${group.property.id}`}>{group.property.name}</h3>
        )}
        <ScopeLink className="portfolio-item-group-link" property={group.property} onOpenScope={onOpenScope} aria-label={`Open ${group.property.name}`}>
          <ArrowRight size={17} aria-hidden="true" />
        </ScopeLink>
        <span>{group.items.length}</span>
      </div>
      {scopeGroups ? (
        <div className="portfolio-unit-groups" id={contentId} hidden={collapsible && !isOpen}>
          {scopeGroups.map((scopeGroup) => (
            <section className="portfolio-unit-group" key={scopeGroup.id} aria-labelledby={`${contentId}-${scopeGroup.id}`}>
              <h4 id={`${contentId}-${scopeGroup.id}`}>
                <ScopeLink className="portfolio-unit-heading" property={group.property} unit={scopeGroup.unit} onOpenScope={onOpenScope}>
                  <span>{scopeGroup.label}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </ScopeLink>
              </h4>
              <PortfolioItemList
                entries={scopeGroup.items}
                action={action}
                busy={busy}
                onItemChange={onItemChange}
                onDeleteItem={onDeleteItem}
                mediaUrls={mediaUrls}
              />
            </section>
          ))}
        </div>
      ) : (
        <PortfolioItemList
          id={contentId}
          hidden={collapsible && !isOpen}
          entries={group.items}
          action={action}
          busy={busy}
          onItemChange={onItemChange}
          onDeleteItem={onDeleteItem}
          mediaUrls={mediaUrls}
        />
      )}
    </section>
  );
}

function PortfolioItemList({ id, hidden, entries, action, busy, onItemChange, onDeleteItem, mediaUrls }) {
  return (
    <ul className="portfolio-item-list" id={id} role="list" hidden={hidden}>
      {entries.map(({ item }) => (
        <PortfolioItemRow
          key={item.id}
          item={item}
          action={action}
          busy={busy}
          onItemChange={onItemChange}
          onDeleteItem={onDeleteItem}
          mediaUrls={mediaUrls}
        />
      ))}
    </ul>
  );
}

function PortfolioItemRow({ item, action, busy, onItemChange, onDeleteItem, mediaUrls }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [working, setWorking] = useState(false);

  async function saveTitle(event) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setWorking(true);
    const saved = await onItemChange(item, { title: nextTitle });
    setWorking(false);
    if (saved) setEditing(false);
  }

  function cancelEdit() {
    setTitle(item.title);
    setEditing(false);
  }

  async function runAction() {
    setWorking(true);
    await onItemChange(item, { status: action.status });
    setWorking(false);
  }

  async function removeItem() {
    setWorking(true);
    await onDeleteItem(item);
    setWorking(false);
  }

  return (
    <li className="portfolio-item-row">
      <div className="portfolio-item-copy">
        {editing ? (
          <form className="portfolio-item-rename" onSubmit={saveTitle}>
            <label className="visually-hidden" htmlFor={`portfolio-item-title-${item.id}`}>Rename {item.title}</label>
            <input
              id={`portfolio-item-title-${item.id}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength="140"
              autoFocus
              required
            />
            <button type="submit" disabled={working}>Save</button>
            <button className="icon-button" type="button" onClick={cancelEdit} aria-label={`Cancel renaming ${item.title}`} disabled={working}>
              <X size={16} aria-hidden="true" />
            </button>
          </form>
        ) : (
          <p>
            <span className="portfolio-item-title">{item.title}</span>
          </p>
        )}
      </div>
      <AttachmentList attachments={item.attachments} mediaUrls={mediaUrls} />
      {!editing && (
        <div className="portfolio-item-actions">
          <button className="portfolio-status-action" type="button" onClick={runAction} disabled={busy || working}>
            <Check size={15} aria-hidden="true" />
            <span>{action.label}</span>
          </button>
          <button className="icon-button" type="button" onClick={() => setEditing(true)} disabled={busy || working} aria-label={`Rename ${item.title}`}>
            <Pencil size={16} aria-hidden="true" />
          </button>
          <button className="icon-button danger-icon-button" type="button" onClick={removeItem} disabled={busy || working} aria-label={`Delete ${item.title}`}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}

function ScopeLink({ property, unit, onOpenScope, className, children, ...linkProps }) {
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

  return <a className={className} href={getScopePath(property, unit)} onClick={handleClick} {...linkProps}>{children}</a>;
}

function getPortfolioGroups(properties, units, items, matches) {
  const unitById = new Map(units.map((unit) => [unit.id, unit]));

  return properties
    .map((property) => {
      const propertyUnits = units
        .filter((unit) => unit.property_id === property.id)
        .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name));

      return {
        property,
        units: propertyUnits,
        items: items
          .filter((item) => item.property_id === property.id && matches(item))
          .sort((left, right) => new Date(right.updated_at) - new Date(left.updated_at))
          .map((item) => ({ item, unit: unitById.get(item.unit_id) || null })),
      };
    })
    .filter((group) => group.items.length > 0)
    .sort((left, right) => right.items.length - left.items.length || left.property.name.localeCompare(right.property.name));
}

function getScopeGroups(group) {
  const propertyItems = group.items.filter(({ unit }) => !unit);
  const unitGroups = group.units.map((unit) => ({
    id: `unit-${unit.id}`,
    label: unit.name,
    unit,
    items: group.items.filter((entry) => entry.unit?.id === unit.id),
  }));

  return [
    ...(propertyItems.length > 0 ? [{ id: "property", label: "Property", unit: null, items: propertyItems }] : []),
    ...unitGroups.filter((group) => group.items.length > 0),
  ];
}
