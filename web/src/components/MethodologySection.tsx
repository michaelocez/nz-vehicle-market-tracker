import { compact, percent, prettyMonth } from "../lib/utils";
import type { Manifest } from "../lib/types";

export function MethodologySection({ manifest }: { manifest: Manifest }) {
  const scopeFrom = prettyMonth(manifest.contract.scope.registration_month_from);
  return (
    <section className="methodology" id="methodology">
      <div className="wrap methodology-grid">
        <div><span className="eyebrow">READ THE NUMBERS CAREFULLY</span><h2>A focused view of ordinary passenger vehicles.</h2></div>
        <div className="method-copy">
          <p>This dashboard includes NZTA <strong>PASSENGER CAR/VAN</strong> records in classes MA, MB and MC, first registered in New Zealand from {scopeFrom} onward.</p>
          <p>It excludes motorcycles, trucks, buses, trailers, caravans, ATVs, tractors and special-purpose machinery. Earlier cohorts reconstructed from the current fleet carry survivorship bias.</p>
          <div className="method-stats">
            <span><b>{compact.format(manifest.quality.included_rows)}</b> scoped records</span>
            <span><b>{percent(manifest.brand_coverage.mapped_share)}</b> brand mapping</span>
            <span><b>v{manifest.contract.version}</b> data contract</span>
          </div>
        </div>
      </div>
    </section>
  );
}
