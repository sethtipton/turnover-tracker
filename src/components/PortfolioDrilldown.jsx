import { Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { getScopePath } from "../lib/routing";

const PANEL_CONFIG = {
  tasks: {
    title: "Open tasks",
    empty: "No open tasks right now.",
    matches: (item) => item.kind === "task" && item.status === "approved",
    action: { label: "Mark done", status: "done" },
  },
  review: {
    title: "Pending review",
    empty: "No tasks need review right now.",
    matches: (item) => item.kind !== "dictation" && item.status === "pending-review",
    action: { label: "Approve", status: "approved" },
  },
  shopping: {
    title: "Shopping items",
    empty: "No shopping items right now.",
    matches: (item) => item.kind === "material" && item.material_type === "shopping" && item.status !== "done",
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
}) {
  const config = PANEL_CONFIG[panel];
  const groups = useMemo(
    () => getPortfolioGroups(properties, units, items, config.matches),
    [config, items, properties, units],
  );
  const count = groups.reduce((total, group) => total + group.items.length, 0);

  return (
    <section className={`portfolio-drilldown portfolio-drilldown-${panel}`} id="portfolio-work-drilldown" aria-labelledby="portfolio-drilldown-title">
      <div className="portfolio-drilldown-heading">
        <div>
          <p className="eyebrow">Portfolio work</p>
          <h2 id="portfolio-drilldown-title">{config.title}</h2>
        </div>
        <span className="portfolio-drilldown-count">{busy ? "Updating" : `${count} item${count === 1 ? "" : "s"}`}</span>
      </div>
      {groups.length === 0 ? (
        <p className="empty">{config.empty}</p>
      ) : (
        <>
          {panel === "shopping" && (
            <ShoppingRunList groups={groups} busy={busy} onItemChange={onItemChange} />
          )}
          <div className="portfolio-drilldown-groups">
            {groups.map((group) => (
              <PropertyItemGroup
                key={group.property.id}
                group={group}
                action={config.action}
                busy={busy}
                onOpenScope={onOpenScope}
                onItemChange={onItemChange}
                onDeleteItem={onDeleteItem}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ShoppingRunList({ groups, busy, onItemChange }) {
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
    <section className="shopping-run" aria-labelledby="shopping-run-title">
      <h3 id="shopping-run-title">
        <button
          className="shopping-run-toggle"
          type="button"
          aria-expanded={isOpen}
          aria-controls="shopping-run-items"
          onClick={() => setIsOpen((current) => !current)}
        >
          <ChevronDown size={17} aria-hidden="true" />
          <span>Shopping List</span>
          <strong>{entries.length}</strong>
        </button>
      </h3>
      <ul className="shopping-run-list" id="shopping-run-items" role="list" hidden={!isOpen}>
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
    </section>
  );
}

function PropertyItemGroup({ group, action, busy, onOpenScope, onItemChange, onDeleteItem }) {
  return (
    <section className="portfolio-item-group" aria-labelledby={`portfolio-group-${group.property.id}`}>
      <div className="portfolio-item-group-heading">
        <ScopeLink property={group.property} onOpenScope={onOpenScope}>
          <h3 id={`portfolio-group-${group.property.id}`}>{group.property.name}</h3>
        </ScopeLink>
        <span>{group.items.length}</span>
      </div>
      <ul className="portfolio-item-list" role="list">
        {group.items.map(({ item, unit }) => (
          <PortfolioItemRow
            key={item.id}
            item={item}
            unit={unit}
            action={action}
            busy={busy}
            onItemChange={onItemChange}
            onDeleteItem={onDeleteItem}
          />
        ))}
      </ul>
    </section>
  );
}

function PortfolioItemRow({ item, unit, action, busy, onItemChange, onDeleteItem }) {
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
      <span className="portfolio-item-scope">{unit?.name || "Property"}</span>
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
      {!editing && (
        <div className="portfolio-item-actions">
          <button className="portfolio-status-action" type="button" onClick={runAction} disabled={busy || working}>
            <Check size={15} aria-hidden="true" />
            {action.label}
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

function ScopeLink({ property, onOpenScope, children }) {
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
    onOpenScope(property.id);
  }

  return <a href={getScopePath(property)} onClick={handleClick}>{children}</a>;
}

function getPortfolioGroups(properties, units, items, matches) {
  const unitById = new Map(units.map((unit) => [unit.id, unit]));

  return properties
    .map((property) => ({
      property,
      items: items
        .filter((item) => item.property_id === property.id && matches(item))
        .sort((left, right) => new Date(right.updated_at) - new Date(left.updated_at))
        .map((item) => ({ item, unit: unitById.get(item.unit_id) || null })),
    }))
    .filter((group) => group.items.length > 0)
    .sort((left, right) => right.items.length - left.items.length || left.property.name.localeCompare(right.property.name));
}
