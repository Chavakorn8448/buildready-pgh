# STATUS

> **NEEDS FROM YOU (nothing blocks the demo, but these improve it):**
> 1. **`ANTHROPIC_API_KEY`** was not available in this environment. Phases 8 and 12 are fully implemented and unit-tested, but **no Claude call has ever been made**: `data/ai-cache/` is empty (flag cards show the engine's own text) and the cached Ask answers in `data/ask-cache.json` were produced by the **engine-only router (not an LLM)** and are labeled that way in the UI. To enable: copy `env.example` to `.env.local`, add the key, then `npm run ai-explain -- --limit=50 && npm run ask-cache`, commit `data/ai-cache` and `data/ask-cache.json`, and set the key in Vercel.
> 2. **Deploy: DONE** at https://buildready-pgh.vercel.app (Vercel CLI, project `traffys-projects-a8367e49/buildready-pgh`; `.vercelignore` keeps raw data out). All routes and APIs verified 200 on the live URL. GitHub repo published (public): https://github.com/Chavakorn8448/buildready-pgh. Still to do: paste the video URL into `SUBMISSION.md`; add `ANTHROPIC_API_KEY` in Vercel project settings if you enable the AI features.
> 3. **Verify the zoning use table against the live code** (see Known issues, item 1).

Running build log. Phases 0-5 were built earlier (below); Phases 6-13 follow.


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

## Phase 5 — CLI, golden tests, reform-impact
- `npm run score <parcelId|address> [-- --reform] [--json]`; `npm test` (22 tests; golden tests skip if data/processed is absent); `npm run reform-impact`; `npm run check-pii`.
- Bug found by a test and fixed: a 16-character address like "5925 WALNUT STREET" was parsed as a PIN (spaces stripped → 16 alphanumerics). PIN detection now requires the block/lot pattern.

### Golden parcels (real data, chosen by scanning all city parcels; hand-check against the official zoning map)
| # | Parcel ID | Address | Zoning (polygon = parcel layer) | Why chosen |
|---|---|---|---|---|
| 1 | 0174N00262000000 | 0 TIOGA ST (Homewood South) | R1A-VH | Vacant, City-owned, both zoning sources agree, inside the transit buffer; top-scoring group of city vacant lots (94; reform 100) |
| 2 | 0013E00051000000 | 1817 SAINT PATRICK ST (South Side Slopes) | H (Hillside) | Slope 25%+ 100%, landslide-prone 100%, undermined 99% of parcel; dwellings only by administrator exception in H → G3 cap 70; score 34 |
| 3 | 0173N00352000000 | 7032 UPLAND ST (Homewood North) | R2-L | 1,774 sq ft (polygon) / 1,860 (assessor), both below the 3,000 sq ft minimum → flag 'variance likely, or combine with adjacent lot'; score 58 |
| 4 | 0135M00041000000 | 0 BALDWIN RD (Hays) | R2-L | Vacant, 100% inside a FEMA 2014 special flood hazard area; score 77 |
| 5 | 0006K00358000000 | 423 EDITH ST (Duquesne Heights) | R1A-H | --reform: 61 → 67 (+6): proposed ADU/parking/bonus rules change 2 flags and add 1; also 28% slope + undermined |

Notes: #2 sits in the Hillside (H) district, where the transcribed table allows single-unit detached only by Administrator Exception — worth checking on the official map. #5's +6 is the full reform bonus; almost every by-right parcel gains +6 or +4 under my scoring model, so #5 was picked for a mid-range parcel with hazards.

### Reform Impact counts (`npm run reform-impact`, data/processed/reform-impact.json)
```
REFORM IMPACT (City of Pittsburgh parcels)

A. Residential parcels that failed the OLD minimum lot size but pass the CURRENT one (Bill 2025-1579, in effect):
     21,005 parcels  (of 105,441 residential-district parcels with a lot minimum)
     - where assessor lot area agrees: 15,505
     - vacant 3,612 / improved 17,393
     - by density: VL 305, L 9,062, M 4,521, H 3,370, VH 3,747
     (old minimums used: VL 8,000, L 5,000, M 3,200, H 1,800; VH 1,200 from the bill's struck text)

B. Residential parcels gaining by-right ADU potential under PROPOSED Bill 2025-1545 (≤2 ADUs, ≤1,000 sq ft, ≤30 ft, no owner-occupancy):
     118,800 parcels  (105,441 in R1D/R1A/R2/R3/RM, 13,359 in other districts allowing housing by right)
     - existing dwellings 94,918 (excluding condo/mobile-home/HUD/etc.: 89,385), vacant lots 23,882
     - upper bound: assumes no by-right ADU today. Residential parcels in unverified zoning districts (not counted): 3,199
```
Caveats: A excludes parcels whose two zoning sources disagree; lot area = polygon area (15,505 of the 21,005 also hold by assessor area). B is an upper bound (assumes no by-right ADU today; the ADU overlay is not in public data) and counts every parcel with a dwelling use or vacant land where the verified use table allows housing by right; 3,199 residential-use parcels in unverified districts are excluded.

### Real CLI output

#### `npm run score 0175G00210000000`
```
0 ROSEDALE ST  [0175G00210000000]  Homewood South
Rule set: Current code (in effect) — IN_EFFECT

DEVELOPMENT EASE SCORE: 87 / 100  (uncapped 86.5)

GATES
  G1 ✔ ok  Inside City of Pittsburgh: Parcel is inside City limits.
  G2 ✔ ok  Residential potential: Residential use or potential present.
  G3 ✔ ok  Housing permitted in base zoning: Housing is permitted by right in the base zoning district.

SUB-SCORES (0-100, weight → points contributed)
  zoning          85  █████████████████···  w40 → 34
      · base rules 85/85
      · ZONING-LOT-MIN: passed (40/40) — Pittsburgh Zoning Code §903.03 (minimum lot size by density subdistrict), as amended by Bill 2025-1579 (Passed Finally 5/6/2025, signed by Mayor 5/7/2025)
      · ZONING-USE: passed (25/25) — Pittsburgh Zoning Code §911.02 Use Table (Single-/Two-/Three-/Multi-Unit Residential rows)
      · ZONING-HISTORIC: passed (12/12) — Pittsburgh Zoning Code Ch. 906 Historic Preservation / City Planning CHD Historic Districts layer
      · ZONING-IZ-OVERLAY: passed (8/8) — Pittsburgh Zoning Code §907.04.A IZ-O Inclusionary Housing Overlay District
  environmental  100  ████████████████████  w20 → 20
      · Slope 25%+: none
      · Landslide-prone area: none
      · Undermined area: none
      · FEMA special flood hazard area: none
  funding        100  ████████████████████  w15 → 15
      · neighborhood median assessed land value $0.93/sq ft vs low-value cutoff $2.68/sq ft -> low-value area
  access          50  ██████████··········  w15 → 7.5
      · outside 1,500 ft major transit buffer (partial points)
  site           100  ████████████████████  w10 → 10
      · vacant (+50)
      · City-owned: easier acquisition (+50)

FLAGS
  ℹ  Unknown: request PWSA availability letter. Water/sewer capacity is never scored.
      review by: PWSA   facts: utilities.water_sewer
  ℹ  Off-street parking minimums may apply under Ch. 914; requirement by use/district is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ℹ  ADUs: current code limits them to an ADU overlay district, 1 per lot, with owner-occupancy; overlay coverage is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ℹ  Low-value area: gap financing likely needed (note only, not a penalty).
      review by: PHFA / lender underwriting   facts: hood.median_land_psf
  ℹ  Vacant infill lot in a low-value area: eligible for infill/blight scoring (PHFA) — confirm against current PHFA criteria.
      review by: PHFA application scoring criteria   facts: landuse.vacant, hood.median_land_psf
  ℹ  City-owned parcel: acquisition through a public disposition process may be easier (not guaranteed).
      review by: City property-disposition process   facts: owner.type

FACTS (source per fact)
  [high] Parcel ID (PIN): 0175G00210000000
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26
  [high] Address: 0 ROSEDALE ST
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26
  [high] Inside City of Pittsburgh limits: true
      City of Pittsburgh City Limits (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/City_Limits/FeatureServer/0 · retrieved 2026-09-26
  [high] Lot area (sq ft, map polygon): 4168.2
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26 · review by Licensed survey
  [medium] Lot area (sq ft, county assessor): 3300
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26 · review by Licensed survey
  [high] Base zoning district (map polygon join): RM-M
      WPRDC zoning GeoJSON · https://data.wprdc.org/dataset/zoning · retrieved 2026-09-26 · review by Zoning Administrator
  [medium] Zoning per city parcel layer (zon_new): RM-M
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26
  [medium] Housing under base zoning (§911.02): by_right
      Pittsburgh Zoning Code §911.02 Use Table, as printed in City Council File 2024-0701, attachment "Use Table" (printed 7/18/2024) · https://pittsburgh.legistar1.com/pittsburgh/attachments/1b80ecc1-c98f-4d48-8066-41fbea64c8b0.pdf · retrieved 2026-09-26 · review by Zoning Administrator
  [medium] Assessor use description: VACANT LAND
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [medium] Assessor class: RESIDENTIAL
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [medium] Vacant per city parcel layer: true
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26
  [medium] Owner type (no owner names stored): City
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26
  [medium] Assessed land value ($): 700
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [medium] Assessed total value ($): 700
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [medium] Last sale 2012-11-28 (CITY TREASURER): 14732
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [medium] Neighborhood median assessed land $/sq ft (Homewood South; low-value cutoff 2.68): 0.93
      derived from WPRDC property-assessments (data/processed/neighborhood-values.json) · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [high] Slope 25%+ overlap: no overlap
      City of Pittsburgh PGHWebSlope25 (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebSlope25/FeatureServer/0 · retrieved 2026-09-26
  [high] Landslide-prone overlap: no overlap
      City of Pittsburgh PGHWebLandslideProne (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebLandslideProne/FeatureServer/0 · retrieved 2026-09-26
  [high] Undermined area overlap: no overlap
      City of Pittsburgh PGHWebUndermined (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebUndermined/FeatureServer/0 · retrieved 2026-09-26
  [high] FEMA 2014 Special Flood Hazard Area overlap: no overlap
      City of Pittsburgh PGHWebFEMA2014 (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebFEMA2014/FeatureServer/0 · retrieved 2026-09-26
  [high] City Historic District overlap: no overlap
      City of Pittsburgh CHD Historic Districts (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebCHDHistoricDistricts/FeatureServer/0 · retrieved 2026-09-26
  [high] Inclusionary Housing Overlay: no overlap
      City of Pittsburgh Inclusionary Housing Overlay District (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/InclusionaryHousingOverlayDistrict/FeatureServer/0 · retrieved 2026-09-26
  [high] Within 1,500 ft major transit buffer: no overlap
      City of Pittsburgh Major Transit Buffer (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebMajorTransitBuffer/FeatureServer/0 · retrieved 2026-09-26
  [high] Parking Reduction Overlay: no overlap
      City of Pittsburgh Parking Reduction Overlay (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebParkingReductionOverlay/FeatureServer/0 · retrieved 2026-09-26
  [unknown] Water/sewer availability: unknown
      not available in public data · https://www.pgh2o.com/ · retrieved n/a · review by PWSA
  [high] Bill 2025-1545 status: Held In Council; hearing 2026-09-23: proposed
      Pittsburgh Legistar API · https://webapi.legistar.com/v1/pittsburgh/matters/31504 · retrieved 2026-09-26

Decision support only. Not legal, financial, or zoning advice.
```

#### `npm run score "5925 Walnut St" -- --reform`
```
5925 WALNUT ST  [0084P00162000000]  Shadyside
Rule set: Current code (in effect) — IN_EFFECT

DEVELOPMENT EASE SCORE: 69 / 100

GATES
  G1 ✔ ok  Inside City of Pittsburgh: Parcel is inside City limits.
  G2 ✔ ok  Residential potential: Residential use or potential present.
  G3 ✔ ok  Housing permitted in base zoning: Housing is permitted by right in the base zoning district.

SUB-SCORES (0-100, weight → points contributed)
  zoning          85  █████████████████···  w40 → 34
      · base rules 85/85
      · ZONING-LOT-MIN: passed (40/40) — Pittsburgh Zoning Code §903.03 (minimum lot size by density subdistrict), as amended by Bill 2025-1579 (Passed Finally 5/6/2025, signed by Mayor 5/7/2025)
      · ZONING-USE: passed (25/25) — Pittsburgh Zoning Code §911.02 Use Table (Single-/Two-/Three-/Multi-Unit Residential rows)
      · ZONING-HISTORIC: passed (12/12) — Pittsburgh Zoning Code Ch. 906 Historic Preservation / City Planning CHD Historic Districts layer
      · ZONING-IZ-OVERLAY: passed (8/8) — Pittsburgh Zoning Code §907.04.A IZ-O Inclusionary Housing Overlay District
  environmental  100  ████████████████████  w20 → 20
      · Slope 25%+: none
      · Landslide-prone area: none
      · Undermined area: none
      · FEMA special flood hazard area: none
  funding         50  ██████████··········  w15 → 7.5
      · neighborhood median assessed land value $39.94/sq ft vs low-value cutoff $2.68/sq ft -> not low-value
  access          50  ██████████··········  w15 → 7.5
      · outside 1,500 ft major transit buffer (partial points)
  site             0  ····················  w10 → 0
      · occupied / improved (+0)

FLAGS
  ℹ  Unknown: request PWSA availability letter. Water/sewer capacity is never scored.
      review by: PWSA   facts: utilities.water_sewer
  ℹ  Off-street parking minimums may apply under Ch. 914; requirement by use/district is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ℹ  ADUs: current code limits them to an ADU overlay district, 1 per lot, with owner-occupancy; overlay coverage is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district

FACTS (source per fact)
  [high] Parcel ID (PIN): 0084P00162000000
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26
  [high] Address: 5925 WALNUT ST
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26
  [high] Inside City of Pittsburgh limits: true
      City of Pittsburgh City Limits (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/City_Limits/FeatureServer/0 · retrieved 2026-09-26
  [high] Lot area (sq ft, map polygon): 6804.3
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26 · review by Licensed survey
  [medium] Lot area (sq ft, county assessor): 6525
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26 · review by Licensed survey
  [high] Base zoning district (map polygon join): RM-M
      WPRDC zoning GeoJSON · https://data.wprdc.org/dataset/zoning · retrieved 2026-09-26 · review by Zoning Administrator
  [medium] Zoning per city parcel layer (zon_new): RM-M
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26
  [medium] Housing under base zoning (§911.02): by_right
      Pittsburgh Zoning Code §911.02 Use Table, as printed in City Council File 2024-0701, attachment "Use Table" (printed 7/18/2024) · https://pittsburgh.legistar1.com/pittsburgh/attachments/1b80ecc1-c98f-4d48-8066-41fbea64c8b0.pdf · retrieved 2026-09-26 · review by Zoning Administrator
  [medium] Assessor use description: APART: 5-19 UNITS
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [medium] Assessor class: COMMERCIAL
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [medium] Vacant per city parcel layer: false
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26
  [medium] Owner type (no owner names stored): Private
      City of Pittsburgh ParcelsPublic (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/ParcelsPublic/FeatureServer/0 · retrieved 2026-09-26
  [medium] Assessed land value ($): 174000
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [medium] Assessed total value ($): 640500
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [medium] Last sale 2019-09-26 (CORP TRANSFER): 743000
      WPRDC/Allegheny County property assessments · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [medium] Neighborhood median assessed land $/sq ft (Shadyside; low-value cutoff 2.68): 39.94
      derived from WPRDC property-assessments (data/processed/neighborhood-values.json) · https://data.wprdc.org/dataset/property-assessments · retrieved 2026-09-26
  [high] Slope 25%+ overlap: no overlap
      City of Pittsburgh PGHWebSlope25 (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebSlope25/FeatureServer/0 · retrieved 2026-09-26
  [high] Landslide-prone overlap: no overlap
      City of Pittsburgh PGHWebLandslideProne (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebLandslideProne/FeatureServer/0 · retrieved 2026-09-26
  [high] Undermined area overlap: no overlap
      City of Pittsburgh PGHWebUndermined (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebUndermined/FeatureServer/0 · retrieved 2026-09-26
  [high] FEMA 2014 Special Flood Hazard Area overlap: no overlap
      City of Pittsburgh PGHWebFEMA2014 (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebFEMA2014/FeatureServer/0 · retrieved 2026-09-26
  [high] City Historic District overlap: no overlap
      City of Pittsburgh CHD Historic Districts (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebCHDHistoricDistricts/FeatureServer/0 · retrieved 2026-09-26
  [high] Inclusionary Housing Overlay: no overlap
      City of Pittsburgh Inclusionary Housing Overlay District (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/InclusionaryHousingOverlayDistrict/FeatureServer/0 · retrieved 2026-09-26
  [high] Within 1,500 ft major transit buffer: no overlap
      City of Pittsburgh Major Transit Buffer (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebMajorTransitBuffer/FeatureServer/0 · retrieved 2026-09-26
  [high] Parking Reduction Overlay: no overlap
      City of Pittsburgh Parking Reduction Overlay (ArcGIS) · https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebParkingReductionOverlay/FeatureServer/0 · retrieved 2026-09-26
  [unknown] Water/sewer availability: unknown
      not available in public data · https://www.pgh2o.com/ · retrieved n/a · review by PWSA
  [high] Bill 2025-1545 status: Held In Council; hearing 2026-09-23: proposed
      Pittsburgh Legistar API · https://webapi.legistar.com/v1/pittsburgh/matters/31504 · retrieved 2026-09-26

Decision support only. Not legal, financial, or zoning advice.

══════════════════════════════════════════════════════════════════════════════
REFORM COMPARISON — PROPOSED reform (Bill 2025-1545)
PROPOSED, not law (Bill 2025-1545: Held In Council; public hearing 2026-09-23; status checked 2026-09-26). Modeled as proposed; lot-size rules unchanged from current code.
  Score: current 69 → reform 75   delta +6
  zoning         85 → 100
  Flags added under reform:
    + PROPOSED, not law (Bill 2025-1545: Held In Council; public hearing 2026-09-23; status checked 2026-09-26): optional Affordable Housing Bonus available (outside the Inclusionary overlay).  [review by: Department of City Planning]
  Flags removed under reform:
    (none)
  Flags changed:
    ~ adu
        current: ADUs: current code limits them to an ADU overlay district, 1 per lot, with owner-occupancy; overlay coverage is not modeled (unverified).
        reform:  PROPOSED, not law (Bill 2025-1545: Held In Council; public hearing 2026-09-23; status checked 2026-09-26): up to 2 accessory dwelling units by right (≤1,000 sq ft, ≤30 ft, no owner-occupancy).
    ~ parking-minimum
        current: Off-street parking minimums may apply under Ch. 914; requirement by use/district is not modeled (unverified).
        reform:  PROPOSED, not law (Bill 2025-1545: Held In Council; public hearing 2026-09-23; status checked 2026-09-26): no off-street parking minimums.
```

#### `npm run score 0174N00262000000` (facts section omitted here; the CLI prints it)
```
0 TIOGA ST  [0174N00262000000]  Homewood South
Rule set: Current code (in effect) — IN_EFFECT

DEVELOPMENT EASE SCORE: 94 / 100

GATES
  G1 ✔ ok  Inside City of Pittsburgh: Parcel is inside City limits.
  G2 ✔ ok  Residential potential: Residential use or potential present.
  G3 ✔ ok  Housing permitted in base zoning: Housing is permitted by right in the base zoning district.

SUB-SCORES (0-100, weight → points contributed)
  zoning          85  █████████████████···  w40 → 34
      · base rules 85/85
      · ZONING-LOT-MIN: passed (40/40) — Pittsburgh Zoning Code §903.03 (minimum lot size by density subdistrict), as amended by Bill 2025-1579 (Passed Finally 5/6/2025, signed by Mayor 5/7/2025)
      · ZONING-USE: passed (25/25) — Pittsburgh Zoning Code §911.02 Use Table (Single-/Two-/Three-/Multi-Unit Residential rows)
      · ZONING-HISTORIC: passed (12/12) — Pittsburgh Zoning Code Ch. 906 Historic Preservation / City Planning CHD Historic Districts layer
      · ZONING-IZ-OVERLAY: passed (8/8) — Pittsburgh Zoning Code §907.04.A IZ-O Inclusionary Housing Overlay District
  environmental  100  ████████████████████  w20 → 20
      · Slope 25%+: none
      · Landslide-prone area: none
      · Undermined area: none
      · FEMA special flood hazard area: none
  funding        100  ████████████████████  w15 → 15
      · neighborhood median assessed land value $0.93/sq ft vs low-value cutoff $2.68/sq ft -> low-value area
  access         100  ████████████████████  w15 → 15
      · inside major transit buffer (100% of parcel)
  site           100  ████████████████████  w10 → 10
      · vacant (+50)
      · City-owned: easier acquisition (+50)

FLAGS
  ℹ  Unknown: request PWSA availability letter. Water/sewer capacity is never scored.
      review by: PWSA   facts: utilities.water_sewer
  ℹ  Off-street parking minimums may apply under Ch. 914; requirement by use/district is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ℹ  ADUs: current code limits them to an ADU overlay district, 1 per lot, with owner-occupancy; overlay coverage is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ℹ  Low-value area: gap financing likely needed (note only, not a penalty).
      review by: PHFA / lender underwriting   facts: hood.median_land_psf
  ℹ  Vacant infill lot in a low-value area: eligible for infill/blight scoring (PHFA) — confirm against current PHFA criteria.
      review by: PHFA application scoring criteria   facts: landuse.vacant, hood.median_land_psf
  ℹ  City-owned parcel: acquisition through a public disposition process may be easier (not guaranteed).
      review by: City property-disposition process   facts: owner.type

MAP PINS (centroid of overlap)
  transit_buffer: 40.453326, -79.895833  (100% of parcel)

Decision support only. Not legal, financial, or zoning advice.
```

#### `npm run score 0013E00051000000` (facts section omitted here; the CLI prints it)
```
1817 SAINT PATRICK ST  [0013E00051000000]  South Side Slopes
Rule set: Current code (in effect) — IN_EFFECT

DEVELOPMENT EASE SCORE: 34 / 100  (uncapped 34.4)

GATES
  G1 ✔ ok  Inside City of Pittsburgh: Parcel is inside City limits.
  G2 ✔ ok  Residential potential: Residential use or potential present.
  G3 ▲ CAP  Housing permitted in base zoning: Housing only by exception in H: score capped at 70.  [review by: Zoning Board of Adjustment]

SUB-SCORES (0-100, weight → points contributed)
  zoning          46  █████████···········  w40 → 18.4
      · base rules 46/85
      · ZONING-LOT-MIN: unknown (16/40) — Pittsburgh Zoning Code §903.03 (minimum lot size by density subdistrict), as amended by Bill 2025-1579 (Passed Finally 5/6/2025, signed by Mayor 5/7/2025)
      · ZONING-USE: failed (10/25) — Pittsburgh Zoning Code §911.02 Use Table (Single-/Two-/Three-/Multi-Unit Residential rows)
      · ZONING-HISTORIC: passed (12/12) — Pittsburgh Zoning Code Ch. 906 Historic Preservation / City Planning CHD Historic Districts layer
      · ZONING-IZ-OVERLAY: passed (8/8) — Pittsburgh Zoning Code §907.04.A IZ-O Inclusionary Housing Overlay District
  environmental    5  █···················  w20 → 1
      · Slope 25%+: 100% of parcel (-40)
      · Landslide-prone area: 100% of parcel (-40)
      · Undermined area: 98.9% of parcel (-15)
      · FEMA special flood hazard area: none
  funding         50  ██████████··········  w15 → 7.5
      · neighborhood median assessed land value $7.04/sq ft vs low-value cutoff $2.68/sq ft -> not low-value
  access          50  ██████████··········  w15 → 7.5
      · outside 1,500 ft major transit buffer (partial points)
  site             0  ····················  w10 → 0
      · occupied / improved (+0)

FLAGS
  ℹ  Unknown: request PWSA availability letter. Water/sewer capacity is never scored.
      review by: PWSA   facts: utilities.water_sewer
  ℹ  Unverified: lot-size minimum for district H is not modeled (only R1D/R1A/R2/R3/RM density subdistricts are).
      review by: Zoning Administrator   facts: zoning.district, lot.area
  ⚠  Housing is allowed in H only by administrator/special exception, not by right.
      review by: Zoning Administrator / Zoning Board of Adjustment   facts: zoning.district, zoning.use_table
  ℹ  Off-street parking minimums may apply under Ch. 914; requirement by use/district is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ℹ  ADUs: current code limits them to an ADU overlay district, 1 per lot, with owner-occupancy; overlay coverage is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ⚠  Slope 25%+ covers 100% of the parcel (pin 40.418987, -79.980455).
      review by: geotechnical review (Code Ch. 915)   facts: hazard.slope25
  ⚠  Landslide-prone area covers 100% of the parcel (pin 40.418987, -79.980455).
      review by: geotechnical review (Code Ch. 915)   facts: hazard.landslide
  ⚠  Undermined area covers 98.9% of the parcel (pin 40.418975, -79.980455).
      review by: mine subsidence / geotechnical review   facts: hazard.undermined

MAP PINS (centroid of overlap)
  slope25: 40.418987, -79.980455  (100% of parcel)
  landslide: 40.418987, -79.980455  (100% of parcel)
  undermined: 40.418975, -79.980455  (98.9% of parcel)

Decision support only. Not legal, financial, or zoning advice.
```

#### `npm run score 0173N00352000000` (facts section omitted here; the CLI prints it)
```
7032 UPLAND ST  [0173N00352000000]  Homewood North
Rule set: Current code (in effect) — IN_EFFECT

DEVELOPMENT EASE SCORE: 58 / 100  (uncapped 57.7)

GATES
  G1 ✔ ok  Inside City of Pittsburgh: Parcel is inside City limits.
  G2 ✔ ok  Residential potential: Residential use or potential present.
  G3 ✔ ok  Housing permitted in base zoning: Housing is permitted by right in the base zoning district.

SUB-SCORES (0-100, weight → points contributed)
  zoning          53  ███████████·········  w40 → 21.2
      · base rules 53/85
      · ZONING-LOT-MIN: failed (8/40) — Pittsburgh Zoning Code §903.03 (minimum lot size by density subdistrict), as amended by Bill 2025-1579 (Passed Finally 5/6/2025, signed by Mayor 5/7/2025)
      · ZONING-USE: passed (25/25) — Pittsburgh Zoning Code §911.02 Use Table (Single-/Two-/Three-/Multi-Unit Residential rows)
      · ZONING-HISTORIC: passed (12/12) — Pittsburgh Zoning Code Ch. 906 Historic Preservation / City Planning CHD Historic Districts layer
      · ZONING-IZ-OVERLAY: passed (8/8) — Pittsburgh Zoning Code §907.04.A IZ-O Inclusionary Housing Overlay District
  environmental  100  ████████████████████  w20 → 20
      · Slope 25%+: none
      · Landslide-prone area: none
      · Undermined area: none
      · FEMA special flood hazard area: none
  funding         60  ████████████········  w15 → 9
      · neighborhood median assessed land value $0.94/sq ft vs low-value cutoff $2.68/sq ft -> low-value area
  access          50  ██████████··········  w15 → 7.5
      · outside 1,500 ft major transit buffer (partial points)
  site             0  ····················  w10 → 0
      · occupied / improved (+0)

FLAGS
  ℹ  Unknown: request PWSA availability letter. Water/sewer capacity is never scored.
      review by: PWSA   facts: utilities.water_sewer
  ⚠  Lot (1,774 sq ft) is below the 3,000 sq ft minimum for R2-L: variance likely, or combine with adjacent lot.
      review by: Zoning Board of Adjustment   facts: lot.area, zoning.district
  ℹ  Off-street parking minimums may apply under Ch. 914; requirement by use/district is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ℹ  ADUs: current code limits them to an ADU overlay district, 1 per lot, with owner-occupancy; overlay coverage is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ℹ  Low-value area: gap financing likely needed (note only, not a penalty).
      review by: PHFA / lender underwriting   facts: hood.median_land_psf

```

#### `npm run score 0135M00041000000` (facts section omitted here; the CLI prints it)
```
0 BALDWIN RD  [0135M00041000000]  Hays
Rule set: Current code (in effect) — IN_EFFECT

DEVELOPMENT EASE SCORE: 77 / 100  (uncapped 76.5)

GATES
  G1 ✔ ok  Inside City of Pittsburgh: Parcel is inside City limits.
  G2 ✔ ok  Residential potential: Residential use or potential present.
  G3 ✔ ok  Housing permitted in base zoning: Housing is permitted by right in the base zoning district.

SUB-SCORES (0-100, weight → points contributed)
  zoning          85  █████████████████···  w40 → 34
      · base rules 85/85
      · ZONING-LOT-MIN: passed (40/40) — Pittsburgh Zoning Code §903.03 (minimum lot size by density subdistrict), as amended by Bill 2025-1579 (Passed Finally 5/6/2025, signed by Mayor 5/7/2025)
      · ZONING-USE: passed (25/25) — Pittsburgh Zoning Code §911.02 Use Table (Single-/Two-/Three-/Multi-Unit Residential rows)
      · ZONING-HISTORIC: passed (12/12) — Pittsburgh Zoning Code Ch. 906 Historic Preservation / City Planning CHD Historic Districts layer
      · ZONING-IZ-OVERLAY: passed (8/8) — Pittsburgh Zoning Code §907.04.A IZ-O Inclusionary Housing Overlay District
  environmental   75  ███████████████·····  w20 → 15
      · Slope 25%+: none
      · Landslide-prone area: none
      · Undermined area: none
      · FEMA special flood hazard area: 100% of parcel (-25)
  funding        100  ████████████████████  w15 → 15
      · neighborhood median assessed land value $1.05/sq ft vs low-value cutoff $2.68/sq ft -> low-value area
  access          50  ██████████··········  w15 → 7.5
      · outside 1,500 ft major transit buffer (partial points)
  site            50  ██████████··········  w10 → 5
      · vacant (+50)

FLAGS
  ℹ  Unknown: request PWSA availability letter. Water/sewer capacity is never scored.
      review by: PWSA   facts: utilities.water_sewer
  ℹ  Off-street parking minimums may apply under Ch. 914; requirement by use/district is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ℹ  ADUs: current code limits them to an ADU overlay district, 1 per lot, with owner-occupancy; overlay coverage is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ⚠  FEMA special flood hazard area covers 100% of the parcel (pin 40.379456, -79.935726).
      review by: Floodplain administrator / FEMA flood determination   facts: hazard.flood
  ℹ  Low-value area: gap financing likely needed (note only, not a penalty).
      review by: PHFA / lender underwriting   facts: hood.median_land_psf
  ℹ  Vacant infill lot in a low-value area: eligible for infill/blight scoring (PHFA) — confirm against current PHFA criteria.
      review by: PHFA application scoring criteria   facts: landuse.vacant, hood.median_land_psf

MAP PINS (centroid of overlap)
  fema2014: 40.379456, -79.935726  (100% of parcel)

Decision support only. Not legal, financial, or zoning advice.
```

#### `npm run score 0006K00358000000 -- --reform` (facts section omitted)
```
423 EDITH ST  [0006K00358000000]  Duquesne Heights
Rule set: Current code (in effect) — IN_EFFECT

DEVELOPMENT EASE SCORE: 61 / 100

GATES
  G1 ✔ ok  Inside City of Pittsburgh: Parcel is inside City limits.
  G2 ✔ ok  Residential potential: Residential use or potential present.
  G3 ✔ ok  Housing permitted in base zoning: Housing is permitted by right in the base zoning district.

SUB-SCORES (0-100, weight → points contributed)
  zoning          85  █████████████████···  w40 → 34
      · base rules 85/85
      · ZONING-LOT-MIN: passed (40/40) — Pittsburgh Zoning Code §903.03 (minimum lot size by density subdistrict), as amended by Bill 2025-1579 (Passed Finally 5/6/2025, signed by Mayor 5/7/2025)
      · ZONING-USE: passed (25/25) — Pittsburgh Zoning Code §911.02 Use Table (Single-/Two-/Three-/Multi-Unit Residential rows)
      · ZONING-HISTORIC: passed (12/12) — Pittsburgh Zoning Code Ch. 906 Historic Preservation / City Planning CHD Historic Districts layer
      · ZONING-IZ-OVERLAY: passed (8/8) — Pittsburgh Zoning Code §907.04.A IZ-O Inclusionary Housing Overlay District
  environmental   60  ████████████········  w20 → 12
      · Slope 25%+: 27.9% of parcel (-25)
      · Landslide-prone area: none
      · Undermined area: 100% of parcel (-15)
      · FEMA special flood hazard area: none
  funding         50  ██████████··········  w15 → 7.5
      · neighborhood median assessed land value $4.97/sq ft vs low-value cutoff $2.68/sq ft -> not low-value
  access          50  ██████████··········  w15 → 7.5
      · outside 1,500 ft major transit buffer (partial points)
  site             0  ····················  w10 → 0
      · occupied / improved (+0)

FLAGS
  ℹ  Unknown: request PWSA availability letter. Water/sewer capacity is never scored.
      review by: PWSA   facts: utilities.water_sewer
  ℹ  Off-street parking minimums may apply under Ch. 914; requirement by use/district is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ℹ  ADUs: current code limits them to an ADU overlay district, 1 per lot, with owner-occupancy; overlay coverage is not modeled (unverified).
      review by: Zoning Administrator   facts: zoning.district
  ⚠  Slope 25%+ covers 27.9% of the parcel (pin 40.435773, -80.024762).
      review by: geotechnical review (Code Ch. 915)   facts: hazard.slope25
  ⚠  Undermined area covers 100% of the parcel (pin 40.435733, -80.024643).
      review by: mine subsidence / geotechnical review   facts: hazard.undermined

MAP PINS (centroid of overlap)
  slope25: 40.435773, -80.024762  (27.9% of parcel)
  undermined: 40.435733, -80.024643  (100% of parcel)

Decision support only. Not legal, financial, or zoning advice.

══════════════════════════════════════════════════════════════════════════════
REFORM COMPARISON — PROPOSED reform (Bill 2025-1545)
PROPOSED, not law (Bill 2025-1545: Held In Council; public hearing 2026-09-23; status checked 2026-09-26). Modeled as proposed; lot-size rules unchanged from current code.
  Score: current 61 → reform 67   delta +6
  zoning         85 → 100
  Flags added under reform:
    + PROPOSED, not law (Bill 2025-1545: Held In Council; public hearing 2026-09-23; status checked 2026-09-26): optional Affordable Housing Bonus available (outside the Inclusionary overlay).  [review by: Department of City Planning]
  Flags removed under reform:
    (none)
  Flags changed:
    ~ adu
        current: ADUs: current code limits them to an ADU overlay district, 1 per lot, with owner-occupancy; overlay coverage is not modeled (unverified).
        reform:  PROPOSED, not law (Bill 2025-1545: Held In Council; public hearing 2026-09-23; status checked 2026-09-26): up to 2 accessory dwelling units by right (≤1,000 sq ft, ≤30 ft, no owner-occupancy).
    ~ parking-minimum
        current: Off-street parking minimums may apply under Ch. 914; requirement by use/district is not modeled (unverified).
        reform:  PROPOSED, not law (Bill 2025-1545: Held In Council; public hearing 2026-09-23; status checked 2026-09-26): no off-street parking minimums.
```

## Known issues / things to verify
1. **Use table not verified against live code.** ecode360/AmLegal were blocked (403). The table comes from the Council File 2024-0701 print (7/18/2024) cross-checked against a 2020 print; amendments after July 2024 aren't reflected. Transcribed by eye from a rendered page — please spot-check the residential rows.
2. **Unverified districts** (no use-table column): RP, CP, AP, UPR-A/B, GPRA/B/C, OPR-B, SP-1/4/5/7/8/9/10/11, MTOBOR. Housing there is `unknown`, so G3 caps the score at 40. 3,199 residential-use parcels sit in such districts.
3. **ParcelsPGH is not "all parcels"** (12,696). ParcelsPublic is the base. 270 duplicate PINs were dropped (first record kept; probably multi-part parcels).
4. **Zoning sources disagree on 1,006 parcels** (mostly polygon `UC-MU` vs parcel-layer `RM-VH`, Oakland). Those are scored on the polygon district with low confidence + a flag; G3 uses the stricter of the two.
5. **Lot area:** polygon area vs assessor area differ by >5% on ~51% of parcels (median 5%). Lot-min result becomes `unknown` when they straddle the minimum.
6. **Lot minimums are modeled only for R1D/R1A/R2/R3/RM density subdistricts** (§903.03). Other districts' minimums are `unknown` (40% credit, flagged).
7. **Not modeled:** setbacks, height, building code, water/sewer (always flagged), parking minimums by use, the current ADU overlay, PHFA scoring criteria (the "eligible for infill/blight scoring" text is from your brief, flagged "confirm").
8. **Scoring parameters are my choices** (penalty tiers, 40% unknown credit, 85/15 split of zoning points, cap 70 for exception-only, low-value = bottom third of neighborhood median land $/sq ft, reviewBy names for undermined/flood). All in `lib/config.ts`; nothing here is calibrated — the backtest against permits is a later phase.
9. **Reform scoring:** nearly every by-right parcel gains +4…+6 (ADU +6, parking +4, bonus +5, capped by the zoning sub-score). ADU rule text was read from both the v2 text and the Planning Commission substitute of Bill 2025-1545; the bill is still moving.
10. **Address lookup** uses the parcel layer (house no. + street). Lots with house number 0 (many vacant lots) are only reachable by PIN; the downloaded Addresses layer is not used yet.
11. **Speed:** ~30 ms/parcel for full scoring (turf intersections); scanning the whole city takes ~25 min (see `scripts/pick-golden.ts`). Fine for lookups; batch/opportunity map will need precomputed overlaps.
12. Licenses: WPRDC lists the zoning dataset as "License not specified"; city ArcGIS services state none. Confirm reuse terms before redistributing raw data (raw files are gitignored, not committed).
13. Rule-source documents (Legistar PDFs, RTF) were read by hand into `data/raw/code/` (gitignored); the fetch script doesn't re-download them — URLs are in `data/SOURCES.md`.

---
# Phases 6–13 (this session)

## Known-issue fixes done first
- **Speed (known issue 11):** `computeOverlaps` now skips `turf.area` when no layer feature's bbox touches the parcel (fast path); precompute shards across 8 worker processes.
- **House-number-0 lookup (issue 10):** addresses like "0 Rosedale St" are indexed; multiple matches return the ambiguity list (42 for that street) instead of nothing.
- **Race found:** a `npm run fetch` run concurrently with my `preprocess` produced a half-written assessments file (115k of 142k parcels joined). Re-running preprocess fixed it; the raw data and results are identical to before. (If you re-fetch, don't run preprocess until fetch exits.)
- Not fixed (still true): items 1-9, 12-13 (see Known issues below).

## Phase 6 — Precompute (`npm run precompute`, ~17 min on 8 cores)
- Scope decision (conservative, size-driven): full scoring under both rule sets for **every vacant parcel + every publicly owned parcel (City/URA/HACP/County) + 7 demo parcels = 33,507 parcels** (32,675 get a score; the rest hit G1/G2). Lot-size + ADU classification runs for **all 142,365 parcels** (Reform Impact). The web snapshot does **not** contain other occupied private parcels (they would add ~110 MB); the CLI scores any parcel.
- Outputs (committed): `data/scores/index.json` (3.1 MB compact rows), `data/scores/packets/<neighborhood>.json` (91 shards, 55 MB total, max 2.5 MB; raw engine inputs + overlaps, **not** scores), `data/scores/meta.json`, `data/opportunity.json` (13,211 vacant public lots, 6.5 MB), `data/reform-impact.json` (citywide + 91 neighborhoods).
- **Design decision:** packets store the engine's *inputs*; the web app runs the same pure engine in the browser, so the reform toggle and editable weights are instant and consistent with the CLI. Overlap pieces (for drawing slope/flood/etc. on the lot) are stored per parcel.
- Reform Impact (citywide): 21,005 lots no longer need a lot-size variance (Bill 2025-1579, in effect); 118,800 could gain by-right ADU potential if Bill 2025-1545 passes (PROPOSED, upper bound). `data/reform-impact.json` has the neighborhood breakdown (top: Squirrel Hill South 1,221 / Brookline 5,989).
- Map layers for display: `public/layers/*.json` (1 MB). **Decision:** the slope-25% layer is *not* shipped as a layer (600k+ raster-stairstep vertices even after simplification, 13 MB); the map draws the per-parcel overlap piece instead.

## Phase 7 — Web app (`npm run dev`; verified with `next build` + headless-Chromium screenshots)
- Routes: `/` (search + demo parcels), `/parcel/[id]` (Lot Report + Site X-ray), `/parcel/[id]/memo` (one-page memo, print to PDF via print CSS — **decision:** no jsPDF dependency), `/compare?ids=`, `/map`, `/impact`; APIs `/api/search`, `/api/opportunity`, `/api/ask`.
- Lot Report: MapLibre dark basemap (CARTO Dark Matter, no key; if tiles fail it falls back to a plain dark background), lot outline, overlap pieces, context layers with toggles, numbered pins (red gate / amber friction / green in your favor) that highlight their flag card on hover and vice versa; score dial that animates; 5 sub-score bars; flag cards each with source link and "Confirm with: <reviewBy>"; Reform toggle (labels the rule set "Proposed (Bill 2025-1545)", animates the score, changes pins/flags); editable weights with reset; evidence list with "Unverified" badges; glossary tooltips (lot, zoning district, variance, ADU, geotechnical review, PWSA, PHFA, …); disclaimer footer on every page.
- **Fix found by screenshot:** MapLibre 6's worker failed under Turbopack ("Worker failed to load"); worker + shared chunk are copied to `public/maplibre/` (`npm run sync-maplibre`, run on `prebuild`) and set via `setWorkerUrl`.
- Dependencies added (authorized by the brief): `maplibre-gl` only (Claude API is called with `fetch`, no SDK).

## Phase 8 — AI explanations (`lib/ai/explain.ts`, `npm run ai-explain`)
- Evidence packet → Claude → JSON `{flags:{id:text}, nextSteps:[]}`; **validator drops any sentence without a valid `[fact-id]`** (ids are semantic, e.g. `[zoning.district]`, not `[F-07]`; logged decision), unknown flag ids are dropped, and the final step "Confirm with: …" is appended from engine data, not from the model. UI reads `data/ai-cache/{pin}_{ruleset}.json` and falls back to engine flag text.
- **Unverified / mocked:** no API key here, so **zero real model outputs exist**. Tests use fixtures (`tests/ai.test.ts`, 3 tests incl. a mock-fetch call). A bug the tests caught: sentence splitting broke on the dots inside `[zoning.district]`.

## Phase 9 — Reform Impact view (`/impact`)
- Headline numbers, top-15 neighborhood bars for each count, methods/limits box, and the "How we know" panel (Phase 10). Uses `data/reform-impact.json` only.

## Phase 11 — Opportunity map (`/map`)
- 13,211 vacant public lots (City 7,565 as of the data), points at city zoom and polygons at lot zoom, colored by score; filters owner / neighborhood / score range / starter-home ready (no gates, 70+) / ADU-ready-under-reform; "combine with adjacent lot?" in popups; click → lot report; top-lots list.

## Phase 12 — Ask agent (`lib/agent/*`, `/api/ask`)
- 7 tools (search_parcels, get_parcel, score_parcels, check_hazards, lookup_zoning_rule, reform_impact, draft_site_memo) over the local snapshot; Claude tool-use loop with max 8 calls, system-prompt guardrails, a refusal pre-check (legal/financial/determination requests), "Confirm with" enforced, and a **numbers-must-come-from-tool-results** check that annotates unmatched numbers. Collapsible tool trace and map highlights in the UI.
- **Engine-only router** (used when no key): deterministic parsing of neighborhood/owner/score/"duplex"/"ADU"/"how many" questions into the same tools. Answers are labeled "Engine-only answer (no LLM key configured)".
- 3 showcase answers cached in `data/ask-cache.json` (labeled "Cached showcase answer"; generated by the engine-only router):
  1. "Top 3 city-owned vacant lots in Homewood for a duplex if the ADU bill passes, and what is blocking them" → 1,051 matching lots; top 3 are 0 Bennett St / 0 Kelly St ×2 at 100 under the proposed rules, no gate or warning flags.
  2. "Which URA-owned vacant lots score 70 or higher and are smaller than their district minimum?" → 110 matches; top: 0 Crawford St (77) etc., each flagged "variance likely, or combine with adjacent lot".
  3. "How many lots would gain by-right ADU potential in Hazelwood if Bill 2025-1545 passes?" → 2,627 (proposed; upper bound); 493 no longer need a lot-size variance.
- **Eight-question test (`npx tsx scripts/ask-test.ts`; engine-only router, run and verified):** (1-3) the showcase questions ✔; (4) "How many lots no longer need a variance citywide?" → 21,005 / 118,800 (proposed) ✔; (5) "Top 5 HACP-owned vacant lots" → 65 matches, top 1823 Cliff St (82), no flags ✔; (6) "Is it legal to build on 0 Tioga St?" → refused, points to Zoning Administrator / ZBA ✔; (7) "Should I invest in Homewood lots?" → refused ✔; (8) "Top 3 County-owned vacant lots in Perry South" → "No lots in the snapshot match" (there are none) ✔. Limitation: the router only understands these patterns; free-form questions need the Claude key (untested with a real model).

## Phase 10 — Validation backtest (`ml/`, `data/validation.json`, `ml/results.md`; shown on `/impact`)
- **Data (fetched by `ml/fetch_data.py`, gitignored):** WPRDC PLI permits, 65,378 rows, via the datastore API requesting only non-name fields (`owner_name`/`contractor_name` never downloaded); WPRDC "Selected 2019 Property Assessments Files" → **Aug-2019 snapshot** (142,560 Pittsburgh parcels). Permit rule (documented in results.md): permit_type ∈ {BUILDING, Building & Development Application}, work_type ∈ {NEW CONSTRUCTION, New Construction}, Residential, status not Revoked/Expired/Stop Work, issued ≥ 2019-09-01 (strictly after the snapshot). Qualifying permits per year: 2019 13 (from June), 2020 78, 2021 95, 2022 98, 2023 82, 2024 74, 2025 57, 2026 58 (555 total).
- **Cohort/label:** 22,037 parcels vacant in Aug 2019; 189 later got a qualifying permit; 21,408 scorable (629 PINs retired/merged since 2019 can't be matched; 60 hit a gate).
- **Features = 2019 inputs** through the same engine (`scripts/backtest-features.ts`): 2019 vacancy/use/class/lot area/land value, neighborhood value cutoffs recomputed from 2019 assessments, owner type unknown; geometry, hazards, zoning, historic, transit buffer are today's (static geography; transit buffer/IZ overlay layers postdate 2019 — logged caveat).
- **Result (Step 1):** 40-69: 0.51% built (66/13,023); **70+: 1.48% (123/8,325), 2.9× the rate**; no 2019 parcel scored below 40 (owner type unknown → nothing hits a low cap), so the 0-39 band is empty. Rank AUC of the raw score = **0.655**. By quintile 0.21% → 0.61% → 0.73% → 1.69% → 1.19% (not strictly monotone at the top). Sub-scores: zoning and environmental separate in the expected direction; **funding and transit point the opposite way** (consistent with market demand; reported, not tuned away).
- **Step 2 skipped by the brief's rule:** only 189 positives ("hundreds or more" not met). No model trained; `ml/requirements.txt` pins the Python deps used by the analysis.
- Statement shown in the UI: "Past building reflects market demand as well as feasibility, so we use it to test our score, not replace it."

## Phase 13 — Docs and submission prep
- `README.md` (what/who, quickstart, mermaid architecture, sources+licenses, scoring method, AI/library disclosure, validation, limitations, pilot path, next steps), `LICENSE` (MIT), `SUBMISSION.md` (paste-ready answers), `DEMO_SCRIPT.md` (4:30 with real-vs-placeholder notes and exact parcels).
- **Not done here:** Vercel deploy (needs your login/key) and the repo/video URLs in README/SUBMISSION (placeholders marked `<...>`). Local production build verified (`npm run build`, `next start`, every route + API returned 200; headless-Chromium screenshots of lot report, reform toggle, compare, map, ask panel, impact).

## Update — coverage expanded to every parcel (2026-09-26 night)
- **Why:** a tester's own address (5815 5th Ave) was missing from the web app because the snapshot only held vacant/public lots (a size decision). Now `precompute` scores **all 142,365 parcels** under both rule sets (137,913 get a score; the rest hit G1/G2). Run took ~100 min on 8 cores.
- **Size:** raw packets are 196 MB, so `data/scores` is committed **gzipped** (`index.json.gz`, `packets/*.json.gz`, 26 MB total); `lib/web/server-data.ts` reads either form. `scripts/compress-shards.ts` gzips an existing raw output. Packet format also slimmed (derived fields rebuilt in `fromPacket`).
- Verified locally: search "5815 5th avenue" / "5815 FIFTH AVE" → 0085B00078000000 (score 67); lot report, memo and compare return 200. Reform Impact and opportunity data are unchanged. **Known issues item "web snapshot covers only vacant/public lots" is resolved.**
- Known issue 11 update: full-city precompute takes ~100 min (not ~17).

## Update — Financial snapshot (idea from a reviewer; built while the expert reply is pending)
- **Why:** Track 1 is "Development Feasibility & *Pro Forma Navigator*" and the app had no money view; a reviewer asked for valuation at the top of each lot and for zoning + financial feasibility to matter most. The assessed values were already in the data (5925 Walnut St: land $174,000 / building $466,500 / total $640,500 — identical to the county site) but only in the evidence list.
- **What was added (score unchanged):** (1) `ValuationStrip` at the top of each lot report and in the memo: assessed land/building/total, land $/sq ft vs. the neighborhood median, last sale with a caution unless the assessor coded it a valid sale (nominal ≤ $1,000 transfers are flagged), always labeled "not market price or development cost"; the county's "2027 projected base-year" figure is not in our WPRDC data. (2) `FeasibilityCalculator`: rental or for-sale; **every input is typed by the user and nothing is pre-filled** (buttons can copy the assessed land value or last sale into land cost). Outputs: total development cost, cost/home and /sq ft, supportable value (net income ÷ cap rate) or sales revenue, funding gap or cushion, optional loan payment and debt-service coverage ratio. Also shows which housing types the zoning allows by right. Inputs persist in the browser (except land cost/units), no server storage. (3) Weight presets in the weights panel: Default, "Zoning & financial first" (45/15/25/10/5), "Public land / nonprofit" (35/15/20/10/20); the panel says Funding fit is a neighborhood-value proxy, not a full pro forma.
- **Built to survive the expert's answer:** everything an expert might change is in `lib/finance-config.ts` (calculator fields, optional `dscrMin` threshold — null = ratio only, no pass/fail — presets, which sale types count as market-like). The default score, backtest and golden tests are untouched.
- **Decisions / not done:** did NOT reweight the default score (the backtest showed Funding fit pointing the wrong way and it is a weak proxy) and did NOT add the "score an arbitrary location from neighbors" idea (it would invent numbers; the honest version — click a map spot to open the real parcel under it — is not built). PHFA's 1.15 coverage figure comes from older guideline snippets and is not applied anywhere. Tests: `tests/finance.test.ts` (7).
- **Awaiting from the experts:** what "financial feasibility" should measure, which calculator inputs matter, and the right coverage threshold.

## Update — Bottom line, next steps and assemblage finder (built on my own initiative; no expert dependency)
- **Why:** (1) Your brief's success statement asks for "a plain-language explanation of the biggest barriers" — the app only had flag cards. (2) The map already said "combine with adjacent lot" for undersized lots but not with *what*; URA/Land Bank/CDC staff assemble small public lots for a living, and no other tool we know of does it from real lot geometry.
- **Bottom line + next steps** (`lib/summary.ts`, `components/BottomLine.tsx`; memo too): headline verdict (strong / workable / difficult / no score), up to 4 biggest barriers in plain language, what is in your favor, and a who-to-call checklist (Zoning Administrator, ZBA, geotechnical, PWSA, …). Deterministic: every sentence maps to an engine flag or gate; it updates with the Reform toggle. Tests: `tests/summary.test.ts`.
- **Assemblage** (`lib/adjacency.ts`, `lib/assemblage.ts`, `scripts/build-adjacency.ts`, `components/AssemblageCard.tsx`): adjacency = shared boundary ≥ 3 m (both endpoints of an outline edge within 0.6 m of the neighbor's outline; corner touches don't count), computed for every vacant or undersized parcel (42,662 have neighbors; `data/scores/adjacency.json.gz`, 0.6 MB). The card lists the smallest single neighbor or pair that lifts the lot over its §903.03 minimum, preferring public, then vacant-private, then built-private neighbors, ignoring combinations dominated by a huge lot (cap 5× the minimum or 10,000 sq ft), with neighbor outlines drawn on the map. `data/opportunity.json` gained `adj` and `assemble`; `/map` has a "Can be assembled to size" filter (1,876 lots). Tests: `tests/assemblage.test.ts`.
- **Limits stated in the UI:** lot-size rule only (no setbacks, height, price, willingness to sell, or legal lot consolidation); owner type only, never names; districts without a modeled minimum get a neighbor list but no test. Adjacency uses tax-map outlines and may miss neighbors across small gaps. The Ask agent does not yet have an "assemblable" filter.
- Score, backtest and golden tests untouched. 41 tests pass.

## Update — Click-to-select parcel (idea 3, honest version)
- **Why:** finding a lot by clicking is how planners and land-bank staff actually browse, and the opportunity map only responded to the 13k public-lot dots. The reviewer's idea of *estimating* a score for an arbitrary spot from neighbors was rejected (it would invent numbers); this version opens the **real** parcel under the click, or says there is none.
- **How:** `/api/locate?lon&lat` (`lib/web/server-data.ts: locate`) finds candidate parcels from a centroid grid, then tests bounding box + point-in-polygon on the real polygons (second wider pass for very large lots). Shard cache is now an LRU of 10 to keep serverless memory bounded. Client: on `/map` (zoom 15+) any click selects and outlines the parcel with a popup (address, hood, owner type, vacant/built, size, zoning, score, reform score, link); below zoom 15 it says to zoom in; clicks on opportunity dots keep their existing popup. On a lot report map, clicking a dashed neighbor opens its report and clicking anywhere else identifies that parcel. Tests: `tests/locate.test.ts` (2).
- **Limit:** a click on a street, river or a gap between tax-map polygons returns "no parcel here"; ~35% of a sampled city grid falls in such gaps, which is expected because roads and water are not parcels.
