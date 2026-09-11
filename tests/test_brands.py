import csv
from pathlib import Path

from nz_vehicle_market_tracker.brands import (
    CANONICAL_BRAND_DATABASE,
    BrandEntry,
    is_non_brand_entity,
    load_brand_reference,
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
