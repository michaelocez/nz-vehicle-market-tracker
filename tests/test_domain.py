from nz_vehicle_market_tracker.domain import (
    calculate_import_age,
    import_status_group,
    is_ordinary_light_passenger,
    powertrain_group,
    registration_month,
)


def test_registration_month_constructs_sortable_value() -> None:
    assert registration_month("2026", "2") == "2026-02"


def test_registration_month_rejects_invalid_parts() -> None:
    assert registration_month("2026", "13") is None
    assert registration_month("", "1") is None


def test_import_status_group_is_conservative() -> None:
    assert import_status_group("NEW") == "nz_new"
    assert import_status_group(" used ") == "used_import"
    assert import_status_group("UNKNOWN") == "other_or_unknown"


def test_ordinary_light_passenger_filter_uses_observed_codes() -> None:
    assert is_ordinary_light_passenger("MA", "PASSENGER CAR/VAN") is True
    assert is_ordinary_light_passenger("MC", "PASSENGER CAR/VAN") is True
    assert is_ordinary_light_passenger("LE", "PASSENGER CAR/VAN") is False
    assert is_ordinary_light_passenger("MA", "MOTORCYCLE") is False


def test_powertrain_grouping() -> None:
    assert powertrain_group("ELECTRIC", "") == "bev"
    assert powertrain_group("PETROL", "ELECTRIC") == "hybrid"
    assert powertrain_group("PHEV", "ELECTRIC") == "phev"
    assert powertrain_group("PLUGIN PETROL HYBRID", "") == "phev"
    assert powertrain_group("DIESEL", "") == "combustion"
    assert powertrain_group("ELECTRIC FUEL CELL HYDROGEN", "") == "hydrogen_fuel_cell"
    assert powertrain_group("ELECTRIC [PETROL EXTENDED]", "") == "range_extended_electric"
    assert powertrain_group("STEAM", "") == "other_or_unknown"


def test_import_age_calculation_and_comparability() -> None:
    result = calculate_import_age(2026, 2018)
    assert result.value == 8
    assert result.quality == "valid"
    assert result.comparable is True

    legacy = calculate_import_age(2026, 2006)
    assert legacy.value == 20
    assert legacy.quality == "valid"
    assert legacy.comparable is False


def test_import_age_quality_flags() -> None:
    assert calculate_import_age(2020, None).quality == "missing"
    assert calculate_import_age(2020, 2021).quality == "negative"
    assert calculate_import_age(2020, 1900).quality == "implausible"
