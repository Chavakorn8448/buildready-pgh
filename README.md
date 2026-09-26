# BuildReady PGH

Development Ease Score (0–100) for City of Pittsburgh parcels. AI for Housing Hackathon, Track 1: Development Feasibility.

> **Decision support only. Not legal, financial, or zoning advice.** Confirm everything with the City of Pittsburgh Department of City Planning / Zoning Board of Adjustment before acting.

## Usage

```bash
npm install
npm run fetch        # download raw data to data/raw (gitignored)
npm run preprocess   # reproject, strip PII, join -> data/processed
npm run score 0175G00210000000
npm run score "5925 Walnut St" -- --reform
npm run reform-impact
npm test
```

## Data sources

See [`data/SOURCES.md`](data/SOURCES.md) for every URL, retrieval date, and license. Summary: City of Pittsburgh ArcGIS (parcels, hazard and overlay layers), WPRDC (zoning districts, property assessments), PASDA (zoning fallback), Pittsburgh Zoning Code Chapter 911 (use table).

## How scoring works

Gates first (G1 outside city → no score; G2 non-residential with no residential potential → no score; G3 housing not permitted in base zoning → cap 40), then five weighted sub-scores (zoning fit 40, environmental 20, funding fit 15, access 15, site & title 10; weights in `lib/config.ts`). Every fact carries `source`, `sourceUrl`, `retrievedAt`, `confidence`, `reviewBy`; unknown data is marked unverified and never counts as a pass. `--reform` also scores the **proposed** Bill 2025-1545 and prints the delta and changed flags.

## Limitations

- Parcel base is ParcelsPublic (the city's ParcelsPGH layer holds only a subset). Zoning use table transcribed from a July-2024 print of §911.02 — not verified against the live code; some districts (Planned Development, Special Purpose, Public Realm) are unverified.

- City of Pittsburgh only.
- No setback, height, building-code, or water/sewer checks. Water/sewer is always flagged "unknown: request PWSA availability letter".
- Reform (Bill 2025-1545) is modeled **as proposed**, not as law.
- Public data used as-is; may be stale or wrong. Every fact carries its source and a `reviewBy`.
- Owner names are dropped at ingest; only owner *type* is kept.

## Status

See [`STATUS.md`](STATUS.md) for the build log.
