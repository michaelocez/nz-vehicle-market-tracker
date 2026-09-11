import type { DashboardView, LeaderboardPowertrain, VehicleView } from "../types";
import {
  fleetAgeLabel,
  leaderboardPowertrainLabel,
  leaderboardPowertrains,
  number,
  percent,
  powertrainLabel,
  prettyMonth,
} from "../utils/formatters";
import { MonthChangeIndicator } from "./MonthChangeIndicator";

export function FleetShapingSection({
  view,
  vehicleView,
  setVehicleView,
  leaderboardPowertrain,
  setLeaderboardPowertrain,
  fleetAgeMean,
  fleetAgeMedian,
  fleetAgeMode,
  fleetAgeBuckets,
  fleetAgeMax,
  selectedFleetAge,
  setActiveFleetAge,
}: {
  view: DashboardView;
  vehicleView: VehicleView;
  setVehicleView: (view: VehicleView) => void;
  leaderboardPowertrain: LeaderboardPowertrain;
  setLeaderboardPowertrain: (powertrain: LeaderboardPowertrain) => void;
  fleetAgeMean: number;
  fleetAgeMedian: number;
  fleetAgeMode: { approximate_current_age: number; vehicle_count: number };
  fleetAgeBuckets: Array<{ age: number; label: string; vehicleYearLabel: string; value: number }>;
  fleetAgeMax: number;
  selectedFleetAge: { age: number; label: string; vehicleYearLabel: string; value: number };
  setActiveFleetAge: (age: number) => void;
}) {
  return (
    <section className="section section-tint" id="vehicles">
      <div className="wrap">
        <div className="section-heading">
          <div>
            <span className="section-number">02</span>
            <h2>What shapes the fleet?</h2>
          </div>
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
        {vehicleView === "latest" && view.previousMonth && (
          <p className="comparison-context">
            Changes compare with {prettyMonth(view.previousMonth)}. A ranking change is omitted when a make or model was
            outside that month&apos;s published top 25.
          </p>
        )}

        <div className="dashboard-grid">
          <article className="panel powertrain-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">POWERTRAIN · {view.vehicleLabel}</span>
                <h3>
                  Combustion still leads.
                  <br />
                  Electrified cars are visible.
                </h3>
              </div>
              <strong>
                {percent(view.electric / view.vehicleTotal)}
                <small>BEV + PHEV</small>
              </strong>
            </div>
            <div className="bar-list">
              {view.powertrains.slice(0, 6).map((row) => (
                <div className="bar-row" key={row.name}>
                  <div>
                    <span>{powertrainLabel[row.name] ?? row.name}</span>
                    <span className="bar-value">
                      <b>{number.format(row.value)}</b>
                      {vehicleView === "latest" && (
                        <MonthChangeIndicator
                          change={view.powertrainChanges.get(row.name) ?? null}
                          previousMonth={view.previousMonth}
                        />
                      )}
                    </span>
                  </div>
                  <i>
                    <em style={{ width: `${(row.value / view.powertrainMax) * 100}%` }} />
                  </i>
                </div>
              ))}
            </div>
          </article>

          <article className="panel ranking-panel">
            <span className="panel-kicker">TOP MAKES · {view.rankingContext}</span>
            <ol>
              {view.topMakes.map((row) => (
                <li key={row.make}>
                  <span className="rank">{String(row.rank).padStart(2, "0")}</span>
                  <div>
                    <strong>{row.brand}</strong>
                    <small>{row.brand_country}</small>
                  </div>
                  <span className="ranking-value">
                    <b>{number.format(row.registration_count)}</b>
                    {vehicleView === "latest" && (
                      <MonthChangeIndicator change={view.makeChanges.get(row.make) ?? null} previousMonth={view.previousMonth} />
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </article>

          <article className="panel arrival-panel">
            <div className="arrival-mix-heading">
              <span className="panel-kicker">ARRIVAL CHANNEL BY POWERTRAIN</span>
              <div className="arrival-key" aria-hidden="true">
                <span>NZ-new</span>
                <span>Used</span>
                <span>Other</span>
              </div>
            </div>
            <div className="arrival-mix-list">
              {view.arrivalMix.map((row) => (
                <div className="arrival-mix-row" key={row.name}>
                  <div>
                    <span>{powertrainLabel[row.name]}</span>
                    <small>
                      {percent(row.nzNew / row.total)} new · {percent(row.used / row.total)} used
                    </small>
                    <b>{number.format(row.total)}</b>
                  </div>
                  <div
                    className="arrival-track"
                    role="img"
                    aria-label={`${powertrainLabel[row.name]}: ${number.format(row.nzNew)} NZ-new, ${number.format(row.used)} used imports and ${number.format(row.other)} other or unknown`}
                  >
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
                <li key={`${row.make}-${row.model}`}>
                  <span className="rank">{String(row.rank).padStart(2, "0")}</span>
                  <div>
                    <strong>{row.model}</strong>
                    <small>{row.make}</small>
                  </div>
                  <span className="ranking-value">
                    <b>{number.format(row.registration_count)}</b>
                    {vehicleView === "latest" && (
                      <MonthChangeIndicator
                        change={view.modelChanges.get(`${row.make}\u0000${row.model}`) ?? null}
                        previousMonth={view.previousMonth}
                      />
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </article>
        </div>

        <article className="panel fleet-age-panel">
          <div className="fleet-age-heading">
            <div>
              <span className="panel-kicker">CURRENT FLEET AGE · DATA AS AT {prettyMonth(view.latest).toUpperCase()}</span>
              <h3>How old are New Zealand&apos;s registered passenger cars?</h3>
            </div>
            <div className="fleet-age-stats">
              <span>
                <b>{fleetAgeMean.toFixed(1)}</b>average years
              </span>
              <span>
                <b>{fleetAgeMedian}</b>median years
              </span>
              <span>
                <b>{fleetAgeMode.approximate_current_age}</b>most common age
              </span>
            </div>
          </div>
          <div className="fleet-age-readout" aria-live="polite">
            <span>
              {fleetAgeLabel(selectedFleetAge.label)}
              {` · vehicle year ${selectedFleetAge.vehicleYearLabel}`}
            </span>
            <strong>
              {number.format(selectedFleetAge.value)} <small>registered passenger vehicles</small>
            </strong>
          </div>
          <div className="fleet-age-chart" aria-label="Current registered passenger fleet by approximate age">
            {fleetAgeBuckets.map((row) => (
              <button
                type="button"
                key={row.age}
                className={selectedFleetAge.age === row.age ? "active" : ""}
                aria-label={`${fleetAgeLabel(row.label)}, vehicle year ${row.vehicleYearLabel}: ${number.format(row.value)} registered passenger vehicles`}
                aria-pressed={selectedFleetAge.age === row.age}
                onMouseEnter={() => setActiveFleetAge(row.age)}
                onFocus={() => setActiveFleetAge(row.age)}
                onClick={() => setActiveFleetAge(row.age)}
              >
                <i style={{ height: `${Math.max(2, (row.value / fleetAgeMax) * 100)}%` }} />
                <span>{row.age % 5 === 0 || row.age === 31 ? row.label : ""}</span>
              </button>
            ))}
          </div>
          <p className="chart-note">
            Approximate whole-year age = {view.latest.slice(0, 4)} snapshot year minus vehicle year. Includes the full
            ordinary passenger-vehicle snapshot with a usable vehicle year; 31+ is grouped for readability. Vehicle-year
            meanings before 2007 are less consistent.
          </p>
        </article>
      </div>
    </section>
  );
}
