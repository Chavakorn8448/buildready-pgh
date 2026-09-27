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
low = "0-39" if "0-39" in by_band else "40-69"  # no 2019 parcel scored below 40 (owner type unknown, so nothing hits a low cap)
lift = (by_band["70+"]["rate"] / by_band[low]["rate"]) if "70+" in by_band and low in by_band and by_band[low]["rate"] > 0 else None
# score quintiles (data-driven view; ties broken by rank)
scored = df[has_score].copy()
scored["q"] = pd.qcut(scored.score.rank(method="first"), 5, labels=["Q1 (lowest)", "Q2", "Q3", "Q4", "Q5 (highest)"])
quint = []
for qn, g in scored.groupby("q", observed=True):
    k, n = int(g.built_after.sum()), len(g); lo, hi = wilson(k, n)
    quint.append({"quintile": str(qn), "scoreRange": [float(g.score.min()), float(g.score.max())], "n": n, "built": k, "rate": k / n, "ci95": [lo, hi]})
monotone = all(by_band[a]["rate"] <= by_band[b]["rate"] for a, b in [("0-39", "40-69"), ("40-69", "70+")] if a in by_band and b in by_band)

# sub-score view
subs = {}
for s_ in ["zoning", "environmental", "funding", "access", "site"]:
    x = scored[[s_, "built_after"]].dropna()
    med = x[s_].median()
    hi = x[x[s_] > med] if x[s_].nunique() > 2 and (x[s_] > med).any() else x[x[s_] >= med]
    lo_ = x[x[s_] <= med] if len(hi) and (x[s_] <= med).any() and x[s_].nunique() > 2 else x[x[s_] < med]
    subs[s_] = {"rate_above_median": float(hi.built_after.mean()) if len(hi) else None, "rate_at_or_below_median": float(lo_.built_after.mean()) if len(lo_) else None, "n_above": int(len(hi)), "n_below": int(len(lo_)), "note": "no variation (constant sub-score in this cohort)" if len(hi) == 0 or len(lo_) == 0 else ""}

caveat = ("Past building reflects market demand as well as feasibility, so this tests the score rather than proving it. Features come from the Aug-2019 assessment snapshot; zoning, hazard, historic and transit-buffer geometry are today's "
          "(static geography; the transit buffer and inclusionary overlay were published after 2019); owner type is unknown for 2019, so Site & title credits vacancy only; the score applies today's rules to 2019 conditions.")
verdict = "rises with the score" if monotone else "does not rise cleanly with the score"
out = {
    "generatedAt": pd.Timestamp.today().strftime("%Y-%m-%d"),
    "summary": (f"Of {n_scored_rows:,} City of Pittsburgh parcels that were vacant in August 2019 and can be scored, {int(scored.built_after.sum())} later received a residential new-construction "
                f"building permit (issued Sep 2019 or later). The build rate {verdict}: " + "; ".join(f"{b['band']} {b['rate']*100:.2f}% ({b['built']}/{b['n']})" for b in bands if b['band'] in ('0-39','40-69','70+')) + f". Ranking lots by score alone gives an AUC of {auc:.2f} (0.5 = chance)."),
    "bands": bands, "overallRate": overall, "rankAUCofScore": float(auc), "lift70plusVs0to39": lift, "monotone": bool(monotone),
    "subScoreSplits": subs, "quintiles": quint, "lowBandUsed": low, "cohort": {"vacant2019": n_cohort, "scored": n_scored_rows, "positives": int(df.built_after.sum()), "permitsPerYear": summary["permitsPerYear"]},
    "permitRule": "permit_type in {BUILDING, Building & Development Application}; work_type in {NEW CONSTRUCTION, New Construction}; Residential; status not Revoked/Expired/Stop Work; issue_date >= 2019-09-01",
    "step2": "only %d positive examples (the brief requires hundreds), so a trained model would overfit" % int(df.built_after.sum()),
    "caveat": caveat,
    "notes": [
        "No 2019 parcel scored below 40 (owner type is unknown for 2019, so nothing hits a low cap), so the 0-39 band is empty; 70+ lots were built at %.1fx the rate of 40-69 lots." % (lift or 0),
        "By quintile the build rate rises from %.2f%% (lowest fifth) to %.2f%% and %.2f%% (top two fifths), but it is not strictly monotone at the top." % (quint[0]["rate"]*100, quint[3]["rate"]*100, quint[4]["rate"]*100),
        "Zoning fit and Environmental separate built from unbuilt lots in the expected direction. Funding fit and Transit access point the other way (lots in higher-value or less transit-served areas were built more often), consistent with the market-demand effect the caveat describes; we report it rather than tune the weights to the backtest.",
    ],
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
       f"- Lift, 70+ vs {low} (no 2019 parcel scored below 40, so the 0-39 band is empty): {('%.2fx' % lift) if lift else 'n/a'}; monotone across bands: {monotone}.", "",
       "### By score quintile (equal-size groups)", "", "| Quintile | Score range | Parcels | Later built | Build rate | 95% CI |", "|---|---|---|---|---|---|"]
for q in quint: md.append(f"| {q['quintile']} | {q['scoreRange'][0]:.0f}-{q['scoreRange'][1]:.0f} | {q['n']:,} | {q['built']} | {q['rate']*100:.2f}% | {q['ci95'][0]*100:.2f}%-{q['ci95'][1]*100:.2f}% |")
md += ["", "### Sub-score splits (build rate above vs at/below the median sub-score)"]
for s_, v in subs.items(): md.append(f"- {s_}: " + (v['note'] if v['note'] else f"{v['rate_above_median']*100:.2f}% above vs {v['rate_at_or_below_median']*100:.2f}% at/below"))
md += ["", "## Reading the result"] + [f"- {n}" for n in out["notes"]]
md += ["", "## Step 2 (trained model)", f"Not run: {out['step2']}.", "", "## Caveats", caveat, "",
       "Other limits: parcels renumbered or merged after 2019 cannot be matched (shown as 'not scorable'); permits filed under new PINs are missed; a permit is not a finished building; the score is rule-based, so this is a check on the rules, not a fitted predictor."]
(ROOT / "ml" / "results.md").write_text("\n".join(md) + "\n")
print("\n".join(md))
