# Validation backtest: does the score track later building?

Generated 2026-09-26. Reproduce: `python ml/fetch_data.py && python ml/build_cohort.py && npx tsx scripts/backtest-features.ts && python ml/backtest.py`.

## Design
- **Cohort:** City of Pittsburgh parcels vacant in the WPRDC Aug-2019 property-assessment snapshot (USEDESC contains VACANT, or BUILDERS LOT).
- **Label:** 1 if a residential new-construction building permit was issued on or after 2019-09-01 on that parcel. Rule: permit_type in {BUILDING, Building & Development Application}; work_type in {NEW CONSTRUCTION, New Construction}; Residential; status not Revoked/Expired/Stop Work; issue_date >= 2019-09-01.
- **Qualifying permits per year (all parcels):** {'2019': 13, '2020': 78, '2021': 95, '2022': 98, '2023': 82, '2024': 74, '2025': 57, '2026': 58} (total 555); 2019 is a partial year (from June).
- **Features:** the engine's own inputs computed from the 2019 snapshot (vacancy, use/class, 2019 lot area and land value, 2019 neighborhood value cutoffs), plus static geography. Today's assessment data is not used because it leaks the answer.
- **PII:** owner_name and contractor_name are never requested; only owner *type* exists in the product and it is unknown for 2019.

## Result (Step 1)
- Cohort 22,037; scored 21,408; positives (all cohort) 189; overall build rate among scored 0.89%.

| Score band | Parcels | Later built | Build rate | 95% CI |
|---|---|---|---|---|
| 40-69 | 13,023 | 66 | 0.51% | 0.40%-0.64% |
| 70+ | 8,325 | 123 | 1.48% | 1.24%-1.76% |
| no score (gate) | 60 | 0 | 0.00% | 0.00%-6.02% |
| not scorable (PIN retired) | 629 | 0 | 0.00% | 0.00%-0.61% |

- Rank AUC of the raw score (probability a built lot outscores an unbuilt lot; no model trained): **0.655** (0.5 = no signal).
- Lift, 70+ vs 40-69 (no 2019 parcel scored below 40, so the 0-39 band is empty): 2.92x; monotone across bands: True.

### By score quintile (equal-size groups)

| Quintile | Score range | Parcels | Later built | Build rate | 95% CI |
|---|---|---|---|---|---|
| Q1 (lowest) | 40-55 | 4,270 | 9 | 0.21% | 0.11%-0.40% |
| Q2 | 55-64 | 4,269 | 26 | 0.61% | 0.42%-0.89% |
| Q3 | 64-69 | 4,270 | 31 | 0.73% | 0.51%-1.03% |
| Q4 | 69-77 | 4,269 | 72 | 1.69% | 1.34%-2.12% |
| Q5 (highest) | 77-89 | 4,270 | 51 | 1.19% | 0.91%-1.57% |

### Sub-score splits (build rate above vs at/below the median sub-score)
- zoning: 1.42% above vs 0.38% at/below
- environmental: 1.42% above vs 0.52% at/below
- funding: 0.52% above vs 1.16% at/below
- access: 0.58% above vs 0.92% at/below
- site: no variation (constant sub-score in this cohort)

## Reading the result
- No 2019 parcel scored below 40 (owner type is unknown for 2019, so nothing hits a low cap), so the 0-39 band is empty; 70+ lots were built at 2.9x the rate of 40-69 lots.
- By quintile the build rate rises from 0.21% (lowest fifth) to 1.69% and 1.19% (top two fifths), but it is not strictly monotone at the top.
- Zoning fit and Environmental separate built from unbuilt lots in the expected direction. Funding fit and Transit access point the other way (lots in higher-value or less transit-served areas were built more often), consistent with the market-demand effect the caveat describes; we report it rather than tune the weights to the backtest.

## Step 2 (trained model)
Not run: only 189 positive examples (the brief requires hundreds), so a trained model would overfit.

## Caveats
Past building reflects market demand as well as feasibility, so this tests the score rather than proving it. Features come from the Aug-2019 assessment snapshot; zoning, hazard, historic and transit-buffer geometry are today's (static geography; the transit buffer and inclusionary overlay were published after 2019); owner type is unknown for 2019, so Site & title credits vacancy only; the score applies today's rules to 2019 conditions.

Other limits: parcels renumbered or merged after 2019 cannot be matched (shown as 'not scorable'); permits filed under new PINs are missed; a permit is not a finished building; the score is rule-based, so this is a check on the rules, not a fitted predictor.
