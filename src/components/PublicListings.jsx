import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Home,
  Landmark,
  LoaderCircle,
  MapPin,
  Maximize,
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from "lucide-react";
import { createListingPreview } from "../lib/listings";
import { getPropertyImageBySlug } from "../lib/propertyImages";
import { getPublicListingPath, getPublicRouteFromCurrentPath } from "../lib/routing";
import { AppFooter } from "./AppFooter";
import { PropertyImage } from "./PropertyImage";
import { TenantMaintenanceDialog } from "./TenantMaintenanceApp";

export function PublicSite({ listings, busy, error, onSignIn, authenticated = false, user, tenantUnits = [], onSignOut, tenantPreview = false, previewRoute, onExitPreview }) {
  const previewRouteKey = previewRoute ? `${previewRoute.propertySlug}/${previewRoute.unitSlug}` : "";
  const [route, setRoute] = useState(() => previewRoute || getPublicRouteFromCurrentPath());
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const groupedListings = useMemo(() => groupListings(listings), [listings]);
  const canReportMaintenance = authenticated && tenantUnits.length > 0;

  useEffect(() => {
    if (previewRoute) {
      setRoute(previewRoute);
      return undefined;
    }
    function syncRoute() {
      setRoute(getPublicRouteFromCurrentPath());
    }
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [previewRoute, previewRouteKey]);

  const property = groupedListings.find((group) => group.property_slug === route.propertySlug);
  const listing = property?.listings.find((candidate) => candidate.unit_slug === route.unitSlug);
  const isListingRoute = Boolean(route.propertySlug && route.unitSlug);
  const isPropertyRoute = Boolean(route.propertySlug);

  useEffect(() => {
    const title = listing?.listing_headline || property?.property_name || "Tree City Rentals";
    document.title = title === "Tree City Rentals" ? title : `${title} | Tree City Rentals`;
  }, [listing?.listing_headline, property?.property_name]);

  return (
    <>
      <main className="public-site" id="main-content" tabIndex="-1">
        <PublicHeader showDirectoryHeading={!isListingRoute && !isPropertyRoute} onReportMaintenance={canReportMaintenance ? () => setMaintenanceDialogOpen(true) : undefined} tenantPreviewLabel={tenantPreview ? `${tenantUnits[0]?.property_name} · ${tenantUnits[0]?.unit_name}` : ""} />
        {error ? (
          <section className="public-empty"><h1>Listings are unavailable</h1><p>{error}</p></section>
        ) : busy && (isListingRoute || isPropertyRoute) ? (
          <PublicRouteLoading listing={isListingRoute} />
        ) : isListingRoute ? (
          listing ? <ListingDetail listing={listing} /> : <PublicNotFound />
        ) : isPropertyRoute ? (
          property ? <PublicPropertyPage property={property} /> : <PublicNotFound />
        ) : (
          <PublicListingDirectory listings={listings} busy={busy} />
        )}
      </main>
      <AppFooter authenticated={authenticated} onAuthAction={tenantPreview ? onExitPreview : authenticated ? onSignOut : onSignIn} authActionLabel={tenantPreview ? "Return to maintenance workspace" : undefined} />
      {canReportMaintenance && <TenantMaintenanceDialog open={maintenanceDialogOpen} onClose={() => setMaintenanceDialogOpen(false)} user={user} tenantUnits={tenantUnits} preview={tenantPreview} />}
    </>
  );
}

export function ListingWorkspace({ property, units, selectedUnit, view, busy, onSaveProperty, onSaveUnit, onSuggestListingField, animated = false }) {
  const propertyUnits = units.filter((unit) => unit.property_id === property.id);
  const displayUnit = selectedUnit || (propertyUnits.length === 1 ? propertyUnits[0] : null);
  const listings = propertyUnits.map((unit) => createListingPreview(property, unit));
  const displayListing = displayUnit
    ? listings.find((listing) => listing.unit_id === displayUnit.id)
    : null;

  return (
    <section className={`listing-workspace${animated ? " listing-workspace-enter" : ""}`} aria-label="Public listing workspace">
      {view === "edit" ? (
        <ListingEditor
          property={property}
          units={selectedUnit ? [selectedUnit] : propertyUnits}
          busy={busy}
          onSaveProperty={onSaveProperty}
          onSaveUnit={onSaveUnit}
          onSuggestListingField={onSuggestListingField}
        />
      ) : displayListing ? (
        <ListingDetail listing={displayListing} preview />
      ) : (
        <PublicPropertyPage property={groupListings(listings)[0]} preview />
      )}
    </section>
  );
}

export function ListingViewSwitch({ view, onViewChange }) {
  return (
    <div className="listing-view-switch" role="group" aria-label="Property view">
      <button className={view === "tasks" ? "active" : ""} type="button" onClick={() => onViewChange("tasks")} aria-pressed={view === "tasks"}>
        <SlidersHorizontal size={17} aria-hidden="true" /> Tasks
      </button>
      <button className={view === "listing" ? "active" : ""} type="button" onClick={() => onViewChange("listing")} aria-pressed={view === "listing"}>
        <Home size={17} aria-hidden="true" /> Listing
      </button>
      <button className={view === "edit" ? "active" : ""} type="button" onClick={() => onViewChange("edit")} aria-pressed={view === "edit"}>
        <Sparkles size={17} aria-hidden="true" /> Edit Listing
      </button>
    </div>
  );
}

function PublicHeader({ showDirectoryHeading = false, onReportMaintenance, tenantPreviewLabel }) {
  return (
    <header className={`public-header${showDirectoryHeading ? " has-header-subtitle" : ""}`}>
      <a className="public-brand" href={getPublicListingPath("")}>
        <span className="public-brand-mark" aria-hidden="true"><Building2 strokeWidth={1.6} /></span>
        <div className="public-brand-content">
          <h1 className="header-brand-title">Tree City Rentals</h1>
          {showDirectoryHeading && <h2>Homes near Kent State University</h2>}
        </div>
      </a>
      {onReportMaintenance && <button className="public-maintenance-button" type="button" onClick={onReportMaintenance}><Wrench size={17} aria-hidden="true" /> Maintenance Request</button>}
      {tenantPreviewLabel && <p className="public-tenant-preview" role="status">Admin tenant preview · {tenantPreviewLabel}</p>}
    </header>
  );
}

function PublicListingDirectory({ listings, busy }) {
  return (
    <section className="public-directory" aria-busy={busy}>
      <header className="public-directory-intro">
        <p>Browse available and coming-soon homes near Kent State, with clear details to help you find the right place to call home.</p>
      </header>
      {busy ? (
        <p className="public-loading">Loading available homes...</p>
      ) : listings.length === 0 ? (
        <section className="public-empty"><h2>No homes are available right now.</h2><p>Check back soon for upcoming listings.</p></section>
      ) : (
        <ul className="public-listing-grid" role="list">
          {listings.map((listing, index) => <ListingCard key={listing.unit_id} listing={listing} priority={index === 0} />)}
        </ul>
      )}
    </section>
  );
}

function PublicRouteLoading({ listing }) {
  return (
    <section className={`public-route-loading${listing ? " listing" : ""}`} aria-busy="true">
      <span className="visually-hidden" role="status">Loading {listing ? "listing" : "property"}</span>
      <div className="public-route-loading-media" aria-hidden="true" />
      <div className="public-route-loading-content" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function PublicPropertyPage({ property, preview = false }) {
  const location = [property.city, property.state].filter(Boolean).join(", ");
  return (
    <section className="public-property-page">
      {preview && <PreviewNotice listings={property.listings} />}
      <header className="public-property-heading">
        <p className="public-kicker">Tree City Rentals</p>
        <h1>{property.property_name}</h1>
        {(property.property_type || location) && <p>{[property.property_type, location].filter(Boolean).join(" / ")}</p>}
      </header>
      <ul className="public-property-listings" role="list">
        {property.listings.map((listing, index) => <ListingCard key={listing.unit_id} listing={listing} preview={preview} priority={index === 0} />)}
      </ul>
    </section>
  );
}

export function ListingDetail({ listing, preview = false }) {
  const title = listing.listing_headline || `${listing.property_name} ${listing.unit_name}`;
  const hasFacts = [
    listing.property_type,
    listing.bedrooms,
    listing.full_bathrooms,
    listing.half_bathrooms,
    listing.interior_square_feet,
    listing.available_date,
    listing.lease_term,
    listing.neighborhood,
  ].some((value) => value !== null && value !== undefined && value !== "");
  const imageSrc = getPropertyImageBySlug(listing.property_slug);
  const isLiveListing = isPublicListing(listing);

  return (
    <article className="public-listing-detail">
      {preview && <PreviewNotice listings={[listing]} />}
      <header className={`public-listing-hero${imageSrc ? " has-image" : ""}`}>
        {imageSrc && (
          <div className="public-listing-hero-media">
            <PropertyImage src={imageSrc} alt={`Exterior of ${listing.property_name}`} priority />
            <span className={`listing-status listing-status-${listing.listing_status}`}>{getListingStatusLabel(listing.listing_status)}</span>
            {preview && isLiveListing && (
              <span className="listing-live-overlay">
                Live on Tree City Rentals as {getListingStatusLabel(listing.listing_status)}.
              </span>
            )}
          </div>
        )}
        <div className="public-listing-hero-content">
          <h1>{title}</h1>
          {listing.display_address && <p className="listing-address"><MapPin size={18} aria-hidden="true" /> {listing.display_address}</p>}
          <p className="listing-rent">{formatRent(listing)}</p>
        </div>
      </header>

      {listing.listing_description && <p className="listing-description">{listing.listing_description}</p>}

      {(hasFacts || listing.amenities?.length > 0) && (
        <div className="listing-facts">
          {hasFacts && (
          <dl className="listing-specs">
            {listing.property_type && <Detail term="Type" value={listing.property_type} icon={<Building2 size={17} aria-hidden="true" />} />}
            {listing.bedrooms != null && <Detail term="Bedrooms" value={formatNumber(listing.bedrooms)} icon={<BedDouble size={17} aria-hidden="true" />} />}
            {listing.full_bathrooms != null && <Detail term="Full baths" value={formatNumber(listing.full_bathrooms)} icon={<Bath size={17} aria-hidden="true" />} />}
            {listing.half_bathrooms != null && <Detail term="Half baths" value={formatNumber(listing.half_bathrooms)} icon={<Bath size={17} aria-hidden="true" />} />}
            {listing.interior_square_feet != null && <Detail term="Interior" value={`${listing.interior_square_feet.toLocaleString()} sq ft`} icon={<Maximize size={17} aria-hidden="true" />} />}
            {listing.available_date && <Detail term="Available" value={formatDate(listing.available_date)} icon={<CalendarDays size={17} aria-hidden="true" />} />}
            {listing.lease_term && <Detail term="Lease" value={listing.lease_term} icon={<Home size={17} aria-hidden="true" />} />}
            {listing.neighborhood && <Detail term="Neighborhood" value={listing.neighborhood} icon={<MapPin size={17} aria-hidden="true" />} />}
          </dl>
          )}
          {listing.amenities?.length > 0 && <ul className="amenity-list" aria-label="Amenities" role="list">{listing.amenities.map((amenity) => <li key={amenity}>{amenity}</li>)}</ul>}
        </div>
      )}
    </article>
  );
}

function ListingCard({ listing, preview = false, priority = false }) {
  const title = listing.listing_headline || `${listing.property_name} ${listing.unit_name}`;
  const imageSrc = getPropertyImageBySlug(listing.property_slug);
  return (
    <li className="public-listing-card">
      <a href={getPublicListingPath(listing.property_slug, listing.unit_slug)}>
        <div className="public-listing-card-media">
          {imageSrc ? (
            <PropertyImage src={imageSrc} alt={`Exterior of ${listing.property_name}`} priority={priority} />
          ) : (
            <Building2 size={28} aria-label={`Image unavailable for ${listing.property_name}`} />
          )}
          <span className={`listing-status listing-status-${listing.listing_status}`}>{getListingStatusLabel(listing.listing_status)}</span>
        </div>
        <div className="public-listing-card-content">
          <h2>{title}</h2>
          {listing.display_address && <p><MapPin size={16} aria-hidden="true" /> {listing.display_address}</p>}
          {(listing.neighborhood || listing.available_date) && (
            <div className="listing-card-details">
              {listing.neighborhood && <span><MapPin size={15} aria-hidden="true" /> {listing.neighborhood}</span>}
              {listing.available_date && <span><CalendarDays size={15} aria-hidden="true" /> Available {formatDate(listing.available_date)}</span>}
            </div>
          )}
          <div className="listing-card-specs">
            {listing.bedrooms != null && <span>{formatNumber(listing.bedrooms)} bd</span>}
            {listing.full_bathrooms != null && <span>{formatNumber(listing.full_bathrooms)} ba</span>}
            {listing.interior_square_feet != null && <span>{listing.interior_square_feet.toLocaleString()} sq ft</span>}
          </div>
          <p className="listing-rent">{formatRent(listing)}</p>
        </div>
      </a>
      {preview && <p className="preview-card-note">Preview</p>}
    </li>
  );
}

function ListingEditor({ property, units, busy, onSaveProperty, onSaveUnit, onSuggestListingField }) {
  return (
    <section className="listing-editor" aria-label="Edit listing">
      <PropertyEditor key={property.id} property={property} onSave={onSaveProperty} />
      {units.map((unit) => <UnitEditor key={unit.id} unit={unit} busy={busy} onSave={onSaveUnit} onSuggestListingField={onSuggestListingField} />)}
    </section>
  );
}

function PropertyEditor({ property, onSave }) {
  const [form, setForm] = useState(toPropertyForm(property));
  const autosave = useListingAutosave(onSave);

  function change(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    autosave.queue(name, value);
  }

  return (
    <form className="listing-edit-panel" onSubmit={(event) => event.preventDefault()}>
      <div className="listing-edit-heading"><h3>Shared property information</h3><AutosaveStatus status={autosave.status} onRetry={autosave.retry} /></div>
      <details>
        <summary><span>Property basics</span><ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="listing-edit-fields">
          <Field label="Public property name" name="public_name" value={form.public_name} onChange={change} onBlur={autosave.flush} />
          <Field label="Property type" name="property_type" value={form.property_type} onChange={change} onBlur={autosave.flush} placeholder="Apartment, duplex, house..." />
        </div>
      </details>
      <details>
        <summary><span>Location</span><ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="listing-edit-fields">
          <Field label="Street address" name="street_address" value={form.street_address} onChange={change} onBlur={autosave.flush} />
          <Field label="City" name="city" value={form.city} onChange={change} onBlur={autosave.flush} />
          <Field label="State" name="state" value={form.state} onChange={change} onBlur={autosave.flush} />
          <Field label="ZIP code" name="postal_code" value={form.postal_code} onChange={change} onBlur={autosave.flush} />
          <Field label="Neighborhood or area" name="neighborhood" value={form.neighborhood} onChange={change} onBlur={autosave.flush} />
        </div>
      </details>
      <details>
        <summary><span>Property records</span><ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="listing-edit-fields">
          <div className="auditor-url-control">
            <Field label="Auditor parcel URL" name="auditor_parcel_url" type="url" value={form.auditor_parcel_url} onChange={change} onBlur={autosave.flush} />
            {form.auditor_parcel_url && (
              <a className="secondary-link auditor-parcel-link" href={form.auditor_parcel_url} target="_blank" rel="noreferrer">
                <Landmark size={17} aria-hidden="true" />
                <span>Open Auditor parcel</span>
                <ExternalLink size={15} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </details>
    </form>
  );
}

function UnitEditor({ unit, busy, onSave, onSuggestListingField }) {
  const [form, setForm] = useState(toUnitForm(unit));
  const [suggestingField, setSuggestingField] = useState("");
  const [suggestionErrorField, setSuggestionErrorField] = useState("");
  const autosave = useListingAutosave((patch) => onSave(unit.id, patch));

  function change(event) {
    const { name, value, checked, type } = event.target;
    const nextValue = type === "checkbox" ? checked : value;
    setForm((current) => ({ ...current, [name]: nextValue }));
    autosave.queue(name, toUnitPatch(name, nextValue), { immediate: type === "checkbox" || type === "date" || event.target.tagName === "SELECT" });
  }

  async function suggest(field) {
    if (!onSuggestListingField || suggestingField || busy) return;

    setSuggestionErrorField("");
    setSuggestingField(field);
    try {
      const result = await onSuggestListingField(unit.id, field);
      const suggestion = typeof result?.suggestion === "string" ? result.suggestion.trim() : "";
      if (suggestion) {
        setForm((current) => ({ ...current, [field]: suggestion }));
        autosave.queue(field, toUnitPatch(field, suggestion), { immediate: true });
      }
    } catch {
      setSuggestionErrorField(field);
    } finally {
      setSuggestingField("");
    }
  }

  return (
    <form className="listing-edit-panel" onSubmit={(event) => event.preventDefault()}>
      <div className="listing-edit-heading"><h3>{unit.name} listing</h3><AutosaveStatus status={autosave.status} onRetry={autosave.retry} /></div>
      <details>
        <summary><span>Publishing and address</span><ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="listing-edit-fields">
          <label className="listing-publish-toggle"><input type="checkbox" name="listing_published" checked={form.listing_published} onChange={change} /> <span>Publish this listing</span></label>
          <SelectField label="Availability" name="listing_status" value={form.listing_status} onChange={change} options={LISTING_STATUS_OPTIONS} />
          <SuggestionField label="Listing headline" name="listing_headline" value={form.listing_headline} onChange={change} onBlur={autosave.flush} onSuggest={() => suggest("listing_headline")} busy={suggestingField === "listing_headline"} error={suggestionErrorField === "listing_headline"} />
          <Field label="Unit number" name="unit_number" value={form.unit_number} onChange={change} onBlur={autosave.flush} />
          <SelectField label="Address visibility" name="address_visibility" value={form.address_visibility} onChange={change} options={ADDRESS_VISIBILITY_OPTIONS} />
        </div>
        <p className="listing-editor-note">Only published Available and Coming soon listings appear publicly.</p>
      </details>
      <details>
        <summary><span>Rental details</span><ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="listing-edit-fields">
          <Field label="Monthly rent" name="monthly_rent" type="number" min="0" inputMode="numeric" value={form.monthly_rent} onChange={change} onBlur={autosave.flush} />
          <SelectField label="Rent display type" name="rent_display_type" value={form.rent_display_type} onChange={change} options={RENT_DISPLAY_OPTIONS} />
          <Field label="Available date" name="available_date" type="date" value={form.available_date} onChange={change} onBlur={autosave.flush} />
          <Field label="Lease term" name="lease_term" value={form.lease_term} onChange={change} onBlur={autosave.flush} placeholder="12 months" />
          <Field label="Bedrooms" name="bedrooms" type="number" min="0" step="0.5" inputMode="decimal" value={form.bedrooms} onChange={change} onBlur={autosave.flush} />
          <Field label="Full bathrooms" name="full_bathrooms" type="number" min="0" step="0.5" inputMode="decimal" value={form.full_bathrooms} onChange={change} onBlur={autosave.flush} />
          <Field label="Half bathrooms" name="half_bathrooms" type="number" min="0" step="0.5" inputMode="decimal" value={form.half_bathrooms} onChange={change} onBlur={autosave.flush} />
          <Field label="Interior square footage" name="interior_square_feet" type="number" min="1" inputMode="numeric" value={form.interior_square_feet} onChange={change} onBlur={autosave.flush} />
        </div>
      </details>
      <details>
        <summary><span>Description and amenities</span><ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="listing-edit-fields">
          <SuggestionField label="Public listing description" name="listing_description" value={form.listing_description} onChange={change} onBlur={autosave.flush} onSuggest={() => suggest("listing_description")} busy={suggestingField === "listing_description"} error={suggestionErrorField === "listing_description"} multiline rows="5" />
          <SuggestionField label="Amenities" hint="one per line" name="amenities" value={form.amenities} onChange={change} onBlur={autosave.flush} onSuggest={() => suggest("amenities")} busy={suggestingField === "amenities"} error={suggestionErrorField === "amenities"} multiline rows="4" />
        </div>
      </details>
    </form>
  );
}

function Field({ label, name, value, onChange, onBlur, type = "text", ...inputProps }) {
  return <label className="form-field"><span>{label}</span><input name={name} type={type} value={value} onChange={onChange} onBlur={onBlur} {...inputProps} /></label>;
}

function SuggestionField({ label, hint, name, value, onChange, onBlur, onSuggest, busy, error, multiline = false, ...inputProps }) {
  const fieldId = `listing-${name}`;
  const state = busy ? "generating" : error ? "error" : "idle";
  const buttonLabel = state === "generating" ? "Generating" : state === "error" ? "Try again" : "Generate";

  return (
    <div className="form-field full-width suggestion-field">
      <div className="suggestion-field-label">
        <label htmlFor={fieldId}>{label}{hint && <> <span className="optional-label">{hint}</span></>}</label>
        <button
          className={`field-suggestion-button ai is-${state}`}
          type="button"
          onClick={onSuggest}
          disabled={busy}
          aria-label={state === "generating" ? `Generating ${label}` : error ? `Retry AI suggestion for ${label}` : `Generate ${label} with AI`}
          title={state === "generating" ? `Generating ${label}` : error ? `Retry AI suggestion for ${label}` : `Generate ${label} with AI`}
        >
          {busy ? <LoaderCircle className="field-suggestion-spinner" size={16} aria-hidden="true" /> : error ? <CircleAlert size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
          <span>{buttonLabel}</span>
        </button>
        {error && <span className="field-suggestion-error" role="alert">Could not generate. Try again.</span>}
      </div>
      {multiline ? (
        <textarea id={fieldId} name={name} value={value} onChange={onChange} onBlur={onBlur} {...inputProps} />
      ) : (
        <input id={fieldId} name={name} value={value} onChange={onChange} onBlur={onBlur} {...inputProps} />
      )}
    </div>
  );
}

function SelectField({ label, name, value, onChange, options }) {
  return <label className="form-field"><span>{label}</span><select name={name} value={value} onChange={onChange}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function AutosaveStatus({ status, onRetry }) {
  if (status === "idle") return null;
  const label = status === "saving" ? "Saving..." : status === "error" ? "Could not save" : "Saved";
  return (
    <span className={`listing-autosave-status is-${status}`}>
      <span role="status">{label}</span>
      {status === "error" && <button type="button" onClick={onRetry}>Retry</button>}
    </span>
  );
}

function useListingAutosave(onSave) {
  const [status, setStatus] = useState("idle");
  const onSaveRef = useRef(onSave);
  const timersRef = useRef(new Map());
  const queueRef = useRef(Promise.resolve());
  const pendingSavesRef = useRef(0);
  const failedPatchesRef = useRef(new Map());

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const save = useCallback((patch) => {
    const fieldName = Object.keys(patch)[0];
    pendingSavesRef.current += 1;
    setStatus("saving");
    const runSave = async () => {
      try {
        await onSaveRef.current(patch);
        pendingSavesRef.current -= 1;
        failedPatchesRef.current.delete(fieldName);
        setStatus(pendingSavesRef.current > 0 ? "saving" : failedPatchesRef.current.size > 0 ? "error" : "saved");
      } catch {
        pendingSavesRef.current -= 1;
        failedPatchesRef.current.set(fieldName, patch);
        setStatus("error");
      }
    };
    queueRef.current = queueRef.current.then(runSave, runSave);
  }, []);

  const flush = useCallback((event) => {
    const { name } = event.target;
    const pending = timersRef.current.get(name);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    timersRef.current.delete(name);
    save(pending.patch);
  }, [save]);

  const queue = useCallback((name, value, { immediate = false } = {}) => {
    const pending = timersRef.current.get(name);
    if (pending) window.clearTimeout(pending.timer);
    const patch = { [name]: value };
    if (immediate) {
      timersRef.current.delete(name);
      save(patch);
      return;
    }
    const timer = window.setTimeout(() => {
      timersRef.current.delete(name);
      save(patch);
    }, 700);
    timersRef.current.set(name, { timer, patch });
  }, [save]);

  const retry = useCallback(() => {
    [...failedPatchesRef.current.values()].forEach(save);
  }, [save]);

  useEffect(() => () => {
    timersRef.current.forEach(({ timer, patch }) => {
      window.clearTimeout(timer);
      save(patch);
    });
    timersRef.current.clear();
  }, [save]);

  return { status, queue, flush, retry };
}

function toUnitPatch(name, value) {
  if (["monthly_rent", "interior_square_feet"].includes(name)) return toOptionalInteger(value);
  if (["bedrooms", "full_bathrooms", "half_bathrooms"].includes(name)) return toOptionalNumber(value);
  if (name === "available_date") return value || null;
  if (name === "amenities") return value.split("\n").map((item) => item.trim()).filter(Boolean);
  return value;
}

function Detail({ term, value, icon }) {
  return <div><dt>{icon}{term}</dt><dd>{value}</dd></div>;
}

function PreviewNotice({ listings }) {
  const unpublished = listings.some((listing) => !isPublicListing(listing));
  return unpublished ? <p className="listing-preview-notice">Preview only. This listing is not currently visible on the public site.</p> : null;
}

function isPublicListing(listing) {
  return listing.listing_published && ["available", "coming-soon"].includes(listing.listing_status);
}

function PublicNotFound() {
  return <section className="public-empty"><h1>That listing is not available.</h1><p>Browse current Tree City Rentals homes below.</p><a className="secondary-link" href={getPublicListingPath("")}>View available homes</a></section>;
}

function groupListings(listings) {
  return Object.values(listings.reduce((groups, listing) => {
    const key = listing.property_id;
    if (!groups[key]) {
      groups[key] = {
        property_id: listing.property_id,
        property_name: listing.property_name,
        property_slug: listing.property_slug,
        property_type: listing.property_type,
        city: listing.city,
        state: listing.state,
        listings: [],
      };
    }
    groups[key].listings.push(listing);
    return groups;
  }, {}));
}

function toPropertyForm(property) {
  return {
    public_name: property.public_name || "",
    property_type: property.property_type || "",
    street_address: property.street_address || "",
    city: property.city || "",
    state: property.state || "",
    postal_code: property.postal_code || "",
    neighborhood: property.neighborhood || "",
    auditor_parcel_url: property.auditor_parcel_url || "",
  };
}

function toUnitForm(unit) {
  return {
    listing_published: Boolean(unit.listing_published),
    listing_status: unit.listing_status || "off-market",
    listing_headline: unit.listing_headline || "",
    address_visibility: unit.address_visibility || "city",
    unit_number: unit.unit_number || "",
    monthly_rent: unit.monthly_rent ?? "",
    rent_display_type: unit.rent_display_type || "exact",
    available_date: unit.available_date || "",
    lease_term: unit.lease_term || "",
    bedrooms: unit.bedrooms ?? "",
    full_bathrooms: unit.full_bathrooms ?? "",
    half_bathrooms: unit.half_bathrooms ?? "",
    interior_square_feet: unit.interior_square_feet ?? "",
    listing_description: unit.listing_description || "",
    amenities: (unit.amenities || []).join("\n"),
  };
}

function formatRent(listing) {
  if (listing.rent_display_type === "contact") return "Contact for rent";
  if (listing.monthly_rent == null) return "Rent details coming soon";
  const rent = `$${listing.monthly_rent.toLocaleString()}`;
  return listing.rent_display_type === "starting-at" ? `Starting at ${rent} / month` : `${rent} / month`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatNumber(value) {
  return Number.isInteger(Number(value)) ? String(value) : Number(value).toFixed(1);
}

function getListingStatusLabel(status) {
  const labels = { available: "Available", "coming-soon": "Coming soon", occupied: "Occupied", "off-market": "Off market" };
  return labels[status] || "Listing";
}

function toOptionalInteger(value) {
  return value === "" ? null : Number.parseInt(value, 10);
}

function toOptionalNumber(value) {
  return value === "" ? null : Number(value);
}

const LISTING_STATUS_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "coming-soon", label: "Coming soon" },
  { value: "occupied", label: "Occupied" },
  { value: "off-market", label: "Off market" },
];

const ADDRESS_VISIBILITY_OPTIONS = [
  { value: "full", label: "Full address" },
  { value: "approximate", label: "Approximate location" },
  { value: "city", label: "City only" },
];

const RENT_DISPLAY_OPTIONS = [
  { value: "exact", label: "Exact amount" },
  { value: "starting-at", label: "Starting at" },
  { value: "contact", label: "Contact for rent" },
];
