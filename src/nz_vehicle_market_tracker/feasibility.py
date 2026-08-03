"""Stream an NZTA fleet ZIP and produce feasibility evidence and small aggregates."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path

from .domain import (
    calculate_import_age,
    import_status_group,
    is_missing,
    is_ordinary_light_passenger,
    parse_int,
    powertrain_group,
    registration_month,
)
from .source import (
    ANALYTICAL_COLUMNS as REQUIRED_COLUMNS,
)
from .source import (
    SENSITIVE_COLUMNS,
)
from .source import (
    open_fleet_csv as inspect_source,
)

MISSINGNESS_COLUMNS = ("MAKE", "MODEL", "PREVIOUS_COUNTRY", "VEHICLE_YEAR")


def _month_sort_key(month: str) -> tuple[int, int]:
    year, number = month.split("-")
    return int(year), int(number)


def _write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def analyse(zip_path: Path, *, recent_months: int = 6) -> dict[str, object]:
    metadata, archive, stream = inspect_source(zip_path)
    text, reader = stream
    indexes = {name: metadata.source_columns.index(name) for name in REQUIRED_COLUMNS}

    total_rows = 0
    invalid_width_rows = 0
    categories = {
        "import_status": Counter(),
        "class": Counter(),
        "vehicle_type": Counter(),
        "motive_power": Counter(),
        "alternative_motive_power": Counter(),
    }
    missingness = Counter()
    import_group_rows = Counter()
    missingness_by_import_group: dict[str, Counter[str]] = defaultdict(Counter)
    month_counts = Counter()
    month_import_counts: dict[str, Counter[str]] = defaultdict(Counter)
    month_powertrain_counts: dict[str, Counter[str]] = defaultdict(Counter)
    month_vehicle_year_bands: dict[str, Counter[str]] = defaultdict(Counter)
    class_type_counts: Counter[tuple[str, str]] = Counter()
    age_quality = Counter()
    used_import_age_quality = Counter()
    used_import_age_values = Counter()
    passenger_rows = 0
    passenger_month_counts = Counter()
    passenger_month_import_counts: dict[str, Counter[str]] = defaultdict(Counter)
    passenger_month_powertrain_counts: dict[str, Counter[str]] = defaultdict(Counter)
    passenger_month_vehicle_year_bands: dict[str, Counter[str]] = defaultdict(Counter)
    passenger_used_import_age_quality = Counter()
    passenger_comparable_used_import_ages = Counter()

    try:
        for row in reader:
            total_rows += 1
            if len(row) != len(metadata.source_columns):
                invalid_width_rows += 1
                continue

            value = {name: row[indexes[name]].strip() for name in REQUIRED_COLUMNS}
            categories["import_status"][value["IMPORT_STATUS"] or "<blank>"] += 1
            categories["class"][value["CLASS"] or "<blank>"] += 1
            categories["vehicle_type"][value["VEHICLE_TYPE"] or "<blank>"] += 1
            categories["motive_power"][value["MOTIVE_POWER"] or "<blank>"] += 1
            categories["alternative_motive_power"][
                value["ALTERNATIVE_MOTIVE_POWER"] or "<blank>"
            ] += 1
            class_type_counts[
                (value["CLASS"] or "<blank>", value["VEHICLE_TYPE"] or "<blank>")
            ] += 1
            is_passenger = is_ordinary_light_passenger(value["CLASS"], value["VEHICLE_TYPE"])
            if is_passenger:
                passenger_rows += 1

            status_group = import_status_group(value["IMPORT_STATUS"])
            import_group_rows[status_group] += 1
            for name in MISSINGNESS_COLUMNS:
                if is_missing(value[name]):
                    missingness[name] += 1
                    missingness_by_import_group[status_group][name] += 1

            month = registration_month(
                value["FIRST_NZ_REGISTRATION_YEAR"], value["FIRST_NZ_REGISTRATION_MONTH"]
            )
            age = calculate_import_age(value["FIRST_NZ_REGISTRATION_YEAR"], value["VEHICLE_YEAR"])
            age_quality[age.quality] += 1
            if status_group == "used_import":
                used_import_age_quality[age.quality] += 1
                if age.quality == "valid" and age.value is not None:
                    used_import_age_values[age.value] += 1
                if is_passenger:
                    passenger_used_import_age_quality[age.quality] += 1
                    if age.quality == "valid" and age.comparable and age.value is not None:
                        passenger_comparable_used_import_ages[age.value] += 1

            if month is None:
                continue
            month_counts[month] += 1
            month_import_counts[month][status_group] += 1
            month_powertrain_counts[month][
                powertrain_group(value["MOTIVE_POWER"], value["ALTERNATIVE_MOTIVE_POWER"])
            ] += 1

            vehicle_year = parse_int(value["VEHICLE_YEAR"])
            if vehicle_year is None:
                band = "missing"
            elif vehicle_year < 1990:
                band = "before_1990"
            elif vehicle_year < 2007:
                band = "1990_to_2006"
            else:
                band = "2007_onward"
            month_vehicle_year_bands[month][band] += 1
            if is_passenger:
                passenger_month_counts[month] += 1
                passenger_month_import_counts[month][status_group] += 1
                passenger_month_powertrain_counts[month][
                    powertrain_group(value["MOTIVE_POWER"], value["ALTERNATIVE_MOTIVE_POWER"])
                ] += 1
                passenger_month_vehicle_year_bands[month][band] += 1
    finally:
        text.close()
        archive.close()

    sorted_months = sorted(month_counts, key=_month_sort_key)
    selected_recent = sorted_months[-recent_months:]
    recent_counts = Counter()
    for month in selected_recent:
        recent_counts.update(month_vehicle_year_bands[month])
    recent_total = sum(month_counts[month] for month in selected_recent)
    passenger_recent_counts = Counter()
    for month in selected_recent:
        passenger_recent_counts.update(passenger_month_vehicle_year_bands[month])
    passenger_recent_total = sum(passenger_month_counts[month] for month in selected_recent)

    def counter_dict(counter: Counter) -> dict[str, int]:
        return dict(sorted(counter.items(), key=lambda item: (-item[1], str(item[0]))))

    def counter_median(counter: Counter[int]) -> float | None:
        total = sum(counter.values())
        if not total:
            return None
        targets = ((total - 1) // 2, total // 2)
        found: list[int] = []
        cumulative = 0
        for value, count in sorted(counter.items()):
            previous = cumulative
            cumulative += count
            for target in targets:
                if previous <= target < cumulative:
                    found.append(value)
        return sum(found) / len(found)

    result: dict[str, object] = {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "source": {
            "file": metadata.zip_path.name,
            "member": metadata.member_name,
            "zip_file_bytes": metadata.zip_path.stat().st_size,
            "compressed_member_bytes": metadata.compressed_bytes,
            "uncompressed_bytes": metadata.uncompressed_bytes,
            "source_columns": metadata.source_columns,
            "selected_columns": list(REQUIRED_COLUMNS),
            "sensitive_columns_present_but_not_selected": sorted(
                SENSITIVE_COLUMNS.intersection(metadata.source_columns)
            ),
            "inferred_selected_types": {
                name: "integer" if name.endswith(("YEAR", "MONTH")) else "string"
                for name in REQUIRED_COLUMNS
            },
        },
        "rows": {"total": total_rows, "invalid_width": invalid_width_rows},
        "categories": {name: counter_dict(values) for name, values in categories.items()},
        "missingness": {
            name: {
                "count": missingness[name],
                "share": missingness[name] / total_rows if total_rows else None,
            }
            for name in MISSINGNESS_COLUMNS
        },
        "missingness_by_import_status_group": {
            group: {
                name: {
                    "count": missingness_by_import_group[group][name],
                    "share": (
                        missingness_by_import_group[group][name] / group_total
                        if group_total
                        else None
                    ),
                }
                for name in MISSINGNESS_COLUMNS
            }
            for group, group_total in import_group_rows.items()
        },
        "registration_month": {
            "earliest": sorted_months[0] if sorted_months else None,
            "latest": sorted_months[-1] if sorted_months else None,
            "valid_row_count": sum(month_counts.values()),
            "recent_months": selected_recent,
            "recent_row_count": recent_total,
            "recent_vehicle_year_bands": counter_dict(recent_counts),
            "recent_share_before_2007": (
                (recent_counts["before_1990"] + recent_counts["1990_to_2006"]) / recent_total
                if recent_total
                else None
            ),
            "recent_share_before_1990": (
                recent_counts["before_1990"] / recent_total if recent_total else None
            ),
        },
        "age_quality": counter_dict(age_quality),
        "used_import_age_quality": counter_dict(used_import_age_quality),
        "used_import_valid_age_distribution": {
            str(age): count for age, count in sorted(used_import_age_values.items())
        },
        "ordinary_light_passenger": {
            "filter": {
                "vehicle_type": "PASSENGER CAR/VAN",
                "classes": ["MA", "MB", "MC"],
                "official_definition_url": "https://www.nzta.govt.nz/vehicles/vehicle-types/vehicle-classes-and-standards/vehicle-classes",
            },
            "row_count": passenger_rows,
            "fleet_share": passenger_rows / total_rows if total_rows else None,
            "valid_registration_month_rows": sum(passenger_month_counts.values()),
            "recent_months": selected_recent,
            "recent_row_count": passenger_recent_total,
            "recent_vehicle_year_bands": counter_dict(passenger_recent_counts),
            "recent_share_before_2007": (
                (passenger_recent_counts["before_1990"] + passenger_recent_counts["1990_to_2006"])
                / passenger_recent_total
                if passenger_recent_total
                else None
            ),
            "recent_share_before_1990": (
                passenger_recent_counts["before_1990"] / passenger_recent_total
                if passenger_recent_total
                else None
            ),
            "used_import_age_quality": counter_dict(passenger_used_import_age_quality),
            "comparable_used_import_median_age": counter_median(
                passenger_comparable_used_import_ages
            ),
            "comparable_used_import_age_distribution": {
                str(age): count
                for age, count in sorted(passenger_comparable_used_import_ages.items())
            },
            "month_import_counts": {
                month: counter_dict(counts)
                for month, counts in sorted(passenger_month_import_counts.items())
            },
            "month_powertrain_counts": {
                month: counter_dict(counts)
                for month, counts in sorted(passenger_month_powertrain_counts.items())
            },
        },
        "month_counts": dict(sorted(month_counts.items())),
        "month_import_counts": {
            month: counter_dict(counts) for month, counts in sorted(month_import_counts.items())
        },
        "month_powertrain_counts": {
            month: counter_dict(counts) for month, counts in sorted(month_powertrain_counts.items())
        },
        "class_vehicle_type_counts": [
            {"class": pair[0], "vehicle_type": pair[1], "count": count}
            for pair, count in class_type_counts.most_common()
        ],
    }
    return result


def write_outputs(result: dict[str, object], output_dir: Path, report_path: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = output_dir / "data_quality_summary.json"
    summary_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    class_rows = result["class_vehicle_type_counts"]
    _write_csv(
        output_dir / "class_vehicle_type_counts.csv",
        ["class", "vehicle_type", "count"],
        class_rows,
    )

    import_rows = []
    passenger = result["ordinary_light_passenger"]
    for month, groups in passenger["month_import_counts"].items():
        for group, count in groups.items():
            import_rows.append(
                {
                    "registration_month": month,
                    "import_status_group": group,
                    "registration_count": count,
                }
            )
    _write_csv(
        output_dir / "sample_monthly_import_status.csv",
        ["registration_month", "import_status_group", "registration_count"],
        import_rows,
    )

    powertrain_rows = []
    for month, groups in passenger["month_powertrain_counts"].items():
        for group, count in groups.items():
            powertrain_rows.append(
                {
                    "registration_month": month,
                    "powertrain_group": group,
                    "registration_count": count,
                }
            )
    _write_csv(
        output_dir / "sample_monthly_powertrain.csv",
        ["registration_month", "powertrain_group", "registration_count"],
        powertrain_rows,
    )

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(render_report(result), encoding="utf-8")


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.2%}"


def _category_table(values: dict[str, int]) -> str:
    lines = ["| Value | Rows |", "|---|---:|"]
    lines.extend(f"| {value or '<blank>'} | {count:,} |" for value, count in values.items())
    return "\n".join(lines)


def render_report(result: dict[str, object]) -> str:
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip_path", type=Path, help="Local NZTA all-vehicle-years ZIP")
    parser.add_argument("--recent-months", type=int, default=6)
    parser.add_argument("--output-dir", type=Path, default=Path("data/processed"))
    parser.add_argument("--report", type=Path, default=Path("reports/feasibility.md"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.recent_months < 1:
        print("--recent-months must be at least 1", file=sys.stderr)
        return 2
    if not args.zip_path.is_file():
        print(f"ZIP not found: {args.zip_path}", file=sys.stderr)
        return 2

    result = analyse(args.zip_path, recent_months=args.recent_months)
    write_outputs(result, args.output_dir, args.report)
    print(f"Processed {result['rows']['total']:,} rows")
    print(f"Report: {args.report}")
    print(f"Data quality summary: {args.output_dir / 'data_quality_summary.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
