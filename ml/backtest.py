"""Validation backtest, step B (required Step 1): build rate by score band.

Question: of the parcels that were vacant in Aug 2019, did higher-scoring ones get built (residential new-construction permit
after Sep 1 2019) more often? Features come from the 2019 snapshot (see scripts/backtest-features.ts), not today's data.
Writes ml/results.md and data/validation.json (read by the /impact page). Never fabricates: if the inputs are missing it exits.
"""
import json, math, sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "ml" / "data"
f = D / "features.csv"
c = D / "cohort_2019.csv"
if not f.exists() or not c.exists():
    sys.exit("missing ml/data/features.csv or cohort_2019.csv: run fetch_data.py, build_cohort.py and scripts/backtest-features.ts first")

feat = pd.read_csv(f, dtype={"pin": str, "gates": str})
coh = pd.read_csv(c, dtype={"parid": str})
summary = json.load(open(D / "cohort_summary.json"))
df = coh.merge(feat, left_on="parid", right_on="pin", how="left")
n_cohort, n_scored_rows = len(coh), int(df.pin.notna().sum())
df["gates"] = df.gates.fillna("")
has_score = df.score.notna()

def band(s):
    if pd.isna(s): return "no score (gate)"
    return "0-39" if s < 40 else "40-69" if s < 70 else "70+"
df["band"] = df.score.map(band)
df.loc[df.pin.isna(), "band"] = "not scorable (PIN retired)"

def wilson(k, n, z=1.96):
    if n == 0: return (0.0, 0.0)
    p = k / n; d = 1 + z * z / n
    m = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0, m - h), min(1, m + h))

order = ["0-39", "40-69", "70+", "no score (gate)", "not scorable (PIN retired)"]
bands = []
for b in order:
    g = df[df.band == b]
    if len(g) == 0: continue
    k, n = int(g.built_after.sum()), len(g)
    lo, hi = wilson(k, n)
    bands.append({"band": b, "n": n, "built": k, "rate": k / n, "ci95": [lo, hi]})

scored = df[has_score].copy()
# rank-based AUC of the raw score (no model training): P(score of a built lot > score of an unbuilt lot)
pos, neg = scored[scored.built_after == 1].score.values, scored[scored.built_after == 0].score.values
ranks = pd.Series(np.concatenate([pos, neg])).rank().values
auc = (ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))
overall = float(scored.built_after.mean())
by_band = {b["band"]: b for b in bands}
lift = (by_band["70+"]["rate"] / by_band["0-39"]["rate"]) if "70+" in by_band and "0-39" in by_band and by_band["0-39"]["rate"] > 0 else None
monotone = all(by_band[a]["rate"] <= by_band[b]["rate"] for a, b in [("0-39", "40-69"), ("40-69", "70+")] if a in by_band and b in by_band)

# sub-score view
subs = {}
for s in ["zoning", "environmental", "funding", "access", "site"]:
    x = scored[[s, "built_after"]].dropna()
    hi = x[x[s] >= x[s].median()]; lo_ = x[x[s] < x[s].median()]
    subs[s] = {"rate_above_median": float(hi.built_after.mean()), "rate_below_median": float(lo_.built_after.mean()), "n_above": int(len(hi)), "n_below": int(len(lo_))}

caveat = ("Past building reflects market demand as well as feasibility, so this tests the score rather than proving it. Features come from the Aug-2019 assessment snapshot; zoning, hazard, historic and transit-buffer geometry are today's "
          "(static geography; the transit buffer and inclusionary overlay were published after 2019); owner type is unknown for 2019, so Site & title credits vacancy only; the score applies today's rules to 2019 conditions.")
verdict = "rises with the score" if monotone else "does not rise cleanly with the score"
out = {
    "generatedAt": pd.Timestamp.today().strftime("%Y-%m-%d"),
    "summary": (f"Of {n_scored_rows:,} City of Pittsburgh parcels that were vacant in August 2019 and can be scored, {int(scored.built_after.sum())} later received a residential new-construction "
                f"building permit (issued Sep 2019 or later). The build rate {verdict}: " + "; ".join(f"{b['band']} {b['rate']*100:.2f}% ({b['built']}/{b['n']})" for b in bands[:3]) + "."),
    "bands": bands, "overallRate": overall, "rankAUCofScore": float(auc), "lift70plusVs0to39": lift, "monotone": bool(monotone),
    "subScoreSplits": subs, "cohort": {"vacant2019": n_cohort, "scored": n_scored_rows, "positives": int(df.built_after.sum()), "permitsPerYear": summary["permitsPerYear"]},
    "permitRule": "permit_type in {BUILDING, Building & Development Application}; work_type in {NEW CONSTRUCTION, New Construction}; Residential; status not Revoked/Expired/Stop Work; issue_date >= 2019-09-01",
    "step2": "not run: only %d positive examples (brief requires hundreds); a trained model would overfit" % int(df.built_after.sum()),
    "caveat": caveat,
}
(ROOT / "data").mkdir(exist_ok=True)
json.dump(out, open(ROOT / "data" / "validation.json", "w"), indent=1)

md = ["# Validation backtest: does the score track later building?", "",
      f"Generated {out['generatedAt']}. Reproduce: `python ml/fetch_data.py && python ml/build_cohort.py && npx tsx scripts/backtest-features.ts && python ml/backtest.py`.", "",
      "## Design", "- **Cohort:** City of Pittsburgh parcels vacant in the WPRDC Aug-2019 property-assessment snapshot (USEDESC contains VACANT, or BUILDERS LOT).",
      f"- **Label:** 1 if a residential new-construction building permit was issued on or after 2019-09-01 on that parcel. Rule: {out['permitRule']}.",
      f"- **Qualifying permits per year (all parcels):** {summary['permitsPerYear']} (total {summary['qualifyingPermits']}); 2019 is a partial year (from June).",
      "- **Features:** the engine's own inputs computed from the 2019 snapshot (vacancy, use/class, 2019 lot area and land value, 2019 neighborhood value cutoffs), plus static geography. Today's assessment data is not used because it leaks the answer.",
      "- **PII:** owner_name and contractor_name are never requested; only owner *type* exists in the product and it is unknown for 2019.", "",
      "## Result (Step 1)", f"- Cohort {n_cohort:,}; scored {n_scored_rows:,}; positives (all cohort) {int(df.built_after.sum())}; overall build rate among scored {overall*100:.2f}%.", "",
      "| Score band | Parcels | Later built | Build rate | 95% CI |", "|---|---|---|---|---|"]
for b in bands: md.append(f"| {b['band']} | {b['n']:,} | {b['built']} | {b['rate']*100:.2f}% | {b['ci95'][0]*100:.2f}%-{b['ci95'][1]*100:.2f}% |")
md += ["", f"- Rank AUC of the raw score (probability a built lot outscores an unbuilt lot; no model trained): **{auc:.3f}** (0.5 = no signal).",
       f"- Lift, 70+ vs 0-39: {('%.2fx' % lift) if lift else 'n/a'}; monotone across bands: {monotone}.", "", "### Sub-score splits (build rate above vs below the median sub-score)"]
for s, v in subs.items(): md.append(f"- {s}: {v['rate_above_median']*100:.2f}% vs {v['rate_below_median']*100:.2f}%")
md += ["", "## Step 2 (trained model)", f"Not run: {out['step2']}.", "", "## Caveats", caveat, "",
       "Other limits: parcels renumbered or merged after 2019 cannot be matched (shown as 'not scorable'); permits filed under new PINs are missed; a permit is not a finished building; the score is rule-based, so this is a check on the rules, not a fitted predictor."]
(ROOT / "ml" / "results.md").write_text("\n".join(md) + "\n")
print("\n".join(md))
