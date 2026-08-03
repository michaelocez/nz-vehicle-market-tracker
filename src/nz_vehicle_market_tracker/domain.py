"""Small, testable domain transformations used by the feasibility pipeline."""

from __future__ import annotations

from dataclasses import dataclass

MISSING_VALUES = {"", "NONE", "NOT KNOWN", "UNKNOWN", "N/A", "NULL"}
COMBUSTION_TERMS = ("PETROL", "DIESEL", "LPG", "CNG", "GAS", "ETHANOL")
ORDINARY_LIGHT_PASSENGER_CLASSES = frozenset({"MA", "MB", "MC"})


def normalise(value: str | None) -> str:
    """Return a stable uppercase representation of a source category."""

    return " ".join((value or "").strip().upper().split())


def is_missing(value: str | None) -> bool:
    return normalise(value) in MISSING_VALUES


def parse_int(value: str | None) -> int | None:
    text = (value or "").strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def registration_month(year: str | int | None, month: str | int | None) -> str | None:
    """Construct a sortable YYYY-MM value, returning None for invalid parts."""

    parsed_year = parse_int(str(year)) if year is not None else None
    parsed_month = parse_int(str(month)) if month is not None else None
    if parsed_year is None or parsed_month is None:
        return None
    if parsed_year < 1900 or parsed_year > 2100 or not 1 <= parsed_month <= 12:
        return None
    return f"{parsed_year:04d}-{parsed_month:02d}"


def import_status_group(value: str | None) -> str:
    """Map source import categories conservatively without inventing meaning."""

    status = normalise(value)
    if status == "NEW":
        return "nz_new"
    if status == "USED":
        return "used_import"
    return "other_or_unknown"


def is_ordinary_light_passenger(vehicle_class: str | None, vehicle_type: str | None) -> bool:
    """Select passenger cars, forward-control passengers, and off-road passengers."""

    return (
        normalise(vehicle_type) == "PASSENGER CAR/VAN"
        and normalise(vehicle_class) in ORDINARY_LIGHT_PASSENGER_CLASSES
    )


def powertrain_group(motive: str | None, alternative: str | None) -> str:
    """Create broad powertrain groups from observed motive-power text.

    PHEV is assigned only when the source text explicitly says plug-in/PHEV.
    Electric combined with a combustion term is labelled hybrid; no charging
    capability is inferred from the mere presence of two motive powers.
    """

    primary = normalise(motive)
    secondary = normalise(alternative)
    combined = " ".join(part for part in (primary, secondary) if part)

    if "FUEL CELL" in combined or "HYDROGEN" in combined:
        return "hydrogen_fuel_cell"
    if "EXTENDED" in combined and "ELECTRIC" in combined:
        return "range_extended_electric"
    if "PHEV" in combined or "PLUGIN" in combined or "PLUG IN" in combined or "PLUG-IN" in combined:
        return "phev"

    has_electric = "ELECTRIC" in combined
    has_combustion = any(term in combined for term in COMBUSTION_TERMS)
    has_hybrid = "HYBRID" in combined

    if has_electric and not has_combustion and not has_hybrid:
        return "bev"
    if has_hybrid or (has_electric and has_combustion):
        return "hybrid"
    if has_combustion:
        return "combustion"
    return "other_or_unknown"


@dataclass(frozen=True)
class ImportAge:
    value: int | None
    quality: str
    comparable: bool


def calculate_import_age(
    registration_year: str | int | None,
    vehicle_year: str | int | None,
    *,
    comparable_from: int = 2007,
    maximum_plausible_age: int = 100,
) -> ImportAge:
    """Calculate approximate age and attach explicit quality/comparability flags."""

    reg = parse_int(str(registration_year)) if registration_year is not None else None
    vehicle = parse_int(str(vehicle_year)) if vehicle_year is not None else None
    if reg is None or vehicle is None:
        return ImportAge(None, "missing", False)

    age = reg - vehicle
    comparable = vehicle >= comparable_from
    if age < 0:
        return ImportAge(age, "negative", comparable)
    if age > maximum_plausible_age:
        return ImportAge(age, "implausible", comparable)
    return ImportAge(age, "valid", comparable)
