# Production aggregation milestone

Source snapshot: `Fleet-30Jun2026.csv`

## Result

The production pipeline successfully streamed 5,899,091 source rows without
extracting or copying the raw CSV into the repository.

- Passenger rows matching `MA`, `MB`, or `MC`: 3,498,444
- Rows first registered in New Zealand from `2007-01`: 3,102,427
- Rows before the registration boundary: 396,010
- Invalid passenger registration months: 7
- Used-import rows in production scope: 1,472,411
- Comparable used-import age rows: 1,014,841
- Pre-2007 vehicle-year rows retained in counts: 468,093
- Brand-country mapping coverage: 99.95%
- Total dimension payload: 10,640,932 bytes

The largest remaining unmapped values are `LVVTA`, `LVV`, and
`FACTORY BUILT`. They are intentionally not assigned a brand country because
they are not defensible marques.

## Output design

Eight frontend-ready JSON dimensions and a checksummed manifest are stored in
`data/production/current/`. Leading make and model tables are capped at the top
25 per month and import-status view, including an `all` view. This reduced the
model payload from approximately 20.3 MB to 3.1 MB while preserving the intended
leaderboard use case.

For June 2026, the production scope contains 9,957 NZ-new vehicles, 7,563 used
imports, and 6 other/re-registration records. The leading makes in the combined
view were Toyota, Nissan, Mazda, Tesla and Kia. These are first-NZ-registration
cohorts in the current fleet snapshot, not retail sales.

## Verification

- 13 unit/integration tests pass.
- Ruff lint and formatting checks pass.
- Monthly status totals reconcile exactly to all included production rows.
- Mapped plus unmapped brand rows reconcile exactly to all included rows.
- Every output file has a SHA-256 hash and record count in `manifest.json`.

## Next milestone

The next implementation step is the responsive static dashboard consuming this
contract. Scheduled monthly refreshes and aggregate snapshot retention should
be added after the first dashboard validates which dimensions are actually
used.
