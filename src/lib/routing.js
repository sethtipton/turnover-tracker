import { UNIT_ROUTE_ALIASES } from "./seed";

const basePath = normalizeBasePath(import.meta.env.BASE_URL);

const LEGACY_PROPERTY_ROUTES = {
  "451": { propertyName: "451 Park" },
  "451-up": { propertyName: "451 Park", unitName: "UP" },
  "451-upstairs": { propertyName: "451 Park", unitName: "UP" },
  "451-down": { propertyName: "451 Park", unitName: "DOWN" },
  "451-downstairs": { propertyName: "451 Park", unitName: "DOWN" },
  "441": { propertyName: "441 Park" },
  "441-up": { propertyName: "441 Park", unitName: "UP" },
  "441-upstairs": { propertyName: "441 Park", unitName: "UP" },
  "441-down": { propertyName: "441 Park", unitName: "DOWN" },
  "441-downstairs": { propertyName: "441 Park", unitName: "DOWN" },
  "1065-hudson-rd": { propertyName: "1065/1067 Hudson", unitName: "1065" },
  "1065-hudson-rd-main-unit": { propertyName: "1065/1067 Hudson", unitName: "1065" },
  "1067-hudson-rd": { propertyName: "1065/1067 Hudson", unitName: "1067" },
  "1067-hudson-rd-main-unit": { propertyName: "1065/1067 Hudson", unitName: "1067" },
  "124-n-mantua": { propertyName: "124/126 N Mantua", unitName: "124" },
  "124-n-mantua-main-unit": { propertyName: "124/126 N Mantua", unitName: "124" },
  "126-n-mantua": { propertyName: "124/126 N Mantua", unitName: "126" },
  "126-n-mantua-main-unit": { propertyName: "124/126 N Mantua", unitName: "126" },
  "127-s-pearl": { propertyName: "127 S Pearl" },
  "127-s-pearl-up": { propertyName: "127 S Pearl", unitName: "UP" },
  "127-s-pearl-down": { propertyName: "127 S Pearl", unitName: "DOWN" },
  "322-park": { propertyName: "310 Park", unitName: "AirBnB" },
};

const PUBLIC_PROPERTY_ROUTE_ALIASES = {
  "133-s-pearl": "127-s-pearl",
  "322-park": "310-park",
};

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

  const legacyRoute = LEGACY_PROPERTY_ROUTES[routeParts[0]];
  if (legacyRoute) {
    const legacyProperty = properties.find((candidate) => candidate.name === legacyRoute.propertyName);
    const unitSlug = legacyRoute.unitName
      ? getSlug(legacyRoute.unitName).toLowerCase()
      : routeParts[1];
    const legacyRouteUnit = unitSlug
      ? units.find((candidate) => (
        candidate.property_id === legacyProperty?.id
        && getUnitRouteSlugs(candidate.name).includes(unitSlug)
      ))
      : null;

    if (legacyProperty) {
      return { propertyId: legacyProperty.id, unitId: legacyRouteUnit?.id || "" };
    }
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

export function getPublicRouteFromCurrentPath() {
  const routeParts = getCurrentRouteParts();
  return {
    propertySlug: PUBLIC_PROPERTY_ROUTE_ALIASES[routeParts[0]] || routeParts[0] || "",
    unitSlug: routeParts[1] || "",
  };
}

export function isMaintenanceRoute() {
  return getCurrentRouteParts()[0] === "maintenance";
}

export function isMaintenanceQrRoute() {
  return getCurrentRouteParts({ preserveCase: true })[0]?.toLowerCase() === "m";
}

export function getMaintenanceQrTokenFromCurrentPath() {
  const routeParts = getCurrentRouteParts({ preserveCase: true });
  return routeParts[0]?.toLowerCase() === "m" && routeParts.length === 2
    ? routeParts[1]
    : "";
}

export function getMaintenancePath() {
  return `${basePath}maintenance/`;
}

export function getMaintenanceQrPath(token) {
  return `${basePath}m/${encodeURIComponent(token)}/`;
}

export function updateMaintenancePath({ replace = false } = {}) {
  const path = getMaintenancePath();
  if (window.location.pathname !== path || window.location.search) {
    window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  }
}

export function getMaintenancePreviewFromCurrentPath() {
  if (!isMaintenanceRoute()) return null;
  const params = new URL(window.location.href).searchParams;
  if (params.get("preview") !== "tenant") return null;
  return {
    mode: "tenant",
    propertyId: params.get("property") || "",
    unitId: params.get("unit") || "",
  };
}

export function updateMaintenancePreviewPath(preview, { replace = false } = {}) {
  const url = new URL(getMaintenancePath(), window.location.origin);
  url.searchParams.set("preview", preview.mode);
  if (preview.propertyId) url.searchParams.set("property", preview.propertyId);
  if (preview.unitId) url.searchParams.set("unit", preview.unitId);
  const path = `${url.pathname}${url.search}`;
  if (`${window.location.pathname}${window.location.search}` !== path) {
    window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  }
}

export function restoreAuthReturnPath() {
  const url = new URL(window.location.href);
  const next = url.searchParams.get("next");
  if (!next) return false;

  const target = new URL(next, window.location.origin);
  if (target.origin !== window.location.origin || !target.pathname.startsWith(basePath)) return false;

  window.history.replaceState({}, "", `${target.pathname}${target.search}${target.hash}`);
  return true;
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

export function getPublicListingPath(propertySlug, unitSlug = "") {
  const segments = [propertySlug, unitSlug].filter(Boolean).map(encodeURIComponent);
  return `${basePath}${segments.join("/")}/`;
}

function getCurrentRouteParts({ preserveCase = false } = {}) {
  const path = window.location.pathname;
  if (!path.startsWith(basePath)) return [];
  return path.slice(basePath.length)
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .map((part) => preserveCase ? part : part.toLowerCase());
}
