import type { AgeRecord, LeaderboardPowertrain, MonthChange, Range, ScopeMakeRecord, SummaryRecord } from "../types";

export const number = new Intl.NumberFormat("en-NZ");

export const fleetAgeLabel = (label: string) => {
  if (label === "31+") return "31 years and older";
  return label === "1" ? "1 year old" : `${label} years old`;
};

export const compact = new Intl.NumberFormat("en-NZ", { notation: "compact", maximumFractionDigits: 1 });
export const monthLabel = new Intl.DateTimeFormat("en-NZ", { month: "long", year: "numeric", timeZone: "UTC" });
export const monthName = new Intl.DateTimeFormat("en-NZ", { month: "long", timeZone: "UTC" });
export const generatedDate = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Pacific/Auckland",
});

export const powertrainLabel: Record<string, string> = {
  bev: "Battery electric",
  phev: "Plug-in hybrid",
  hybrid: "Hybrid",
  combustion: "Combustion",
  range_extended_electric: "Range-extended EV",
  hydrogen_fuel_cell: "Hydrogen fuel cell",
  other_or_unknown: "Other / unknown",
};

export const arrivalPowertrains = ["combustion", "hybrid", "bev", "phev"];
export const leaderboardPowertrains: LeaderboardPowertrain[] = ["all", "combustion", "hybrid", "bev", "phev", "other"];
export const leaderboardPowertrainLabel: Record<LeaderboardPowertrain, string> = {
  all: "All",
  combustion: "Combustion",
  hybrid: "Hybrid",
  bev: "BEV",
  phev: "PHEV",
  other: "Other",
};

export function prettyMonth(value: string) {
  return monthLabel.format(new Date(`${value}-01T00:00:00Z`));
}

export function prettyMonthName(value: string) {
  return monthName.format(new Date(`${value}-01T00:00:00Z`));
}

export function prettyGeneratedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown" : generatedDate.format(date);
}

export function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function monthChange(current: number, previous: number | undefined): MonthChange | null {
  if (previous === undefined) return null;
  return {
    delta: current - previous,
    rate: previous === 0 ? null : (current - previous) / previous,
  };
}

export function signedNumber(value: number) {
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : "−"}${number.format(Math.abs(value))}`;
}

export function signedPercent(change: MonthChange) {
  if (change.delta === 0) return "No change";
  if (change.rate === null) return signedNumber(change.delta);
  return `${change.rate > 0 ? "+" : "−"}${percent(Math.abs(change.rate))}`;
}

export function changeTone(change: MonthChange) {
  if (change.delta === 0) return "steady";
  return change.delta > 0 ? "up" : "down";
}

export function makeOptionLabel(row: ScopeMakeRecord) {
  return row.make === row.brand.toUpperCase() ? row.brand : `${row.brand} — ${row.make}`;
}

export function annualise(records: SummaryRecord[], range: Range) {
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

export function weightedMedian(records: AgeRecord[]) {
  const ordered = [...records].sort((a, b) => a.approximate_import_age - b.approximate_import_age);
  const halfway = ordered.reduce((sum, row) => sum + row.registration_count, 0) / 2;
  let cumulative = 0;
  for (const row of ordered) {
    cumulative += row.registration_count;
    if (cumulative >= halfway) return row.approximate_import_age;
  }
  return 0;
}
