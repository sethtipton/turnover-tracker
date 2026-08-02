import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { INITIAL_PROPERTIES } from "../src/lib/seed.js";

const distDir = "dist";
const source = join(distDir, "index.html");

await copyFile(source, join(distDir, "404.html"));
await writeFile(join(distDir, ".nojekyll"), "");

for (const property of INITIAL_PROPERTIES) {
  const propertySlug = getSlug(property.name);
  await createFallback(propertySlug);

  for (const unit of property.units) {
    await createFallback(join(propertySlug, getSlug(unit)));
    await createFallback(getSlug(`${property.name} ${unit}`));
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
