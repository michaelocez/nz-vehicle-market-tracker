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
  assert.match(app, /htmlFor="make-select"/);
  assert.match(app, /<optgroup label="Recognised makes">/);
  assert.match(app, /<optgroup label="Other \/ unmapped source makes">/);
  assert.match(app, /Vehicles represented in the current NZTA fleet snapshot/);
  assert.match(styles, /color-scheme:\s*dark/);
  assert.doesNotMatch(app, /localStorage|theme-toggle|Switch to.*mode/);
  assert.doesNotMatch(styles, /data-theme|theme-toggle/);
  assert.doesNotMatch(packageJson, /next|vinext|wrangler|cloudflare/i);
  assert.match(viteConfig, /base:\s*"\.\/"/);
});

test("synced data matches the approved production snapshot", async () => {
  const [manifest, summary, scopeMakes, scopeModels] = await Promise.all([
    readFile(new URL("../public/data/manifest.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/monthly_summary.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/scope_make.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/scope_model.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.equal(manifest.contract.scope.vehicle_type, "PASSENGER CAR/VAN");
  assert.deepEqual(manifest.contract.scope.classes, ["MA", "MB", "MC"]);
  assert.equal(summary.snapshot_month, "2026-06");

  const latest = Object.fromEntries(
    summary.records
      .filter((row) => row.registration_month === summary.snapshot_month)
      .map((row) => [row.import_status_group, row.registration_count]),
  );
  assert.deepEqual(latest, { nz_new: 9957, other_or_unknown: 6, used_import: 7563 });
  assert.equal(
    scopeMakes.records.filter((row) => row.import_status_group === "all").reduce((sum, row) => sum + row.vehicle_count, 0),
    manifest.quality.included_rows,
  );
  assert.equal(
    scopeModels.records.filter((row) => row.import_status_group === "all").reduce((sum, row) => sum + row.vehicle_count, 0),
    manifest.quality.included_rows,
  );
});

test("Cloudflare and Sites scaffolding is absent", async () => {
  for (const path of ["../.openai", "../worker", "../build", "../next.config.ts"]) {
    await assert.rejects(access(new URL(path, import.meta.url)));
  }
});
