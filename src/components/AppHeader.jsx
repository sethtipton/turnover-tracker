import { Building2 } from "lucide-react";
import {
  getPropertyImage,
  getPropertyImageTransitionName,
  getPropertyTitleTransitionName,
} from "../lib/propertyImages";
import { PropertyImage } from "./PropertyImage";

export function AppHeader({
  property,
  scopeTitle,
  peopleAccessOpen,
  scopeSelector,
}) {
  const propertyImage = getPropertyImage(property?.name);
  const showBrandIdentity = !property && !peopleAccessOpen;
  const hasHeaderVisual = Boolean(propertyImage) || showBrandIdentity;
  const hasHeaderSubtitle = Boolean((property || showBrandIdentity) && scopeTitle);
  const title = property?.name || (showBrandIdentity ? "Tree City Rentals" : scopeTitle || "Turnover Tracker");
  const headerClassName = [
    "app-header",
    hasHeaderVisual && "has-header-visual",
    showBrandIdentity && "has-brand-mark",
    hasHeaderSubtitle && "has-header-subtitle",
    scopeSelector && "has-scope-selector",
  ].filter(Boolean).join(" ");

  return (
    <header className={headerClassName}>
      {propertyImage ? (
        <div
          className="app-header-visual"
          style={{ viewTransitionName: getPropertyImageTransitionName(property.id) }}
        >
          <PropertyImage src={propertyImage} alt="" />
        </div>
      ) : showBrandIdentity ? (
        <div className="app-header-visual app-header-brand-mark" aria-hidden="true">
          <Building2 strokeWidth={1.6} />
        </div>
      ) : null}
      <div className="app-header-identity">
        <h1
          id="app-title"
          tabIndex="-1"
          style={{ viewTransitionName: getPropertyTitleTransitionName(property?.id) }}
        >
          {title}
        </h1>
        {(property || showBrandIdentity) && scopeTitle && <h2>{scopeTitle}</h2>}
      </div>
      {scopeSelector}
    </header>
  );
}
