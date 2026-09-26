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
