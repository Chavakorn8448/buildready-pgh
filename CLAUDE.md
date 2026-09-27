@AGENTS.md

# BuildReady PGH: guidance for Claude Code

Decision-support tool for City of Pittsburgh housing development (AI for Housing Hackathon, Track 1). Read `STATUS.md` first: it is the build log, lists every modeling decision, what is unverified, and what is still open. `README.md` has the overview; `DEMO_SCRIPT.md` and `SUBMISSION.md` are the hackathon deliverables.

## Non-negotiable rules
- **Never invent or synthesize data.** Missing or unverifiable data is confidence `unknown`, shown as "Unverified", and never counts as a pass.
- **The engine sets every score and fact; AI only explains.** `lib/` is pure, deterministic TypeScript with no LLM. Do not change scoring logic without logging why in `STATUS.md`; keep `tests/golden.test.ts` passing.
- **No PII.** Owner names are never fetched or stored, only owner *type* (City, County, HACP, URA, Private, Other). `npm run check-pii` must pass. The permits/assessment loaders request only non-name fields.
- **No secrets in git.** `.env*` is gitignored; use `env.example` as the template. `ANTHROPIC_API_KEY` is optional, and every AI feature must have a working non-AI fallback.
- **Label proposed law as proposed.** Bill 2025-1579 (lot minimums) is in effect; Bill 2025-1545 (ADUs, no parking minimums, affordable housing bonus) is PROPOSED and must always say so.
- Everything is decision support only: never present output as legal, financial, or zoning advice, and keep the disclaimer and "Confirm with: <office>" on user-facing results.
- Next.js here is v16 with breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`).

## Commands
```bash
npm run fetch          # download raw data (gitignored, ~550 MB). Do not run preprocess while it is still running.
npm run preprocess     # reproject to WGS84, drop owner names, joins -> data/processed
npm run precompute     # score all 142k parcels (~100 min, 8 workers) -> data/scores (committed as .json.gz)
npm run build-adjacency  # neighbors for the assemblage finder -> data/scores/adjacency.json.gz + opportunity.json
npm run build-layers   # simplified map layers -> public/layers
npm run dev | build | start
npm test               # vitest: engine, golden parcels, AI validator, finance, assemblage, locate, summary
npm run typecheck && npm run lint
npm run score <parcelId|"address"> [-- --reform] [--json]   # CLI, works for any city parcel
npm run reform-impact  # Reform Impact counts
npm run ai-explain -- --limit=50   # needs ANTHROPIC_API_KEY; writes data/ai-cache
npm run ask-cache      # regenerate cached Ask answers (engine-only router without a key)
python ml/fetch_data.py && python ml/build_cohort.py && npx tsx scripts/backtest-features.ts && python ml/backtest.py   # validation backtest
```

## Architecture
- `lib/` engine: `score.ts` (gates G1-G3 -> five weighted sub-scores -> flags/facts), `rules/current.ts` and `rules/reform-2025-1545.ts` (same `Rule` interface), `hazards.ts` (Turf overlaps with map pins), `zoning.ts` + `data/rules/permitted-uses.json` (Zoning Code §911.02), `config.ts` (weights and every knob), `lookup.ts`.
- Extras that are *not* part of the score: `finance.ts` + `finance-config.ts` (assessed values, user-input calculator; expert-dependent settings live in the config), `assemblage.ts` + `adjacency.ts` (combine-with-adjacent-lot), `summary.ts` (plain-language bottom line), `agent/` (Ask tools), `ai/explain.ts` (validated AI explanations), `web/` (server data, client helpers).
- Data flow: `data/raw` (gitignored) -> `data/processed` -> `precompute` -> `data/scores` + `data/opportunity.json` + `data/reform-impact.json` -> web app reads precomputed JSON only (no live API). Packets store engine *inputs*, so the browser runs the same engine (reform toggle, weights).
- Web: Next.js App Router in `app/` and `components/`; MapLibre map (worker copied to `public/maplibre`, run `npm run sync-maplibre`); routes `/`, `/parcel/[id]`, `/parcel/[id]/memo`, `/compare`, `/map`, `/impact`, APIs `/api/search`, `/api/locate`, `/api/opportunity`, `/api/ask`.
- Deploy: Vercel (`vercel --prod`), `.vercelignore` keeps raw data out. Live: https://buildready-pgh.vercel.app. Repo: https://github.com/Chavakorn8448/buildready-pgh.

## Conventions
- Match surrounding style. Engine functions stay pure (no I/O); file access lives in `lib/data/load.ts` and `lib/web/server-data.ts`.
- Facts use `{id, label, value, source, sourceUrl, retrievedAt, confidence, reviewBy}`; cite semantic fact ids like `[zoning.district]`.
- Cross-source disagreement, split zoning, and lot-area conflicts are surfaced as flags, not silently resolved.
- Mobile and desktop must both work (test at 390 px and 1440 px); no horizontal overflow.
- Commit after each meaningful change, append what was built / decisions / unverified items to `STATUS.md`, and keep the README limitations accurate.

## Known open items (see STATUS.md)
Use table transcribed from a July 2024 print and not verified against the live code; Claude API features never run against a real key; waiting on expert input about "financial feasibility"; the validation backtest is modest (rank AUC 0.655) and reflects market demand as well as feasibility.
