/**
 * Real, sourced context for the "construction cost" field: recent Pittsburgh new-construction residential permits,
 * aggregated by neighborhood (median/min/max total_project_value, count). Never per-sq-ft (permits don't carry
 * square footage, so converting to $/sq ft would be inventing a number) — shown as reference only, not an autofill.
 * Owner/contractor names are never requested. Standalone (does not require the ml/ validation pipeline to have run).
 * Output: data/rules/permit-reference.json (small, committed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchJson } from './lib/http';
import { ROOT } from '../lib/data/load';

const RESOURCE = 'f4d1177a-f597-4c32-8cbf-7885f56253f6'; // WPRDC PLI Building Permits
const API = 'https://data.wprdc.org/api/3/action/datastore_search';
const FIELDS = ['permit_type', 'work_type', 'commercial_or_residential', 'total_project_value', 'issue_date', 'neighborhood', 'status']; // no owner_name / contractor_name
const NEW_CONSTRUCTION_WORK_TYPES = ['NEW CONSTRUCTION', 'New Construction'];
const EXCLUDE_STATUS = ['Revoked', 'Expired', 'Stop Work'];
const YEARS_BACK = 6;

async function main() {
  const limit = 30000;
  let offset = 0, total = 0;
  const rows: { value: number; year: number; neighborhood: string }[] = [];
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - YEARS_BACK);
  do {
    const q = new URLSearchParams({ resource_id: RESOURCE, fields: FIELDS.join(','), limit: String(limit), offset: String(offset), sort: '_id' });
    const j = await fetchJson<any>(`${API}?${q}`);
    total = j.result.total;
    for (const r of j.result.records) {
      if (!['BUILDING', 'Building & Development Application'].includes(r.permit_type)) continue;
      if (!NEW_CONSTRUCTION_WORK_TYPES.includes(r.work_type)) continue;
      if (r.commercial_or_residential !== 'Residential') continue;
      if (EXCLUDE_STATUS.includes(r.status)) continue;
      const v = Number(r.total_project_value);
      // a few records show $1-a few thousand for "NEW CONSTRUCTION" residential permits (likely fee placeholders or accessory
      // structures misfiled under this work type); WPRDC's SQL endpoint is blocked here so individual records can't be inspected,
      // so anything under $5,000 is excluded as implausible for new-home construction and this floor is disclosed in _meta.
      if (!Number.isFinite(v) || v < 5000) continue;
      const d = new Date(r.issue_date);
      if (Number.isNaN(d.getTime()) || d < cutoff) continue;
      rows.push({ value: v, year: d.getFullYear(), neighborhood: r.neighborhood || 'Unknown' });
    }
    offset += limit;
    console.log(`  ${Math.min(offset, total)}/${total}`);
  } while (offset < total);
  console.log(`qualifying residential new-construction permits, last ${YEARS_BACK} years: ${rows.length}`);

  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const byHood = new Map<string, number[]>();
  for (const r of rows) (byHood.get(r.neighborhood) ?? byHood.set(r.neighborhood, []).get(r.neighborhood)!).push(r.value);
  const hoods: Record<string, { count: number; median: number; min: number; max: number }> = {};
  for (const [h, vs] of byHood) if (vs.length >= 3) hoods[h] = { count: vs.length, median: Math.round(median(vs)), min: Math.round(Math.min(...vs)), max: Math.round(Math.max(...vs)) };
  const allVals = rows.map((r) => r.value);
  const out = {
    _meta: {
      description: 'Recent residential new-construction building permits by neighborhood, for context on the calculator\'s construction-cost field. total_project_value is the permit applicant\'s declared project cost (often construction cost only; may exclude land, soft costs, or be understated) and permits do not record square footage, so this is NOT converted to a $/sq ft figure — that would require guessing a size.',
      source: 'WPRDC PLI Building Permits (City of Pittsburgh Dept. of Permits, Licenses and Inspections)', sourceUrl: 'https://data.wprdc.org/dataset/building-permits', license: 'CC BY',
      filter: `permit_type in {BUILDING, Building & Development Application} (same rule as the ml/ validation backtest); work_type NEW CONSTRUCTION; Residential; status not Revoked/Expired/Stop Work; issued in the last ${YEARS_BACK} years; declared project value >= $5,000 (excludes implausible low values for new-home construction; not individually verified, WPRDC's SQL endpoint returned 403 here)`,
      retrievedAt: new Date().toISOString().slice(0, 10), qualifyingPermits: rows.length,
    },
    citywide: allVals.length ? { count: allVals.length, median: Math.round(median(allVals)), min: Math.round(Math.min(...allVals)), max: Math.round(Math.max(...allVals)) } : null,
    byNeighborhood: hoods,
  };
  fs.writeFileSync(path.join(ROOT, 'data/rules/permit-reference.json'), JSON.stringify(out, null, 1));
  console.log(`wrote data/rules/permit-reference.json: ${Object.keys(hoods).length} neighborhoods with >=3 permits`);
}
main().catch((e) => { console.error(e); process.exit(1); });
