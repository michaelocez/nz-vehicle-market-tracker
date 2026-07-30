# NZ Vehicle Market Tracker

[![Deploy GitHub Pages](https://github.com/michaelocez/nz-vehicle-market-tracker/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/michaelocez/nz-vehicle-market-tracker/actions/workflows/deploy-pages.yml)
[![Refresh NZTA aggregates](https://github.com/michaelocez/nz-vehicle-market-tracker/actions/workflows/refresh-data.yml/badge.svg)](https://github.com/michaelocez/nz-vehicle-market-tracker/actions/workflows/refresh-data.yml)

An interactive data product exploring how New Zealand's passenger-vehicle fleet
is changing. It turns NZTA's multi-gigabyte current-fleet release into a small,
versioned set of aggregates and a responsive static dashboard.

**[View the live dashboard](https://michaelocez.github.io/nz-vehicle-market-tracker/)**

## What the dashboard shows

- NZ-new vehicles versus used imports entering the fleet over time.
- The leading makes and models in the latest month and current scoped fleet.
- Combustion, hybrid, battery-electric and plug-in-hybrid composition.
- NZ-new versus used-import arrival channels within each major powertrain.
- Previous registration countries for used imports.
- Approximate import-age patterns for the comparable 2007+ cohort.
- Current fleet totals for a selected make or model.

The dashboard describes vehicles as **first registered in New Zealand** or
**entering the NZ fleet**. Registrations are not treated as retail purchases,
and `PREVIOUS_COUNTRY` means a previous registration/import country rather than
the country where a vehicle was manufactured.

## How it works

```mermaid
flowchart LR
    A["NZTA all-vehicle-years ZIP"] --> B["Streaming Python pipeline"]
    B --> C["Validated aggregate JSON"]
    C --> D["React and TypeScript dashboard"]
    D --> E["GitHub Pages"]
    F["Weekly GitHub Actions check"] --> A
```

The website is entirely static. It requires no backend, user accounts or
database, and the raw vehicle-level dataset is never deployed.

## Technology

- **Data pipeline:** Python 3, streaming CSV/ZIP processing and checksummed JSON.
- **Frontend:** React 19, TypeScript and Vite.
- **Quality:** pytest, Ruff, TypeScript checks and Node test assertions.
- **Automation:** GitHub Actions and GitHub Pages.
- **Data source:** NZTA New Zealand Vehicle Fleet Open Data.

## Automated data refresh

The `Refresh NZTA aggregates` workflow checks every Monday for a changed NZTA
all-vehicle-years release. It downloads the ZIP into temporary runner storage,
runs the Python and frontend tests, rebuilds the aggregates, and commits only
changed aggregate JSON. The raw ZIP and fleet CSV are discarded with the
runner, so no monthly maintenance or personal access token is required.

Each changed snapshot updates `data/production/current/` and is retained under
`data/production/archive/YYYY-MM/`. Dataset checksums prevent unnecessary
commits when NZTA has not changed its release. If NZTA replaces the official
direct download URL, the workflow can use a repository Actions variable named
`NZTA_ALL_YEARS_ZIP_URL`.

The Pages workflow tests and builds `web/dist` whenever `main` changes. A
successful data refresh calls the same deployment workflow, publishing the new
aggregates without manual intervention.

## Run the dashboard locally

The frontend reads only the production aggregates. Its development and build
commands copy the required JSON into an ignored local public-data directory:

```powershell
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. Run the frontend checks and production build with:

```powershell
npm test
```

## Run the data pipeline

Create a Python environment and install the project with its development tools:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
```

Build the production aggregates from a local all-years ZIP without permanently
extracting it:

```powershell
.venv\Scripts\python -m nz_vehicle_market_tracker.production `
  "<path-to>\Fleet-data-all-vehicle-years.zip"
```

The downloader can discover the current all-years release or accept an explicit
ZIP URL. Downloads go to the ignored `data/cache/` directory:

```powershell
.venv\Scripts\python -m nz_vehicle_market_tracker.downloader
```

Run the Python test suite with:

```powershell
.venv\Scripts\python -m pytest
```

The original feasibility investigation can also be reproduced:

```powershell
.venv\Scripts\python -m nz_vehicle_market_tracker.feasibility `
  "<path-to>\Fleet-data-all-vehicle-years.zip"
```

It writes a Markdown report and small evidence outputs under `reports/` and
`data/processed/`. Use `--report`, `--output-dir` or `--recent-months` to
override the defaults.

## Data definitions and scope

- The download boundary is NZTA's complete current-fleet snapshot.
- Production trends begin at first NZ registration month `2007-01`.
- Production rows are restricted to `VEHICLE_TYPE = PASSENGER CAR/VAN` and
  `CLASS IN (MA, MB, MC)`.
- Import-age comparisons use vehicle years from 2007 onward. Older rows remain
  available for overall counts but are legacy/non-comparable for age analysis.
- Brand country is a curated marque-level attribute, not the manufacturing
  country of an individual vehicle.
- Historical cohorts reconstructed from a current-fleet snapshot have
  survivorship bias. Reliable ongoing history begins with archived project
  snapshots.

Motorcycles, goods vehicles, buses, trailers, caravans, ATVs, tractors and
special-purpose machinery are outside the product scope.

The complete schema and inclusion rules are documented in the
[data contract](docs/data-contract.md). The reviewable
[brand-country mapping](data/reference/brand_countries.csv) records the
recognised origin of each marque.

## Privacy and raw data

Raw NZTA files are processed directly from a ZIP outside the repository. The
pipeline selects only analytical columns and never retains identifiers such as
`VIN11`, `CHASSIS7`, `ENGINE_NUMBER` or `POSTCODE`. Raw ZIPs, extracted fleet
CSVs, caches and temporary data directories are ignored by Git.

## Data source and licence

Source: [NZ Transport Agency Waka Kotahi — New Zealand Vehicle Fleet Open Data](https://www.nzta.govt.nz/resources/new-zealand-motor-vehicle-register-statistics/new-zealand-vehicle-fleet-open-data-sets/).

NZTA's source data is licensed under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
