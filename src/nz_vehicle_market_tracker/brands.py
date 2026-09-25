"""Brand-to-country reference mapping loaded from a curated CSV."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from .domain import normalise

DEFAULT_BRAND_REFERENCE = Path("data/reference/brand_countries.csv")


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
