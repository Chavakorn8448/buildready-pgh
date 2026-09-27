# Submission answers (ready to paste)

**Repository:** `<PUBLIC GITHUB REPO URL>` (public, full commit history) · **Live demo:** https://buildready-pgh.vercel.app · **Demo video:** `<VIDEO URL>`

## Project title
BuildReady PGH: source-grounded development feasibility for Pittsburgh housing

## Track
Track 1: Development Feasibility & Pro Forma Navigator

## Description
BuildReady PGH shows developers what's blocking a site, shows nonprofits which vacant lots to build on first, and shows the city how many homes its zoning reforms unlock, with every number sourced.

**What it does.** Enter any parcel ID or address (or click a lot on the map) and get a Development Ease Score (0-100) from a transparent rule engine: gates for outside-city, no-residential-potential and housing-not-permitted; then weighted sub-scores for zoning fit (lot size vs. district minimum under Bill 2025-1579, use table, historic and inclusionary overlays), environmental hazards (25%+ slope, landslide, undermined, flood), funding fit (infill/blight scoring, gap financing note), transit access and site & title. Each flag card explains the issue in plain language, links its data source and names who to confirm with (Zoning Board of Adjustment, geotechnical review under Code Ch. 915, PWSA availability letter). A Site X-ray map shows numbered pins where hazards overlap the lot. A Reform toggle re-scores the lot under the *proposed* Bill 2025-1545 (by-right ADUs, no parking minimums, affordable-housing bonus). A one-page site memo prints to PDF.

**Who it's for.** Small developers and CDCs (Lot Report, Compare), nonprofits, the Land Bank and URA (Opportunity Map of 13,211 vacant public lots with filters), and City Planning and Council (Reform Impact: 21,005 lots no longer need a lot-size variance since Bill 2025-1579; up to 118,800 could gain by-right ADUs if Bill 2025-1545 passes, by neighborhood). An Ask panel lets anyone query the engine in plain English.

**Data & AI integrity.** Scores come only from the deterministic engine; AI never sets a score. Every fact carries source, URL, retrieval date, confidence and review office; unknown data is shown as unverified and never counts as a pass. Owner names are dropped at ingest (only owner type is kept). AI explanations must cite engine fact IDs (a validator deletes any sentence that doesn't), and the Ask agent may only state numbers that appear in tool results. A validation backtest checks the score against later building permits using 2019-only inputs.

**What we'd build next.** A Zoning Board variance predictor from past decisions; setback and height checks; all 130 Allegheny County municipalities; PWSA capacity integration; live-refresh mode; verification of the use table against live code and the official zoning map.

**Limitations.** City of Pittsburgh only; setbacks, height, building code, historic-review outcomes and water/sewer capacity are not checked; the reform scenario models Bill 2025-1545 as proposed; public data is as-is and may be stale (snapshot 2026-09-26); the backtest reflects market demand as well as feasibility; liens and tax delinquency not included; the web snapshot covers all 142,365 City parcels as of 2026-09-26 (parcels created later are missing). Decision support only, not legal, financial, or zoning advice.

## Data sources used
City of Pittsburgh ArcGIS (ParcelsPublic, City Limits, Addresses, PGHWebSlope25, PGHWebLandslideProne, PGHWebUndermined, PGHWebFEMA2014, PGHWebCHDHistoricDistricts, InclusionaryHousingOverlayDistrict, PGHWebParkingReductionOverlay, PGHWebMajorTransitBuffer); WPRDC zoning districts; WPRDC/Allegheny County property assessments (current and Aug 2019); WPRDC PLI building permits (CC BY; Data Use Agreement); Pittsburgh Zoning Code §911.02 and §903.03; City Council files 2024-0701, 2025-1579 and 2025-1545 (Legistar). Full URLs and dates: `data/SOURCES.md`.

## AI tool disclosure
Claude Code (Anthropic) wrote most of the code during the event. The Claude API powers (a) plain-English flag explanations (validated, citation-only) and (b) the Ask agent's tool-use loop; both are optional and fall back to deterministic engine text. All code was written after Sat Sep 26, 2026 9 AM ET. No secrets are committed.

## Libraries
Next.js, React, Tailwind CSS, TypeScript, Turf.js, zod, MapLibre GL JS (CARTO Dark Matter basemap, © OpenStreetMap contributors), vitest, tsx; Python pandas, numpy, scikit-learn.
