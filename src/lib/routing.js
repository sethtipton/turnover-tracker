const basePath = normalizeBasePath(import.meta.env.BASE_URL);

export function normalizeBasePath(path) {
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

export function getUnitSlug(unit) {
  return unit.name
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCurrentUnitSlug() {
  const path = window.location.pathname;
  if (!path.startsWith(basePath)) return "";
  return decodeURIComponent(path.slice(basePath.length).replace(/^\/+|\/+$/g, ""));
}

export function getUnitIdFromCurrentPath(units) {
  const routeSlug = getCurrentUnitSlug().toLowerCase();
  if (!routeSlug) return "";
  return units.find((unit) => getUnitSlug(unit).toLowerCase() === routeSlug)?.id || "";
}

export function updateUnitPath(unit) {
  const nextPath = unit ? `${basePath}${encodeURIComponent(getUnitSlug(unit))}/` : basePath;
  if (window.location.pathname === nextPath) return;
  window.history.pushState({}, "", nextPath);
}
