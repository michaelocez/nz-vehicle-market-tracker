import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
  assert.match(html, /rel="icon"[^>]+href="\.\/favicon\.png"/i);
  assert.match(html, /rel="canonical" href="https:\/\/michaelocez\.github\.io\/nz-vehicle-market-tracker\/"/i);
  assert.match(html, /property="og:image" content="https:\/\/michaelocez\.github\.io\/nz-vehicle-market-tracker\/social-preview\.png"/i);
  assert.match(html, /name="twitter:card" content="summary_large_image"/i);
  await access(new URL("../dist/favicon.png", import.meta.url));
  const socialPreview = await readFile(new URL("../dist/social-preview.png", import.meta.url));
  assert.equal(socialPreview.readUInt32BE(16), 1200);
  assert.equal(socialPreview.readUInt32BE(20), 630);
  assert.doesNotMatch(html, /_next|_vinext|cloudflare/i);
});

test("dashboard is dark-only and loads data from the Vite base path", async () => {
  const [app, styles, packageJson, viteConfig, allSource] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readAllSource(),
  ]);

  assert.match(allSource, /import\.meta\.env\.BASE_URL/);
  assert.match(allSource, /scope_make\.json/);
  assert.match(allSource, /scope_model\.json/);
  assert.match(allSource, /monthly_make_powertrain\.json/);
  assert.match(allSource, /monthly_model_powertrain\.json/);
  assert.match(allSource, /scope_make_powertrain\.json/);
  assert.match(allSource, /scope_model_powertrain\.json/);
  assert.match(allSource, /scope_vehicle_age\.json/);
  assert.match(allSource, /htmlFor="make-select"/);
  assert.match(allSource, /<optgroup label="Recognised makes">/);
  assert.match(allSource, /<optgroup label="Other \/ unmapped source makes">/);
  assert.match(allSource, /Vehicles represented in the current NZTA fleet snapshot/);
  assert.match(allSource, /aria-label="Vehicle ranking view"/);
  assert.match(allSource, /aria-pressed=\{vehicleView === value\}/);
  assert.match(allSource, /Latest entries/);
  assert.match(allSource, /Current fleet/);
  assert.match(allSource, /function monthChange\(current: number, previous: number \| undefined\)/);
  assert.match(allSource, /className=\{`month-change \$\{changeTone\(change\)\}/);
  assert.match(allSource, /Changes compare with \{prettyMonth\(view\.previousMonth\)\}/);
  assert.match(allSource, /outside that month&apos;s published top 25/);
  assert.match(allSource, /previousPowertrainTotals/);
  assert.match(allSource, /previousMakeRecords/);
  assert.match(allSource, /previousModelRecords/);
  assert.match(styles, /\.month-change\.up b/);
  assert.match(styles, /\.month-change\.down b/);
  assert.match(allSource, /aria-label="Leaderboard powertrain filter"/);
  assert.match(allSource, /PASSENGER VEHICLES ONLY · MA \/ MB \/ MC/);
  assert.match(allSource, /\["all", "combustion", "hybrid", "bev", "phev", "other"\]/);
  assert.match(allSource, /leaderboardPowertrain === value/);
  assert.match(allSource, /registration_month_from/);
  assert.match(allSource, /ARRIVAL CHANNEL BY POWERTRAIN/);
  assert.match(allSource, /arrivalPowertrains = \["combustion", "hybrid", "bev", "phev"\]/);
  assert.match(allSource, /className="panel arrival-panel"/);
  assert.match(allSource, /className="annual-readout"/);
  assert.match(allSource, /onMouseEnter=\{\(\) => setActiveMarketYear\(row\.year\)\}/);
  assert.match(allSource, /aria-pressed=\{activeAnnual\?\.year === row\.year\}/);
  assert.match(allSource, /className="monthly-detail-controls"/);
  assert.match(allSource, /aria-label="Previous month"/);
  assert.match(allSource, /aria-label="Next month"/);
  assert.match(allSource, /setSelectedMarketMonth/);
  assert.match(allSource, /Browse exact passenger-vehicle entries for any available month/);
  assert.match(allSource, /className="country-kicker-toggle"/);
  assert.match(allSource, /aria-pressed=\{countryView === "snapshot"\}/);
  assert.match(allSource, /setCountryView/);
  assert.match(allSource, /view\.startYear\}\+/);
  assert.match(allSource, /CURRENT FLEET · \$\{view\.startYear\}\+/);
  assert.match(allSource, /className="panel fleet-age-panel"/);
  assert.match(allSource, /CURRENT FLEET AGE · DATA AS AT/);
  assert.match(allSource, /How old are New Zealand&apos;s registered passenger cars\?/);
  assert.match(allSource, /approximate_current_age/);
  assert.match(allSource, /vehicleYearLabel/);
  assert.match(allSource, /vehicle year \$\{selectedFleetAge\.vehicleYearLabel\}/);
  assert.match(allSource, /label === "1" \? "1 year old"/);
  assert.match(allSource, /aria-label="Current registered passenger fleet by approximate age"/);
  assert.match(allSource, /onMouseEnter=\{\(\) => setActiveFleetAge\(row\.age\)\}/);
  assert.match(allSource, /manifest\.contract\.version/);
  assert.match(allSource, /manifest\.generated_at_utc/);
  assert.match(allSource, /timeZone: "Pacific\/Auckland"/);
  assert.match(allSource, /Aggregates generated <time/);
  assert.doesNotMatch(allSource, /<b>v\d+\.\d+(?:\.\d+)?<\/b> data contract/);
  assert.match(allSource, /href="https:\/\/www\.nzta\.govt\.nz\/resources\/new-zealand-motor-vehicle-register-statistics\/new-zealand-vehicle-fleet-open-data-sets"/);
  assert.match(allSource, /href="https:\/\/github\.com\/michaelocez\/nz-vehicle-market-tracker"/);
  assert.match(styles, /color-scheme:\s*dark/);
  assert.doesNotMatch(allSource, /localStorage|theme-toggle|Switch to.*mode/);
  assert.doesNotMatch(styles, /data-theme|theme-toggle/);
  assert.doesNotMatch(packageJson, /next|vinext|wrangler|cloudflare/i);
  assert.match(viteConfig, /base:\s*"\.\/"/);

  assert.match(app, /import { computeDashboardView } from "\.\/lib\/dashboardView"/);
  assert.match(app, /import { ErrorState } from "\.\/components\/ErrorState"/);
  assert.match(app, /import { Hero } from "\.\/components\/Hero"/);
  assert.match(app, /import { MarketSection } from "\.\/components\/MarketSection"/);
  assert.match(app, /import { VehiclesSection } from "\.\/components\/VehiclesSection"/);
  assert.match(app, /import { ImportsSection } from "\.\/components\/ImportsSection"/);
  assert.match(app, /import { ExplorerSection } from "\.\/components\/ExplorerSection"/);
  assert.match(app, /import { MethodologySection } from "\.\/components\/MethodologySection"/);
  assert.match(app, /import { Footer } from "\.\/components\/Footer"/);
  assert.match(allSource, /startYear: number;/);
  assert.match(allSource, /startYear = Number\(.*registration_month_from/);
  assert.doesNotMatch(app, /function Home\(\) \{[\s\S]*function render/);
  assert.doesNotMatch(app, /useState.*activeMarketYear/);
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
