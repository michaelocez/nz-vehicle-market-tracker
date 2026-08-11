import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build emits a GitHub Pages-compatible static entry point", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");

  assert.match(html, /<title>NZ Vehicle Market Tracker<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/i);
  assert.match(html, /(?:src|href)="\.\/assets\//i);
  assert.match(html, /rel="icon"[^>]+href="\.\/favicon\.png"/i);
  await access(new URL("../dist/favicon.png", import.meta.url));
  assert.doesNotMatch(html, /_next|_vinext|cloudflare/i);
});

test("dashboard is dark-only and loads data from the Vite base path", async () => {
  const [app, styles, packageJson, viteConfig] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(app, /import\.meta\.env\.BASE_URL/);
  assert.match(app, /scope_make\.json/);
  assert.match(app, /scope_model\.json/);
  assert.match(app, /monthly_make_powertrain\.json/);
  assert.match(app, /monthly_model_powertrain\.json/);
  assert.match(app, /scope_make_powertrain\.json/);
  assert.match(app, /scope_model_powertrain\.json/);
  assert.match(app, /htmlFor="make-select"/);
  assert.match(app, /<optgroup label="Recognised makes">/);
  assert.match(app, /<optgroup label="Other \/ unmapped source makes">/);
  assert.match(app, /Vehicles represented in the current NZTA fleet snapshot/);
  assert.match(app, /aria-label="Vehicle ranking view"/);
  assert.match(app, /aria-pressed=\{vehicleView === value\}/);
  assert.match(app, /Latest entries/);
  assert.match(app, /Current fleet/);
  assert.match(app, /aria-label="Leaderboard powertrain filter"/);
  assert.match(app, /PASSENGER VEHICLES ONLY · MA \/ MB \/ MC/);
  assert.match(app, /\["all", "combustion", "hybrid", "bev", "phev", "other"\]/);
  assert.match(app, /leaderboardPowertrain === value/);
  assert.match(app, /CURRENT FLEET SNAPSHOT · 2007\+ SCOPE/);
  assert.match(app, /ARRIVAL CHANNEL BY POWERTRAIN/);
  assert.match(app, /arrivalPowertrains = \["combustion", "hybrid", "bev", "phev"\]/);
  assert.match(app, /className="panel arrival-panel"/);
  assert.match(app, /className="annual-readout"/);
  assert.match(app, /onMouseEnter=\{\(\) => setActiveMarketYear\(row\.year\)\}/);
  assert.match(app, /aria-pressed=\{activeAnnual\?\.year === row\.year\}/);
  assert.match(app, /Hover, focus or tap a year for exact counts/);
  assert.doesNotMatch(styles, /\.powertrain-panel \{ grid-row: span 2/);
  assert.doesNotMatch(styles, /\.arrival-mix \{ margin-top: auto/);
  assert.match(app, /className="stat-kicker">\{prettyMonth\(view\.latest\)\}/);
  assert.doesNotMatch(app, /year-to-date through June/);
  assert.match(app, /data\.manifest\.contract\.version/);
  assert.doesNotMatch(app, /<b>v\d+\.\d+(?:\.\d+)?<\/b> data contract/);
  assert.match(app, /href="https:\/\/www\.nzta\.govt\.nz\/resources\/new-zealand-motor-vehicle-register-statistics\/new-zealand-vehicle-fleet-open-data-sets"/);
  assert.doesNotMatch(styles, /--brand-mark-bg|--brand-mark-border/);
  assert.match(styles, /color-scheme:\s*dark/);
  assert.doesNotMatch(app, /localStorage|theme-toggle|Switch to.*mode/);
  assert.doesNotMatch(styles, /data-theme|theme-toggle/);
  assert.doesNotMatch(packageJson, /next|vinext|wrangler|cloudflare/i);
  assert.match(viteConfig, /base:\s*"\.\/"/);
});

test("synced data matches the approved production snapshot", async () => {
  const [manifest, summary, scopeMakes, scopeModels, monthlyMakePowertrains, monthlyModelPowertrains, scopeMakePowertrains, scopeModelPowertrains] = await Promise.all([
    readFile(new URL("../public/data/manifest.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/monthly_summary.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/scope_make.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/scope_model.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/monthly_make_powertrain.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/monthly_model_powertrain.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/scope_make_powertrain.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/scope_model_powertrain.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.equal(manifest.contract.scope.vehicle_type, "PASSENGER CAR/VAN");
  assert.deepEqual(manifest.contract.scope.classes, ["MA", "MB", "MC"]);
  for (const dataset of [summary, scopeMakes, scopeModels, monthlyMakePowertrains, monthlyModelPowertrains, scopeMakePowertrains, scopeModelPowertrains]) {
    assert.equal(dataset.contract_version, manifest.contract.version);
  }
  assert.equal(
    summary.snapshot_month,
    summary.records.reduce((latest, row) => row.registration_month > latest ? row.registration_month : latest, ""),
  );

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
});

test("Cloudflare and Sites scaffolding is absent", async () => {
  for (const path of ["../.openai", "../worker", "../build", "../next.config.ts"]) {
    await assert.rejects(access(new URL(path, import.meta.url)));
  }
});
