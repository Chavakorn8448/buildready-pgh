# STATUS

Running build log. Phases 0–5 run autonomously.

## Phase 0 — Scaffold
- Next.js 16 (App Router) + TS + Tailwind, Turf 7, zod 4; dev: tsx, vitest.
- `.env*` and `/data/raw/` gitignored.
- Decision: `@types/node` bumped 20 -> 22 (vitest 5 peer requirement).

## Phase 1 — Fetch + SOURCES.md
Built `scripts/fetch.ts` (+ `scripts/lib/http.ts`: 3 attempts w/ backoff). All 15 layers downloaded OK on 2026-09-26 (~550 MB in `data/raw`, gitignored).

| Layer | Records |
|---|---|
| parcels_public (ParcelsPublic) | 142,635 |
| parcels_pgh (ParcelsPGH) | 12,696 |
| city_limits | 2 |
| slope25 / landslide / undermined / fema2014 | 1,714 / 37 / 47 / 160 |
| historic / iz_overlay / parking_reduction / transit_buffer | 21 / 1 / 9 / 3 |
| addresses | 169,896 |
| zoning (WPRDC GeoJSON — first choice worked, PASDA fallback not needed) | 1,069 polygons |
| assessments (Pittsburgh wards MUNICODE 101–132 of 584,999 county rows) | 142,395 |

**Findings that differ from the brief (decisions made on your behalf):**
- **ParcelsPGH is NOT "all city parcels"** — only 12,696 records; it contains neither `0175G00210000000`'s neighborhood nor `5925 Walnut St` (that address is pin `0084P00162000000`, found in ParcelsPublic). **Decision:** parcel base = ParcelsPublic (142,635 ≈ all city parcels, and it has `propertyho`/`propertyad`/`usedesc`/`classdesc`); ParcelsPGH is a supplemental source only. Address lookup runs against the ParcelsPublic house no. + street.
- ParcelsPublic has no `lotarea`, only `calcacreag` (rounded to 0.01 ac) and `Shape__Area`. **Decision:** lot area comes from assessor `LOTAREA` when present, else geometry area (see Phase 2).
- Base zoning polygons are available on the city server (`PGHWebZoning`) as well as WPRDC; WPRDC used per your instruction. The WPRDC dataset mirrors the city layer.
- PII: `propertyow`, owner mailing address fields, and zoning `created_user`/`last_edited_user` are never requested/kept. Raw files contain no `propertyow` (grep-verified).
- License: city services declare none in metadata; WPRDC lists zoning as "License not specified", assessments as CC0. Recorded as-is in SOURCES.md.

## Phase 2 — Preprocess + joins (`npm run preprocess`, `npm run check-pii`)
Output in `data/processed/` (parcels.ndjson + index and slope25 layer are gitignored: 124 MB / 32 MB, regenerate with `npm run preprocess`; everything else is committed).

- **142,365 parcels** (142,635 raw − 270 duplicate PINs; first record kept — likely multi-part parcels; known issue). All inside City_Limits (centroid test). 142,340 have an assessment row (25 don't).
- All geometry WGS84 (server-side `outSR=4326`; coordinate-range assertion in preprocess).
- **Zoning join** (WPRDC polygons, Approved/unlabeled only; 1 "Pending" polygon excluded): 142,283 parcels get a district; 82 get none (→ engine treats zoning as `unknown`); 2,508 parcels are split across districts (>5% in a second district; largest-share district used, others recorded).
- **Cross-check vs ParcelsPublic.zon_new: 99.3% agree overall (141,277 / 142,283); 99.8% for public lots (City/URA/HACP/County: 14,930 compared).** 1,006 mismatches, concentrated in one pattern: polygon `UC-MU` vs zon_new `RM-VH` (685), `OPR-B` (77), `UI` (67), `RM-M` (67) — i.e. Oakland-area Urban Center Mixed Use polygons where the parcel layer carries an older/different code. Full list: `data/processed/zoning-crosscheck.json`. **Decision (conservative):** engine uses the polygon district (as you specified), marks it confidence `low` and adds a "verify with zoning map" flag when the two disagree; gate G3 only passes if housing is by-right under BOTH codes.
- **Lot area:** polygon area (geodesic) of the ParcelsPublic geometry; it matches ParcelsPublic `Shape__Area` within 0.3% (mean). Assessor `LOTAREA` is kept alongside: median |diff| is 5%, p90 24% (assessor values are often legacy deed numbers). **Decision:** lot-size rule uses polygon area; if polygon and assessor areas fall on opposite sides of the district minimum, the rule result is `unknown` (never a pass) with a flag.
- **Owner PII:** `propertyow` and mailing-address fields are never requested; editor-account fields (`created_user`, `last_edited_user`, …) are scrubbed at fetch. `npm run check-pii` scans raw + processed: passed (31 files). Only owner TYPE (City/County/HACP/URA/Private/Other) is stored.
- `neighborhood-values.json`: median assessed land $/sq ft by neighborhood (for "low-value area" in Funding fit; threshold = 33rd percentile of neighborhood medians).
