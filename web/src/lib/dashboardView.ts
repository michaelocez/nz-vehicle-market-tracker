import type {
  DashboardData,
  FleetAgeRecord,
  LeaderboardPowertrain,
  MakePowertrainRecord,
  MakeRecord,
  ModelPowertrainRecord,
  ModelRecord,
  MonthChange,
  Range,
  ScopeMakePowertrainRecord,
  ScopeMakeRecord,
  ScopeModelPowertrainRecord,
  ScopeModelRecord,
  SummaryRecord,
  VehicleView,
} from "./types";
import {
  arrivalPowertrains,
  leaderboardPowertrainLabel,
  monthChange,
  prettyMonth,
  weightedMedian,
} from "./utils";

export interface DashboardView {
  latest: string;
  previousMonth: string | null;
  startYear: number;
  nzNew: number;
  used: number;
  latestTotal: number;
  latestTotalChange: MonthChange | null;
  annual: Array<{ year: number; nz_new: number; used_import: number }>;
  annualMax: number;
  powertrains: Array<{ name: string; value: number }>;
  powertrainChanges: Map<string, MonthChange | null>;
  powertrainMax: number;
  arrivalMix: Array<{ name: string; total: number; nzNew: number; used: number; other: number }>;
  topMakes: Array<{
    rank: number;
    make: string;
    brand: string;
    brand_country: string;
    registration_count: number;
  }>;
  topModels: Array<{
    rank: number;
    make: string;
    model: string;
    registration_count: number;
  }>;
  ageBuckets: Array<{ label: string; value: number }>;
  ageMax: number;
  makeChanges: Map<string, MonthChange | null>;
  modelChanges: Map<string, MonthChange | null>;
  medianAge: number | null;
  electric: number;
  vehicleTotal: number;
  vehicleLabel: string;
  rankingContext: string;

  fleetAgeTotal: number;
  fleetAgeMean: number;
  fleetAgeMedian: number;
  fleetAgeMode: FleetAgeRecord;
  fleetSnapshotYear: number;
  fleetAgeBuckets: Array<{ age: number; label: string; vehicleYearLabel: string; value: number }>;
  fleetAgeMax: number;
}

export function computeDashboardView(
  data: DashboardData,
  range: Range,
  vehicleView: VehicleView,
  leaderboardPowertrain: LeaderboardPowertrain,
): DashboardView {
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
  const startYear = Number(data.manifest.contract.scope.registration_month_from.slice(0, 4));

  const annual = annualise(data.summary.records, range, startYear);
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

  const topMakes = vehicleView === "latest"
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
      .filter(
        (row) =>
          leaderboardPowertrain === "all"
            ? (row as ScopeMakeRecord).import_status_group === "all"
            : (row as ScopeMakePowertrainRecord).powertrain_group === leaderboardPowertrain,
      )
      .sort((a, b) =>
        leaderboardPowertrain === "all"
          ? (b as ScopeMakeRecord).vehicle_count - (a as ScopeMakeRecord).vehicle_count
          : (a as ScopeMakePowertrainRecord).rank - (b as ScopeMakePowertrainRecord).rank,
      )
      .slice(0, 5)
      .map((row, index) => ({ ...row, rank: index + 1, registration_count: (row as { vehicle_count: number }).vehicle_count })) as DashboardView["topMakes"];

  const topModels = vehicleView === "latest"
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
      .filter(
        (row) =>
          leaderboardPowertrain === "all"
            ? (row as ScopeModelRecord).import_status_group === "all"
            : (row as ScopeModelPowertrainRecord).powertrain_group === leaderboardPowertrain,
      )
      .sort((a, b) =>
        leaderboardPowertrain === "all"
          ? (b as ScopeModelRecord).vehicle_count - (a as ScopeModelRecord).vehicle_count
          : (a as ScopeModelPowertrainRecord).rank - (b as ScopeModelPowertrainRecord).rank,
      )
      .slice(0, 5)
      .map((row, index) => ({ ...row, rank: index + 1, registration_count: (row as { vehicle_count: number }).vehicle_count })) as DashboardView["topModels"];

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
      return [row.make, monthChange(row.registration_count as number, previous?.registration_count)];
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
      return [
        `${row.make}\u0000${row.model}`,
        monthChange(row.registration_count as number, previous?.registration_count),
      ];
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
  const vehicleLabel = vehicleView === "latest"
    ? prettyMonth(latest).toUpperCase()
    : `CURRENT FLEET SNAPSHOT · ${startYear}+`;
  const rankingContext =
    leaderboardPowertrain === "all"
      ? vehicleLabel
      : `${leaderboardPowertrainLabel[leaderboardPowertrain].toUpperCase()} · ${vehicleLabel}`;

  const fleetAgeTotal = data.fleetAges.records.reduce((sum, row) => sum + row.vehicle_count, 0);
  const fleetAgeMean = fleetAgeTotal
    ? data.fleetAges.records.reduce((sum, row) => sum + row.approximate_current_age * row.vehicle_count, 0) / fleetAgeTotal
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
  const fleetSnapshotYear = Number(latest.slice(0, 4));
  const fleetAgeBuckets = Array.from({ length: 32 }, (_, age) => ({
    age,
    label: age === 31 ? "31+" : String(age),
    vehicleYearLabel:
      age === 31 ? `${fleetSnapshotYear - age} or earlier` : String(fleetSnapshotYear - age),
    value: data.fleetAges.records
      .filter((row) =>
        age === 31
          ? row.approximate_current_age >= 31
          : row.approximate_current_age === age,
      )
      .reduce((sum, row) => sum + row.vehicle_count, 0),
  }));
  const fleetAgeMax = Math.max(1, ...fleetAgeBuckets.map((row) => row.value));

  return {
    latest,
    previousMonth,
    startYear,
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
    fleetAgeTotal,
    fleetAgeMean,
    fleetAgeMedian,
    fleetAgeMode,
    fleetSnapshotYear,
    fleetAgeBuckets,
    fleetAgeMax,
  };
}

function annualise(
  records: SummaryRecord[],
  range: Range,
  startYearValue: number,
): Array<{ year: number; nz_new: number; used_import: number }> {
  const lastYear = Math.max(...records.map((row) => Number(row.registration_month.slice(0, 4))));
  const fromYear = range === "5y" ? lastYear - 4 : range === "10y" ? lastYear - 9 : startYearValue;
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
