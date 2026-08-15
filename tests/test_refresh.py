import hashlib
import json
from pathlib import Path

import pytest

from nz_vehicle_market_tracker.refresh import promote_candidate


def _write_snapshot(
    directory: Path,
    month: str,
    digest: str,
    generated_at: str,
    *,
    records: list[dict[str, object]] | None = None,
) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    dataset = directory / "monthly_summary.json"
    dataset.write_text(
        json.dumps(
            {
                "contract_version": "test",
                "snapshot_month": month,
                "records": records or [],
            }
        ),
        encoding="utf-8",
    )
    checksum = hashlib.sha256(dataset.read_bytes()).hexdigest()
    scope_dataset = directory / "scope_make.json"
    scope_records = [{"make": "TOYOTA", "vehicle_count": 100}]
    scope_dataset.write_text(
        json.dumps(
            {
                "contract_version": "test",
                "snapshot_month": month,
                "records": scope_records,
            }
        ),
        encoding="utf-8",
    )
    scope_checksum = hashlib.sha256(scope_dataset.read_bytes()).hexdigest()
    (directory / "manifest.json").write_text(
        json.dumps(
            {
                "source": {"snapshot_month": month},
                "generated_at_utc": generated_at,
                "files": {
                    "monthly_summary": {
                        "path": "monthly_summary.json",
                        "sha256": checksum if digest == "valid" else digest,
                    },
                    "scope_make": {
                        "path": "scope_make.json",
                        "sha256": scope_checksum,
                    },
                },
            }
        ),
        encoding="utf-8",
    )


def test_promotes_candidate_to_current_and_monthly_archive(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    current = tmp_path / "current"
    archive_root = tmp_path / "archive"
    _write_snapshot(
        candidate,
        "2026-06",
        "valid",
        "new",
        records=[
            {"registration_month": "2026-05", "registration_count": 10},
            {"registration_month": "2026-06", "registration_count": 20},
        ],
    )

    changed, month = promote_candidate(candidate, current, archive_root)

    assert changed is True
    assert month == "2026-06"
    assert (current / "monthly_summary.json").is_file()
    archive = archive_root / month
    archive_manifest = json.loads((archive / "manifest.json").read_text())
    archive_dataset = json.loads((archive / "monthly_summary.json").read_text())
    archive_scope = json.loads((archive / "scope_make.json").read_text())
    assert archive_manifest["archive"]["kind"] == "compact_snapshot"
    assert archive_manifest["archive"]["monthly_dimensions"] == "snapshot_month_only"
    assert set(archive_manifest["archive"]["source_files"]) == {
        "monthly_summary",
        "scope_make",
    }
    assert archive_dataset["records"] == [
        {"registration_month": "2026-06", "registration_count": 20}
    ]
    assert archive_scope["records"] == [{"make": "TOYOTA", "vehicle_count": 100}]


def test_compact_archive_prevents_repeat_publication(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    current = tmp_path / "current"
    archive_root = tmp_path / "archive"
    _write_snapshot(
        candidate,
        "2026-06",
        "valid",
        "new",
        records=[{"registration_month": "2026-06", "registration_count": 20}],
    )

    assert promote_candidate(candidate, current, archive_root)[0] is True
    assert promote_candidate(candidate, current, archive_root)[0] is False


def test_rejects_archive_when_monthly_dataset_has_no_snapshot_rows(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    _write_snapshot(
        candidate,
        "2026-06",
        "valid",
        "new",
        records=[{"registration_month": "2026-05", "registration_count": 10}],
    )

    with pytest.raises(ValueError, match="no rows for archive month"):
        promote_candidate(candidate, tmp_path / "current", tmp_path / "archive")
    assert not (tmp_path / "current").exists()


def test_ignores_generation_time_when_dataset_checksums_are_unchanged(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    current = tmp_path / "current"
    archive = tmp_path / "archive" / "2026-06"
    _write_snapshot(candidate, "2026-06", "valid", "new")
    _write_snapshot(current, "2026-06", "valid", "existing")
    _write_snapshot(archive, "2026-06", "valid", "existing")

    changed, month = promote_candidate(candidate, current, tmp_path / "archive")

    assert changed is False
    assert month == "2026-06"
    assert json.loads((current / "manifest.json").read_text())["generated_at_utc"] == "existing"


def test_refresh_workflow_uses_the_direct_official_zip_url() -> None:
    workflow = Path(".github/workflows/refresh-data.yml").read_text(encoding="utf-8")
    workflow_lines = {line.strip() for line in workflow.splitlines()}

    assert (
        "NZTA_ALL_YEARS_ZIP_URL: ${{ vars.NZTA_ALL_YEARS_ZIP_URL || "
        "'https://wksprdgisopendata.blob.core.windows.net/"
        "motorvehicleregister/Fleet-data-all-vehicle-years.zip' }}"
    ) in workflow_lines
    assert '--url "$NZTA_ALL_YEARS_ZIP_URL"' in workflow
    assert "vars.NZTA_ALL_YEARS_ZIP_URL" in workflow
    assert 'cron: "17 5 * * *"' in workflow
    assert 'curl --fail --silent --show-error --head "$NZTA_ALL_YEARS_ZIP_URL"' in workflow
    assert "data/production/source-release.json" in workflow
    assert (
        "git add data/production/source-release.json data/production/current "
        "data/production/archive"
    ) in workflow
    assert "steps.probe.outputs.changed == 'true'" in workflow
    assert "inputs.force" in workflow
