import assert from "node:assert/strict";
import test from "node:test";

import { DATA_FILES, loadData } from "../src/lib/data.ts";
import { computeDashboardView } from "../src/lib/dashboardView.ts";
import { computeExplorer } from "../src/lib/explorerView.ts";
import {
  changeTone,
  fleetAgeLabel,
  makeOptionLabel,
  monthChange,
  percent,
  prettyGeneratedDate,
  prettyMonth,
  prettyMonthName,
  signedNumber,
  signedPercent,
  weightedMedian,
} from "../src/lib/utils.ts";

const CONTRACT_VERSION = "1.3.0";
const SNAPSHOT_MONTH = "2026-06";

function dataFile(records = []) {
  return { contract_version: CONTRACT_VERSION, snapshot_month: SNAPSHOT_MONTH, records };
}

function baseData(overrides = {}) {
  return {
    manifest: {
      contract: { version: CONTRACT_VERSION, scope: { registration_month_from: "2007-01" } },
      source: { snapshot_month: SNAPSHOT_MONTH },
      generated_at_utc: "2026-09-03T09:56:30Z",
      quality: { included_rows: 0, mapped_brand_rows: 0 },
      brand_coverage: { mapped_share: 1 },
    },
    summary: dataFile(),
    powertrain: dataFile(),
    makes: dataFile(),
    models: dataFile(),
    makePowertrains: dataFile(),
    modelPowertrains: dataFile(),
    scopeMakes: dataFile(),
    scopeModels: dataFile(),
    scopeMakePowertrains: dataFile(),
    scopeModelPowertrains: dataFile(),
    countries: dataFile(),
    ages: dataFile(),
    fleetAges: dataFile(),
    ...overrides,
  };
}

const summaryRecords = [
  { registration_month: "2010-03", import_status_group: "nz_new", registration_count: 5 },
  { registration_month: "2026-05", import_status_group: "nz_new", registration_count: 80 },
  { registration_month: "2026-05", import_status_group: "used_import", registration_count: 40 },
  { registration_month: "2026-05", import_status_group: "other_or_unknown", registration_count: 5 },
  { registration_month: "2026-06", import_status_group: "nz_new", registration_count: 100 },
  { registration_month: "2026-06", import_status_group: "used_import", registration_count: 50 },
  { registration_month: "2026-06", import_status_group: "other_or_unknown", registration_count: 10 },
];

const scopeMakes = dataFile([
  { import_status_group: "all", make: "TOYOTA", brand: "Toyota", brand_country: "Japan", vehicle_count: 100 },
  { import_status_group: "nz_new", make: "TOYOTA", brand: "Toyota", brand_country: "Japan", vehicle_count: 60 },
  { import_status_group: "used_import", make: "TOYOTA", brand: "Toyota", brand_country: "Japan", vehicle_count: 30 },
  { import_status_group: "other_or_unknown", make: "TOYOTA", brand: "Toyota", brand_country: "Japan", vehicle_count: 10 },
  { import_status_group: "all", make: "FORD", brand: "Ford", brand_country: "United States", vehicle_count: 50 },
  { import_status_group: "all", make: "MYSTERY", brand: "Mystery", brand_country: "Unmapped", vehicle_count: 10 },
]);

const scopeModels = dataFile([
  { import_status_group: "all", make: "TOYOTA", model: "COROLLA", vehicle_count: 70 },
  { import_status_group: "nz_new", make: "TOYOTA", model: "COROLLA", vehicle_count: 40 },
  { import_status_group: "used_import", make: "TOYOTA", model: "COROLLA", vehicle_count: 25 },
  { import_status_group: "all", make: "TOYOTA", model: "HILUX", vehicle_count: 30 },
]);

test("weightedMedian returns null when there is no measurable weight", () => {
  assert.equal(weightedMedian([]), null);
  assert.equal(weightedMedian([{ approximate_import_age: 4, registration_count: 0 }]), null);
  assert.equal(
    weightedMedian([
      { approximate_import_age: 4, registration_count: 0 },
      { approximate_import_age: 9, registration_count: 0 },
    ]),
    null,
  );
});

test("weightedMedian returns the age at the weighted midpoint, not the plain midpoint", () => {
  assert.equal(
    weightedMedian([
      { approximate_import_age: 2, registration_count: 3 },
      { approximate_import_age: 8, registration_count: 1 },
    ]),
    2,
  );
  assert.equal(
    weightedMedian([
      { approximate_import_age: 8, registration_count: 3 },
      { approximate_import_age: 2, registration_count: 1 },
    ]),
    8,
  );
});

test("monthChange reports deltas and unknown rates for a zero baseline", () => {
  assert.equal(monthChange(10, undefined), null);
  assert.deepEqual(monthChange(15, 10), { delta: 5, rate: 0.5 });
  assert.deepEqual(monthChange(5, 0), { delta: 5, rate: null });
  assert.deepEqual(monthChange(2, 5), { delta: -3, rate: -0.6 });
});

test("change tone and signed formatting cover steady, up and down cases", () => {
  assert.equal(changeTone({ delta: 0, rate: 0 }), "steady");
  assert.equal(changeTone({ delta: 4, rate: 0.1 }), "up");
  assert.equal(changeTone({ delta: -4, rate: null }), "down");

  assert.equal(signedNumber(0), "No change");
  assert.equal(signedNumber(1500), "+1,500");
  assert.equal(signedNumber(-3), "−3");

  assert.equal(signedPercent({ delta: 0, rate: 0 }), "No change");
  assert.equal(signedPercent({ delta: 5, rate: null }), "+5");
  assert.equal(signedPercent({ delta: -5, rate: -0.25 }), "−25.0%");
});

test("labels and date formatting read the way the dashboard expects", () => {
  assert.equal(percent(0.1234), "12.3%");
  assert.equal(fleetAgeLabel("31+"), "31 years and older");
  assert.equal(fleetAgeLabel("1"), "1 year old");
  assert.equal(fleetAgeLabel("7"), "7 years old");
  assert.equal(makeOptionLabel("TOYOTA", "Toyota"), "Toyota");
  assert.equal(makeOptionLabel("LEXUS", "Toyota"), "Toyota — LEXUS");

  assert.equal(prettyMonth("2026-06"), "June 2026");
  assert.equal(prettyMonthName("2026-06"), "June");
  assert.equal(prettyGeneratedDate("2026-06-30T00:00:00Z"), "30 June 2026");
  assert.equal(prettyGeneratedDate("not-a-date"), "Unknown");
});

test("loadData requests every dataset under the base path and maps aliases", async () => {
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    const name = String(url).split("/").pop();
    return { ok: true, json: async () => ({ file: name }) };
  };

  try {
    const data = await loadData("./");
    assert.deepEqual(
      requested,
      DATA_FILES.map((file) => `./data/${file}`),
    );
    assert.equal(data.manifest.file, "manifest.json");
    assert.equal(data.countries.file, "monthly_previous_country.json");
    assert.equal(data.ages.file, "monthly_import_age.json");
    assert.equal(data.fleetAges.file, "scope_vehicle_age.json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadData surfaces a failed dataset download", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: !String(url).endsWith("monthly_summary.json"),
    json: async () => ({}),
  });

  try {
    await assert.rejects(loadData("./"), /monthly_summary\.json/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("computeExplorer splits mapped and unmapped makes and totals the selected make", () => {
  const data = baseData({ scopeMakes, scopeModels });
  const explorer = computeExplorer(data, "", "");

  assert.equal(explorer.make, "TOYOTA");
  assert.equal(explorer.makeRecord?.brand, "Toyota");
  assert.deepEqual(
    explorer.mappedMakeOptions.map((row) => row.make),
    ["FORD", "TOYOTA"],
  );
  assert.deepEqual(
    explorer.unmappedMakeOptions.map((row) => row.make),
    ["MYSTERY"],
  );
  assert.deepEqual(
    explorer.modelOptions.map((row) => row.model),
    ["COROLLA", "HILUX"],
  );
  assert.equal(explorer.total, 100);
  assert.equal(explorer.nzNew, 60);
  assert.equal(explorer.used, 30);
  assert.equal(explorer.other, 10);
});

test("computeExplorer honours a selected model and ignores unknown ones", () => {
  const data = baseData({ scopeMakes, scopeModels });

  const selected = computeExplorer(data, "TOYOTA", "COROLLA");
  assert.equal(selected.model, "COROLLA");
  assert.equal(selected.total, 70);

  const unknown = computeExplorer(data, "TOYOTA", "DOES-NOT-EXIST");
  assert.equal(unknown.model, "");
  assert.equal(unknown.total, 100);
});

test("computeDashboardView derives the latest month, totals and prior-month change", () => {
  const view = computeDashboardView(
    baseData({ summary: dataFile(summaryRecords) }),
    "all",
    "latest",
    "all",
  );

  assert.equal(view.latest, "2026-06");
  assert.equal(view.previousMonth, "2026-05");
  assert.equal(view.startYear, 2007);
  assert.equal(view.nzNew, 100);
  assert.equal(view.used, 50);
  assert.equal(view.latestTotal, 160);
  assert.deepEqual(view.latestTotalChange, monthChange(160, 125));
});

test("computeDashboardView annualises within the requested range", () => {
  const data = baseData({ summary: dataFile(summaryRecords) });

  const all = computeDashboardView(data, "all", "latest", "all").annual;
  assert.deepEqual(
    all.map((row) => row.year),
    [2010, 2026],
  );
  assert.deepEqual(
    all.find((row) => row.year === 2026),
    { year: 2026, nz_new: 180, used_import: 90 },
  );

  const recent = computeDashboardView(data, "5y", "latest", "all").annual;
  assert.deepEqual(
    recent.map((row) => row.year),
    [2026],
  );
});

test("computeDashboardView reports a weighted median age, or null without ages", () => {
  const ages = dataFile([
    { registration_month: "2026-05", approximate_import_age: 15, registration_count: 100 },
    { registration_month: "2026-06", approximate_import_age: 2, registration_count: 10 },
    { registration_month: "2026-06", approximate_import_age: 10, registration_count: 10 },
  ]);

  const withAges = computeDashboardView(
    baseData({ summary: dataFile(summaryRecords), ages }),
    "all",
    "latest",
    "all",
  );
  assert.equal(withAges.medianAge, 2);

  const withoutAges = computeDashboardView(
    baseData({ summary: dataFile(summaryRecords) }),
    "all",
    "latest",
    "all",
  );
  assert.equal(withoutAges.medianAge, null);
});

test("computeDashboardView sums electric powertrains and describes the ranking context", () => {
  const powertrain = dataFile([
    { registration_month: "2026-05", import_status_group: "all", powertrain_group: "combustion", registration_count: 80 },
    { registration_month: "2026-06", import_status_group: "all", powertrain_group: "combustion", registration_count: 100 },
    { registration_month: "2026-06", import_status_group: "all", powertrain_group: "bev", registration_count: 20 },
    { registration_month: "2026-06", import_status_group: "all", powertrain_group: "phev", registration_count: 5 },
    { registration_month: "2026-06", import_status_group: "all", powertrain_group: "hybrid", registration_count: 10 },
  ]);

  const view = computeDashboardView(
    baseData({ summary: dataFile(summaryRecords), powertrain }),
    "all",
    "latest",
    "all",
  );

  assert.equal(view.electric, 25);
  assert.equal(view.vehicleTotal, 135);
  assert.deepEqual(
    view.powertrains.map((row) => row.name),
    ["combustion", "bev", "hybrid", "phev"],
  );
  assert.deepEqual(view.powertrainChanges.get("combustion"), { delta: 20, rate: 0.25 });

  const filtered = computeDashboardView(
    baseData({ summary: dataFile(summaryRecords), powertrain }),
    "all",
    "latest",
    "bev",
  );
  assert.equal(filtered.rankingContext, "BEV · JUNE 2026");
});

test("computeDashboardView ranks snapshot makes by vehicle count", () => {
  const view = computeDashboardView(
    baseData({ summary: dataFile(summaryRecords), scopeMakes, scopeModels }),
    "all",
    "snapshot",
    "all",
  );

  assert.deepEqual(
    view.topMakes,
    [
      { import_status_group: "all", make: "TOYOTA", brand: "Toyota", brand_country: "Japan", vehicle_count: 100, rank: 1, registration_count: 100 },
      { import_status_group: "all", make: "FORD", brand: "Ford", brand_country: "United States", vehicle_count: 50, rank: 2, registration_count: 50 },
      { import_status_group: "all", make: "MYSTERY", brand: "Mystery", brand_country: "Unmapped", vehicle_count: 10, rank: 3, registration_count: 10 },
    ],
  );
});

test("computeDashboardView summarises the current fleet age distribution", () => {
  const fleetAges = dataFile([
    { approximate_current_age: 5, vehicle_count: 3 },
    { approximate_current_age: 10, vehicle_count: 1 },
  ]);

  const view = computeDashboardView(
    baseData({ summary: dataFile(summaryRecords), fleetAges }),
    "all",
    "snapshot",
    "all",
  );

  assert.equal(view.fleetAgeTotal, 4);
  assert.equal(view.fleetAgeMean, 6.25);
  assert.equal(view.fleetAgeMedian, 5);
  assert.deepEqual(view.fleetAgeMode, { approximate_current_age: 5, vehicle_count: 3 });
  assert.equal(view.fleetSnapshotYear, 2026);
});
