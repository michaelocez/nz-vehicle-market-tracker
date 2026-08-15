"""Promote a newly built aggregate snapshot into current and archive storage."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

SNAPSHOT_MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
ARCHIVE_FORMAT_VERSION = "1.0.0"


def load_manifest(directory: Path) -> dict[str, object]:
    path = directory / "manifest.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not read aggregate manifest: {path}") from exc
    if not isinstance(manifest, dict):
        # A decoded JSON document with the wrong shape is malformed input, not an API type error.
        raise ValueError(f"Aggregate manifest must be a JSON object: {path}")  # noqa: TRY004
    return manifest


def snapshot_month(manifest: dict[str, object]) -> str:
    source = manifest.get("source")
    value = source.get("snapshot_month") if isinstance(source, dict) else None
    if not isinstance(value, str) or not SNAPSHOT_MONTH_PATTERN.fullmatch(value):
        raise ValueError("Aggregate manifest has no valid source.snapshot_month")
    return value


def data_signature(manifest: dict[str, object]) -> tuple[str, tuple[tuple[str, str], ...]]:
    files = manifest.get("files")
    if not isinstance(files, dict) or not files:
        raise ValueError("Aggregate manifest has no dataset file checksums")

    checksums: list[tuple[str, str]] = []
    for name, metadata in files.items():
        digest = metadata.get("sha256") if isinstance(metadata, dict) else None
        if not isinstance(name, str) or not isinstance(digest, str) or len(digest) != 64:
            raise ValueError("Aggregate manifest contains an invalid dataset checksum")
        checksums.append((name, digest))
    return snapshot_month(manifest), tuple(sorted(checksums))


def validate_dataset_files(directory: Path, manifest: dict[str, object]) -> None:
    files = manifest.get("files")
    if not isinstance(files, dict):
        # Preserve ValueError as the consistent contract for invalid manifest contents.
        raise ValueError("Aggregate manifest has no dataset files")  # noqa: TRY004
    for metadata in files.values():
        path_value = metadata.get("path") if isinstance(metadata, dict) else None
        digest = metadata.get("sha256") if isinstance(metadata, dict) else None
        if not isinstance(path_value, str) or Path(path_value).name != path_value:
            raise ValueError("Aggregate manifest contains an unsafe dataset path")
        path = directory / path_value
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Aggregate dataset does not match its checksum: {path}")


def _signature_if_present(directory: Path) -> tuple[str, tuple[tuple[str, str], ...]] | None:
    if not (directory / "manifest.json").is_file():
        return None
    try:
        manifest = load_manifest(directory)
        signature = data_signature(manifest)
        validate_dataset_files(directory, manifest)
    except ValueError:
        return None
    return signature


def _sync_json_files(source: Path, destination: Path) -> None:
    source_files = {path.name: path for path in source.glob("*.json") if path.is_file()}
    if "manifest.json" not in source_files:
        raise ValueError(f"Candidate directory has no manifest.json: {source}")

    destination.mkdir(parents=True, exist_ok=True)
    for existing in destination.glob("*.json"):
        if existing.name not in source_files:
            existing.unlink()
    for name, path in source_files.items():
        shutil.copy2(path, destination / name)


def _write_json(path: Path, value: object, *, compact: bool) -> tuple[int, str]:
    options: dict[str, object] = {"ensure_ascii": False}
    if compact:
        options["separators"] = (",", ":")
    else:
        options["indent"] = 2
    payload = json.dumps(value, **options).encode("utf-8")
    path.write_bytes(payload)
    return len(payload), hashlib.sha256(payload).hexdigest()


def _source_checksums(manifest: dict[str, object]) -> dict[str, str]:
    return dict(data_signature(manifest)[1])


def _archive_matches_candidate(
    archive: Path,
    candidate_manifest: dict[str, object],
) -> bool:
    candidate_signature = data_signature(candidate_manifest)
    if _signature_if_present(archive) == candidate_signature:
        # Full archives created before compact archive format 1.0 remain valid
        # baseline checkpoints and do not need a destructive migration.
        return True

    try:
        archive_manifest = load_manifest(archive)
        validate_dataset_files(archive, archive_manifest)
    except ValueError:
        return False

    metadata = archive_manifest.get("archive")
    return (
        isinstance(metadata, dict)
        and metadata.get("format_version") == ARCHIVE_FORMAT_VERSION
        and metadata.get("kind") == "compact_snapshot"
        and metadata.get("source_files") == _source_checksums(candidate_manifest)
        and snapshot_month(archive_manifest) == snapshot_month(candidate_manifest)
    )


def _compact_records(name: str, document: object, month: str) -> dict[str, object]:
    if not isinstance(document, dict) or not isinstance(document.get("records"), list):
        # Invalid decoded JSON is malformed input under this module's ValueError contract.
        raise ValueError(f"Aggregate dataset has no records array: {name}.json")  # noqa: TRY004
    if document.get("snapshot_month") != month:
        raise ValueError(f"Aggregate dataset snapshot does not match archive month: {name}.json")

    records = document["records"]
    if name.startswith("monthly_"):
        compact_records = [
            record
            for record in records
            if isinstance(record, dict) and record.get("registration_month") == month
        ]
        if records and not compact_records:
            raise ValueError(f"Monthly aggregate has no rows for archive month: {name}.json")
    elif name.startswith("scope_"):
        compact_records = records
    else:
        raise ValueError(f"Aggregate dataset has no archive retention rule: {name}.json")

    return {
        "contract_version": document.get("contract_version"),
        "snapshot_month": document.get("snapshot_month"),
        "records": compact_records,
    }


def _write_compact_archive(
    candidate: Path,
    archive: Path,
    candidate_manifest: dict[str, object],
) -> None:
    month = snapshot_month(candidate_manifest)
    temporary = archive.parent / f".{month}.tmp"
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.mkdir(parents=True)

    try:
        archive_manifest = {
            key: value for key, value in candidate_manifest.items() if key != "files"
        }
        archive_manifest["archive"] = {
            "format_version": ARCHIVE_FORMAT_VERSION,
            "kind": "compact_snapshot",
            "monthly_dimensions": "snapshot_month_only",
            "scope_dimensions": "full_snapshot",
            "source_files": _source_checksums(candidate_manifest),
        }
        archive_manifest["files"] = {}

        files = candidate_manifest.get("files")
        if not isinstance(files, dict):
            raise ValueError("Aggregate manifest has no dataset files")  # noqa: TRY004
        for name, metadata in files.items():
            path_value = metadata.get("path") if isinstance(metadata, dict) else None
            if not isinstance(name, str) or not isinstance(path_value, str):
                raise ValueError(  # noqa: TRY004
                    "Aggregate manifest contains invalid dataset metadata"
                )
            document = json.loads((candidate / path_value).read_text(encoding="utf-8"))
            compact_document = _compact_records(name, document, month)
            size, digest = _write_json(
                temporary / path_value,
                compact_document,
                compact=True,
            )
            archive_manifest["files"][name] = {
                "path": path_value,
                "records": len(compact_document["records"]),
                "bytes": size,
                "sha256": digest,
            }

        _write_json(temporary / "manifest.json", archive_manifest, compact=False)
        validate_dataset_files(temporary, archive_manifest)
        _sync_json_files(temporary, archive)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def promote_candidate(candidate: Path, current: Path, archive_root: Path) -> tuple[bool, str]:
    """Publish candidate JSON only when its checked dataset content is new."""

    candidate_manifest = load_manifest(candidate)
    candidate_signature = data_signature(candidate_manifest)
    validate_dataset_files(candidate, candidate_manifest)
    month = candidate_signature[0]
    archive = archive_root / month

    current_matches = _signature_if_present(current) == candidate_signature
    archive_matches = _archive_matches_candidate(archive, candidate_manifest)
    if current_matches and archive_matches:
        return False, month

    if not archive_matches:
        _write_compact_archive(candidate, archive, candidate_manifest)
    if not current_matches:
        _sync_json_files(candidate, current)
    return True, month


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate_dir", type=Path)
    parser.add_argument("--current-dir", type=Path, default=Path("data/production/current"))
    parser.add_argument("--archive-root", type=Path, default=Path("data/production/archive"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        changed, month = promote_candidate(args.candidate_dir, args.current_dir, args.archive_root)
    except (OSError, ValueError) as exc:
        print(f"Aggregate promotion failed: {exc}", file=sys.stderr)
        return 1

    if changed:
        print(f"Published aggregate snapshot {month}")
    else:
        print(f"Aggregate snapshot {month} is already current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
