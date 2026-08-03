import { getSlug } from "./routing";

export function createListingPreview(property, unit) {
  return {
    property_id: property.id,
    unit_id: unit.id,
    property_name: property.public_name || property.name,
    property_slug: getSlug(property.name).toLowerCase(),
    unit_name: unit.name,
    unit_slug: getSlug(unit.name).toLowerCase(),
    property_type: property.property_type || "",
    listing_headline: unit.listing_headline || "",
    listing_published: unit.listing_published,
    listing_status: unit.listing_status,
    display_address: getDisplayAddress(property, unit),
    city: property.city || "",
    state: property.state || "",
    neighborhood: property.neighborhood || "",
    monthly_rent: unit.monthly_rent,
    rent_display_type: unit.rent_display_type,
    available_date: unit.available_date,
    lease_term: unit.lease_term || "",
    bedrooms: unit.bedrooms,
    full_bathrooms: unit.full_bathrooms,
    half_bathrooms: unit.half_bathrooms,
    interior_square_feet: unit.interior_square_feet,
    listing_description: unit.listing_description || "",
    amenities: unit.amenities || [],
  };
}

function getDisplayAddress(property, unit) {
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  if (unit.address_visibility === "full") {
    return [[property.street_address, unit.unit_number].filter(Boolean).join(" "), cityState, property.postal_code]
      .filter(Boolean)
      .join(", ");
  }
  if (unit.address_visibility === "approximate") return property.neighborhood || cityState;
  return cityState;
}
