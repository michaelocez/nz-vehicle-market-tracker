import { useEffect, useMemo, useState } from "react";
import { computeDashboardView } from "./lib/dashboardView";
import { computeExplorer } from "./lib/explorerView";
import { loadData } from "./lib/data";
import { prettyMonth } from "./lib/utils";
import { ErrorState } from "./components/ErrorState";
import { ExplorerSection } from "./components/ExplorerSection";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { ImportsSection } from "./components/ImportsSection";
import { MarketSection } from "./components/MarketSection";
import { MethodologySection } from "./components/MethodologySection";
import { VehiclesSection } from "./components/VehiclesSection";
import type { LeaderboardPowertrain, Range, VehicleView } from "./lib/types";

export default function Home() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadData>> | null>(null);
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
    loadData(import.meta.env.BASE_URL)
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const view = useMemo(
    () => (data ? computeDashboardView(data, range, vehicleView, leaderboardPowertrain) : null),
    [data, range, vehicleView, leaderboardPowertrain],
  );

  const explorer = useMemo(
    () => (data ? computeExplorer(data, selectedMake, selectedModel) : null),
    [data, selectedMake, selectedModel],
  );

  const marketMonths = useMemo(
    () => [...new Set(data?.summary.records.map((row) => row.registration_month) ?? [])].sort(),
    [data],
  );

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
  const countryViewLabel =
    countryView === "latest" ? prettyMonth(view.latest).toUpperCase() : `CURRENT FLEET · ${view.startYear}+`;

  const selectedFleetAge =
    view.fleetAgeBuckets.find(
      (row) => row.age === (activeFleetAge ?? Math.min(view.fleetAgeMode.approximate_current_age, 31)),
    ) ?? view.fleetAgeBuckets[0];

  function selectMarketYear(year: number) {
    const months = marketMonths.filter((month) => month.startsWith(`${year}-`));
    const latestMonth = months.at(-1);
    if (latestMonth) setSelectedMarketMonth(latestMonth);
  }

  return (
    <main>
      <Hero view={view} />

      <MarketSection
        view={view}
        range={range}
        setRange={setRange}
        activeMarketYear={activeMarketYear}
        setActiveMarketYear={setActiveMarketYear}
        marketMonths={marketMonths}
        selectedMarketMonth={selectedMarketMonth}
        setSelectedMarketMonth={setSelectedMarketMonth}
        selectMarketYear={selectMarketYear}
        monthlyDetail={monthlyDetail}
        monthlyDetailTotal={monthlyDetailTotal}
        activeAnnual={activeAnnual ?? null}
      />

      <VehiclesSection
        view={view}
        vehicleView={vehicleView}
        setVehicleView={setVehicleView}
        leaderboardPowertrain={leaderboardPowertrain}
        setLeaderboardPowertrain={setLeaderboardPowertrain}
        activeFleetAge={activeFleetAge}
        setActiveFleetAge={setActiveFleetAge}
        selectedFleetAge={selectedFleetAge}
      />

      <ImportsSection
        view={view}
        countryView={countryView}
        setCountryView={setCountryView}
        topCountries={topCountries}
        countryMax={countryMax}
        countryViewLabel={countryViewLabel}
      />

      <ExplorerSection
        explorer={explorer}
        setSelectedMake={setSelectedMake}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        manifest={data.manifest}
      />

      <MethodologySection manifest={data.manifest} />

      <Footer manifest={data.manifest} />
    </main>
  );
}
