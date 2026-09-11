import { useEffect, useMemo, useState } from "react";

import { ErrorState } from "./components/ErrorState";
import { FleetShapingSection } from "./components/FleetShapingSection";
import { HeroSection } from "./components/HeroSection";
import { MarketFlowSection } from "./components/MarketFlowSection";
import { MethodologySection } from "./components/MethodologySection";
import { UsedImportSection } from "./components/UsedImportSection";
import { VehicleExplorerSection } from "./components/VehicleExplorerSection";
import type {
  DashboardData,
  DashboardView,
  LeaderboardPowertrain,
  MakePowertrainRecord,
  MakeRecord,
  ModelPowertrainRecord,
  ModelRecord,
  Range,
  ScopeMakePowertrainRecord,
  ScopeMakeRecord,
  ScopeModelPowertrainRecord,
  ScopeModelRecord,
  VehicleExplorerData,
  VehicleView,
} from "./types";
import {
  annualise,
  arrivalPowertrains,
  leaderboardPowertrainLabel,
  makeOptionLabel,
  monthChange,
  prettyMonth,
  weightedMedian,
} from "./utils/formatters";

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<Range>("10y");
  const [vehicleView, setVehicleView] = useState<VehicleView>("latest");
  const [leaderboardPowertrain, setLeaderboardPowertrain] = useState<LeaderboardPowertrain>("all");
  const [activeMarketYear, setActiveMarketYear] = useState<number | null>(null);
  const [selectedMarketMonth, setSelectedMarketMonth] = useState("");
  const [countryView, setCountryView] = useState<VehicleView>("latest");
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [activeFleetAge, setActiveFleetAge] = useState<number | null>(null);

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
      "scope_vehicle_age.json",
      "monthly_previous_country.json",
      "monthly_import_age.json",
    ];
    Promise.all(
      files.map((file) =>
        fetch(`${import.meta.env.BASE_URL}data/${file}`).then((response) => {
          if (!response.ok) throw new Error(file);
          return response.json();
        }),
      ),
    )
      .then(
        ([
          manifest,
          summary,
          powertrain,
          makes,
          models,
          makePowertrains,
          modelPowertrains,
          scopeMakes,
          scopeModels,
          scopeMakePowertrains,
          scopeModelPowertrains,
          fleetAges,
          countries,
          ages,
        ]) => {
          setData({
            manifest,
            summary,
            powertrain,
            makes,
            models,
            makePowertrains,
            modelPowertrains,
            scopeMakes,
            scopeModels,
            scopeMakePowertrains,
            scopeModelPowertrains,
            fleetAges,
            countries,
            ages,
          });
        },
      )
      .catch(() => setError(true));
  }, []);

  const view: DashboardView | null = useMemo(() => {
    if (!data) return null;
    const latest = data.summary.snapshot_month;
    const availableMonths = [...new Set(data.summary.records.map((row) => row.registration_month))].sort();
    const previousMonth = availableMonths.filter((month) => month < latest).at(-1) ?? null;
    const latestSummary = data.summary.records.filter((row) => row.registration_month === latest);
    const previousSummary = previousMonth
      ? data.summary.records.filter((row) => row.registration_month === previousMonth)
      : [];
    const nzNew = latestSummary.find((row) => row.import_status_group === "nz_new")?.registration_count ?? 0;
    const used = latestSummary.find((row) => row.import_status_group === "used_import")?.registration_count ?? 0;
    const other = latestSummary.find((row) => row.import_status_group === "other_or_unknown")?.registration_count ?? 0;
    const latestTotal = nzNew + used + other;
    const previousTotal = previousMonth
      ? previousSummary.reduce((sum, row) => sum + row.registration_count, 0)
      : undefined;
    const latestTotalChange = monthChange(latestTotal, previousTotal);
    const annual = annualise(data.summary.records, range);
    const annualMax = Math.max(...annual.flatMap((row) => [row.nz_new, row.used_import]));
    const displayedPowertrain =
      vehicleView === "latest"
        ? data.powertrain.records.filter((row) => row.registration_month === latest)
        : data.powertrain.records;
    const powertrains = [
      ...displayedPowertrain.reduce((map, row) => {
        map.set(row.powertrain_group, (map.get(row.powertrain_group) ?? 0) + row.registration_count);
        return map;
      }, new Map<string, number>()),
    ]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const previousPowertrainTotals = previousMonth
      ? data.powertrain.records
          .filter((row) => row.registration_month === previousMonth)
          .reduce((map, row) => {
            map.set(row.powertrain_group, (map.get(row.powertrain_group) ?? 0) + row.registration_count);
            return map;
          }, new Map<string, number>())
      : new Map<string, number>();
    const powertrainChanges = new Map(
      powertrains.map((row) => [
        row.name,
        vehicleView === "latest" ? monthChange(row.value, previousPowertrainTotals.get(row.name)) : null,
      ]),
    );
    const arrivalMix = arrivalPowertrains.map((name) => {
      const records = displayedPowertrain.filter((row) => row.powertrain_group === name);
      const countFor = (status: string) =>
        records.filter((row) => row.import_status_group === status).reduce((sum, row) => sum + row.registration_count, 0);
      return {
        name,
        total: records.reduce((sum, row) => sum + row.registration_count, 0),
        nzNew: countFor("nz_new"),
        used: countFor("used_import"),
        other: countFor("other_or_unknown"),
      };
    });
    const powertrainMax = Math.max(...powertrains.map((row) => row.value));
    const topMakes =
      vehicleView === "latest"
        ? (leaderboardPowertrain === "all" ? data.makes.records : data.makePowertrains.records)
            .filter(
              (row) =>
                row.registration_month === latest &&
                (leaderboardPowertrain === "all"
                  ? (row as MakeRecord).import_status_group === "all"
                  : (row as MakePowertrainRecord).powertrain_group === leaderboardPowertrain),
            )
            .sort((a, b) => a.rank - b.rank)
            .slice(0, 5)
        : (leaderboardPowertrain === "all" ? data.scopeMakes.records : data.scopeMakePowertrains.records)
            .filter((row) =>
              leaderboardPowertrain === "all"
                ? (row as ScopeMakeRecord).import_status_group === "all"
                : (row as ScopeMakePowertrainRecord).powertrain_group === leaderboardPowertrain,
            )
            .sort((a, b) =>
              leaderboardPowertrain === "all"
                ? b.vehicle_count - a.vehicle_count
                : (a as ScopeMakePowertrainRecord).rank - (b as ScopeMakePowertrainRecord).rank,
            )
            .slice(0, 5)
            .map((row, index) => ({ ...row, rank: index + 1, registration_count: row.vehicle_count }));
    const topModels =
      vehicleView === "latest"
        ? (leaderboardPowertrain === "all" ? data.models.records : data.modelPowertrains.records)
            .filter(
              (row) =>
                row.registration_month === latest &&
                (leaderboardPowertrain === "all"
                  ? (row as ModelRecord).import_status_group === "all"
                  : (row as ModelPowertrainRecord).powertrain_group === leaderboardPowertrain),
            )
            .sort((a, b) => a.rank - b.rank)
            .slice(0, 5)
        : (leaderboardPowertrain === "all" ? data.scopeModels.records : data.scopeModelPowertrains.records)
            .filter((row) =>
              leaderboardPowertrain === "all"
                ? (row as ScopeModelRecord).import_status_group === "all"
                : (row as ScopeModelPowertrainRecord).powertrain_group === leaderboardPowertrain,
            )
            .sort((a, b) =>
              leaderboardPowertrain === "all"
                ? b.vehicle_count - a.vehicle_count
                : (a as ScopeModelPowertrainRecord).rank - (b as ScopeModelPowertrainRecord).rank,
            )
            .slice(0, 5)
            .map((row, index) => ({ ...row, rank: index + 1, registration_count: row.vehicle_count }));
    const previousMakeRecords =
      !previousMonth || vehicleView !== "latest"
        ? []
        : (leaderboardPowertrain === "all" ? data.makes.records : data.makePowertrains.records).filter(
            (row) =>
              row.registration_month === previousMonth &&
              (leaderboardPowertrain === "all"
                ? (row as MakeRecord).import_status_group === "all"
                : (row as MakePowertrainRecord).powertrain_group === leaderboardPowertrain),
          );
    const makeChanges = new Map(
      topMakes.map((row) => {
        const previous = previousMakeRecords.find((candidate) => candidate.make === row.make);
        return [row.make, monthChange(row.registration_count, previous?.registration_count)];
      }),
    );
    const previousModelRecords =
      !previousMonth || vehicleView !== "latest"
        ? []
        : (leaderboardPowertrain === "all" ? data.models.records : data.modelPowertrains.records).filter(
            (row) =>
              row.registration_month === previousMonth &&
              (leaderboardPowertrain === "all"
                ? (row as ModelRecord).import_status_group === "all"
                : (row as ModelPowertrainRecord).powertrain_group === leaderboardPowertrain),
          );
    const modelChanges = new Map(
      topModels.map((row) => {
        const previous = previousModelRecords.find(
          (candidate) => candidate.make === row.make && candidate.model === row.model,
        );
        return [`${row.make}\u0000${row.model}`, monthChange(row.registration_count, previous?.registration_count)];
      }),
    );
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
    const vehicleLabel = vehicleView === "latest" ? prettyMonth(latest).toUpperCase() : "CURRENT FLEET SNAPSHOT · 2007+";
    const rankingContext =
      leaderboardPowertrain === "all"
        ? vehicleLabel
        : `${leaderboardPowertrainLabel[leaderboardPowertrain].toUpperCase()} · ${vehicleLabel}`;
    return {
      latest,
      previousMonth,
      nzNew,
      used,
      latestTotal,
      latestTotalChange,
      annual,
      annualMax,
      powertrains,
      powertrainChanges,
      powertrainMax,
      arrivalMix,
      topMakes,
      topModels,
      ageBuckets,
      ageMax,
      makeChanges,
      modelChanges,
      medianAge: weightedMedian(latestAges),
      electric,
      vehicleTotal,
      vehicleLabel,
      rankingContext,
    };
  }, [data, range, vehicleView, leaderboardPowertrain]);

  const explorer: VehicleExplorerData | null = useMemo(() => {
    if (!data) return null;
    const makeRecords = data.scopeMakes.records.filter((row) => row.import_status_group === "all");
    const defaultMake = [...makeRecords].sort((a, b) => b.vehicle_count - a.vehicle_count)[0];
    const makeOptions = makeRecords.sort((a, b) => makeOptionLabel(a).localeCompare(makeOptionLabel(b)));
    const mappedMakeOptions = makeOptions.filter((row) => row.brand_country !== "Unmapped");
    const unmappedMakeOptions = makeOptions.filter((row) => row.brand_country === "Unmapped");
    const make = selectedMake || defaultMake?.make || "";
    const makeRecord = makeOptions.find((row) => row.make === make);
    const modelOptions = data.scopeModels.records
      .filter((row) => row.import_status_group === "all" && row.make === make)
      .sort((a, b) => a.model.localeCompare(b.model));
    const model = selectedModel && modelOptions.some((row) => row.model === selectedModel) ? selectedModel : "";
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

  const marketMonths = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.summary.records.map((row) => row.registration_month))].sort();
  }, [data]);

  if (error) return <ErrorState />;
  if (!data || !view || !explorer) {
    return (
      <main className="state-page">
        <div className="loading-line" aria-label="Loading dashboard" />
      </main>
    );
  }

  const activeAnnual = view.annual.find((row) => row.year === activeMarketYear) ?? view.annual.at(-1);
  const marketMonth = marketMonths.includes(selectedMarketMonth) ? selectedMarketMonth : view.latest;
  const marketMonthIndex = marketMonths.indexOf(marketMonth);
  const marketYears = [...new Set(marketMonths.map((month) => month.slice(0, 4)))];
  const marketYearMonths = marketMonths.filter((month) => month.startsWith(marketMonth.slice(0, 4)));
  const marketMonthRecords = data.summary.records.filter((row) => row.registration_month === marketMonth);
  const marketCountFor = (status: string) =>
    marketMonthRecords.find((row) => row.import_status_group === status)?.registration_count ?? 0;
  const monthlyDetail = {
    nzNew: marketCountFor("nz_new"),
    used: marketCountFor("used_import"),
    other: marketCountFor("other_or_unknown"),
  };
  const monthlyDetailTotal = monthlyDetail.nzNew + monthlyDetail.used + monthlyDetail.other;
  const countryRecords =
    countryView === "latest"
      ? data.countries.records.filter((row) => row.registration_month === view.latest)
      : data.countries.records;
  const topCountries = [
    ...countryRecords.reduce((counts, row) => {
      counts.set(row.previous_country, (counts.get(row.previous_country) ?? 0) + row.registration_count);
      return counts;
    }, new Map<string, number>()),
  ]
    .map(([previous_country, registration_count]) => ({ previous_country, registration_count }))
    .sort((a, b) => b.registration_count - a.registration_count)
    .slice(0, 6);
  const countryMax = Math.max(1, ...topCountries.map((row) => row.registration_count));
  const countryViewLabel = countryView === "latest" ? prettyMonth(view.latest).toUpperCase() : "CURRENT FLEET · 2007+";
  const fleetAgeTotal = data.fleetAges.records.reduce((sum, row) => sum + row.vehicle_count, 0);
  const fleetAgeMean = fleetAgeTotal
    ? data.fleetAges.records.reduce((sum, row) => sum + row.approximate_current_age * row.vehicle_count, 0) /
      fleetAgeTotal
    : 0;
  const fleetAgeMedianThreshold = fleetAgeTotal / 2;
  let fleetAgeCumulative = 0;
  const fleetAgeMedian =
    [...data.fleetAges.records]
      .sort((a, b) => a.approximate_current_age - b.approximate_current_age)
      .find((row) => {
        fleetAgeCumulative += row.vehicle_count;
        return fleetAgeCumulative >= fleetAgeMedianThreshold;
      })?.approximate_current_age ?? 0;
  const fleetAgeMode = data.fleetAges.records.reduce(
    (mostCommon, row) => (row.vehicle_count > mostCommon.vehicle_count ? row : mostCommon),
    { approximate_current_age: 0, vehicle_count: 0 },
  );
  const fleetSnapshotYear = Number(view.latest.slice(0, 4));
  const fleetAgeBuckets = Array.from({ length: 32 }, (_, age) => ({
    age,
    label: age === 31 ? "31+" : String(age),
    vehicleYearLabel:
      age === 31 ? `${fleetSnapshotYear - age} or earlier` : String(fleetSnapshotYear - age),
    value: data.fleetAges.records
      .filter((row) => (age === 31 ? row.approximate_current_age >= 31 : row.approximate_current_age === age))
      .reduce((sum, row) => sum + row.vehicle_count, 0),
  }));
  const fleetAgeMax = Math.max(1, ...fleetAgeBuckets.map((row) => row.value));
  const selectedFleetAge =
    fleetAgeBuckets.find((row) => row.age === (activeFleetAge ?? Math.min(fleetAgeMode.approximate_current_age, 31))) ??
    fleetAgeBuckets[0];

  function selectMarketYear(year: number) {
    const months = marketMonths.filter((month) => month.startsWith(`${year}-`));
    const latestMonth = months.at(-1);
    if (latestMonth) setSelectedMarketMonth(latestMonth);
  }

  return (
    <main>
      <HeroSection view={view} />

      <MarketFlowSection
        view={view}
        range={range}
        setRange={setRange}
        activeAnnual={activeAnnual}
        setActiveMarketYear={setActiveMarketYear}
        selectMarketYear={selectMarketYear}
        marketMonth={marketMonth}
        marketMonthIndex={marketMonthIndex}
        marketMonths={marketMonths}
        marketYears={marketYears}
        marketYearMonths={marketYearMonths}
        setSelectedMarketMonth={setSelectedMarketMonth}
        monthlyDetail={monthlyDetail}
        monthlyDetailTotal={monthlyDetailTotal}
      />

      <FleetShapingSection
        view={view}
        vehicleView={vehicleView}
        setVehicleView={setVehicleView}
        leaderboardPowertrain={leaderboardPowertrain}
        setLeaderboardPowertrain={setLeaderboardPowertrain}
        fleetAgeMean={fleetAgeMean}
        fleetAgeMedian={fleetAgeMedian}
        fleetAgeMode={fleetAgeMode}
        fleetAgeBuckets={fleetAgeBuckets}
        fleetAgeMax={fleetAgeMax}
        selectedFleetAge={selectedFleetAge}
        setActiveFleetAge={setActiveFleetAge}
      />

      <UsedImportSection
        view={view}
        countryView={countryView}
        setCountryView={setCountryView}
        countryViewLabel={countryViewLabel}
        topCountries={topCountries}
        countryMax={countryMax}
      />

      <VehicleExplorerSection
        explorer={explorer}
        setSelectedMake={setSelectedMake}
        setSelectedModel={setSelectedModel}
        includedRows={data.manifest.quality.included_rows}
      />

      <MethodologySection manifest={data.manifest} />
    </main>
  );
}
