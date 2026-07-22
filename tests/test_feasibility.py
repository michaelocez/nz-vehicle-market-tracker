import csv
import zipfile
from pathlib import Path

from nz_vehicle_market_tracker.feasibility import REQUIRED_COLUMNS, analyse, write_outputs


def _write_fixture_zip(path: Path) -> None:
    rows = [
        {
            "VEHICLE_YEAR": "2018",
            "FIRST_NZ_REGISTRATION_YEAR": "2026",
            "FIRST_NZ_REGISTRATION_MONTH": "6",
            "IMPORT_STATUS": "USED",
            "MAKE": "TOYOTA",
            "MODEL": "PRIUS",
            "MOTIVE_POWER": "PETROL",
            "ALTERNATIVE_MOTIVE_POWER": "ELECTRIC",
            "PREVIOUS_COUNTRY": "JAPAN",
            "CLASS": "MA",
            "VEHICLE_TYPE": "PASSENGER CAR/VAN",
        },
        {
            "VEHICLE_YEAR": "2026",
            "FIRST_NZ_REGISTRATION_YEAR": "2026",
            "FIRST_NZ_REGISTRATION_MONTH": "6",
            "IMPORT_STATUS": "NEW",
            "MAKE": "BYD",
            "MODEL": "ATTO 3",
            "MOTIVE_POWER": "ELECTRIC",
            "ALTERNATIVE_MOTIVE_POWER": "",
            "PREVIOUS_COUNTRY": "NONE",
            "CLASS": "MA",
            "VEHICLE_TYPE": "PASSENGER CAR/VAN",
        },
    ]
    csv_path = path.with_suffix(".csv")
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(REQUIRED_COLUMNS))
        writer.writeheader()
        writer.writerows(rows)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(csv_path, "Fleet-test.csv")
    csv_path.unlink()


def test_analyse_and_write_outputs(tmp_path: Path) -> None:
    source = tmp_path / "fleet.zip"
    _write_fixture_zip(source)

    result = analyse(source)

    assert result["rows"]["total"] == 2
    assert result["registration_month"]["latest"] == "2026-06"
    assert result["categories"]["import_status"] == {"NEW": 1, "USED": 1}
    assert result["month_powertrain_counts"]["2026-06"] == {"bev": 1, "hybrid": 1}
    assert result["ordinary_light_passenger"]["row_count"] == 2

    output_dir = tmp_path / "processed"
    report = tmp_path / "report.md"
    write_outputs(result, output_dir, report)
    assert report.is_file()
    assert (output_dir / "data_quality_summary.json").is_file()
    assert (output_dir / "sample_monthly_import_status.csv").is_file()
