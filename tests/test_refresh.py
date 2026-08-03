import hashlib
import json
from pathlib import Path

from nz_vehicle_market_tracker.refresh import promote_candidate


def _write_snapshot(directory: Path, month: str, digest: str, generated_at: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    dataset = directory / "monthly_summary.json"
    dataset.write_text(json.dumps({"snapshot_month": month, "records": []}), encoding="utf-8")
    checksum = hashlib.sha256(dataset.read_bytes()).hexdigest()
    (directory / "manifest.json").write_text(
        json.dumps(
            {
                "source": {"snapshot_month": month},
                "generated_at_utc": generated_at,
                "files": {
                    "monthly_summary": {
                        "path": "monthly_summary.json",
                        "sha256": checksum if digest == "valid" else digest,
                    }
                },
            }
        ),
        encoding="utf-8",
    )


def test_promotes_candidate_to_current_and_monthly_archive(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    current = tmp_path / "current"
    archive_root = tmp_path / "archive"
    _write_snapshot(candidate, "2026-06", "valid", "new")

    changed, month = promote_candidate(candidate, current, archive_root)

    assert changed is True
    assert month == "2026-06"
    assert (current / "monthly_summary.json").is_file()
    assert (archive_root / month / "manifest.json").is_file()


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

    assert "wksprdgisopendata.blob.core.windows.net" in workflow
    assert '--url "$NZTA_ALL_YEARS_ZIP_URL"' in workflow
    assert "vars.NZTA_ALL_YEARS_ZIP_URL" in workflow
    assert 'cron: "17 5 * * *"' in workflow
    assert 'curl --fail --silent --show-error --head "$NZTA_ALL_YEARS_ZIP_URL"' in workflow
    assert "data/production/source-release.json" in workflow
    assert "steps.probe.outputs.changed == 'true'" in workflow
    assert "inputs.force" in workflow
