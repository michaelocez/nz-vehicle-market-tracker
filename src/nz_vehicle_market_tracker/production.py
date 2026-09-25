"""Build frontend-ready monthly aggregates from an NZTA fleet snapshot."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .aggregators import Accumulators, _process_row, leaderboard_powertrain_group, reconcile
from .brands import DEFAULT_BRAND_REFERENCE, BrandInfo, BrandReference
from .config import (
    DATA_CONTRACT_VERSION,
    DEFAULT_OUTPUT_DIR,
    DEFAULT_START_MONTH,
    LEADERBOARD_LIMIT,
    LEADERBOARD_POWERTRAIN_GROUPS,
    ProductionConfig,
)
from .source import ANALYTICAL_COLUMNS, SourceMetadata, open_fleet_csv

__all__ = [
    "DATA_CONTRACT_VERSION",
    "BrandInfo",
    "BrandReference",
    "ProductionConfig",
    "leaderboard_powertrain_group",
    "aggregate",
    "write_outputs",
    "infer_snapshot_month",
]


def infer_snapshot_month(member_name: str) -> str | None:
    match = re.search(r"Fleet-(\d{2}[A-Za-z]{3}\d{4})", member_name)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%d%b%Y").replace(tzinfo=UTC).strftime("%Y-%m")
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


def _build_result(
    acc: Accumulators,
    metadata: SourceMetadata,
    config: ProductionConfig,
    snapshot_month: str,
    zip_path: Path,
) -> dict[str, Any]:
    """Assemble the final contract- and frontend-ready result dictionary."""

    included = acc.quality["included_rows"]
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
            "snapshot_month": snapshot_month,
        },
        "quality": dict(sorted(acc.quality.items())),
        "brand_coverage": {
            "mapped_share": (acc.quality["mapped_brand_rows"] / included if included else None),
            "unmapped_makes": _records(acc.unmapped_make, ("make",)),
        },
        "datasets": {
            "monthly_summary": _records(
                acc.monthly_summary, ("registration_month", "import_status_group")
            ),
            "monthly_powertrain": _records(
                acc.monthly_powertrain,
                ("registration_month", "import_status_group", "powertrain_group"),
            ),
            "monthly_make": _ranked_records(
                acc.monthly_make,
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
                acc.monthly_model,
                ("registration_month", "import_status_group", "make", "model"),
                group_fields=2,
            ),
            "monthly_make_powertrain": _ranked_records(
                acc.monthly_make_powertrain,
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
                acc.monthly_model_powertrain,
                (
                    "registration_month",
                    "powertrain_group",
                    "make",
                    "model",
                ),
                group_fields=2,
            ),
            "scope_make": _records(
                acc.scope_make,
                ("import_status_group", "make", "brand", "brand_country"),
                count_field="vehicle_count",
            ),
            "scope_model": _records(
                acc.scope_model,
                ("import_status_group", "make", "model"),
                count_field="vehicle_count",
            ),
            "scope_make_powertrain": _ranked_records(
                acc.scope_make_powertrain,
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
                acc.scope_model_powertrain,
                ("powertrain_group", "make", "model"),
                group_fields=1,
                count_field="vehicle_count",
            ),
            "scope_vehicle_age": _records(
                acc.scope_vehicle_age,
                ("approximate_current_age",),
                count_field="vehicle_count",
            ),
            "monthly_brand_country": _records(
                acc.monthly_brand_country,
                ("registration_month", "import_status_group", "brand_country"),
            ),
            "monthly_previous_country": _records(
                acc.monthly_previous_country, ("registration_month", "previous_country")
            ),
            "monthly_vehicle_year": _records(
                acc.monthly_vehicle_year,
                (
                    "registration_month",
                    "import_status_group",
                    "vehicle_year",
                    "age_comparable",
                ),
            ),
            "monthly_import_age": _records(
                acc.monthly_import_age, ("registration_month", "approximate_import_age")
            ),
        },
    }


def aggregate(
    zip_path: Path,
    brand_reference: BrandReference,
    config: ProductionConfig | None = None,
) -> dict[str, Any]:
    """Stream one snapshot and return bounded, frontend-ready aggregate tables."""

    config = config or ProductionConfig()
    metadata, archive, stream = open_fleet_csv(zip_path)
    text, reader = stream
    indexes = {name: metadata.source_columns.index(name) for name in ANALYTICAL_COLUMNS}
    snapshot_month = infer_snapshot_month(metadata.member_name)
    if snapshot_month is None:
        text.close()
        archive.close()
        raise ValueError("Could not infer the fleet snapshot month from the CSV filename")
    snapshot_year = int(snapshot_month[:4])

    acc = Accumulators.fresh()
    try:
        for row in reader:
            _process_row(acc, row, indexes, metadata, brand_reference, config, snapshot_year)
    finally:
        text.close()
        archive.close()

    reconcile(acc)
    return _build_result(acc, metadata, config, snapshot_month, zip_path)


def _write_json(path: Path, value: object, *, compact: bool) -> tuple[int, str]:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    options: dict[str, Any] = {"ensure_ascii": False}
    if compact:
        options["separators"] = (",", ":")
    else:
        options["indent"] = 2
    payload = json.dumps(value, **options).encode("utf-8")
    temporary.write_bytes(payload)
    temporary.replace(path)
    return len(payload), hashlib.sha256(payload).hexdigest()


def write_outputs(result: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    """Write one JSON file per dimension plus a checksummed manifest."""

    output_dir.mkdir(parents=True, exist_ok=True)
    snapshot_month = result["source"]["snapshot_month"]
    manifest = {
        "contract": result["contract"],
        "source": result["source"],
        "generated_at_utc": datetime.now(UTC).isoformat(),
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
