import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { INITIAL_PROPERTIES, UNIT_ROUTE_ALIASES } from "../src/lib/seed.js";

const distDir = "dist";
const source = join(distDir, "index.html");

await copyFile(source, join(distDir, "404.html"));
await writeFile(join(distDir, ".nojekyll"), "");

for (const property of INITIAL_PROPERTIES) {
  const propertySlug = getSlug(property.name);
  await createFallback(propertySlug);

  for (const unit of property.units) {
    const routeNames = [unit, ...(UNIT_ROUTE_ALIASES[unit] || [])];
    for (const routeName of routeNames) {
      await createFallback(join(propertySlug, getSlug(routeName)));
      await createFallback(getSlug(`${property.name} ${routeName}`));
    }
  }
}

async function createFallback(route) {
  const routeDir = join(distDir, route);
  await mkdir(routeDir, { recursive: true });
  await copyFile(source, join(routeDir, "index.html"));
}

function getSlug(value) {
  return value
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}
