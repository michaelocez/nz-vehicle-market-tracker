import type { VehicleExplorerData } from "../types";
import { makeOptionLabel, number, percent } from "../utils/formatters";

export function VehicleExplorerSection({
  explorer,
  setSelectedMake,
  setSelectedModel,
  includedRows,
}: {
  explorer: VehicleExplorerData;
  setSelectedMake: (make: string) => void;
  setSelectedModel: (model: string) => void;
  includedRows: number;
}) {
  return (
    <section className="section section-tint" id="explorer">
      <div className="wrap">
        <div className="section-heading">
          <div>
            <span className="section-number">04</span>
            <h2>Find a make or model</h2>
          </div>
        </div>
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
                  {explorer.mappedMakeOptions.map((row) => (
                    <option key={row.make} value={row.make}>
                      {makeOptionLabel(row)}
                    </option>
                  ))}
                </optgroup>
                {explorer.unmappedMakeOptions.length > 0 && (
                  <optgroup label="Other / unmapped source makes">
                    {explorer.unmappedMakeOptions.map((row) => (
                      <option key={row.make} value={row.make}>
                        {makeOptionLabel(row)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label htmlFor="model-select">Model</label>
              <select id="model-select" value={explorer.model} onChange={(event) => setSelectedModel(event.target.value)}>
                <option value="">All {explorer.makeRecord?.brand ?? explorer.make} models</option>
                {explorer.modelOptions.map((row) => (
                  <option key={row.model} value={row.model}>
                    {row.model}
                  </option>
                ))}
              </select>
            </div>
            <p>Model labels follow NZTA source categories, so related variants may appear separately.</p>
          </div>

          <article className="explorer-result" aria-live="polite">
            <span className="panel-kicker">CURRENT FLEET SNAPSHOT · 2007+ SCOPE</span>
            <div className="explorer-title">
              <div>
                <h3>{explorer.model || explorer.makeRecord?.brand || explorer.make}</h3>
                <p>{explorer.model ? explorer.makeRecord?.brand : explorer.makeRecord?.brand_country}</p>
              </div>
              <strong>
                {number.format(explorer.total)}
                <small>vehicles represented</small>
              </strong>
            </div>
            <div
              className="explorer-meter"
              aria-label={`${number.format(explorer.nzNew)} NZ-new and ${number.format(explorer.used)} used imports`}
            >
              <i style={{ width: `${explorer.total ? (explorer.nzNew / explorer.total) * 100 : 0}%` }} />
              <em style={{ width: `${explorer.total ? (explorer.used / explorer.total) * 100 : 0}%` }} />
            </div>
            <div className="explorer-breakdown">
              <span>
                <b>{number.format(explorer.nzNew)}</b>NZ-new
              </span>
              <span>
                <b>{number.format(explorer.used)}</b>Used imports
              </span>
              <span>
                <b>{number.format(explorer.other)}</b>Other / unknown
              </span>
              <span>
                <b>{percent(explorer.total / includedRows)}</b>of scoped fleet
              </span>
            </div>
            <p className="explorer-note">
              Vehicles represented in the current NZTA fleet snapshot that were first registered in New Zealand from 2007
              onward.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
