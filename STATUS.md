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

## Phase 3 — Permitted-uses table (`data/rules/permitted-uses.json`, `scripts/build-permitted-uses.ts`)
- **Source problem:** ecode360.com and AmLegal returned Cloudflare 403 (curl and WebFetch); elaws.us timed out. **Workaround (code text only, no memory):** City Council Legistar file 2024-0701 attaches the *entire* §911.02 Use Table as a gridded PDF (printed 7/18/2024; only Community Home is marked as amended). I rendered the page and transcribed the five dwelling rows for all 24 columns by eye, and cross-checked against an Oct-2020 print of §911.02 (agrees, except R1D Single-Unit Attached, which became P/S via Ord. 2024-0059, enacted 4/22/2024). **Caveat: not verified against live code; post-July-2024 amendments are not reflected.**
- **Verified columns (24):** R1D, R1A, R2, R3, RM, NDO, LNC, NDI, UNC, HC, GI, UI, UC-MU, UC-E, R-MU, P, H, EMI, GT, RIV-RM/MU/NS/GI/IMU. GT-A…GT-E map to the single GT column (assumption: the table has one GT column). Density suffixes (R1D-VL…) use the base column.
- **NOT verified (no column in the Use Table — engine treats housing permission as `unknown`, never a pass):** RP, CP, AP, UPR-A, UPR-B, GPRA, GPRB, GPRC, OPR-B, SP-1/4/5/7/8/9/10/11 (and MTOBOR = Mount Oliver Borough, outside city zoning). Their rules live in Ch. 905/908/909.
- Statuses: by_right (P), administrator_exception (A), special_exception (S), conditional_use (C), P/S, not_permitted (blank). Every entry cites the §911.02 row + column (+ §911.04.A.xx standard where the table references one).
- **Decision (G3):** cap at 40 only when NO dwelling type is allowed in any form (HC, GI, RIV-GI) or the district is unverified; districts where housing is possible only by A/S/C exception (UI, UC-E, H) get a flag + lower zoning-fit score + cap at 70 (not "not permitted", but not by right).
- **Verified lot sizes (Bill 2025-1579, Passed Finally 5/6/2025, signed 5/7/2025)** from the bill's struck/underlined RTF: VL 8,000→6,000; L 5,000→3,000; M 3,200→2,400; H 1,800→1,200; **VH 1,200→deleted (none)**; all "minimum lot size per unit" values struck. Your numbers match. Pre-reform VH was 1,200 sq ft (not in your list); I include it in reform-impact's old-minimum table, labeled as taken from the bill text.
- **Bill 2025-1545 status (Legistar API, 2026-09-26): "Held In Council"; public hearing held 9/23/2026; not passed → stays labeled PROPOSED.** ADU text verified in the bill (§912.08 as amended): ≤1,000 sq ft, ≤30 ft, max 2 per zoning lot for residential uses, no owner-occupancy (existing §912.08: owner on-site, 1 ADU, overlay-only). Parking minimums removed (Ch. 914). Bonus program = §902.04 (Affordable Housing Bonus Program).

## Phase 4 — Engine + both rule sets (`lib/`)
Pure, typed, deterministic (no I/O in `lib/score.ts`, `lib/rules/*`, `lib/hazards.ts`; file loading is isolated in `lib/data/load.ts`). Entry points: `scoreParcel(parcel, data, ruleSet)` and `compareRuleSets(parcel, data, current, reform)`; weights and every knob in `lib/config.ts`.

- **Fact shape** = `{id,label,value,source,sourceUrl,retrievedAt,confidence,reviewBy}` (zod schema in `lib/types.ts`); every fact carries the layer URL + retrieval date; flags reference fact ids.
- **Gates:** G1 outside city limits (or Mount Oliver `MTOBOR`) → no score; G2 non-residential land use with no residential potential → no score (existing dwellings/apartments count as residential even when the assessor class is COMMERCIAL, e.g. 5925 Walnut = "APART: 5-19 UNITS"; a commercial building where housing is by-right counts as "potential"; land use unknown → no score, unverified); G3 housing not in base zoning → cap 40 (flag "use variance or rezoning needed", reviewBy Zoning Board of Adjustment); **decision:** exception-only districts cap at 70; unverified districts are treated like "not permitted" (cap 40) since unknown never passes.
- **Sub-scores/weights:** zoning 40 / environmental 20 / funding 15 / access 15 / site 10, all 0–100.
- **Zoning fit** points: lot-min 40, use table 25, historic 12, IZ overlay 8 (= 85, **decision:** 15 points reserved so the proposed reform's bonus rules — ADU +6, no parking minimum +4, Affordable Housing Bonus outside IZ +5 — can raise even a clean parcel; consequence: under current rules max zoning-fit is 85). Unknown → 40% credit (`unknownCredit`) + "unverified" flag; failed lot-min → 20% + flag "variance likely, or combine with adjacent lot" (reviewBy ZBA); if polygon and assessor lot areas fall on opposite sides of the minimum → `unknown`.
- **Environmental:** 100 minus penalties by share of parcel overlapped (slope/landslide: −10 / −25 / −40 for <5% / 5–50% / >50%; undermined −15; SFHA flood −25, floodway −40; layer unavailable −20 + flag). Slope & landslide flags have reviewBy "geotechnical review (Code Ch. 915)". FEMA: only `sfha_tf = T` polygons count. Overlaps under 1% of the parcel are treated as boundary slivers. Every overlap has a **map pin** = a point inside the largest overlap piece (`pointOnFeature` of the Turf intersection).
- **Funding:** vacant & low-value neighborhood = 100 (flag "eligible for infill/blight scoring (PHFA)"); vacant not-low 70; occupied low 60 (+"gap financing likely" note); occupied not-low 50; unknown 30. Low-value = neighborhood median assessed land $/sq ft below the 33rd percentile ($2.68). **The PHFA eligibility wording is your brief's claim; I could not verify PHFA criteria — flagged "confirm against current PHFA criteria".**
- **Access:** ≥50% inside major-transit buffer 100; partial overlap 75; outside 50. **Site & title:** vacant +50; City/URA/HACP +50; County +25.
- **Water/sewer:** always the flag "Unknown: request PWSA availability letter", never scored.
- **Rule sets:** `lib/rules/current.ts` (in effect; lot-min by density suffix from Bill 2025-1579, verified) and `lib/rules/reform-2025-1545.ts` (PROPOSED; status from Legistar: Held In Council, not signed). Same `Rule` interface returning `{ruleId, citation, result: passed|failed|unknown, points, flag?}`.
- **Lookup:** 16-char PIN with/without dashes, or address matched on house no. + street with St/Street, Ave/Avenue, N/North, First/1st normalization; ambiguous matches list candidates and exit 3.
