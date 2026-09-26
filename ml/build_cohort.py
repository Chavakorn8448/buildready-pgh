"""Build the backtest cohort and labels (no owner names anywhere).

Cohort  = City of Pittsburgh parcels that were VACANT in the Aug-2019 assessment snapshot.
Label   = 1 if the parcel later received a residential NEW-CONSTRUCTION building permit issued on/after 2019-09-01
          (the snapshot is Aug 2019, so this is strictly after it).
Permit rule (documented in ml/results.md):
  permit_type in {BUILDING, Building & Development Application}   (the type was renamed in June 2024; both included)
  work_type   in {NEW CONSTRUCTION, New Construction}
  commercial_or_residential == Residential
  status not in {Revoked, Expired, Stop Work}                     (cancelled/void/never-built are excluded)
"""
import json
from pathlib import Path
import pandas as pd

D = Path(__file__).parent / "data"
SNAPSHOT_END = "2019-09-01"
VACANT_USE = lambda s: isinstance(s, str) and ("VACANT" in s or s == "BUILDERS LOT")  # noqa: E731

a = pd.read_csv(D / "assess_2019.csv", dtype=str)
for c in ["LOTAREA", "FAIRMARKETLAND", "FAIRMARKETBUILDING", "FAIRMARKETTOTAL", "COUNTYLAND", "SALEPRICE"]:
    a[c] = pd.to_numeric(a[c], errors="coerce")
a["vacant_2019"] = a.USEDESC.map(VACANT_USE)
print("2019 parcels:", len(a), "vacant:", int(a.vacant_2019.sum()))

p = pd.read_csv(D / "permits.csv", dtype=str)
p["issue_date"] = pd.to_datetime(p.issue_date, errors="coerce")
ok = (
    p.permit_type.isin(["BUILDING", "Building & Development Application"])
    & p.work_type.isin(["NEW CONSTRUCTION", "New Construction"])
    & (p.commercial_or_residential == "Residential")
    & ~p.status.isin(["Revoked", "Expired", "Stop Work"])
)
q = p[ok].copy()
per_year = q.groupby(q.issue_date.dt.year).size().to_dict()
print("qualifying permits per year:", per_year, "total", len(q))
after = q[q.issue_date >= SNAPSHOT_END]
first = after.groupby("parcel_num").agg(first_issue=("issue_date", "min"), permits=("permit_id", "nunique"), value=("total_project_value", lambda s: pd.to_numeric(s, errors="coerce").sum())).reset_index()

cohort = a[a.vacant_2019].merge(first, left_on="PARID", right_on="parcel_num", how="left")
cohort["built_after"] = cohort.permits.notna().astype(int)
out = cohort[["PARID", "USEDESC", "CLASSDESC", "LOTAREA", "FAIRMARKETLAND", "FAIRMARKETTOTAL", "TAXDESC", "OWNERDESC", "NEIGHDESC", "built_after", "first_issue", "permits"]].rename(columns=str.lower)
out.to_csv(D / "cohort_2019.csv", index=False)
print("cohort:", len(out), "positives:", int(out.built_after.sum()))
# permits on parcels that were NOT vacant in 2019 (context only)
nv = after[~after.parcel_num.isin(a[a.vacant_2019].PARID)]
print("new-construction permits after snapshot on parcels not vacant in 2019 (demolition/teardown rebuilds, other):", nv.parcel_num.nunique())
missing = set(after.parcel_num) - set(a.PARID)
print("permit parcels not in 2019 file (parcels created/renumbered later):", len(missing))

# compact 2019 assessment table for neighborhood value stats computed in TypeScript (no owner fields)
with open(D / "assess_2019_min.ndjson", "w") as f:
    for r in a.itertuples():
        f.write(json.dumps({"pin": r.PARID, "class": r.CLASSDESC, "use": r.USEDESC, "lot": None if pd.isna(r.LOTAREA) else r.LOTAREA, "land": None if pd.isna(r.FAIRMARKETLAND) else r.FAIRMARKETLAND, "vacant": bool(r.vacant_2019)}) + "\n")
json.dump({"permitsPerYear": {str(k): int(v) for k, v in per_year.items()}, "qualifyingPermits": int(len(q)), "cohort": int(len(out)), "positives": int(out.built_after.sum())}, open(D / "cohort_summary.json", "w"), indent=1)
