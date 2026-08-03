"""Build frontend-ready monthly aggregates from an NZTA fleet snapshot."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .domain import (
    calculate_import_age,
    import_status_group,
    is_missing,
    is_ordinary_light_passenger,
    normalise,
    parse_int,
    powertrain_group,
    registration_month,
)
from .source import ANALYTICAL_COLUMNS, open_fleet_csv


DATA_CONTRACT_VERSION = "1.2.0"
DEFAULT_START_MONTH = "2007-01"
DEFAULT_BRAND_REFERENCE = Path("data/reference/brand_countries.csv")
DEFAULT_OUTPUT_DIR = Path("data/production/current")
LEADERBOARD_LIMIT = 25
LEADERBOARD_POWERTRAIN_GROUPS = ("combustion", "hybrid", "bev", "phev", "other")


@dataclass(frozen=True)
class BrandInfo:
    brand: str
    country: str


class BrandReference:
    """Reviewable mapping from exact NZTA make values to marque origins."""

    def __init__(self, entries: dict[str, BrandInfo]) -> None:
        self.entries = entries

    @classmethod
    def load(cls, path: Path) -> BrandReference:
        entries: dict[str, BrandInfo] = {}
        with path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            expected = {"source_make", "brand", "brand_country"}
            if set(reader.fieldnames or ()) != expected:
                raise ValueError("Brand reference must contain source_make, brand, brand_country")
            for line_number, row in enumerate(reader, start=2):
                source_make = normalise(row["source_make"])
                brand = row["brand"].strip()
                country = row["brand_country"].strip()
                if not source_make or not brand or not country:
                    raise ValueError(f"Incomplete brand reference row {line_number}")
                if source_make in entries:
                    raise ValueError(f"Duplicate source_make in brand reference: {source_make}")
                entries[source_make] = BrandInfo(brand=brand, country=country)
        return cls(entries)

    def lookup(self, make: str) -> BrandInfo | None:
        return self.entries.get(normalise(make))


@dataclass(frozen=True)
class ProductionConfig:
    start_month: str = DEFAULT_START_MONTH
    comparable_vehicle_year: int = 2007

    def __post_init__(self) -> None:
        if not re.fullmatch(r"\d{4}-\d{2}", self.start_month):
            raise ValueError("start_month must use YYYY-MM")
        if registration_month(*self.start_month.split("-")) != self.start_month:
            raise ValueError("start_month must be a valid YYYY-MM")


def infer_snapshot_month(member_name: str) -> str | None:
    match = re.search(r"Fleet-(\d{2}[A-Za-z]{3}\d{4})", member_name)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%d%b%Y").strftime("%Y-%m")
    except ValueError:
        return None


def _records(
    counter: Counter[tuple],
    fields: tuple[str, ...],
    *,
    count_field: str = "registration_count",
) -> list[dict[str, object]]:
    rows = []
    for values, count in sorted(counter.items(), key=lambda item: item[0]):
        row = dict(zip(fields, values, strict=True))
        row[count_field] = count
        rows.append(row)
    return rows


def _ranked_records(
    counter: Counter[tuple],
    fields: tuple[str, ...],
    *,
    group_fields: int,
    limit: int = LEADERBOARD_LIMIT,
    count_field: str = "registration_count",
) -> list[dict[str, object]]:
    grouped: dict[tuple, list[tuple[tuple, int]]] = {}
    for values, count in counter.items():
        grouped.setdefault(values[:group_fields], []).append((values, count))

    rows = []
    for group in sorted(grouped):
        ranked = sorted(
            grouped[group],
            key=lambda item: (-item[1], tuple(str(value) for value in item[0])),
        )[:limit]
        for rank, (values, count) in enumerate(ranked, start=1):
            row = dict(zip(fields, values, strict=True))
            row["rank"] = rank
            row[count_field] = count
            rows.append(row)
    return rows


def leaderboard_powertrain_group(motive: str) -> str:
    """Collapse very small motive groups into one stable leaderboard option."""

    return motive if motive in LEADERBOARD_POWERTRAIN_GROUPS[:-1] else "other"


def aggregate(
    zip_path: Path,
    brand_reference: BrandReference,
    config: ProductionConfig | None = None,
) -> dict[str, object]:
    """Stream one snapshot and return bounded, frontend-ready aggregate tables."""

    config = config or ProductionConfig()
    metadata, archive, stream = open_fleet_csv(zip_path)
    text, reader = stream
    indexes = {name: metadata.source_columns.index(name) for name in ANALYTICAL_COLUMNS}

    quality = Counter()
    monthly_summary: Counter[tuple[str, str]] = Counter()
    monthly_powertrain: Counter[tuple[str, str, str]] = Counter()
    monthly_make: Counter[tuple[str, str, str, str, str]] = Counter()
    monthly_model: Counter[tuple[str, str, str, str]] = Counter()
    monthly_make_powertrain: Counter[tuple[str, str, str, str, str]] = Counter()
    monthly_model_powertrain: Counter[tuple[str, str, str, str]] = Counter()
    scope_make: Counter[tuple[str, str, str, str]] = Counter()
    scope_model: Counter[tuple[str, str, str]] = Counter()
    scope_make_powertrain: Counter[tuple[str, str, str, str]] = Counter()
    scope_model_powertrain: Counter[tuple[str, str, str]] = Counter()
    monthly_brand_country: Counter[tuple[str, str, str]] = Counter()
    monthly_previous_country: Counter[tuple[str, str]] = Counter()
    monthly_vehicle_year: Counter[tuple[str, str, int, bool]] = Counter()
    monthly_import_age: Counter[tuple[str, int]] = Counter()
    unmapped_make: Counter[tuple[str]] = Counter()

    try:
        for row in reader:
            quality["source_rows"] += 1
            if len(row) != len(metadata.source_columns):
                quality["malformed_rows"] += 1
                continue

            value = {name: row[indexes[name]].strip() for name in ANALYTICAL_COLUMNS}
            if not is_ordinary_light_passenger(value["CLASS"], value["VEHICLE_TYPE"]):
                quality["non_passenger_rows"] += 1
                continue
            quality["passenger_rows"] += 1

            month = registration_month(
                value["FIRST_NZ_REGISTRATION_YEAR"],
                value["FIRST_NZ_REGISTRATION_MONTH"],
            )
            if month is None:
                quality["invalid_registration_month_rows"] += 1
                continue
            if month < config.start_month:
                quality["before_start_month_rows"] += 1
                continue

            quality["included_rows"] += 1
            status = import_status_group(value["IMPORT_STATUS"])
            motive = powertrain_group(value["MOTIVE_POWER"], value["ALTERNATIVE_MOTIVE_POWER"])
            leaderboard_motive = leaderboard_powertrain_group(motive)
            make = normalise(value["MAKE"]) or "UNKNOWN"
            model = normalise(value["MODEL"]) or "UNKNOWN"
            brand_info = brand_reference.lookup(make)
            if brand_info is None:
                brand = make
                brand_country = "Unmapped"
                quality["unmapped_brand_rows"] += 1
                unmapped_make[(make,)] += 1
            else:
                brand = brand_info.brand
                brand_country = brand_info.country
                quality["mapped_brand_rows"] += 1

            monthly_summary[(month, status)] += 1
            monthly_powertrain[(month, status, motive)] += 1
            monthly_make[(month, status, make, brand, brand_country)] += 1
            monthly_make[(month, "all", make, brand, brand_country)] += 1
            monthly_model[(month, status, make, model)] += 1
            monthly_model[(month, "all", make, model)] += 1
            monthly_make_powertrain[(month, leaderboard_motive, make, brand, brand_country)] += 1
            monthly_model_powertrain[(month, leaderboard_motive, make, model)] += 1
            scope_make[(status, make, brand, brand_country)] += 1
            scope_make[("all", make, brand, brand_country)] += 1
            scope_model[(status, make, model)] += 1
            scope_model[("all", make, model)] += 1
            scope_make_powertrain[(leaderboard_motive, make, brand, brand_country)] += 1
            scope_model_powertrain[(leaderboard_motive, make, model)] += 1
            monthly_brand_country[(month, status, brand_country)] += 1

            if status == "used_import":
                quality["used_import_rows"] += 1
                previous_country = (
                    "UNKNOWN"
                    if is_missing(value["PREVIOUS_COUNTRY"])
                    else normalise(value["PREVIOUS_COUNTRY"])
                )
                monthly_previous_country[(month, previous_country)] += 1

            vehicle_year = parse_int(value["VEHICLE_YEAR"])
            if vehicle_year is None:
                quality["missing_vehicle_year_rows"] += 1
            else:
                comparable = vehicle_year >= config.comparable_vehicle_year
                monthly_vehicle_year[(month, status, vehicle_year, comparable)] += 1
                if comparable:
                    quality["comparable_vehicle_year_rows"] += 1
                else:
                    quality["legacy_vehicle_year_rows"] += 1

            if status == "used_import":
                age = calculate_import_age(
                    value["FIRST_NZ_REGISTRATION_YEAR"],
                    value["VEHICLE_YEAR"],
                    comparable_from=config.comparable_vehicle_year,
                )
                if age.quality == "valid" and age.comparable and age.value is not None:
                    monthly_import_age[(month, age.value)] += 1
                    quality["comparable_import_age_rows"] += 1
                elif age.quality == "valid":
                    quality["excluded_import_age_legacy_vehicle_year_rows"] += 1
                else:
                    quality[f"excluded_import_age_{age.quality}_rows"] += 1
    finally:
        text.close()
        archive.close()

    included = quality["included_rows"]
    if sum(monthly_summary.values()) != included:
        raise RuntimeError("Monthly summary does not reconcile to included rows")
    if quality["mapped_brand_rows"] + quality["unmapped_brand_rows"] != included:
        raise RuntimeError("Brand coverage does not reconcile to included rows")
    if sum(count for values, count in scope_make.items() if values[0] == "all") != included:
        raise RuntimeError("Scope make totals do not reconcile to included rows")
    if sum(count for values, count in scope_make.items() if values[0] != "all") != included:
        raise RuntimeError("Scope make status totals do not reconcile to included rows")
    if sum(count for values, count in scope_model.items() if values[0] == "all") != included:
        raise RuntimeError("Scope model totals do not reconcile to included rows")
    if sum(count for values, count in scope_model.items() if values[0] != "all") != included:
        raise RuntimeError("Scope model status totals do not reconcile to included rows")

    return {
        "contract": {
            "version": DATA_CONTRACT_VERSION,
            "scope": {
                "vehicle_type": "PASSENGER CAR/VAN",
                "classes": ["MA", "MB", "MC"],
                "registration_month_from": config.start_month,
                "import_age_vehicle_year_from": config.comparable_vehicle_year,
                "legacy_vehicle_years_in_counts": True,
                "leaderboard_limit_per_month_and_status": LEADERBOARD_LIMIT,
                "leaderboard_powertrain_groups": list(LEADERBOARD_POWERTRAIN_GROUPS),
            },
        },
        "source": {
            "file": zip_path.name,
            "member": metadata.member_name,
            "snapshot_month": infer_snapshot_month(metadata.member_name),
        },
        "quality": dict(sorted(quality.items())),
        "brand_coverage": {
            "mapped_share": (quality["mapped_brand_rows"] / included if included else None),
            "unmapped_makes": _records(unmapped_make, ("make",)),
        },
        "datasets": {
            "monthly_summary": _records(
                monthly_summary, ("registration_month", "import_status_group")
            ),
            "monthly_powertrain": _records(
                monthly_powertrain,
                ("registration_month", "import_status_group", "powertrain_group"),
            ),
            "monthly_make": _ranked_records(
                monthly_make,
                (
                    "registration_month",
                    "import_status_group",
                    "make",
                    "brand",
                    "brand_country",
                ),
                group_fields=2,
            ),
            "monthly_model": _ranked_records(
                monthly_model,
                ("registration_month", "import_status_group", "make", "model"),
                group_fields=2,
            ),
            "monthly_make_powertrain": _ranked_records(
                monthly_make_powertrain,
                (
                    "registration_month",
                    "powertrain_group",
                    "make",
                    "brand",
                    "brand_country",
                ),
                group_fields=2,
            ),
            "monthly_model_powertrain": _ranked_records(
                monthly_model_powertrain,
                (
                    "registration_month",
                    "powertrain_group",
                    "make",
                    "model",
                ),
                group_fields=2,
            ),
            "scope_make": _records(
                scope_make,
                ("import_status_group", "make", "brand", "brand_country"),
                count_field="vehicle_count",
            ),
            "scope_model": _records(
                scope_model,
                ("import_status_group", "make", "model"),
                count_field="vehicle_count",
            ),
            "scope_make_powertrain": _ranked_records(
                scope_make_powertrain,
                (
                    "powertrain_group",
                    "make",
                    "brand",
                    "brand_country",
                ),
                group_fields=1,
                count_field="vehicle_count",
            ),
            "scope_model_powertrain": _ranked_records(
                scope_model_powertrain,
                ("powertrain_group", "make", "model"),
                group_fields=1,
                count_field="vehicle_count",
            ),
            "monthly_brand_country": _records(
                monthly_brand_country,
                ("registration_month", "import_status_group", "brand_country"),
            ),
            "monthly_previous_country": _records(
                monthly_previous_country, ("registration_month", "previous_country")
            ),
            "monthly_vehicle_year": _records(
                monthly_vehicle_year,
                (
                    "registration_month",
                    "import_status_group",
                    "vehicle_year",
                    "age_comparable",
                ),
            ),
            "monthly_import_age": _records(
                monthly_import_age, ("registration_month", "approximate_import_age")
            ),
        },
    }


def _write_json(path: Path, value: object, *, compact: bool) -> tuple[int, str]:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    options = {"ensure_ascii": False}
    if compact:
        options["separators"] = (",", ":")
    else:
        options["indent"] = 2
    payload = json.dumps(value, **options).encode("utf-8")
    temporary.write_bytes(payload)
    temporary.replace(path)
    return len(payload), hashlib.sha256(payload).hexdigest()


def write_outputs(result: dict[str, object], output_dir: Path) -> dict[str, object]:
    """Write one JSON file per dimension plus a checksummed manifest."""

    output_dir.mkdir(parents=True, exist_ok=True)
    snapshot_month = result["source"]["snapshot_month"]
    manifest = {
        "contract": result["contract"],
        "source": result["source"],
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "quality": result["quality"],
        "brand_coverage": result["brand_coverage"],
        "files": {},
    }
    for name, records in result["datasets"].items():
        filename = f"{name}.json"
        document = {
            "contract_version": DATA_CONTRACT_VERSION,
            "snapshot_month": snapshot_month,
            "records": records,
        }
        size, digest = _write_json(output_dir / filename, document, compact=True)
        manifest["files"][name] = {
            "path": filename,
            "records": len(records),
            "bytes": size,
            "sha256": digest,
        }
    _write_json(output_dir / "manifest.json", manifest, compact=False)
    return manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip_path", type=Path)
    parser.add_argument("--brand-reference", type=Path, default=DEFAULT_BRAND_REFERENCE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--start-month", default=DEFAULT_START_MONTH)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.zip_path.is_file():
        print(f"ZIP not found: {args.zip_path}", file=sys.stderr)
        return 2
    if not args.brand_reference.is_file():
        print(f"Brand reference not found: {args.brand_reference}", file=sys.stderr)
        return 2
    try:
        reference = BrandReference.load(args.brand_reference)
        result = aggregate(
            args.zip_path,
            reference,
            ProductionConfig(start_month=args.start_month),
        )
        manifest = write_outputs(result, args.output_dir)
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"Aggregation failed: {exc}", file=sys.stderr)
        return 1

    print(f"Included {result['quality']['included_rows']:,} passenger rows")
    print(f"Snapshot month: {result['source']['snapshot_month'] or 'unknown'}")
    print(f"Brand coverage: {result['brand_coverage']['mapped_share']:.2%}")
    print(f"Manifest: {args.output_dir / 'manifest.json'}")
    print(f"Datasets: {len(manifest['files'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
