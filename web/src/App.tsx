import { useEffect, useMemo, useState } from "react";

type Range = "5y" | "10y" | "all";
type VehicleView = "latest" | "snapshot";
type LeaderboardPowertrain = "all" | "combustion" | "hybrid" | "bev" | "phev" | "other";
type CountRecord = { registration_month: string; registration_count: number };
type SummaryRecord = CountRecord & { import_status_group: string };
type PowertrainRecord = SummaryRecord & { powertrain_group: string };
type MakeRecord = SummaryRecord & { make: string; brand: string; brand_country: string; rank: number };
type ModelRecord = SummaryRecord & { make: string; model: string; rank: number };
type ScopeMakeRecord = { import_status_group: string; make: string; brand: string; brand_country: string; vehicle_count: number };
type ScopeModelRecord = { import_status_group: string; make: string; model: string; vehicle_count: number };
type MakePowertrainRecord = CountRecord & { powertrain_group: string; make: string; brand: string; brand_country: string; rank: number };
type ModelPowertrainRecord = CountRecord & { powertrain_group: string; make: string; model: string; rank: number };
type ScopeMakePowertrainRecord = { powertrain_group: string; make: string; brand: string; brand_country: string; vehicle_count: number; rank: number };
type ScopeModelPowertrainRecord = { powertrain_group: string; make: string; model: string; vehicle_count: number; rank: number };
type CountryRecord = CountRecord & { previous_country: string };
type AgeRecord = CountRecord & { approximate_import_age: number };
type DataFile<T> = { contract_version: string; snapshot_month: string; records: T[] };
type Manifest = {
  contract: { version: string };
  source: { snapshot_month: string };
  quality: { included_rows: number; mapped_brand_rows: number };
  brand_coverage: { mapped_share: number };
};
type DashboardData = {
  manifest: Manifest;
  summary: DataFile<SummaryRecord>;
  powertrain: DataFile<PowertrainRecord>;
  makes: DataFile<MakeRecord>;
  models: DataFile<ModelRecord>;
  makePowertrains: DataFile<MakePowertrainRecord>;
  modelPowertrains: DataFile<ModelPowertrainRecord>;
  scopeMakes: DataFile<ScopeMakeRecord>;
  scopeModels: DataFile<ScopeModelRecord>;
  scopeMakePowertrains: DataFile<ScopeMakePowertrainRecord>;
  scopeModelPowertrains: DataFile<ScopeModelPowertrainRecord>;
  countries: DataFile<CountryRecord>;
  ages: DataFile<AgeRecord>;
};

const number = new Intl.NumberFormat("en-NZ");
const compact = new Intl.NumberFormat("en-NZ", { notation: "compact", maximumFractionDigits: 1 });
const monthLabel = new Intl.DateTimeFormat("en-NZ", { month: "long", year: "numeric", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat("en-NZ", { month: "long", timeZone: "UTC" });

const powertrainLabel: Record<string, string> = {
  bev: "Battery electric",
  phev: "Plug-in hybrid",
  hybrid: "Hybrid",
  combustion: "Combustion",
  range_extended_electric: "Range-extended EV",
  hydrogen_fuel_cell: "Hydrogen fuel cell",
  other_or_unknown: "Other / unknown",
};

const arrivalPowertrains = ["combustion", "hybrid", "bev", "phev"];
const leaderboardPowertrains: LeaderboardPowertrain[] = ["all", "combustion", "hybrid", "bev", "phev", "other"];
const leaderboardPowertrainLabel: Record<LeaderboardPowertrain, string> = {
  all: "All",
  combustion: "Combustion",
  hybrid: "Hybrid",
  bev: "BEV",
  phev: "PHEV",
  other: "Other",
};

function prettyMonth(value: string) {
  return monthLabel.format(new Date(`${value}-01T00:00:00Z`));
}

function prettyMonthName(value: string) {
  return monthName.format(new Date(`${value}-01T00:00:00Z`));
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function makeOptionLabel(row: ScopeMakeRecord) {
  return row.make === row.brand.toUpperCase() ? row.brand : `${row.brand} — ${row.make}`;
}

function annualise(records: SummaryRecord[], range: Range) {
  const lastYear = Math.max(...records.map((row) => Number(row.registration_month.slice(0, 4))));
  const fromYear = range === "5y" ? lastYear - 4 : range === "10y" ? lastYear - 9 : 2007;
  const years = new Map<number, { year: number; nz_new: number; used_import: number }>();
  for (const row of records) {
    const year = Number(row.registration_month.slice(0, 4));
    if (year < fromYear || row.import_status_group === "other_or_unknown") continue;
    const current = years.get(year) ?? { year, nz_new: 0, used_import: 0 };
    if (row.import_status_group === "nz_new") current.nz_new += row.registration_count;
    if (row.import_status_group === "used_import") current.used_import += row.registration_count;
    years.set(year, current);
  }
  return [...years.values()];
}

function weightedMedian(records: AgeRecord[]) {
  const ordered = [...records].sort((a, b) => a.approximate_import_age - b.approximate_import_age);
  const halfway = ordered.reduce((sum, row) => sum + row.registration_count, 0) / 2;
  let cumulative = 0;
  for (const row of ordered) {
    cumulative += row.registration_count;
    if (cumulative >= halfway) return row.approximate_import_age;
  }
  return 0;
}

function ErrorState() {
  return (
    <main className="state-page">
      <div className="state-card">
        <span className="eyebrow">DATA UNAVAILABLE</span>
        <h1>The dashboard could not load its local aggregates.</h1>
        <p>Run <code>npm run sync:data</code> from the web folder, then refresh this page.</p>
      </div>
    </main>
  );
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<Range>("10y");
  const [vehicleView, setVehicleView] = useState<VehicleView>("latest");
  const [leaderboardPowertrain, setLeaderboardPowertrain] = useState<LeaderboardPowertrain>("all");
  const [activeMarketYear, setActiveMarketYear] = useState<number | null>(null);
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedModel, setSelectedModel] = useState("");

  useEffect(() => {
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
      "monthly_previous_country.json",
      "monthly_import_age.json",
    ];
    Promise.all(files.map((file) => fetch(`${import.meta.env.BASE_URL}data/${file}`).then((response) => {
      if (!response.ok) throw new Error(file);
      return response.json();
    })))
      .then(([manifest, summary, powertrain, makes, models, makePowertrains, modelPowertrains, scopeMakes, scopeModels, scopeMakePowertrains, scopeModelPowertrains, countries, ages]) => {
        setData({ manifest, summary, powertrain, makes, models, makePowertrains, modelPowertrains, scopeMakes, scopeModels, scopeMakePowertrains, scopeModelPowertrains, countries, ages });
      })
      .catch(() => setError(true));
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const latest = data.summary.snapshot_month;
    const latestSummary = data.summary.records.filter((row) => row.registration_month === latest);
    const nzNew = latestSummary.find((row) => row.import_status_group === "nz_new")?.registration_count ?? 0;
    const used = latestSummary.find((row) => row.import_status_group === "used_import")?.registration_count ?? 0;
    const other = latestSummary.find((row) => row.import_status_group === "other_or_unknown")?.registration_count ?? 0;
    const latestTotal = nzNew + used + other;
    const annual = annualise(data.summary.records, range);
    const annualMax = Math.max(...annual.flatMap((row) => [row.nz_new, row.used_import]));
    const displayedPowertrain = vehicleView === "latest"
      ? data.powertrain.records.filter((row) => row.registration_month === latest)
      : data.powertrain.records;
    const powertrains = [...displayedPowertrain.reduce((map, row) => {
      map.set(row.powertrain_group, (map.get(row.powertrain_group) ?? 0) + row.registration_count);
      return map;
    }, new Map<string, number>())]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const arrivalMix = arrivalPowertrains.map((name) => {
      const records = displayedPowertrain.filter((row) => row.powertrain_group === name);
      const countFor = (status: string) => records
        .filter((row) => row.import_status_group === status)
        .reduce((sum, row) => sum + row.registration_count, 0);
      return {
        name,
        total: records.reduce((sum, row) => sum + row.registration_count, 0),
        nzNew: countFor("nz_new"),
        used: countFor("used_import"),
        other: countFor("other_or_unknown"),
      };
    });
    const powertrainMax = Math.max(...powertrains.map((row) => row.value));
    const topMakes = vehicleView === "latest"
      ? (leaderboardPowertrain === "all" ? data.makes.records : data.makePowertrains.records)
        .filter((row) => row.registration_month === latest
          && (leaderboardPowertrain === "all"
            ? (row as MakeRecord).import_status_group === "all"
            : (row as MakePowertrainRecord).powertrain_group === leaderboardPowertrain))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 5)
      : (leaderboardPowertrain === "all" ? data.scopeMakes.records : data.scopeMakePowertrains.records)
        .filter((row) => leaderboardPowertrain === "all"
          ? (row as ScopeMakeRecord).import_status_group === "all"
          : (row as ScopeMakePowertrainRecord).powertrain_group === leaderboardPowertrain)
        .sort((a, b) => leaderboardPowertrain === "all"
          ? b.vehicle_count - a.vehicle_count
          : (a as ScopeMakePowertrainRecord).rank - (b as ScopeMakePowertrainRecord).rank)
        .slice(0, 5)
        .map((row, index) => ({ ...row, rank: index + 1, registration_count: row.vehicle_count }));
    const topModels = vehicleView === "latest"
      ? (leaderboardPowertrain === "all" ? data.models.records : data.modelPowertrains.records)
        .filter((row) => row.registration_month === latest
          && (leaderboardPowertrain === "all"
            ? (row as ModelRecord).import_status_group === "all"
            : (row as ModelPowertrainRecord).powertrain_group === leaderboardPowertrain))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 5)
      : (leaderboardPowertrain === "all" ? data.scopeModels.records : data.scopeModelPowertrains.records)
        .filter((row) => leaderboardPowertrain === "all"
          ? (row as ScopeModelRecord).import_status_group === "all"
          : (row as ScopeModelPowertrainRecord).powertrain_group === leaderboardPowertrain)
        .sort((a, b) => leaderboardPowertrain === "all"
          ? b.vehicle_count - a.vehicle_count
          : (a as ScopeModelPowertrainRecord).rank - (b as ScopeModelPowertrainRecord).rank)
        .slice(0, 5)
        .map((row, index) => ({ ...row, rank: index + 1, registration_count: row.vehicle_count }));
    const topCountries = data.countries.records
      .filter((row) => row.registration_month === latest)
      .sort((a, b) => b.registration_count - a.registration_count)
      .slice(0, 6);
    const countryMax = Math.max(...topCountries.map((row) => row.registration_count));
    const latestAges = data.ages.records.filter((row) => row.registration_month === latest);
    const ageBuckets = [
      { label: "0–2 years", min: 0, max: 2 },
      { label: "3–5 years", min: 3, max: 5 },
      { label: "6–8 years", min: 6, max: 8 },
      { label: "9–11 years", min: 9, max: 11 },
      { label: "12+ years", min: 12, max: 100 },
    ].map((bucket) => ({
      label: bucket.label,
      value: latestAges
        .filter((row) => row.approximate_import_age >= bucket.min && row.approximate_import_age <= bucket.max)
        .reduce((sum, row) => sum + row.registration_count, 0),
    }));
    const ageMax = Math.max(...ageBuckets.map((row) => row.value));
    const electric = powertrains
      .filter((row) => ["bev", "phev"].includes(row.name))
      .reduce((sum, row) => sum + row.value, 0);
    const vehicleTotal = powertrains.reduce((sum, row) => sum + row.value, 0);
    const vehicleLabel = vehicleView === "latest"
      ? prettyMonth(latest).toUpperCase()
      : "CURRENT FLEET SNAPSHOT · 2007+";
    const rankingContext = leaderboardPowertrain === "all"
      ? vehicleLabel
      : `${leaderboardPowertrainLabel[leaderboardPowertrain].toUpperCase()} · ${vehicleLabel}`;
    return {
      latest, nzNew, used, latestTotal, annual, annualMax, powertrains, powertrainMax, arrivalMix,
      topMakes, topModels, topCountries, countryMax, ageBuckets, ageMax,
      medianAge: weightedMedian(latestAges), electric, vehicleTotal, vehicleLabel, rankingContext,
    };
  }, [data, range, vehicleView, leaderboardPowertrain]);

  const explorer = useMemo(() => {
    if (!data) return null;
    const makeRecords = data.scopeMakes.records.filter((row) => row.import_status_group === "all");
    const defaultMake = [...makeRecords].sort((a, b) => b.vehicle_count - a.vehicle_count)[0];
    const makeOptions = makeRecords
      .sort((a, b) => makeOptionLabel(a).localeCompare(makeOptionLabel(b)));
    const mappedMakeOptions = makeOptions.filter((row) => row.brand_country !== "Unmapped");
    const unmappedMakeOptions = makeOptions.filter((row) => row.brand_country === "Unmapped");
    const make = selectedMake || defaultMake?.make || "";
    const makeRecord = makeOptions.find((row) => row.make === make);
    const modelOptions = data.scopeModels.records
      .filter((row) => row.import_status_group === "all" && row.make === make)
      .sort((a, b) => a.model.localeCompare(b.model));
    const model = selectedModel && modelOptions.some((row) => row.model === selectedModel)
      ? selectedModel
      : "";
    const records = model
      ? data.scopeModels.records.filter((row) => row.make === make && row.model === model)
      : data.scopeMakes.records.filter((row) => row.make === make);
    const countFor = (status: string) => records.find((row) => row.import_status_group === status)?.vehicle_count ?? 0;
    return {
      make,
      model,
      makeRecord,
      mappedMakeOptions,
      unmappedMakeOptions,
      modelOptions,
      total: countFor("all"),
      nzNew: countFor("nz_new"),
      used: countFor("used_import"),
      other: countFor("other_or_unknown"),
    };
  }, [data, selectedMake, selectedModel]);

  if (error) return <ErrorState />;
  if (!data || !view || !explorer) {
    return <main className="state-page"><div className="loading-line" aria-label="Loading dashboard" /></main>;
  }

  const activeAnnual = view.annual.find((row) => row.year === activeMarketYear)
    ?? view.annual.at(-1);

  return (
    <main>
      <header className="hero" id="overview">
        <nav className="nav wrap" aria-label="Primary navigation">
          <a className="brand-mark" href="#overview" aria-label="NZ Vehicle Market Tracker home">
            <span>NZ</span><b>Vehicle Market Tracker</b>
          </a>
          <div className="nav-links">
            <a href="#market">Market</a>
            <a href="#vehicles">Vehicles</a>
            <a href="#imports">Imports</a>
            <a href="#explorer">Explorer</a>
            <a href="#methodology">Methodology</a>
          </div>
        </nav>

        <div className="hero-content wrap">
          <div className="hero-copy">
            <span className="eyebrow">NEW ZEALAND · PASSENGER VEHICLES · 2007–2026</span>
            <h1>How New Zealand&apos;s car market is changing.</h1>
            <p className="hero-intro">
              A monthly view of NZ-new cars, used imports, powertrains and the vehicles entering the fleet.
            </p>
            <div className="scope-note">
              <span className="scope-dot" />
              Data through <strong>{prettyMonth(view.latest)}</strong> · NZTA current-fleet snapshot
            </div>
          </div>
          <div className="hero-stat" aria-label={`${number.format(view.latestTotal)} passenger vehicles entered the fleet in ${prettyMonth(view.latest)}`}>
            <span className="stat-kicker">{prettyMonth(view.latest)}</span>
            <strong>{number.format(view.latestTotal)}</strong>
            <span>passenger vehicles entered the NZ fleet</span>
            <div className="split-meter" aria-hidden="true">
              <i style={{ width: `${(view.nzNew / view.latestTotal) * 100}%` }} />
            </div>
            <div className="split-labels">
              <span><b>{percent(view.nzNew / view.latestTotal)}</b> NZ-new</span>
              <span><b>{percent(view.used / view.latestTotal)}</b> used imports</span>
            </div>
          </div>
        </div>
      </header>

      <section className="section wrap" id="market">
        <div className="section-heading">
          <div><span className="section-number">01</span><h2>Market flow</h2></div>
          <div className="range-control" aria-label="Chart range">
            {(["5y", "10y", "all"] as Range[]).map((value) => (
              <button key={value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>
                {value === "all" ? "All" : value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <p className="section-lead">Annual passenger-vehicle entries, split by how they first arrived in New Zealand.</p>

        <div className="chart-card market-card">
          <div className="market-chart-toolbar">
            {activeAnnual && (
              <div className="annual-readout" aria-label={`Selected year ${activeAnnual.year}`}>
                <strong>{activeAnnual.year}</strong>
                <span className="readout-new"><b>{number.format(activeAnnual.nz_new)}</b>NZ-new</span>
                <span className="readout-used"><b>{number.format(activeAnnual.used_import)}</b>Used imports</span>
              </div>
            )}
            <div className="chart-key" aria-hidden="true"><span className="key-new">NZ-new</span><span className="key-used">Used imports</span></div>
          </div>
          <div className="year-chart" role="group" aria-label="Annual NZ-new and used-import passenger vehicle registrations">
            {view.annual.map((row) => (
              <button
                type="button"
                className={`year-column${activeAnnual?.year === row.year ? " active" : ""}`}
                key={row.year}
                aria-label={`${row.year}: ${number.format(row.nz_new)} NZ-new, ${number.format(row.used_import)} used imports`}
                aria-pressed={activeAnnual?.year === row.year}
                onMouseEnter={() => setActiveMarketYear(row.year)}
                onFocus={() => setActiveMarketYear(row.year)}
                onClick={() => setActiveMarketYear(row.year)}
              >
                <div className="year-bars" aria-hidden="true">
                  <i className="bar-new" style={{ height: `${Math.max(2, (row.nz_new / view.annualMax) * 100)}%` }} />
                  <i className="bar-used" style={{ height: `${Math.max(2, (row.used_import / view.annualMax) * 100)}%` }} />
                </div>
                <span>{row.year}</span>
              </button>
            ))}
          </div>
          <p className="chart-note">{view.latest.slice(0, 4)} is year-to-date through {prettyMonthName(view.latest)}. Hover, focus or tap a year for exact counts.</p>
        </div>

        <div className="insight-strip">
          <article><span>NZ-new</span><strong>{number.format(view.nzNew)}</strong><p>vehicles in {prettyMonth(view.latest)}</p></article>
          <article><span>Used imports</span><strong>{number.format(view.used)}</strong><p>vehicles in {prettyMonth(view.latest)}</p></article>
          <article className="accent"><span>Import mix</span><strong>{percent(view.used / view.latestTotal)}</strong><p>of the latest month came in used</p></article>
        </div>
      </section>

      <section className="section section-tint" id="vehicles">
        <div className="wrap">
          <div className="section-heading">
            <div><span className="section-number">02</span><h2>What shapes the fleet?</h2></div>
            <div className="range-control vehicle-view-control" aria-label="Vehicle ranking view">
              {(["latest", "snapshot"] as VehicleView[]).map((value) => (
                <button
                  key={value}
                  className={vehicleView === value ? "active" : ""}
                  aria-pressed={vehicleView === value}
                  onClick={() => setVehicleView(value)}
                >
                  {value === "latest" ? "Latest entries" : "Current fleet"}
                </button>
              ))}
            </div>
          </div>
          <p className="section-lead vehicle-section-lead">
            {vehicleView === "latest"
              ? "The powertrains, makes and models shaping the latest month."
              : "The powertrains, makes and models represented across the current scoped fleet."}
          </p>
          <div className="ranking-filter-row">
            <span className="scope-note">PASSENGER VEHICLES ONLY · MA / MB / MC</span>
            <div className="ranking-filter" aria-label="Leaderboard powertrain filter">
              <span>Rankings</span>
              <div className="range-control">
                {leaderboardPowertrains.map((value) => (
                  <button
                    key={value}
                    className={leaderboardPowertrain === value ? "active" : ""}
                    aria-pressed={leaderboardPowertrain === value}
                    onClick={() => setLeaderboardPowertrain(value)}
                  >
                    {leaderboardPowertrainLabel[value]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <article className="panel powertrain-panel">
              <div className="panel-heading"><div><span className="panel-kicker">POWERTRAIN · {view.vehicleLabel}</span><h3>Combustion still leads.<br />Electrified cars are visible.</h3></div><strong>{percent(view.electric / view.vehicleTotal)}<small>BEV + PHEV</small></strong></div>
              <div className="bar-list">
                {view.powertrains.slice(0, 6).map((row) => (
                  <div className="bar-row" key={row.name}>
                    <div><span>{powertrainLabel[row.name] ?? row.name}</span><b>{number.format(row.value)}</b></div>
                    <i><em style={{ width: `${(row.value / view.powertrainMax) * 100}%` }} /></i>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel ranking-panel">
              <span className="panel-kicker">TOP MAKES · {view.rankingContext}</span>
              <ol>
                {view.topMakes.map((row) => (
                  <li key={row.make}><span className="rank">{String(row.rank).padStart(2, "0")}</span><div><strong>{row.brand}</strong><small>{row.brand_country}</small></div><b>{number.format(row.registration_count)}</b></li>
                ))}
              </ol>
            </article>

            <article className="panel arrival-panel">
              <div className="arrival-mix-heading">
                <span className="panel-kicker">ARRIVAL CHANNEL BY POWERTRAIN</span>
                <div className="arrival-key" aria-hidden="true"><span>NZ-new</span><span>Used</span><span>Other</span></div>
              </div>
              <div className="arrival-mix-list">
                {view.arrivalMix.map((row) => (
                  <div className="arrival-mix-row" key={row.name}>
                    <div><span>{powertrainLabel[row.name]}</span><small>{percent(row.nzNew / row.total)} new · {percent(row.used / row.total)} used</small><b>{number.format(row.total)}</b></div>
                    <div className="arrival-track" role="img" aria-label={`${powertrainLabel[row.name]}: ${number.format(row.nzNew)} NZ-new, ${number.format(row.used)} used imports and ${number.format(row.other)} other or unknown`}>
                      <i className="arrival-new" style={{ width: `${(row.nzNew / row.total) * 100}%` }} />
                      <i className="arrival-used" style={{ width: `${(row.used / row.total) * 100}%` }} />
                      <i className="arrival-other" style={{ width: `${(row.other / row.total) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel ranking-panel">
              <span className="panel-kicker">TOP MODELS · {view.rankingContext}</span>
              <ol>
                {view.topModels.map((row) => (
                  <li key={`${row.make}-${row.model}`}><span className="rank">{String(row.rank).padStart(2, "0")}</span><div><strong>{row.model}</strong><small>{row.make}</small></div><b>{number.format(row.registration_count)}</b></li>
                ))}
              </ol>
            </article>
          </div>
        </div>
      </section>

      <section className="section wrap" id="imports">
        <div className="section-heading"><div><span className="section-number">03</span><h2>The used-import story</h2></div></div>
        <p className="section-lead">Where used cars were previously registered—and how old comparable imports were at NZ entry.</p>

        <div className="imports-grid">
          <article className="panel country-panel">
            <div className="panel-heading simple"><div><span className="panel-kicker">PREVIOUS COUNTRY</span><h3>Japan dominates the import channel.</h3></div></div>
            <div className="country-list">
              {view.topCountries.map((row, index) => (
                <div className="country-row" key={row.previous_country}>
                  <span>{String(index + 1).padStart(2, "0")}</span><strong>{row.previous_country}</strong>
                  <i><em style={{ width: `${(row.registration_count / view.countryMax) * 100}%` }} /></i>
                  <b>{number.format(row.registration_count)}</b>
                </div>
              ))}
            </div>
            <p className="chart-note">Previous country means prior registration/import country, not manufacturing country.</p>
          </article>

          <article className="panel age-panel">
            <div className="panel-heading"><div><span className="panel-kicker">APPROXIMATE IMPORT AGE</span><h3>Most comparable used imports arrive well-used.</h3></div><strong>{view.medianAge}<small>median years</small></strong></div>
            <div className="age-chart">
              {view.ageBuckets.map((row) => (
                <div className="age-column" key={row.label} title={`${row.label}: ${number.format(row.value)}`}>
                  <div><i style={{ height: `${Math.max(3, (row.value / view.ageMax) * 100)}%` }} /></div>
                  <b>{compact.format(row.value)}</b><span>{row.label}</span>
                </div>
              ))}
            </div>
            <p className="chart-note">Comparable cohort only: used imports with vehicle year 2007 or later.</p>
          </article>
        </div>
      </section>

      <section className="section section-tint" id="explorer">
        <div className="wrap">
          <div className="section-heading"><div><span className="section-number">04</span><h2>Find a make or model</h2></div></div>
          <p className="section-lead">Explore exact totals across the current snapshot, beyond the monthly top-five rankings.</p>

          <div className="explorer-grid">
            <div className="explorer-controls">
              <div>
                <label htmlFor="make-select">Make</label>
                <select
                  id="make-select"
                  value={explorer.make}
                  onChange={(event) => {
                    setSelectedMake(event.target.value);
                    setSelectedModel("");
                  }}
                >
                  <optgroup label="Recognised makes">
                    {explorer.mappedMakeOptions.map((row) => <option key={row.make} value={row.make}>{makeOptionLabel(row)}</option>)}
                  </optgroup>
                  {explorer.unmappedMakeOptions.length > 0 && (
                    <optgroup label="Other / unmapped source makes">
                      {explorer.unmappedMakeOptions.map((row) => <option key={row.make} value={row.make}>{makeOptionLabel(row)}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="model-select">Model</label>
                <select id="model-select" value={explorer.model} onChange={(event) => setSelectedModel(event.target.value)}>
                  <option value="">All {explorer.makeRecord?.brand ?? explorer.make} models</option>
                  {explorer.modelOptions.map((row) => <option key={row.model} value={row.model}>{row.model}</option>)}
                </select>
              </div>
              <p>Model labels follow NZTA source categories, so related variants may appear separately.</p>
            </div>

            <article className="explorer-result" aria-live="polite">
              <span className="panel-kicker">CURRENT FLEET SNAPSHOT · 2007+ SCOPE</span>
              <div className="explorer-title">
                <div><h3>{explorer.model || explorer.makeRecord?.brand || explorer.make}</h3><p>{explorer.model ? explorer.makeRecord?.brand : explorer.makeRecord?.brand_country}</p></div>
                <strong>{number.format(explorer.total)}<small>vehicles represented</small></strong>
              </div>
              <div className="explorer-meter" aria-label={`${number.format(explorer.nzNew)} NZ-new and ${number.format(explorer.used)} used imports`}>
                <i style={{ width: `${explorer.total ? (explorer.nzNew / explorer.total) * 100 : 0}%` }} />
                <em style={{ width: `${explorer.total ? (explorer.used / explorer.total) * 100 : 0}%` }} />
              </div>
              <div className="explorer-breakdown">
                <span><b>{number.format(explorer.nzNew)}</b>NZ-new</span>
                <span><b>{number.format(explorer.used)}</b>Used imports</span>
                <span><b>{number.format(explorer.other)}</b>Other / unknown</span>
                <span><b>{percent(explorer.total / data.manifest.quality.included_rows)}</b>of scoped fleet</span>
              </div>
              <p className="explorer-note">Vehicles represented in the current NZTA fleet snapshot that were first registered in New Zealand from 2007 onward.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="methodology" id="methodology">
        <div className="wrap methodology-grid">
          <div><span className="eyebrow">READ THE NUMBERS CAREFULLY</span><h2>A focused view of ordinary passenger vehicles.</h2></div>
          <div className="method-copy">
            <p>This dashboard includes NZTA <strong>PASSENGER CAR/VAN</strong> records in classes MA, MB and MC, first registered in New Zealand from January 2007 onward.</p>
            <p>It excludes motorcycles, trucks, buses, trailers, caravans, ATVs, tractors and special-purpose machinery. Earlier cohorts reconstructed from the current fleet carry survivorship bias.</p>
            <div className="method-stats"><span><b>{compact.format(data.manifest.quality.included_rows)}</b> scoped records</span><span><b>{percent(data.manifest.brand_coverage.mapped_share)}</b> brand mapping</span><span><b>v{data.manifest.contract.version}</b> data contract</span></div>
          </div>
        </div>
      </section>

      <footer className="footer wrap">
        <span>NZ Vehicle Market Tracker</span>
        <p>
          Source: <a href="https://www.nzta.govt.nz/resources/new-zealand-motor-vehicle-register-statistics/new-zealand-vehicle-fleet-open-data-sets" target="_blank" rel="noreferrer">NZTA vehicle fleet open data ↗</a> · Current-fleet snapshot
        </p>
      </footer>
    </main>
  );
}
