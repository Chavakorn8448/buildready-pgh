"""Fetch validation data (nothing here is committed: ml/data is gitignored).

1. WPRDC PLI permits (CC BY): owner_name and contractor_name are never requested (PII rule).
2. WPRDC property assessments, August 2019 snapshot (from 'Selected 2019 Property Assessments Files'):
   only non-owner columns are kept; filtered to City of Pittsburgh wards (MUNICODE 101-132).
"""
import io, json, sys, urllib.parse, urllib.request, zipfile
from pathlib import Path
import pandas as pd

DATA = Path(__file__).parent / "data"
DATA.mkdir(exist_ok=True)
API = "https://data.wprdc.org/api/3/action/datastore_search"
PERMITS = "f4d1177a-f597-4c32-8cbf-7885f56253f6"
PERMIT_FIELDS = ["permit_id", "permit_type", "work_type", "work_description", "commercial_or_residential", "total_project_value",
                 "issue_date", "parcel_num", "address", "latitude", "longitude", "neighborhood", "status"]  # no owner_name / contractor_name


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "buildready-pgh-validation"}), timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            print("retry", e, file=sys.stderr)


def fetch_permits():
    out, offset, total = [], 0, None
    while total is None or offset < total:
        q = urllib.parse.urlencode({"resource_id": PERMITS, "fields": ",".join(PERMIT_FIELDS), "limit": 30000, "offset": offset, "sort": "_id"})
        j = get(f"{API}?{q}")["result"]
        total = j["total"]
        out += j["records"]
        offset += 30000
        print(f"permits {len(out)}/{total}")
    df = pd.DataFrame(out)
    assert len(df) == total, "permit count mismatch"
    df.to_csv(DATA / "permits.csv", index=False)
    print("permits:", len(df), "rows; issue_date", df.issue_date.min(), "->", df.issue_date.max())


ASSESS_COLS = ["PARID", "MUNICODE", "NEIGHDESC", "TAXCODE", "TAXDESC", "OWNERDESC", "CLASSDESC", "USEDESC", "LOTAREA",
               "SALEDATE", "SALEPRICE", "COUNTYLAND", "COUNTYBUILDING", "COUNTYTOTAL", "FAIRMARKETLAND", "FAIRMARKETBUILDING", "FAIRMARKETTOTAL", "YEARBLT", "TAXYEAR"]


def fetch_assess():
    z = zipfile.ZipFile(DATA / "assess2019.zip")
    names = sorted(n for n in z.namelist() if n.lower().endswith(".csv"))
    print("zip members:", names)
    target = next(n for n in names if "2019-08" in n or "2019_08" in n or "08" in Path(n).stem)
    print("using", target)
    with z.open(target) as f:
        df = pd.read_csv(f, usecols=lambda c: c in ASSESS_COLS, dtype=str, encoding="latin-1")
    df["MUNICODE"] = pd.to_numeric(df["MUNICODE"], errors="coerce")
    df = df[(df.MUNICODE >= 101) & (df.MUNICODE <= 132)].copy()
    df["snapshot"] = Path(target).stem
    df.to_csv(DATA / "assess_2019.csv", index=False)
    print("assess 2019 (Pittsburgh):", len(df), "rows;", df.PARID.nunique(), "parcels")


if __name__ == "__main__":
    which = sys.argv[1:] or ["permits", "assess"]
    if "permits" in which:
        fetch_permits()
    if "assess" in which:
        fetch_assess()
