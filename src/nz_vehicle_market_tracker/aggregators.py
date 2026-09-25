"""Streaming accumulators for passenger-vehicle fleet aggregation."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from .brands import BrandReference
from .config import (
    _QUALITY_FIELDS,
    LEADERBOARD_POWERTRAIN_GROUPS,
    MAX_CURRENT_FLEET_AGE,
    ProductionConfig,
)
from .domain import (
    calculate_import_age,
    import_status_group,
    is_missing,
    is_ordinary_light_passenger,
    normalise,
    parse_int,
    powertrain_group,
    registration_month,
)
from .source import ANALYTICAL_COLUMNS, SourceMetadata


@dataclass
class Accumulators:
    """All Counter containers used during a single streaming pass over the fleet CSV."""

    quality: Counter[str]
    monthly_summary: Counter[tuple[str, str]]
    monthly_powertrain: Counter[tuple[str, str, str]]
    monthly_make: Counter[tuple[str, str, str, str, str]]
    monthly_model: Counter[tuple[str, str, str, str]]
    monthly_make_powertrain: Counter[tuple[str, str, str, str, str]]
    monthly_model_powertrain: Counter[tuple[str, str, str, str]]
    scope_make: Counter[tuple[str, str, str, str]]
    scope_model: Counter[tuple[str, str, str]]
    scope_make_powertrain: Counter[tuple[str, str, str, str]]
    scope_model_powertrain: Counter[tuple[str, str, str]]
    scope_vehicle_age: Counter[tuple[int]]
    monthly_brand_country: Counter[tuple[str, str, str]]
    monthly_previous_country: Counter[tuple[str, str]]
    monthly_vehicle_year: Counter[tuple[str, str, int, bool]]
    monthly_import_age: Counter[tuple[str, int]]
    unmapped_make: Counter[tuple[str]]

    @classmethod
    def fresh(cls) -> Accumulators:
        quality: Counter[str] = Counter()
        for field in _QUALITY_FIELDS:
            quality[field] = 0
        return cls(
            quality=quality,
            monthly_summary=Counter(),
            monthly_powertrain=Counter(),
            monthly_make=Counter(),
            monthly_model=Counter(),
            monthly_make_powertrain=Counter(),
            monthly_model_powertrain=Counter(),
            scope_make=Counter(),
            scope_model=Counter(),
            scope_make_powertrain=Counter(),
            scope_model_powertrain=Counter(),
            scope_vehicle_age=Counter(),
            monthly_brand_country=Counter(),
            monthly_previous_country=Counter(),
            monthly_vehicle_year=Counter(),
            monthly_import_age=Counter(),
            unmapped_make=Counter(),
        )


def leaderboard_powertrain_group(motive: str) -> str:
    """Collapse very small motive groups into one stable leaderboard option."""

    return motive if motive in LEADERBOARD_POWERTRAIN_GROUPS[:-1] else "other"


def _process_row(
    acc: Accumulators,
    row: list[str],
    indexes: dict[str, int],
    metadata: SourceMetadata,
    brand_reference: BrandReference,
    config: ProductionConfig,
    snapshot_year: int,
) -> None:
    """Accumulate counts for a single source row into the streaming accumulators."""

    acc.quality["source_rows"] += 1
    if len(row) != len(metadata.source_columns):
        acc.quality["malformed_rows"] += 1
        return

    value = {name: row[indexes[name]].strip() for name in ANALYTICAL_COLUMNS}
    if not is_ordinary_light_passenger(value["CLASS"], value["VEHICLE_TYPE"]):
        acc.quality["non_passenger_rows"] += 1
        return
    acc.quality["passenger_rows"] += 1

    _accumulate_current_fleet_age(acc, value, snapshot_year)
    _accumulate_included_row(acc, value, brand_reference, config)


def _accumulate_current_fleet_age(
    acc: Accumulators, value: dict[str, str], snapshot_year: int
) -> None:
    """Contribute to the current-fleet age distribution, regardless of registration month."""

    current_vehicle_year = parse_int(value["VEHICLE_YEAR"])
    if current_vehicle_year is None:
        acc.quality["excluded_current_fleet_age_missing_or_invalid_vehicle_year_rows"] += 1
        return
    current_age = snapshot_year - current_vehicle_year
    if current_age < 0:
        acc.quality["excluded_current_fleet_age_future_vehicle_year_rows"] += 1
    elif current_age > MAX_CURRENT_FLEET_AGE:
        acc.quality["excluded_current_fleet_age_implausible_vehicle_year_rows"] += 1
    else:
        acc.scope_vehicle_age[(current_age,)] += 1
        acc.quality["current_fleet_age_rows"] += 1


def _accumulate_included_row(
    acc: Accumulators,
    value: dict[str, str],
    brand_reference: BrandReference,
    config: ProductionConfig,
) -> None:
    """Accumulate all monthly and scoped counters for a row within the registration horizon."""

    month = registration_month(
        value["FIRST_NZ_REGISTRATION_YEAR"],
        value["FIRST_NZ_REGISTRATION_MONTH"],
    )
    if month is None:
        acc.quality["invalid_registration_month_rows"] += 1
        return
    if month < config.start_month:
        acc.quality["before_start_month_rows"] += 1
        return

    acc.quality["included_rows"] += 1
    status = import_status_group(value["IMPORT_STATUS"])
    motive = powertrain_group(value["MOTIVE_POWER"], value["ALTERNATIVE_MOTIVE_POWER"])
    leaderboard_motive = leaderboard_powertrain_group(motive)
    make = normalise(value["MAKE"]) or "UNKNOWN"
    model = normalise(value["MODEL"]) or "UNKNOWN"
    brand_info = brand_reference.lookup(make)
    if brand_info is None:
        brand = make
        brand_country = "Unmapped"
        acc.quality["unmapped_brand_rows"] += 1
        acc.unmapped_make[(make,)] += 1
    else:
        brand = brand_info.brand
        brand_country = brand_info.country
        acc.quality["mapped_brand_rows"] += 1

    _accumulate_monthly_scopes(acc, month, status, motive, leaderboard_motive, make, model, brand, brand_country)

    _accumulate_used_import_scopes(acc, value, month, status, config)

    vehicle_year = parse_int(value["VEHICLE_YEAR"])
    if vehicle_year is None:
        acc.quality["missing_vehicle_year_rows"] += 1
    else:
        comparable = vehicle_year >= config.comparable_vehicle_year
        acc.monthly_vehicle_year[(month, status, vehicle_year, comparable)] += 1
        if comparable:
            acc.quality["comparable_vehicle_year_rows"] += 1
        else:
            acc.quality["legacy_vehicle_year_rows"] += 1


def _accumulate_monthly_scopes(
    acc: Accumulators,
    month: str,
    status: str,
    motive: str,
    leaderboard_motive: str,
    make: str,
    model: str,
    brand: str,
    brand_country: str,
) -> None:
    """Populate every monthly_* and scope_* dimension for one included row."""

    acc.monthly_summary[(month, status)] += 1
    acc.monthly_powertrain[(month, status, motive)] += 1
    acc.monthly_make[(month, status, make, brand, brand_country)] += 1
    acc.monthly_make[(month, "all", make, brand, brand_country)] += 1
    acc.monthly_model[(month, status, make, model)] += 1
    acc.monthly_model[(month, "all", make, model)] += 1
    acc.monthly_make_powertrain[(month, leaderboard_motive, make, brand, brand_country)] += 1
    acc.monthly_model_powertrain[(month, leaderboard_motive, make, model)] += 1
    acc.scope_make[(status, make, brand, brand_country)] += 1
    acc.scope_make[("all", make, brand, brand_country)] += 1
    acc.scope_model[(status, make, model)] += 1
    acc.scope_model[("all", make, model)] += 1
    acc.scope_make_powertrain[(leaderboard_motive, make, brand, brand_country)] += 1
    acc.scope_model_powertrain[(leaderboard_motive, make, model)] += 1
    acc.monthly_brand_country[(month, status, brand_country)] += 1


def _accumulate_used_import_scopes(
    acc: Accumulators,
    value: dict[str, str],
    month: str,
    status: str,
    config: ProductionConfig,
) -> None:
    """Populate previous-country and import-age counters for used-import rows."""

    if status != "used_import":
        return

    acc.quality["used_import_rows"] += 1
    previous_country = (
        "UNKNOWN" if is_missing(value["PREVIOUS_COUNTRY"]) else normalise(value["PREVIOUS_COUNTRY"])
    )
    acc.monthly_previous_country[(month, previous_country)] += 1

    age = calculate_import_age(
        value["FIRST_NZ_REGISTRATION_YEAR"],
        value["VEHICLE_YEAR"],
        comparable_from=config.comparable_vehicle_year,
    )
    if age.quality == "valid" and age.comparable and age.value is not None:
        acc.monthly_import_age[(month, age.value)] += 1
        acc.quality["comparable_import_age_rows"] += 1
    elif age.quality == "valid":
        acc.quality["excluded_import_age_legacy_vehicle_year_rows"] += 1
    else:
        acc.quality[f"excluded_import_age_{age.quality}_rows"] += 1


def reconcile(acc: Accumulators) -> int:
    """Assert internal consistency of the accumulated counters and return included_rows."""

    included = acc.quality["included_rows"]
    if sum(acc.monthly_summary.values()) != included:
        raise RuntimeError("Monthly summary does not reconcile to included rows")
    if acc.quality["mapped_brand_rows"] + acc.quality["unmapped_brand_rows"] != included:
        raise RuntimeError("Brand coverage does not reconcile to included rows")
    if sum(count for values, count in acc.scope_make.items() if values[0] == "all") != included:
        raise RuntimeError("Scope make totals do not reconcile to included rows")
    if sum(count for values, count in acc.scope_make.items() if values[0] != "all") != included:
        raise RuntimeError("Scope make status totals do not reconcile to included rows")
    if sum(count for values, count in acc.scope_model.items() if values[0] == "all") != included:
        raise RuntimeError("Scope model totals do not reconcile to included rows")
    if sum(count for values, count in acc.scope_model.items() if values[0] != "all") != included:
        raise RuntimeError("Scope model status totals do not reconcile to included rows")
    current_age_excluded = sum(
        count for name, count in acc.quality.items() if name.startswith("excluded_current_fleet_age_")
    )
    if acc.quality["current_fleet_age_rows"] + current_age_excluded != acc.quality["passenger_rows"]:
        raise RuntimeError("Current-fleet age totals do not reconcile to passenger rows")
    return included
