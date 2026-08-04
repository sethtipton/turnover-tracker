import { UsersRound } from "lucide-react";
import {
  getPropertyImage,
  getPropertyImageTransitionName,
  getPropertyTitleTransitionName,
} from "../lib/propertyImages";

export function AppHeader({
  property,
  scopeTitle,
  hasSelectedProperty,
  isWorkspaceOwner,
  peopleAccessOpen,
  onTogglePeopleAccess,
  scopeSelector,
}) {
  const propertyImage = getPropertyImage(property?.name);
  const headerClassName = [
    "app-header",
    propertyImage && "has-property-image",
    scopeSelector && "has-scope-selector",
  ].filter(Boolean).join(" ");

  return (
    <header className={headerClassName}>
      {propertyImage && (
        <div
          className="app-header-property-image"
          style={{ viewTransitionName: getPropertyImageTransitionName(property.id) }}
        >
          <img src={propertyImage} alt="" width="1024" height="768" />
        </div>
      )}
      <div className="app-header-identity">
        <h1
          id="app-title"
          tabIndex="-1"
          style={{ viewTransitionName: getPropertyTitleTransitionName(property?.id) }}
        >
          {scopeTitle || "Turnover Tracker"}
        </h1>
      </div>
      {isWorkspaceOwner && !hasSelectedProperty && (
        <div className="header-actions" aria-label="Workspace actions">
          <button
            className={peopleAccessOpen ? "people-access-button active" : "people-access-button"}
            type="button"
            onClick={onTogglePeopleAccess}
            aria-pressed={peopleAccessOpen}
          >
            <UsersRound size={18} aria-hidden="true" />
            <span className="action-label">People &amp; Access</span>
          </button>
        </div>
      )}
      {scopeSelector}
    </header>
  );
}
