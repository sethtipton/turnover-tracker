import { UNIT_ROUTE_ALIASES } from "./seed";

const basePath = normalizeBasePath(import.meta.env.BASE_URL);

export function normalizeBasePath(path) {
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

export function getSlug(value) {
  return value
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

export function getScopeFromCurrentPath(properties, units) {
  const routeParts = getCurrentRouteParts();
  if (routeParts.length === 0) return { propertyId: "", unitId: "" };

  const property = properties.find((candidate) => (
    getSlug(candidate.name).toLowerCase() === routeParts[0]
  ));

  if (property) {
    const unit = routeParts[1]
      ? units.find((candidate) => (
        candidate.property_id === property.id
        && getUnitRouteSlugs(candidate.name).includes(routeParts[1])
      ))
      : null;
    return { propertyId: property.id, unitId: unit?.id || "" };
  }

  const legacyUnit = units.find((candidate) => {
    const parent = properties.find((candidateProperty) => candidateProperty.id === candidate.property_id);
    return parent && getUnitRouteNames(candidate.name).some((unitName) => (
      getSlug(`${parent.name} ${unitName}`).toLowerCase() === routeParts[0]
    ));
  });

  return legacyUnit
    ? { propertyId: legacyUnit.property_id, unitId: legacyUnit.id }
    : { propertyId: "", unitId: "" };
}

function getUnitRouteNames(unitName) {
  return [unitName, ...(UNIT_ROUTE_ALIASES[unitName] || [])];
}

function getUnitRouteSlugs(unitName) {
  return getUnitRouteNames(unitName).map((name) => getSlug(name).toLowerCase());
}

export function updateScopePath(property, unit, { replace = false } = {}) {
  const nextPath = getScopePath(property, unit);

  if (window.location.pathname === nextPath) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
}

export function getScopePath(property, unit) {
  const segments = property
    ? [getSlug(property.name), unit ? getSlug(unit.name) : null].filter(Boolean)
    : [];
  return segments.length > 0
    ? `${basePath}${segments.map(encodeURIComponent).join("/")}/`
    : basePath;
}

function getCurrentRouteParts() {
  const path = window.location.pathname;
  if (!path.startsWith(basePath)) return [];
  return decodeURIComponent(path.slice(basePath.length))
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map((part) => part.toLowerCase());
}
