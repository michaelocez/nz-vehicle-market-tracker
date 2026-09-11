import type { Manifest } from "../types";
import { compact, percent, prettyGeneratedDate } from "../utils/formatters";

export function MethodologySection({ manifest }: { manifest: Manifest }) {
  return (
    <>
      <section className="methodology" id="methodology">
        <div className="wrap methodology-grid">
          <div>
            <span className="eyebrow">READ THE NUMBERS CAREFULLY</span>
            <h2>A focused view of ordinary passenger vehicles.</h2>
          </div>
          <div className="method-copy">
            <p>
              This dashboard includes NZTA <strong>PASSENGER CAR/VAN</strong> records in classes MA, MB and MC, first
              registered in New Zealand from January 2007 onward.
            </p>
            <p>
              It excludes motorcycles, trucks, buses, trailers, caravans, ATVs, tractors and special-purpose machinery.
              Earlier cohorts reconstructed from the current fleet carry survivorship bias.
            </p>
            <div className="method-stats">
              <span>
                <b>{compact.format(manifest.quality.included_rows)}</b> scoped records
              </span>
              <span>
                <b>{percent(manifest.brand_coverage.mapped_share)}</b> brand mapping
              </span>
              <span>
                <b>v{manifest.contract.version}</b> data contract
              </span>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer wrap">
        <span>NZ Vehicle Market Tracker</span>
        <p>
          <span>
            Source:{" "}
            <a
              href="https://www.nzta.govt.nz/resources/new-zealand-motor-vehicle-register-statistics/new-zealand-vehicle-fleet-open-data-sets"
              target="_blank"
              rel="noreferrer"
            >
              NZTA vehicle fleet open data ↗
            </a>{" "}
            ·{" "}
            <a href="https://github.com/michaelocez/nz-vehicle-market-tracker" target="_blank" rel="noreferrer">
              GitHub repository ↗
            </a>
          </span>
          <span>
            Current-fleet snapshot · Aggregates generated{" "}
            <time dateTime={manifest.generated_at_utc}>{prettyGeneratedDate(manifest.generated_at_utc)}</time>
          </span>
        </p>
      </footer>
    </>
  );
}
