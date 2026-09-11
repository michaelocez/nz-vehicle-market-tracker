import csv
from pathlib import Path

import pytest

from nz_vehicle_market_tracker.brands import (
    CANONICAL_BRAND_DATABASE,
    BrandEntry,
    is_non_brand_entity,
    load_brand_reference,
    query_wikidata_brand,
    resolve_brand,
    save_brand_reference,
    update_brand_reference,
)
from nz_vehicle_market_tracker.production import BrandInfo, BrandReference


def test_is_non_brand_entity() -> None:
    assert is_non_brand_entity("LVVTA") is True
    assert is_non_brand_entity("lvv") is True
    assert is_non_brand_entity("FACTORY BUILT") is True
    assert is_non_brand_entity("HOMEBUILT") is True
    assert is_non_brand_entity("CUSTOMBUILT") is True
    assert is_non_brand_entity("UNKNOWN") is True
    assert is_non_brand_entity("TOYOTA") is False
    assert is_non_brand_entity("ABARTH") is False
    assert is_non_brand_entity("AC") is False


def test_resolve_brand_known_marques() -> None:
    entry = resolve_brand("ABARTH")
    assert entry is not None
    assert entry.brand == "Abarth"
    assert entry.brand_country == "Italy"

    entry = resolve_brand("alpine")
    assert entry is not None
    assert entry.brand == "Alpine"
    assert entry.brand_country == "France"

    entry = resolve_brand("ALMAC")
    assert entry is not None
    assert entry.brand == "Almac"
    assert entry.brand_country == "New Zealand"


def test_resolve_brand_rejects_non_marques() -> None:
    assert resolve_brand("LVVTA") is None
    assert resolve_brand("LVV") is None
    assert resolve_brand("FACTORY BUILT") is None
    assert resolve_brand("UNKNOWN") is None
    assert resolve_brand("HOMEBUILT") is None


def test_update_brand_reference_appends_and_sorts(tmp_path: Path) -> None:
    csv_path = tmp_path / "brand_countries.csv"
    save_brand_reference(
        csv_path,
        {
            "TOYOTA": BrandEntry("TOYOTA", "Toyota", "Japan"),
            "BYD": BrandEntry("BYD", "BYD", "China"),
        },
    )

    added = update_brand_reference(
        csv_path,
        ["AC", "LVVTA", "ALPINE", "TOYOTA", "UNKNOWN"],
    )

    added_makes = {entry.source_make for entry in added}
    assert added_makes == {"AC", "ALPINE"}

    # Verify updated CSV on disk
    loaded = load_brand_reference(csv_path)
    assert set(loaded.keys()) == {"AC", "ALPINE", "BYD", "TOYOTA"}

    with csv_path.open(encoding="utf-8", newline="") as handle:
        reader = list(csv.DictReader(handle))
        saved_makes = [row["source_make"] for row in reader]
        assert saved_makes == ["AC", "ALPINE", "BYD", "TOYOTA"]


def test_brand_reference_auto_update_in_production(tmp_path: Path) -> None:
    csv_path = tmp_path / "brand_countries.csv"
    save_brand_reference(
        csv_path,
        {
            "TOYOTA": BrandEntry("TOYOTA", "Toyota", "Japan"),
        },
    )

    reference = BrandReference.load(csv_path, auto_update=True)
    assert reference.lookup("TOYOTA") == BrandInfo("Toyota", "Japan")
    assert reference.lookup("LVVTA") is None
    assert "LVVTA" not in reference.newly_resolved

    abarth_info = reference.lookup("ABARTH")
    assert abarth_info == BrandInfo("Abarth", "Italy")
    assert "ABARTH" in reference.newly_resolved

    reference.persist_changes()

    # Re-reading should now have ABARTH
    reloaded = load_brand_reference(csv_path)
    assert "ABARTH" in reloaded
    assert reloaded["ABARTH"].brand == "Abarth"
    assert reloaded["ABARTH"].brand_country == "Italy"


def test_canonical_database_coverage() -> None:
    assert len(CANONICAL_BRAND_DATABASE) > 80
    assert "ABARTH" in CANONICAL_BRAND_DATABASE
    assert "ZEEKR" in CANONICAL_BRAND_DATABASE
    assert "ARCFOX" in CANONICAL_BRAND_DATABASE


def test_wikidata_lookup_requires_an_exact_name_and_country_of_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    responses = iter(
        [
            {"search": [{"id": "Q1"}]},
            {
                "entities": {
                    "Q1": {
                        "labels": {"en": {"value": "Exact Motors"}},
                        "aliases": {"en": [{"value": "Exact"}]},
                        "claims": {
                            "P495": [
                                {
                                    "rank": "normal",
                                    "mainsnak": {"datavalue": {"value": {"id": "Q2"}}},
                                }
                            ]
                        },
                    }
                }
            },
            {"entities": {"Q2": {"labels": {"en": {"value": "New Zealand"}}}}},
        ]
    )
    monkeypatch.setattr("nz_vehicle_market_tracker.brands._wikidata_request", lambda _: next(responses))

    assert query_wikidata_brand("exact") == BrandEntry("EXACT", "Exact Motors", "New Zealand")


def test_wikidata_lookup_rejects_a_fuzzy_match(monkeypatch: pytest.MonkeyPatch) -> None:
    responses = iter(
        [
            {"search": [{"id": "Q1"}]},
            {
                "entities": {
                    "Q1": {
                        "labels": {"en": {"value": "Different Motors"}},
                        "aliases": {},
                        "claims": {"P495": []},
                    }
                }
            },
        ]
    )
    monkeypatch.setattr("nz_vehicle_market_tracker.brands._wikidata_request", lambda _: next(responses))

    assert query_wikidata_brand("exact") is None


def test_brand_reference_caches_unresolved_lookups(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    csv_path = tmp_path / "brand_countries.csv"
    save_brand_reference(csv_path, {})
    calls = 0

    def unresolved(make: str, *, allow_network: bool) -> BrandEntry | None:
        nonlocal calls
        calls += 1
        assert make == "UNKNOWN MAKE"
        assert allow_network is True
        return None

    monkeypatch.setattr("nz_vehicle_market_tracker.brands.resolve_brand", unresolved)
    reference = BrandReference.load(csv_path, auto_update=True, allow_network=True)

    assert reference.lookup("unknown make") is None
    assert reference.lookup("UNKNOWN MAKE") is None
    assert calls == 1
