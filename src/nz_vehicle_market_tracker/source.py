"""Shared streaming access to the approved NZTA analytical columns."""

from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import TextIO

ANALYTICAL_COLUMNS = (
    "VEHICLE_YEAR",
    "FIRST_NZ_REGISTRATION_YEAR",
    "FIRST_NZ_REGISTRATION_MONTH",
    "IMPORT_STATUS",
    "MAKE",
    "MODEL",
    "MOTIVE_POWER",
    "ALTERNATIVE_MOTIVE_POWER",
    "PREVIOUS_COUNTRY",
    "CLASS",
    "VEHICLE_TYPE",
)
SENSITIVE_COLUMNS = {"VIN11", "CHASSIS7", "ENGINE_NUMBER", "POSTCODE"}


@dataclass(frozen=True)
class SourceMetadata:
    zip_path: Path
    member_name: str
    compressed_bytes: int
    uncompressed_bytes: int
    source_columns: list[str]


def open_fleet_csv(
    zip_path: Path,
) -> tuple[SourceMetadata, zipfile.ZipFile, tuple[TextIO, csv.reader]]:
    """Open the single fleet CSV in a ZIP and validate the analytical schema."""

    archive = zipfile.ZipFile(zip_path)
    csv_members = [item for item in archive.infolist() if item.filename.lower().endswith(".csv")]
    if len(csv_members) != 1:
        archive.close()
        raise ValueError(f"Expected exactly one CSV in ZIP, found {len(csv_members)}")

    member = csv_members[0]
    raw = archive.open(member)
    text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
    reader = csv.reader(text)
    try:
        header = next(reader)
    except StopIteration as exc:
        text.close()
        archive.close()
        raise ValueError("CSV is empty") from exc

    missing = sorted(set(ANALYTICAL_COLUMNS) - set(header))
    if missing:
        text.close()
        archive.close()
        raise ValueError(f"Required columns missing: {', '.join(missing)}")

    metadata = SourceMetadata(
        zip_path=zip_path,
        member_name=member.filename,
        compressed_bytes=member.compress_size,
        uncompressed_bytes=member.file_size,
        source_columns=header,
    )
    return metadata, archive, (text, reader)
