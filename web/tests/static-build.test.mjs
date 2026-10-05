import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { DATA_FILES } from "../src/lib/data.ts";

const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));

async function readAllSource() {
  const files = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push(readFile(fullPath, "utf8"));
      }
    }
  }
  await walk(SRC_DIR);
  const contents = await Promise.all(files);
  return contents.join("\n");
}

test("build emits a GitHub Pages-compatible static entry point", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");

  assert.match(html, /<title>NZ Vehicle Market Tracker<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/i);
  assert.match(html, /(?:src|href)="\.\/assets\//i);
  assert.match(html, /rel="icon"[^>]+type="image\/svg\+xml"[^>]+href="\.\/favicon\.svg"/i);
  assert.match(html, /rel="apple-touch-icon"[^>]+href="\.\/apple-touch-icon\.png"/i);
  assert.match(html, /rel="canonical" href="https:\/\/michaelocez\.github\.io\/nz-vehicle-market-tracker\/"/i);
  assert.match(html, /property="og:image" content="https:\/\/michaelocez\.github\.io\/nz-vehicle-market-tracker\/social-preview\.png"/i);
  assert.match(html, /name="twitter:card" content="summary_large_image"/i);
  await access(new URL("../dist/favicon.svg", import.meta.url));
  await access(new URL("../dist/apple-touch-icon.png", import.meta.url));
  const socialPreview = await readFile(new URL("../dist/social-preview.png", import.meta.url));
  assert.equal(socialPreview.readUInt32BE(16), 1200);
  assert.equal(socialPreview.readUInt32BE(20), 630);
  assert.doesNotMatch(html, /_next|_vinext|cloudflare/i);
});

test("frontend stays a dark-only dashboard served from a relative base path", async () => {
  const [allSource, styles, packageJson, viteConfig] = await Promise.all([
    readAllSource(),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(viteConfig, /base:\s*"\.\/"/);
  assert.match(allSource, /import\.meta\.env\.BASE_URL/);
  assert.match(styles, /color-scheme:\s*dark/);
  assert.doesNotMatch(allSource, /localStorage|theme-toggle/i);
  assert.doesNotMatch(styles, /data-theme|theme-toggle/i);
  assert.doesNotMatch(packageJson, /next|vinext|wrangler|cloudflare/i);
});

test("synced data matches the approved production snapshot", async () => {
  const [manifest, summary, scopeMakes, scopeModels, monthlyMakePowertrains, monthlyModelPowertrains, scopeMakePowertrains, scopeModelPowertrains, fleetAges] = await Promise.all([
    readFile(new URL("../public/data/manifest.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/monthly_summary.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/scope_make.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/scope_model.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/monthly_make_powertrain.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/monthly_model_powertrain.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/scope_make_powertrain.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/scope_model_powertrain.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/scope_vehicle_age.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.equal(manifest.contract.scope.vehicle_type, "PASSENGER CAR/VAN");
  assert.deepEqual(manifest.contract.scope.classes, ["MA", "MB", "MC"]);
  assert.ok(!Number.isNaN(Date.parse(manifest.generated_at_utc)));
  for (const dataset of [summary, scopeMakes, scopeModels, monthlyMakePowertrains, monthlyModelPowertrains, scopeMakePowertrains, scopeModelPowertrains, fleetAges]) {
    assert.equal(dataset.contract_version, manifest.contract.version);
  }
  assert.equal(
    summary.snapshot_month,
    summary.records.reduce((latest, row) => row.registration_month > latest ? row.registration_month : latest, ""),
  );
  assert.equal(fleetAges.snapshot_month, summary.snapshot_month);

  const latest = Object.fromEntries(
    summary.records
      .filter((row) => row.registration_month === summary.snapshot_month)
      .map((row) => [row.import_status_group, row.registration_count]),
  );
  assert.deepEqual(Object.keys(latest).sort(), ["nz_new", "other_or_unknown", "used_import"]);
  assert.ok(Object.values(latest).reduce((sum, count) => sum + count, 0) > 0);
  assert.equal(
    scopeMakes.records.filter((row) => row.import_status_group === "all").reduce((sum, row) => sum + row.vehicle_count, 0),
    manifest.quality.included_rows,
  );
  assert.equal(
    scopeModels.records.filter((row) => row.import_status_group === "all").reduce((sum, row) => sum + row.vehicle_count, 0),
    manifest.quality.included_rows,
  );
  for (const records of [scopeMakes.records, scopeModels.records]) {
    const topCounts = records
      .filter((row) => row.import_status_group === "all")
      .sort((a, b) => b.vehicle_count - a.vehicle_count)
      .slice(0, 5)
      .map((row) => row.vehicle_count);
    assert.equal(topCounts.length, 5);
    assert.ok(topCounts.every((count) => count > 0));
    assert.deepEqual(topCounts, [...topCounts].sort((a, b) => b - a));
  }

  const expectedPowertrains = ["bev", "combustion", "hybrid", "other", "phev"];
  for (const dataset of [monthlyMakePowertrains, monthlyModelPowertrains]) {
    const latestRecords = dataset.records.filter((row) => row.registration_month === summary.snapshot_month);
    assert.deepEqual([...new Set(latestRecords.map((row) => row.powertrain_group))].sort(), expectedPowertrains);
    for (const powertrain of expectedPowertrains) {
      const ranks = latestRecords.filter((row) => row.powertrain_group === powertrain).map((row) => row.rank);
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
      assert.ok(ranks.length > 0);
    }
  }
  for (const dataset of [scopeMakePowertrains, scopeModelPowertrains]) {
    assert.deepEqual([...new Set(dataset.records.map((row) => row.powertrain_group))].sort(), expectedPowertrains);
    assert.ok(dataset.records.every((row) => row.vehicle_count > 0));
  }
  assert.equal(
    fleetAges.records.reduce((sum, row) => sum + row.vehicle_count, 0),
    manifest.quality.current_fleet_age_rows,
  );
  assert.ok(fleetAges.records.every((row) => row.approximate_current_age >= 0));
  assert.deepEqual(
    fleetAges.records.map((row) => row.approximate_current_age),
    [...fleetAges.records.map((row) => row.approximate_current_age)].sort((a, b) => a - b),
  );
});

test("Cloudflare and Sites scaffolding is absent", async () => {
  for (const path of ["../.openai", "../worker", "../build", "../next.config.ts"]) {
    await assert.rejects(access(new URL(path, import.meta.url)));
  }
});

test("every dataset the loader requests is present in the synced data", async () => {
  const dataDir = new URL("../public/data", import.meta.url);
  const entries = await readdir(dataDir, { withFileTypes: true });
  const actualFiles = new Set(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
  );

  for (const file of DATA_FILES) {
    assert.ok(actualFiles.has(file), `Frontend loader requests ${file} but it is missing from synced data`);
  }
});
