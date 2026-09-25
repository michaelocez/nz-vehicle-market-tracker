"""Shared configuration and constants for the production pipeline."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .domain import registration_month

DATA_CONTRACT_VERSION = "1.3.0"
DEFAULT_START_MONTH = "2007-01"
MAX_CURRENT_FLEET_AGE = 150
DEFAULT_OUTPUT_DIR = Path("data/production/current")
LEADERBOARD_LIMIT = 25
LEADERBOARD_POWERTRAIN_GROUPS = ("combustion", "hybrid", "bev", "phev", "other")
_QUALITY_FIELDS = (
    "source_rows",
    "malformed_rows",
    "non_passenger_rows",
    "passenger_rows",
    "invalid_registration_month_rows",
    "before_start_month_rows",
    "included_rows",
    "unmapped_brand_rows",
    "mapped_brand_rows",
    "missing_vehicle_year_rows",
    "comparable_vehicle_year_rows",
    "legacy_vehicle_year_rows",
    "current_fleet_age_rows",
    "excluded_current_fleet_age_missing_or_invalid_vehicle_year_rows",
    "excluded_current_fleet_age_future_vehicle_year_rows",
    "excluded_current_fleet_age_implausible_vehicle_year_rows",
    "used_import_rows",
    "comparable_import_age_rows",
    "excluded_import_age_legacy_vehicle_year_rows",
    "excluded_import_age_missing_rows",
    "excluded_import_age_negative_rows",
    "excluded_import_age_implausible_rows",
)


@dataclass(frozen=True)
class ProductionConfig:
    start_month: str = DEFAULT_START_MONTH
    comparable_vehicle_year: int = 2007

    def __post_init__(self) -> None:
        if not re.fullmatch(r"\d{4}-\d{2}", self.start_month):
            raise ValueError("start_month must use YYYY-MM")
        if registration_month(*self.start_month.split("-")) != self.start_month:
            raise ValueError("start_month must be a valid YYYY-MM")
