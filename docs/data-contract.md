# Production data contract

Contract version: `1.3.0`

## Inclusion rules

A record enters the production aggregates when all these conditions hold:

1. `VEHICLE_TYPE` is exactly `PASSENGER CAR/VAN`.
2. `CLASS` is `MA`, `MB`, or `MC`.
3. `FIRST_NZ_REGISTRATION_YEAR` and `FIRST_NZ_REGISTRATION_MONTH` form a valid
   month on or after `2007-01`.

This includes ordinary passenger cars, forward-control passenger vehicles and
passenger SUVs/off-road vehicles. It excludes motorcycles, goods vehicles,
buses, trailers, caravans, ATVs, tractors and special-purpose machinery.

The current-fleet age aggregate is the one exception to rule 3. It includes all
ordinary passenger rows in the snapshot with a usable `VEHICLE_YEAR`, including
vehicles first registered in New Zealand before 2007. This is necessary for the
age profile to represent the current registered passenger fleet rather than
only the project's 2007+ market-entry analysis window.

Rows with `VEHICLE_YEAR < 2007` remain in registration, import-status,
make/model, brand-country, previous-country and powertrain counts. They are
excluded only from comparable import-age output. A 2005 car first registered in
New Zealand in 2012 therefore remains a real 2012 fleet entry but does not
contribute to the age comparison.

## Dataset files

Every file contains `contract_version`, `snapshot_month`, and `records`.
`manifest.json` provides record counts, byte sizes and SHA-256 hashes.

The complete current release is stored in `data/production/current/`. Compact
archives retain the rows whose `registration_month` matches that snapshot for
every `monthly_*` dimension and retain every row from each `scope_*` dimension.
Their manifest records archive format `1.0.0`, the retention policy and the
checksums of the complete source datasets from which the archive was derived.
The June and July 2026 archives predate this format and remain complete baseline
snapshots.

| File | Grain |
|---|---|
| `monthly_summary.json` | registration month x import-status group |
| `monthly_powertrain.json` | month x import status x powertrain group |
| `monthly_make.json` | month x import status x leading make/brand/country |
| `monthly_model.json` | month x import status x leading make/model |
| `monthly_make_powertrain.json` | month x powertrain x leading make/brand/country |
| `monthly_model_powertrain.json` | month x powertrain x leading make/model |
| `scope_make.json` | import status x make/brand/country across the full 2007+ scope |
| `scope_model.json` | import status x make/model across the full 2007+ scope |
| `scope_make_powertrain.json` | powertrain x leading make/brand/country across the 2007+ scope |
| `scope_model_powertrain.json` | powertrain x leading make/model across the 2007+ scope |
| `scope_vehicle_age.json` | approximate current age across the full passenger-vehicle snapshot |
| `monthly_brand_country.json` | month x import status x marque-origin country |
| `monthly_previous_country.json` | month x previous country, used imports only |
| `monthly_vehicle_year.json` | month x import status x vehicle year x comparability |
| `monthly_import_age.json` | month x approximate import age, comparable used imports only |

Make and model outputs retain the top 25 entries for every month and status
view. They also contain an `all` status view and a deterministic `rank` field.
The separate `scope_make.json` and `scope_model.json` files retain every make
and model category in the current snapshot for exact explorer totals. Their
count field is `vehicle_count` because these are current-fleet snapshot counts,
not counts for one registration month. Other dimensions retain all aggregate
categories.

Make/model and powertrain scope totals mean vehicles represented in the current
NZTA fleet snapshot that were first registered in New Zealand from January 2007
onward. They must not be described as every vehicle currently in New Zealand.
`scope_vehicle_age.json` is different: as noted above, it covers the full
ordinary passenger-vehicle snapshot when `VEHICLE_YEAR` is usable. Model names
are NZTA source categories and are not consolidated into editorial model
families.

## Group definitions

`import_status_group`:

- `nz_new`: source value `NEW`
- `used_import`: source value `USED`
- `other_or_unknown`: any other source value, including `RE-REG` and `SCRATCH`

`powertrain_group`:

- `bev`
- `phev`
- `hybrid`
- `combustion`
- `range_extended_electric`
- `hydrogen_fuel_cell`
- `other_or_unknown`

Leaderboard filters retain `combustion`, `hybrid`, `bev` and `phev`; the much
smaller `range_extended_ev`, `hydrogen` and `other_or_unknown` groups are
combined as `other` for make/model ranking comparisons.

PHEV is assigned only when the source explicitly identifies plug-in capability.
Hydrogen fuel-cell and range-extended categories remain separate rather than
being forced into BEV or hybrid.

`approximate_import_age` is:

```text
FIRST_NZ_REGISTRATION_YEAR - VEHICLE_YEAR
```

It is emitted only for used imports with `VEHICLE_YEAR >= 2007` and a valid age
between 0 and 100 inclusive.

`approximate_current_age` is:

```text
snapshot year - VEHICLE_YEAR
```

The snapshot year comes from the dated CSV filename inside the NZTA ZIP, so a
July 2026 snapshot uses 2026 regardless of when the website is viewed. Ages from
0 to 150 inclusive are retained. Missing, invalid, future and implausibly old
vehicle years are excluded and counted in the manifest's quality fields.

This is an approximate age in whole years because `VEHICLE_YEAR` has no month.
NZTA also notes that before 2007 this field may mean manufacture year, model
year, or first-registration year; from 2007 it means first registration in New
Zealand or overseas. The chart must therefore not imply exact build dates.

## Brand country

Brand country means the recognised origin of the marque. It is not the vehicle's
manufacturing country and is not derived from `ORIGINAL_COUNTRY`. Exact NZTA
`MAKE` values are mapped through `data/reference/brand_countries.csv`; unmatched
values remain `Unmapped` and are listed in the manifest for review.

## Historical limitation

These aggregates are reconstructed from a snapshot of vehicles that remain in
the current fleet. Earlier registration cohorts therefore have survivorship
bias. Reliable month-to-month history begins when the project starts retaining
aggregate snapshots from successive NZTA releases.
