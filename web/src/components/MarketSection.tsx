import { MonthChangeIndicator } from "./MonthChangeIndicator";
import { number, percent, prettyMonth, prettyMonthName } from "../lib/utils";
import type { DashboardView } from "../lib/dashboardView";
import type { Range } from "../lib/types";

interface MonthlyDetail {
  nzNew: number;
  used: number;
  other: number;
}

interface Props {
  view: DashboardView;
  range: Range;
  setRange: (value: Range) => void;
  activeMarketYear: number | null;
  setActiveMarketYear: (value: number | null) => void;
  marketMonths: string[];
  selectedMarketMonth: string;
  setSelectedMarketMonth: (value: string) => void;
  selectMarketYear: (year: number) => void;
  monthlyDetail: MonthlyDetail;
  monthlyDetailTotal: number;
  activeAnnual: { year: number; nz_new: number; used_import: number } | null;
}

export function MarketSection({
  view,
  range,
  setRange,
  activeMarketYear,
  setActiveMarketYear,
  marketMonths,
  selectedMarketMonth,
  setSelectedMarketMonth,
  selectMarketYear,
  monthlyDetail,
  monthlyDetailTotal,
  activeAnnual,
}: Props) {
  const marketMonth = marketMonths.includes(selectedMarketMonth) ? selectedMarketMonth : view.latest;
  const marketMonthIndex = marketMonths.indexOf(marketMonth);
  const marketYears = [...new Set(marketMonths.map((month) => month.slice(0, 4)))];
  const marketYearMonths = marketMonths.filter((month) => month.startsWith(marketMonth.slice(0, 4)));

  return (
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
              onClick={() => {
                setActiveMarketYear(row.year);
                selectMarketYear(row.year);
              }}
            >
              <div className="year-bars" aria-hidden="true">
                <i className="bar-new" style={{ height: `${Math.max(2, (row.nz_new / view.annualMax) * 100)}%` }} />
                <i className="bar-used" style={{ height: `${Math.max(2, (row.used_import / view.annualMax) * 100)}%` }} />
              </div>
              <span>{row.year}</span>
            </button>
          ))}
        </div>
        <p className="chart-note">{view.latest.slice(0, 4)} is year-to-date through {prettyMonthName(view.latest)}. Hover or focus for annual counts; select a year to open its latest month below.</p>
      </div>

      <div className="monthly-detail-heading">
        <div>
          <span className="panel-kicker">MONTHLY DETAIL</span>
          <p>Browse exact passenger-vehicle entries for any available month.</p>
        </div>
        <div className="monthly-detail-controls" aria-label="Monthly detail period">
          <button
            type="button"
            aria-label="Previous month"
            disabled={marketMonthIndex <= 0}
            onClick={() => setSelectedMarketMonth(marketMonths[marketMonthIndex - 1])}
          >
            &larr;
          </button>
          <label>
            <span>Year</span>
            <select value={marketMonth.slice(0, 4)} onChange={(event) => selectMarketYear(Number(event.target.value))}>
              {marketYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label>
            <span>Month</span>
            <select value={marketMonth} onChange={(event) => setSelectedMarketMonth(event.target.value)}>
              {marketYearMonths.map((month) => <option key={month} value={month}>{prettyMonthName(month)}</option>)}
            </select>
          </label>
          <button
            type="button"
            aria-label="Next month"
            disabled={marketMonthIndex >= marketMonths.length - 1}
            onClick={() => setSelectedMarketMonth(marketMonths[marketMonthIndex + 1])}
          >
            &rarr;
          </button>
        </div>
      </div>

      <div className="insight-strip">
        <article><span>NZ-new</span><strong>{number.format(monthlyDetail.nzNew)}</strong><p>vehicles in {prettyMonth(marketMonth)}</p></article>
        <article><span>Used imports</span><strong>{number.format(monthlyDetail.used)}</strong><p>vehicles in {prettyMonth(marketMonth)}</p></article>
        <article className="accent"><span>Import mix</span><strong>{percent(monthlyDetailTotal ? monthlyDetail.used / monthlyDetailTotal : 0)}</strong><p>of {prettyMonth(marketMonth)} entries came in used</p></article>
      </div>
    </section>
  );
}
