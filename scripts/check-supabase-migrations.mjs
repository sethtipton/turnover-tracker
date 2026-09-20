import { execFileSync } from "node:child_process";

const result = JSON.parse(execFileSync("supabase", ["migration", "list", "--linked", "--output-format", "json"], { encoding: "utf8" }));
if (!Array.isArray(result.migrations)) throw new Error("Could not verify deployed Supabase migrations.");
const pending = result.migrations.filter((migration) => migration.local && migration.local !== migration.remote);
if (pending.length) {
  throw new Error(`Apply and verify these Supabase migrations before deploying: ${pending.map((migration) => migration.local).join(", ")}`);
}
console.info("All required Supabase migrations are deployed.");
