/**
 * Reform Impact counts (npm run reform-impact).
 *  A. Residential parcels that FAIL the pre-Bill-2025-1579 minimum lot size but PASS the current one
 *     ("no longer needs a lot-size variance"). Pre-2025 minimums are used only here, never for scoring.
 *  B. Residential parcels gaining by-right ADU potential under the PROPOSED Bill 2025-1545.
 * Lot area = map polygon area; a stricter "both sources agree" count (polygon AND assessor area) is printed too.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEngineData, ParcelStore, ROOT } from '../lib/data/load';
import { CURRENT_LOT_MIN, PRE_2025_1579_LOT_MIN, landUseOf, parseZoning, stricter } from '../lib';

const store = new ParcelStore();
const data = loadEngineData();
const DENS = ['VL', 'L', 'M', 'H', 'VH'] as const;

const A = { total: 0, bothAgree: 0, vacant: 0, improved: 0, byDensity: {} as Record<string, number>, byDistrict: {} as Record<string, number>, resParcelsWithMin: 0 };
const B = { total: 0, residentialDistricts: 0, otherDistricts: 0, vacantLots: 0, existingDwellings: 0, excludingCondoMobile: 0, byDistrict: {} as Record<string, number>, residentialParcels: 0, unknownZoningResidential: 0 };
const CONDO = /CONDO|MOBILE HOME|COMMON AREA|HUD PROJ|METRO HOUSING|INDEPENDENT LIVING|GROUP HOME|RES AUX/;

for (const pin of store.pins()) {
  const p = store.byPin(pin)!;
  const lu = landUseOf(p);
  const residentialParcel = lu.residentialUse || lu.vacant === true; // dwelling use, residential class, or vacant land
  if (!residentialParcel) continue;
  const z = parseZoning(p.zoningDistrict, data.permittedUses);
  const alt = p.zoningParcelsPublic && p.zoningParcelsPublic !== p.zoningDistrict ? parseZoning(p.zoningParcelsPublic, data.permittedUses) : null;
  const housing = alt ? stricter(z.housing, alt.housing) : z.housing;

  // ---- A: old minimum failed, current minimum passed (residential-district parcels with a density suffix) ----
  if (z.residentialFamily && z.density && p.lotAreaSqft !== null && (lu.residentialUse || lu.vacant === true) && !alt) {
    A.resParcelsWithMin++;
    const oldMin = PRE_2025_1579_LOT_MIN[z.density], newMin = CURRENT_LOT_MIN[z.density];
    const fails = (area: number) => oldMin !== null && area < oldMin;
    const passes = (area: number) => newMin === null || area >= newMin;
    if (fails(p.lotAreaSqft) && passes(p.lotAreaSqft)) {
      A.total++;
      if (p.lotAreaAssessorSqft !== null && fails(p.lotAreaAssessorSqft) && passes(p.lotAreaAssessorSqft)) A.bothAgree++;
      if (lu.vacant) A.vacant++; else A.improved++;
      A.byDensity[z.density] = (A.byDensity[z.density] ?? 0) + 1;
      A.byDistrict[z.column!] = (A.byDistrict[z.column!] ?? 0) + 1;
    }
  }

  // ---- B: ADU by right under the reform (verified by-right housing district + residential use or vacant) ----
  if (housing === 'by_right') {
    B.total++;
    if (z.residentialFamily) B.residentialDistricts++; else B.otherDistricts++;
    if (lu.vacant) B.vacantLots++; else B.existingDwellings++;
    if (!CONDO.test(p.useDesc ?? '') && !lu.vacant) B.excludingCondoMobile++;
    B.byDistrict[z.column ?? '?'] = (B.byDistrict[z.column ?? '?'] ?? 0) + 1;
  } else if (housing === 'unknown') B.unknownZoningResidential++;
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  note: 'Bill 2025-1545 is PROPOSED (Held In Council; public hearing 2026-09-23). Bill 2025-1579 is in effect. Pre-2025-1579 minimums are used only for count A.',
  preMinimums: PRE_2025_1579_LOT_MIN, currentMinimums: CURRENT_LOT_MIN,
  A_noLongerNeedsLotSizeVariance: A,
  B_gainByRightAduPotential: { ...B, caveat: 'Assumes no by-right ADU today (current §912.08 limits ADUs to an ADU overlay with owner-occupancy; that overlay is not in the public data), so this is an upper bound of parcels gaining.' },
};
fs.writeFileSync(path.join(ROOT, 'data/processed/reform-impact.json'), JSON.stringify(out, null, 2));

const n = (x: number) => x.toLocaleString('en-US');
console.log('REFORM IMPACT (City of Pittsburgh parcels)');
console.log('');
console.log(`A. Residential parcels that failed the OLD minimum lot size but pass the CURRENT one (Bill 2025-1579, in effect):`);
console.log(`     ${n(A.total)} parcels  (of ${n(A.resParcelsWithMin)} residential-district parcels with a lot minimum)`);
console.log(`     - where assessor lot area agrees: ${n(A.bothAgree)}`);
console.log(`     - vacant ${n(A.vacant)} / improved ${n(A.improved)}`);
console.log(`     - by density: ${DENS.map((d) => `${d} ${n(A.byDensity[d] ?? 0)}`).join(', ')}`);
console.log(`     (old minimums used: VL 8,000, L 5,000, M 3,200, H 1,800${''}; VH 1,200 from the bill's struck text)`);
console.log('');
console.log(`B. Residential parcels gaining by-right ADU potential under PROPOSED Bill 2025-1545 (≤2 ADUs, ≤1,000 sq ft, ≤30 ft, no owner-occupancy):`);
console.log(`     ${n(B.total)} parcels  (${n(B.residentialDistricts)} in R1D/R1A/R2/R3/RM, ${n(B.otherDistricts)} in other districts allowing housing by right)`);
console.log(`     - existing dwellings ${n(B.existingDwellings)} (excluding condo/mobile-home/HUD/etc.: ${n(B.excludingCondoMobile)}), vacant lots ${n(B.vacantLots)}`);
console.log(`     - upper bound: assumes no by-right ADU today. Residential parcels in unverified zoning districts (not counted): ${n(B.unknownZoningResidential)}`);
