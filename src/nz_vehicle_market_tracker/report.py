"""Markdown report rendering for feasibility analysis output."""

from __future__ import annotations

import json
from typing import Any


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.2%}"


def _category_table(values: dict[str, int]) -> str:
    lines = ["| Value | Rows |", "|---|---:|"]
    lines.extend(f"| {value or '<blank>'} | {count:,} |" for value, count in values.items())
    return "\n".join(lines)


def render_report(result: dict[str, Any]) -> str:
    source = result["source"]
    registration = result["registration_month"]
    rows = result["rows"]
    missingness = result["missingness"]
    used_import_missingness = result["missingness_by_import_status_group"]["used_import"]
    categories = result["categories"]
    age = result["age_quality"]
    used_age = result["used_import_age_quality"]
    recent_bands = registration["recent_vehicle_year_bands"]
    passenger = result["ordinary_light_passenger"]

    missing_lines = ["| Column | Missing/unknown | Share |", "|---|---:|---:|"]
    for name, detail in missingness.items():
        missing_lines.append(f"| {name} | {detail['count']:,} | {_pct(detail['share'])} |")

    used_missing_lines = ["| Column | Missing/unknown | Share |", "|---|---:|---:|"]
    for name, detail in used_import_missingness.items():
        used_missing_lines.append(f"| {name} | {detail['count']:,} | {_pct(detail['share'])} |")

    return f"""# NZTA Fleet Data Feasibility Report

Generated from the local source snapshot at `{result["generated_at_utc"]}`.

## Scope and source

- ZIP: `{source["file"]}` (read in place; not copied or extracted)
- CSV member: `{source["member"]}`
- ZIP file size: {source["zip_file_bytes"]:,} bytes
- Compressed CSV member: {source["compressed_member_bytes"]:,} bytes
- Uncompressed CSV: {source["uncompressed_bytes"]:,} bytes
- Rows processed: {rows["total"]:,}
- Rows with malformed column width: {rows["invalid_width"]:,}
- Source columns: {len(source["source_columns"])}; selected analytical columns: {len(source["selected_columns"])}
- Sensitive columns present but not selected: {", ".join(source["sensitive_columns_present_but_not_selected"])}

Source: NZ Transport Agency Waka Kotahi, New Zealand Vehicle Fleet Open Data,
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The processor projects only the approved analytical fields while streaming the
CSV directly from the ZIP. Source year/month fields are interpreted as nullable
integers; all observed categories remain strings.

## Registration coverage

- Earliest valid registration month: {registration["earliest"]}
- Latest valid registration month: {registration["latest"]}
- Rows with a valid registration month: {registration["valid_row_count"]:,}
- Recent window inspected: {", ".join(registration["recent_months"])}
- Current-fleet rows in that window: {registration["recent_row_count"]:,}
- Recent rows with `VEHICLE_YEAR < 2007`: {_pct(registration["recent_share_before_2007"])}
- Recent rows with `VEHICLE_YEAR < 1990`: {_pct(registration["recent_share_before_1990"])}

Recent vehicle-year bands: `{json.dumps(recent_bands, sort_keys=True)}`.

## Missingness

{chr(10).join(missing_lines)}

`NONE`, `NOT KNOWN`, `UNKNOWN`, blank, `N/A`, and `NULL` are counted as missing
for these feasibility measures. The raw category tables remain unmodified.

For used imports specifically:

{chr(10).join(used_missing_lines)}

## Observed source categories

### IMPORT_STATUS

{_category_table(categories["import_status"])}

### CLASS

{_category_table(categories["class"])}

### VEHICLE_TYPE

{_category_table(categories["vehicle_type"])}

### MOTIVE_POWER

{_category_table(categories["motive_power"])}

### ALTERNATIVE_MOTIVE_POWER

{_category_table(categories["alternative_motive_power"])}

The full observed `CLASS` x `VEHICLE_TYPE` cross-tab is in
`data/processed/class_vehicle_type_counts.csv`.

## Recommended ordinary-light-passenger filter

Use `VEHICLE_TYPE = PASSENGER CAR/VAN` and `CLASS IN (MA, MB, MC)`.
[NZTA defines these](https://www.nzta.govt.nz/vehicles/vehicle-types/vehicle-classes-and-standards/vehicle-classes)
as passenger car, forward-control passenger vehicle, and off-road passenger
vehicle, respectively, with no more than nine seating positions. This excludes
blank legacy classes and class LE motor tricycles rather than silently treating
them as ordinary passenger cars.

- Matching current-fleet rows: {passenger["row_count"]:,} ({_pct(passenger["fleet_share"])})
- Matching rows in the recent window: {passenger["recent_row_count"]:,}
- Recent matching rows with `VEHICLE_YEAR < 2007`: {_pct(passenger["recent_share_before_2007"])}
- Recent matching rows with `VEHICLE_YEAR < 1990`: {_pct(passenger["recent_share_before_1990"])}
- Used-import age quality in this cohort: `{json.dumps(passenger["used_import_age_quality"], sort_keys=True)}`
- Median comparable used-import age: {passenger["comparable_used_import_median_age"]} years

The sample monthly import-status and powertrain aggregates apply this filter.

## Approximate import age

`approximate_import_age = FIRST_NZ_REGISTRATION_YEAR - VEHICLE_YEAR`

All-row quality counts: `{json.dumps(age, sort_keys=True)}`.

Used-import quality counts: `{json.dumps(used_age, sort_keys=True)}`.

Negative ages and ages over 100 are flagged rather than silently discarded.
Rows with `VEHICLE_YEAR >= 2007` are initially comparable; older rows remain
available for counts but are legacy/non-comparable for age analysis.

## Feasibility conclusion

The source supports reproducible monthly cohort aggregates for import status,
make/model, previous country, broad powertrain, vehicle year, and approximate
entry age. The aggregate files are cohort reconstructions from a current-fleet
snapshot, so older periods have survivorship bias. Reliable month-over-month
history begins when this project starts retaining monthly aggregate snapshots.

The powertrain grouping is deliberately conservative: PHEV is assigned only
when source text explicitly identifies plug-in capability. Brand country will
require a separate curated, reviewable marque reference and must not be called
manufacturing country.

Recommended display coverage is 2007 onward for comparable cohort and age
trends. Older surviving fleet rows remain useful for current-fleet totals and
clearly labelled legacy context, but should not be blended into the default age
trend. The ongoing archive should retain each new monthly aggregate from the
first production run onward.
"""
