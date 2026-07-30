# NZ Vehicle Market Tracker

This repository contains the completed data-feasibility work, the production
aggregation pipeline, and a responsive dashboard for a portfolio-quality
analysis of New Zealand's registered vehicle fleet. The product is static: it
does not require a backend, user accounts, or a database.

The analysis uses NZTA's all-vehicle-years fleet release and describes vehicles
as being **first registered in New Zealand** or **entering the NZ fleet**. It
does not interpret registrations as retail purchases. `PREVIOUS_COUNTRY` is a
previous registration/import country, not a manufacturing country.

Source: NZ Transport Agency Waka Kotahi, New Zealand Vehicle Fleet Open Data,
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Privacy and raw data

Raw NZTA files are processed directly from a ZIP outside the repository. The
pipeline selects only analytical columns and never retains identifiers such as
`VIN11`, `CHASSIS7`, `ENGINE_NUMBER`, or `POSTCODE`. Raw ZIPs, extracted fleet
CSVs, caches, and temporary data directories are ignored by Git.

## Run the feasibility analysis

Create an environment and install the development tools:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
```

Run against a local all-years ZIP without extracting it:

```powershell
.venv\Scripts\python -m nz_vehicle_market_tracker.feasibility `
  "<path-to>\Fleet-data-all-vehicle-years.zip"
```

The command writes a Markdown report and small aggregate outputs under
`reports/` and `data/processed/`. Override those locations with `--report` and
`--output-dir`. Use `--recent-months` to change the default six-month recency
window.

For a future refresh, the downloader can discover the current all-years link
from NZTA's fleet-data page or accept an explicit ZIP URL. Downloads go to the
ignored `data/cache/` directory:

```powershell
.venv\Scripts\python -m nz_vehicle_market_tracker.downloader
```

## Build production aggregates

The production build applies the approved scope and writes checksummed JSON
dimensions under `data/production/current/`, including complete make/model
snapshot totals for the dashboard explorer:

```powershell
.venv\Scripts\python -m nz_vehicle_market_tracker.production `
  "<path-to>\Fleet-data-all-vehicle-years.zip"
```

The schema and inclusion rules are documented in
[`docs/data-contract.md`](docs/data-contract.md). Brand country comes from the
reviewable [`data/reference/brand_countries.csv`](data/reference/brand_countries.csv)
lookup and means the recognised origin of the marque, not the manufacturing
country of an individual vehicle.

Run tests with:

```powershell
.venv\Scripts\python -m pytest
```

## Automated data refresh

The `Refresh NZTA aggregates` GitHub Actions workflow checks for a new NZTA
release every Monday and can also be started manually from the repository's
**Actions** tab.
It downloads the current all-vehicle-years ZIP into temporary runner storage,
runs the Python and frontend tests, and commits only changed aggregate JSON.
The raw ZIP and fleet CSV are discarded with the runner and never enter Git.
The workflow uses NZTA's official direct blob URL because the public webpage
rejects GitHub-hosted automated requests. If NZTA changes that URL, set a
repository Actions variable named `NZTA_ALL_YEARS_ZIP_URL` to the replacement.

Each changed NZTA snapshot updates `data/production/current/` and is retained
under `data/production/archive/YYYY-MM/`. Dataset checksums prevent a new commit
when NZTA has not changed the published snapshot. The workflow requires
`contents: write` permission for its repository-scoped `GITHUB_TOKEN`; no
personal token or monthly manual download is required.

## Deployment

The dashboard is published through GitHub Pages at:

https://michaelocez.github.io/nz-vehicle-market-tracker/

The Pages workflow tests and builds `web/dist` whenever `main` changes. The
monthly data-refresh workflow calls the same deployment after processing, so a
new NZTA snapshot is published without manual intervention. The repository may
remain private under an eligible GitHub plan while the Pages website is public.

## Run the dashboard

The frontend lives under `web/`. It reads only the production aggregates, not
the raw NZTA file. Its development and build commands automatically sync the
required JSON into an ignored local public-data directory:

The vehicle rankings can switch between the latest entry month and totals
represented across the current 2007+ scoped fleet snapshot.

```powershell
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. Run the frontend checks and production build with:

```powershell
npm test
```

## Approved analytical boundaries

- The download boundary is the complete current-fleet snapshot.
- Production trends begin at first NZ registration month `2007-01`.
- Import-age comparisons use vehicle years from 2007 onward.
- Older rows remain in overall counts and are flagged as legacy/non-comparable
  for age analysis.
- Production rows are restricted to `VEHICLE_TYPE = PASSENGER CAR/VAN` and
  `CLASS IN (MA, MB, MC)`.
- Historical registration cohorts reconstructed from a current snapshot have
  survivorship bias. Reliable monthly history begins when aggregate snapshots
  are archived by this project.

Motorcycles, goods vehicles, buses, trailers, caravans, ATVs, tractors and
special-purpose machinery are outside the product scope.
