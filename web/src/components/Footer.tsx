import { prettyGeneratedDate } from "../lib/utils";
import type { Manifest } from "../lib/types";

export function Footer({ manifest }: { manifest: Manifest }) {
  return (
    <footer className="footer wrap">
      <span>NZ Vehicle Market Tracker</span>
      <p>
        <span>
          Source: <a href="https://www.nzta.govt.nz/resources/new-zealand-motor-vehicle-register-statistics/new-zealand-vehicle-fleet-open-data-sets" target="_blank" rel="noreferrer">NZTA vehicle fleet open data ↗</a> · <a href="https://github.com/michaelocez/nz-vehicle-market-tracker" target="_blank" rel="noreferrer">GitHub repository ↗</a>
        </span>
        <span>
          Current-fleet snapshot · Aggregates generated <time dateTime={manifest.generated_at_utc}>{prettyGeneratedDate(manifest.generated_at_utc)}</time>
        </span>
      </p>
    </footer>
  );
}
