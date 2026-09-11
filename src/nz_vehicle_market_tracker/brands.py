"""Automated discovery, cataloging, and maintenance of automotive brand countries."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .domain import normalise

DEFAULT_BRAND_REFERENCE = Path("data/reference/brand_countries.csv")
USER_AGENT = "nz-vehicle-market-tracker/0.1 (+brand reference maintenance)"
WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php"

# Certification authorities, build types, and non-marque categories that must not be assigned a country
NON_BRAND_ENTITIES = frozenset(
    {
        "",
        "BOAT",
        "CONVERTED",
        "CUSTOM",
        "CUSTOMBUILT",
        "FACTORY BUILT",
        "FACTORYBUILT",
        "HOMEBUILT",
        "HOMEMADE",
        "LVV",
        "LVVTA",
        "N/A",
        "NONE",
        "NOT KNOWN",
        "NULL",
        "OTHER",
        "RE-REG",
        "REPLICA",
        "SPECIAL",
        "TRAILER",
        "UNKNOWN",
        "UNSPECIFIED",
    }
)

# Canonical automotive marques, historical brands, and emerging EV entrants
CANONICAL_BRAND_DATABASE: dict[str, tuple[str, str]] = {
    # Current unmapped makes from NZTA fleet records
    "ABARTH": ("Abarth", "Italy"),
    "AC": ("AC", "United Kingdom"),
    "ALMAC": ("Almac", "New Zealand"),
    "ALPINA": ("Alpina", "Germany"),
    "ALPINE": ("Alpine", "France"),
    "ALVIS": ("Alvis", "United Kingdom"),
    "AM GENERAL": ("AM General", "United States"),
    "AMC": ("AMC", "United States"),
    "AMERICAN": ("American Motors", "United States"),
    "ARCFOX": ("Arcfox", "China"),
    "AUBURN": ("Auburn", "United States"),
    "AUTECH": ("Autech", "Japan"),
    "AUTECH ZAGATO": ("Autech", "Japan"),
    "AUTO UNION": ("Auto Union", "Germany"),
    "AVATR": ("Avatr", "China"),
    "BOLWELL": ("Bolwell", "Australia"),
    "BORGWARD": ("Borgward", "Germany"),
    "BRICKLIN": ("Bricklin", "Canada"),
    "BRISTOL": ("Bristol", "United Kingdom"),
    "BUGATTI": ("Bugatti", "France"),
    "CAN-AM": ("Can-Am", "Canada"),
    "CATERHAM": ("Caterham", "United Kingdom"),
    "CHANDLER": ("Chandler", "United States"),
    "CLENET": ("Clenet", "United States"),
    "CONTINENTAL": ("Continental", "United States"),
    "CORD": ("Cord", "United States"),
    "COUNTESS": ("Countess", "New Zealand"),
    "DACIA": ("Dacia", "Romania"),
    "DAVIS": ("Davis", "United States"),
    "DE LOREAN": ("DeLorean", "United States"),
    "DELOREAN": ("DeLorean", "United States"),
    "DE SOTO": ("DeSoto", "United States"),
    "DESOTO": ("DeSoto", "United States"),
    "DE TOMASO": ("De Tomaso", "Italy"),
    "DETOMASO": ("De Tomaso", "Italy"),
    "DELAGE": ("Delage", "France"),
    "DIATTO": ("Diatto", "Italy"),
    "DIXON": ("Dixon", "United States"),
    "DS": ("DS Automobiles", "France"),
    "DS AUTOMOBILES": ("DS Automobiles", "France"),
    "EDSEL": ("Edsel", "United States"),
    "ESSEX": ("Essex", "United States"),
    "EUNOS": ("Eunos", "Japan"),
    "EXCALIBUR": ("Excalibur", "United States"),
    "FANGCHENGBAO": ("Fangchengbao", "China"),
    "FISKER": ("Fisker", "United States"),
    "GINETTA": ("Ginetta", "United Kingdom"),
    "GRAHAM": ("Graham", "United States"),
    "GRAHAM-PAIGE": ("Graham-Paige", "United States"),
    "HILLMAN": ("Hillman", "United Kingdom"),
    "HINO": ("Hino", "Japan"),
    "HOLDEN SPECIAL VEHICLES": ("HSV", "Australia"),
    "HSV": ("HSV", "Australia"),
    "HUDSON": ("Hudson", "United States"),
    "HUMBER": ("Humber", "United Kingdom"),
    "HUPMOBILE": ("Hupmobile", "United States"),
    "IMPERIAL": ("Imperial", "United States"),
    "INTERNATIONAL": ("International", "United States"),
    "INTERNATIONAL HARVESTER": ("International", "United States"),
    "ISO": ("Iso", "Italy"),
    "JENSEN": ("Jensen", "United Kingdom"),
    "JEWETT": ("Jewett", "United States"),
    "JOWETT": ("Jowett", "United Kingdom"),
    "JUNEYAO": ("Juneyao", "China"),
    "KAISER": ("Kaiser", "United States"),
    "KOENIGSEGG": ("Koenigsegg", "Sweden"),
    "KTM": ("KTM", "Austria"),
    "LADA": ("Lada", "Russia"),
    "LAGONDA": ("Lagonda", "United Kingdom"),
    "LEYLAND": ("Leyland", "United Kingdom"),
    "LIVAN": ("Livan", "China"),
    "LUCID": ("Lucid", "United States"),
    "MATRA": ("Matra", "France"),
    "MAYBACH": ("Maybach", "Germany"),
    "MCC": ("Smart", "Germany"),
    "MITSUOKA": ("Mitsuoka", "Japan"),
    "NASH": ("Nash", "United States"),
    "NISSAN INFINITI": ("Infiniti", "Japan"),
    "NSU": ("NSU", "Germany"),
    "OAKLAND": ("Oakland", "United States"),
    "OVERLAND": ("Overland", "United States"),
    "PAGANI": ("Pagani", "Italy"),
    "PANTHER": ("Panther", "United Kingdom"),
    "PEERLESS": ("Peerless", "United States"),
    "PIERCE-ARROW": ("Pierce-Arrow", "United States"),
    "RAMBLER": ("Rambler", "United States"),
    "RELIANT": ("Reliant", "United Kingdom"),
    "REWACO": ("Rewaco", "Germany"),
    "RILEY": ("Riley", "United Kingdom"),
    "RIVIAN": ("Rivian", "United States"),
    "SACHSENRING": ("Sachsenring", "Germany"),
    "SATURN": ("Saturn", "United States"),
    "SAXON": ("Saxon", "United States"),
    "SCION": ("Scion", "Japan"),
    "SHAY": ("Shay", "United States"),
    "SHELBY": ("Shelby", "United States"),
    "SINGER": ("Singer", "United Kingdom"),
    "SKYWELL": ("Skywell", "China") ,
    "SKYWORTH": ("Skyworth", "China"),
    "STANDARD": ("Standard", "United Kingdom"),
    "STUTZ": ("Stutz", "United States"),
    "SWALLOW": ("Swallow", "United Kingdom"),
    "TALBOT": ("Talbot", "United Kingdom"),
    "TOWNSEND": ("Townsend", "New Zealand"),
    "TUSHEK": ("Tushek", "Slovenia"),
    "VALIANT": ("Valiant", "United States"),
    "VANDEN PLAS": ("Vanden Plas", "United Kingdom"),
    "BYD": ("BYD", "China"),
    "LEAPMOTOR": ("Leapmotor", "China"),
    "NIO": ("Nio", "China"),
    "POLESTAR": ("Polestar", "Sweden"),
    "TESLA": ("Tesla", "United States"),
    "VENTURI": ("Venturi", "France"),
    "VINFAST": ("VinFast", "Vietnam"),
    "WARSAW": ("FSO", "Poland"),
    "WARTBURG": ("Wartburg", "Germany"),
    "WESTFIELD": ("Westfield", "United Kingdom"),
    "WIESMANN": ("Wiesmann", "Germany"),
    "WOLSELEY": ("Wolseley", "United Kingdom"),
    "XPENG": ("XPeng", "China"),
    "YANGWANG": ("Yangwang", "China"),
    "ZAGATO": ("Zagato", "Italy"),
    "ZEEKR": ("Zeekr", "China"),
}


@dataclass(frozen=True)
class BrandEntry:
    source_make: str
    brand: str
    brand_country: str


def is_non_brand_entity(make: str | None) -> bool:
    """Check if the given make is a known non-marque build or certification entity."""
    return normalise(make) in NON_BRAND_ENTITIES


def _wikidata_request(parameters: dict[str, str]) -> dict[str, object]:
    request = Request(
        f"{WIKIDATA_API_URL}?{urlencode(parameters)}",
        headers={"User-Agent": USER_AGENT},
    )
    with urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def _entity_names(entity: dict[str, object]) -> set[str]:
    labels = entity.get("labels", {})
    aliases = entity.get("aliases", {})
    values: list[object] = []
    if isinstance(labels, dict):
        values.extend(labels.values())
    if isinstance(aliases, dict):
        for language_aliases in aliases.values():
            if isinstance(language_aliases, list):
                values.extend(language_aliases)
    return {
        normalise(value.get("value"))
        for value in values
        if isinstance(value, dict) and isinstance(value.get("value"), str)
    }


def _claim_entity_ids(entity: dict[str, object], property_id: str) -> set[str]:
    claims = entity.get("claims", {})
    if not isinstance(claims, dict):
        return set()
    values: set[str] = set()
    for claim in claims.get(property_id, []):
        if not isinstance(claim, dict) or claim.get("rank") == "deprecated":
            continue
        mainsnak = claim.get("mainsnak", {})
        if not isinstance(mainsnak, dict):
            continue
        datavalue = mainsnak.get("datavalue", {})
        if not isinstance(datavalue, dict) or not isinstance(datavalue.get("value"), dict):
            continue
        entity_id = datavalue["value"].get("id")
        if isinstance(entity_id, str):
            values.add(entity_id)
    return values


def query_wikidata_brand(make: str) -> BrandEntry | None:
    """Resolve only exact marque matches with a Wikidata country-of-origin claim."""
    cleaned = normalise(make)
    if is_non_brand_entity(cleaned):
        return None
    try:
        search = _wikidata_request(
            {
                "action": "wbsearchentities",
                "search": cleaned,
                "language": "en",
                "format": "json",
                "limit": "10",
            }
        )
        candidates = search.get("search", [])
        if not isinstance(candidates, list):
            return None
        candidate_ids = [
            item.get("id")
            for item in candidates
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        ]
        if not candidate_ids:
            return None
        entities_response = _wikidata_request(
            {
                "action": "wbgetentities",
                "ids": "|".join(candidate_ids),
                "props": "labels|aliases|claims",
                "languages": "en",
                "format": "json",
            }
        )
        entities = entities_response.get("entities", {})
        if not isinstance(entities, dict):
            return None
        exact_matches = [
            entity
            for entity in entities.values()
            if isinstance(entity, dict) and cleaned in _entity_names(entity)
        ]
        if len(exact_matches) != 1:
            return None
        entity = exact_matches[0]
        country_ids = _claim_entity_ids(entity, "P495")
        if len(country_ids) != 1:
            return None
        countries_response = _wikidata_request(
            {
                "action": "wbgetentities",
                "ids": next(iter(country_ids)),
                "props": "labels",
                "languages": "en",
                "format": "json",
            }
        )
        countries = countries_response.get("entities", {})
        if not isinstance(countries, dict):
            return None
        country = countries.get(next(iter(country_ids)), {})
        if not isinstance(country, dict):
            return None
        labels = country.get("labels", {})
        if not isinstance(labels, dict) or not isinstance(labels.get("en"), dict):
            return None
        country_name = labels["en"].get("value")
        entity_labels = entity.get("labels", {})
        if not isinstance(entity_labels, dict) or not isinstance(entity_labels.get("en"), dict):
            return None
        brand_name = entity_labels["en"].get("value")
        if not isinstance(country_name, str) or not isinstance(brand_name, str):
            return None
        return BrandEntry(source_make=cleaned, brand=brand_name, brand_country=country_name)
    except (URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None


def resolve_brand(make: str, *, allow_network: bool = False) -> BrandEntry | None:
    """Resolve an unmapped make using the canonical database with optional network fallback."""
    cleaned = normalise(make)
    if is_non_brand_entity(cleaned):
        return None

    if cleaned in CANONICAL_BRAND_DATABASE:
        brand, country = CANONICAL_BRAND_DATABASE[cleaned]
        return BrandEntry(source_make=cleaned, brand=brand, brand_country=country)

    if allow_network:
        return query_wikidata_brand(cleaned)

    return None


def load_brand_reference(reference_path: Path) -> dict[str, BrandEntry]:
    """Load the current brand reference CSV into a dictionary keyed by normalized source_make."""
    entries: dict[str, BrandEntry] = {}
    if not reference_path.is_file():
        return entries

    with reference_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            source_make = normalise(row.get("source_make"))
            brand = (row.get("brand") or "").strip()
            country = (row.get("brand_country") or "").strip()
            if source_make and brand and country:
                entries[source_make] = BrandEntry(
                    source_make=source_make,
                    brand=brand,
                    brand_country=country,
                )
    return entries


def save_brand_reference(reference_path: Path, entries: dict[str, BrandEntry]) -> None:
    """Save the brand reference CSV sorted deterministically by source_make."""
    reference_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = reference_path.with_suffix(reference_path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["source_make", "brand", "brand_country"])
        writer.writeheader()
        for source_make in sorted(entries):
            entry = entries[source_make]
            writer.writerow(
                {
                    "source_make": entry.source_make,
                    "brand": entry.brand,
                    "brand_country": entry.brand_country,
                }
            )
    temporary.replace(reference_path)


def update_brand_reference(
    reference_path: Path,
    observed_makes: Iterable[str],
    *,
    allow_network: bool = False,
) -> list[BrandEntry]:
    """Inspect observed makes, resolve any missing brands, and update the reference CSV if changed."""
    entries = load_brand_reference(reference_path)
    newly_added: list[BrandEntry] = []

    for raw_make in observed_makes:
        make = normalise(raw_make)
        if not make or make in entries or is_non_brand_entity(make):
            continue

        resolved = resolve_brand(make, allow_network=allow_network)
        if resolved:
            entries[resolved.source_make] = resolved
            newly_added.append(resolved)

    if newly_added:
        save_brand_reference(reference_path, entries)

    return newly_added


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reference-path",
        type=Path,
        default=DEFAULT_BRAND_REFERENCE,
        help="Path to brand_countries.csv",
    )
    parser.add_argument(
        "--manifest-path",
        type=Path,
        help="Path to manifest.json containing unmapped makes",
    )
    parser.add_argument(
        "--allow-network",
        action="store_true",
        help="Allow online fallback lookups for unknown makes",
    )
    parser.add_argument(
        "--sync-canonical",
        action="store_true",
        help="Sync all known marques in CANONICAL_BRAND_DATABASE into the CSV",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    makes_to_check: list[str] = []

    if args.sync_canonical:
        makes_to_check.extend(CANONICAL_BRAND_DATABASE.keys())

    if args.manifest_path and args.manifest_path.is_file():
        try:
            manifest = json.loads(args.manifest_path.read_text(encoding="utf-8"))
            unmapped = manifest.get("brand_coverage", {}).get("unmapped_makes", [])
            makes_to_check.extend(item.get("make") for item in unmapped if isinstance(item, dict))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"Failed to read manifest: {exc}", file=sys.stderr)
            return 1

    added = update_brand_reference(
        args.reference_path,
        makes_to_check,
        allow_network=args.allow_network,
    )
    if added:
        print(f"Added {len(added)} new brand mappings to {args.reference_path}:")
        for entry in added:
            print(f"  + {entry.source_make} -> {entry.brand} ({entry.brand_country})")
    else:
        print(f"Brand reference {args.reference_path} is up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
