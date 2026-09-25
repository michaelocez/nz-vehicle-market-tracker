import { MonthChangeIndicator } from "./MonthChangeIndicator";
import { number, percent, prettyMonth } from "../lib/utils";
import type { DashboardView } from "../lib/dashboardView";

export function Hero({ view }: { view: DashboardView }) {
  return (
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
          <span className="eyebrow">{`NEW ZEALAND · PASSENGER VEHICLES · ${view.startYear}–${view.latest.slice(0, 4)}`}</span>
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
          <MonthChangeIndicator change={view.latestTotalChange} previousMonth={view.previousMonth} detailed />
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
  );
}
