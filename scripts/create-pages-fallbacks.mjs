import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { INITIAL_UNITS } from "../src/lib/seed.js";

const distDir = "dist";
const source = join(distDir, "index.html");

await copyFile(source, join(distDir, "404.html"));
await writeFile(join(distDir, ".nojekyll"), "");

for (const unit of INITIAL_UNITS) {
  const slug = getUnitSlug(unit);
  const routeDir = join(distDir, slug);
  await mkdir(routeDir, { recursive: true });
  await copyFile(source, join(routeDir, "index.html"));
}

function getUnitSlug(unit) {
  return unit
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}
