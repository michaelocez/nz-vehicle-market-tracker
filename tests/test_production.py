import csv
import json
import zipfile
from pathlib import Path

from nz_vehicle_market_tracker.production import (
    BrandInfo,
    BrandReference,
    ProductionConfig,
    aggregate,
    infer_snapshot_month,
    write_outputs,
)
from nz_vehicle_market_tracker.source import ANALYTICAL_COLUMNS


def _row(**overrides: str) -> dict[str, str]:
    row = {
        "VEHICLE_YEAR": "2018",
        "FIRST_NZ_REGISTRATION_YEAR": "2026",
        "FIRST_NZ_REGISTRATION_MONTH": "6",
        "IMPORT_STATUS": "USED",
        "MAKE": "TOYOTA",
        "MODEL": "PRIUS",
        "MOTIVE_POWER": "PETROL HYBRID",
        "ALTERNATIVE_MOTIVE_POWER": "",
        "PREVIOUS_COUNTRY": "JAPAN",
        "CLASS": "MA",
        "VEHICLE_TYPE": "PASSENGER CAR/VAN",
    }
    row.update(overrides)
    return row


def _write_zip(path: Path, rows: list[dict[str, str]]) -> None:
    csv_path = path.with_suffix(".csv")
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(ANALYTICAL_COLUMNS))
        writer.writeheader()
        writer.writerows(rows)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(csv_path, "Fleet-30Jun2026.csv")
    csv_path.unlink()


def test_production_scope_and_age_boundary(tmp_path: Path) -> None:
    source = tmp_path / "fleet.zip"
    _write_zip(
        source,
        [
            _row(),
            _row(VEHICLE_YEAR="2005", MODEL="COROLLA"),
            _row(
                VEHICLE_YEAR="2026",
                IMPORT_STATUS="NEW",
                MAKE="BYD",
                MODEL="ATTO 3",
                MOTIVE_POWER="ELECTRIC",
                PREVIOUS_COUNTRY="NONE",
            ),
            _row(FIRST_NZ_REGISTRATION_YEAR="2006"),
            _row(CLASS="NA", VEHICLE_TYPE="GOODS VAN/TRUCK/UTILITY"),
            _row(CLASS="LC", VEHICLE_TYPE="MOTORCYCLE"),
        ],
    )
    reference = BrandReference(
        {
            "TOYOTA": BrandInfo("Toyota", "Japan"),
            "BYD": BrandInfo("BYD", "China"),
        }
    )

    result = aggregate(source, reference, ProductionConfig(start_month="2007-01"))

    assert result["quality"]["included_rows"] == 3
    assert result["quality"]["non_passenger_rows"] == 2
    assert result["quality"]["before_start_month_rows"] == 1
    assert sum(row["registration_count"] for row in result["datasets"]["monthly_summary"]) == 3
    assert sum(row["registration_count"] for row in result["datasets"]["monthly_import_age"]) == 1
    assert any(
        row["vehicle_year"] == 2005 and row["age_comparable"] is False
        for row in result["datasets"]["monthly_vehicle_year"]
    )


def test_writes_checksummed_dimension_files(tmp_path: Path) -> None:
    source = tmp_path / "fleet.zip"
    _write_zip(source, [_row()])
    result = aggregate(
        source,
        BrandReference({"TOYOTA": BrandInfo("Toyota", "Japan")}),
    )

    output = tmp_path / "output"
    manifest = write_outputs(result, output)

    assert (output / "manifest.json").is_file()
    assert len(manifest["files"]) == 8
    monthly_summary = json.loads((output / "monthly_summary.json").read_text())
    assert monthly_summary["contract_version"] == "1.0.0"
    assert monthly_summary["snapshot_month"] == "2026-06"


def test_infers_snapshot_month() -> None:
    assert infer_snapshot_month("Fleet-30Jun2026.csv") == "2026-06"
    assert infer_snapshot_month("Fleet-test.csv") is None
