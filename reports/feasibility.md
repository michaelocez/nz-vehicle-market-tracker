# NZTA Fleet Data Feasibility Report

Generated from the local source snapshot at `2026-07-22T05:18:30.330876+00:00`.

## Scope and source

- ZIP: `Fleet-data-all-vehicle-years.zip` (read in place; not copied or extracted)
- CSV member: `Fleet-30Jun2026.csv`
- ZIP file size: 323,136,240 bytes
- Compressed CSV member: 323,136,104 bytes
- Uncompressed CSV: 1,442,165,971 bytes
- Rows processed: 5,899,091
- Rows with malformed column width: 0
- Source columns: 39; selected analytical columns: 11
- Sensitive columns present but not selected: CHASSIS7, ENGINE_NUMBER, POSTCODE, VIN11

Source: NZ Transport Agency Waka Kotahi, New Zealand Vehicle Fleet Open Data,
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The processor projects only the approved analytical fields while streaming the
CSV directly from the ZIP. Source year/month fields are interpreted as nullable
integers; all observed categories remain strings.

## Registration coverage

- Earliest valid registration month: 1901-01
- Latest valid registration month: 2026-06
- Rows with a valid registration month: 5,898,900
- Recent window inspected: 2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06
- Current-fleet rows in that window: 144,667
- Recent rows with `VEHICLE_YEAR < 2007`: 2.14%
- Recent rows with `VEHICLE_YEAR < 1990`: 0.78%

Recent vehicle-year bands: `{"1990_to_2006": 1959, "2007_onward": 141578, "before_1990": 1130}`.

## Missingness

| Column | Missing/unknown | Share |
|---|---:|---:|
| MAKE | 0 | 0.00% |
| MODEL | 25,340 | 0.43% |
| PREVIOUS_COUNTRY | 3,865,662 | 65.53% |
| VEHICLE_YEAR | 0 | 0.00% |

`NONE`, `NOT KNOWN`, `UNKNOWN`, blank, `N/A`, and `NULL` are counted as missing
for these feasibility measures. The raw category tables remain unmodified.

For used imports specifically:

| Column | Missing/unknown | Share |
|---|---:|---:|
| MAKE | 0 | 0.00% |
| MODEL | 93 | 0.00% |
| PREVIOUS_COUNTRY | 1,592 | 0.08% |
| VEHICLE_YEAR | 0 | 0.00% |

## Observed source categories

### IMPORT_STATUS

| Value | Rows |
|---|---:|
| NEW | 3,649,507 |
| USED | 1,943,765 |
| RE-REG | 280,788 |
| SCRATCH | 25,031 |

### CLASS

| Value | Rows |
|---|---:|
| MA | 3,064,556 |
| NA | 738,334 |
| TA | 540,410 |
| MC | 424,632 |
| <blank> | 391,598 |
| TB | 185,183 |
| LC | 167,794 |
| NB | 109,390 |
| OTH | 82,928 |
| NC | 74,460 |
| TD | 40,472 |
| LA | 28,752 |
| MD1 | 23,858 |
| ME | 10,664 |
| MB | 9,257 |
| LE | 2,369 |
| TC | 1,516 |
| MD3 | 1,454 |
| MD4 | 845 |
| MD2 | 381 |
| LD | 188 |
| LB | 50 |

### VEHICLE_TYPE

| Value | Rows |
|---|---:|
| PASSENGER CAR/VAN | 3,685,704 |
| GOODS VAN/TRUCK/UTILITY | 927,873 |
| TRAILER/CARAVAN | 880,652 |
| MOTORCYCLE | 190,807 |
| MOTOR CARAVAN | 56,086 |
| TRACTOR | 45,557 |
| BUS | 37,504 |
| MOPED | 29,937 |
| MOBILE MACHINE | 27,548 |
| ATV | 9,252 |
| AGRICULTURAL MACHINE | 3,432 |
| SPECIAL PURPOSE VEHICLE | 3,397 |
| TRAILER NOT DESIGNED FOR H/WAY USE | 1,077 |
| HIGH SPEED AGRICULTURAL VEHICLE | 265 |

### MOTIVE_POWER

| Value | Rows |
|---|---:|
| PETROL | 3,185,874 |
| DIESEL | 1,232,248 |
| <blank> | 881,713 |
| PETROL HYBRID | 414,314 |
| ELECTRIC | 105,234 |
| PLUGIN PETROL HYBRID | 48,791 |
| DIESEL HYBRID | 14,549 |
| PETROL ELECTRIC HYBRID | 11,174 |
| LPG | 3,529 |
| ELECTRIC [PETROL EXTENDED] | 839 |
| OTHER | 469 |
| CNG | 141 |
| DIESEL ELECTRIC HYBRID | 87 |
| ELECTRIC FUEL CELL OTHER | 46 |
| ELECTRIC FUEL CELL HYDROGEN | 44 |
| PLUGIN DIESEL HYBRID | 29 |
| PLUG IN FUEL CELL HYDROGEN HYBRID | 5 |
| ELECTRIC [DIESEL EXTENDED] | 4 |
| PLUG IN FUEL CELL OTHER HYBRID | 1 |

### ALTERNATIVE_MOTIVE_POWER

| Value | Rows |
|---|---:|
| <blank> | 5,892,306 |
| LPG | 3,618 |
| CNG | 2,838 |
| DIESEL | 254 |
| PETROL | 52 |
| PETROL HYBRID | 17 |
| DIESEL ELECTRIC HYBRID | 2 |
| PLUGIN PETROL HYBRID | 2 |
| ELECTRIC | 1 |
| OTHER | 1 |

The full observed `CLASS` x `VEHICLE_TYPE` cross-tab is in
`data/processed/class_vehicle_type_counts.csv`.

## Recommended ordinary-light-passenger filter

Use `VEHICLE_TYPE = PASSENGER CAR/VAN` and `CLASS IN (MA, MB, MC)`.
[NZTA defines these](https://www.nzta.govt.nz/vehicles/vehicle-types/vehicle-classes-and-standards/vehicle-classes)
as passenger car, forward-control passenger vehicle, and off-road passenger
vehicle, respectively, with no more than nine seating positions. This excludes
blank legacy classes and class LE motor tricycles rather than silently treating
them as ordinary passenger cars.

- Matching current-fleet rows: 3,498,444 (59.30%)
- Matching rows in the recent window: 95,534
- Recent matching rows with `VEHICLE_YEAR < 2007`: 0.52%
- Recent matching rows with `VEHICLE_YEAR < 1990`: 0.17%
- Used-import age quality in this cohort: `{"implausible": 33, "missing": 4, "negative": 10, "valid": 1631898}`
- Median comparable used-import age: 9.0 years

The sample monthly import-status and powertrain aggregates apply this filter.

## Approximate import age

`approximate_import_age = FIRST_NZ_REGISTRATION_YEAR - VEHICLE_YEAR`

All-row quality counts: `{"implausible": 90, "missing": 190, "negative": 4787, "valid": 5894024}`.

Used-import quality counts: `{"implausible": 64, "missing": 9, "negative": 24, "valid": 1943668}`.

Negative ages and ages over 100 are flagged rather than silently discarded.
Rows with `VEHICLE_YEAR >= 2007` are initially comparable; older rows remain
available for counts but are legacy/non-comparable for age analysis.

## Feasibility conclusion

The source supports reproducible monthly cohort aggregates for import status,
make/model, previous country, broad powertrain, vehicle year, and approximate
entry age. The aggregate files are cohort reconstructions from a current-fleet
snapshot, so older periods have survivorship bias. Reliable month-over-month
history begins when this project starts retaining monthly aggregate snapshots.

The powertrain grouping is deliberately conservative: PHEV is assigned only
when source text explicitly identifies plug-in capability. Brand country will
require a separate curated, reviewable marque reference and must not be called
manufacturing country.

Recommended display coverage is 2007 onward for comparable cohort and age
trends. Older surviving fleet rows remain useful for current-fleet totals and
clearly labelled legacy context, but should not be blended into the default age
trend. The ongoing archive should retain each new monthly aggregate from the
first production run onward.
