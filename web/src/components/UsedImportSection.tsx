import type React from "react";
import type { DashboardView, VehicleView } from "../types";
import { compact, number, prettyMonth } from "../utils/formatters";

export function UsedImportSection({
  view,
  countryView,
  setCountryView,
  countryViewLabel,
  topCountries,
  countryMax,
}: {
  view: DashboardView;
  countryView: VehicleView;
  setCountryView: React.Dispatch<React.SetStateAction<VehicleView>>;
  countryViewLabel: string;
  topCountries: Array<{ previous_country: string; registration_count: number }>;
  countryMax: number;
}) {
  return (
    <section className="section wrap" id="imports">
      <div className="section-heading">
        <div>
          <span className="section-number">03</span>
          <h2>The used-import story</h2>
        </div>
      </div>
      <p className="section-lead">Where used cars were previously registered—and how old comparable imports were at NZ entry.</p>

      <div className="imports-grid">
        <article className="panel country-panel">
          <div className="panel-heading simple">
            <div>
              <button
                type="button"
                className="country-kicker-toggle"
                aria-label={`Show ${countryView === "latest" ? "current fleet" : "latest month"} previous-country counts`}
                aria-pressed={countryView === "snapshot"}
                onClick={() => setCountryView((current) => (current === "latest" ? "snapshot" : "latest"))}
              >
                <span className="panel-kicker">PREVIOUS COUNTRY · {countryViewLabel}</span>
                <span aria-hidden="true">↔</span>
              </button>
              <h3>Japan dominates the import channel.</h3>
            </div>
          </div>
          <div className="country-list">
            {topCountries.map((row, index) => (
              <div className="country-row" key={row.previous_country}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{row.previous_country}</strong>
                <i>
                  <em style={{ width: `${(row.registration_count / countryMax) * 100}%` }} />
                </i>
                <b>{number.format(row.registration_count)}</b>
              </div>
            ))}
          </div>
          <p className="chart-note">
            {countryView === "latest"
              ? `Previous registration/import country of used imports first registered in New Zealand during ${prettyMonth(view.latest)}; not manufacturing country.`
              : "Previous registration/import country among 2007+ used imports still represented in the current fleet snapshot; not manufacturing country."}
          </p>
        </article>

        <article className="panel age-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">APPROXIMATE IMPORT AGE</span>
              <h3>Most comparable used imports arrive well-used.</h3>
            </div>
            <strong>
              {view.medianAge}
              <small>median years</small>
            </strong>
          </div>
          <div className="age-chart">
            {view.ageBuckets.map((row) => (
              <div className="age-column" key={row.label} title={`${row.label}: ${number.format(row.value)}`}>
                <div>
                  <i style={{ height: `${Math.max(3, (row.value / view.ageMax) * 100)}%` }} />
                </div>
                <b>{compact.format(row.value)}</b>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
          <p className="chart-note">Comparable cohort only: used imports with vehicle year 2007 or later.</p>
        </article>
      </div>
    </section>
  );
}
