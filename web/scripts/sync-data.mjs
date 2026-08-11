import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(webRoot, "..", "data", "production", "current");
const outputRoot = join(webRoot, "public", "data");
const files = [
  "manifest.json",
  "monthly_summary.json",
  "monthly_powertrain.json",
  "monthly_make.json",
  "monthly_model.json",
  "monthly_make_powertrain.json",
  "monthly_model_powertrain.json",
  "scope_make.json",
  "scope_model.json",
  "scope_make_powertrain.json",
  "scope_model_powertrain.json",
  "scope_vehicle_age.json",
  "monthly_previous_country.json",
  "monthly_import_age.json",
];

await mkdir(outputRoot, { recursive: true });
await Promise.all(files.map((file) => copyFile(join(sourceRoot, file), join(outputRoot, file))));
console.log(`Synced ${files.length} production data files.`);
