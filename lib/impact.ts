/** Reform Impact classification for one parcel (pure). Used by scripts/reform-impact.ts and scripts/precompute.ts. */
import { landUseOf } from './landuse';
import { CURRENT_LOT_MIN, PRE_2025_1579_LOT_MIN, parseZoning, stricter, type PermittedUses } from './zoning';
import type { ProcessedParcel } from './types';

const CONDO = /CONDO|MOBILE HOME|COMMON AREA|HUD PROJ|METRO HOUSING|INDEPENDENT LIVING|GROUP HOME|RES AUX/;

export type ImpactFlags = {
  residential: boolean; // dwelling use, residential class, or vacant land
  a: boolean; // failed the pre-Bill-2025-1579 minimum, passes the current one (by polygon area)
  aBoth: boolean; // ... and the assessor lot area agrees
  b: boolean; // by-right housing district + residential parcel => ADU by right under PROPOSED Bill 2025-1545 (upper bound)
  bExcludingCondo: boolean;
  inResidentialDistrict: boolean;
  unknownZoning: boolean;
  resWithLotMin: boolean;
  belowCurrentMin: boolean; // lot smaller than the CURRENT minimum
  vacant: boolean;
};

export function classifyImpact(p: ProcessedParcel, pu: PermittedUses): ImpactFlags {
  const lu = landUseOf(p);
  const f: ImpactFlags = { residential: lu.residentialUse || lu.vacant === true, a: false, aBoth: false, b: false, bExcludingCondo: false, inResidentialDistrict: false, unknownZoning: false, resWithLotMin: false, belowCurrentMin: false, vacant: lu.vacant === true };
  if (!f.residential) return f;
  const z = parseZoning(p.zoningDistrict, pu);
  const alt = p.zoningParcelsPublic && p.zoningParcelsPublic !== p.zoningDistrict ? parseZoning(p.zoningParcelsPublic, pu) : null;
  const housing = alt ? stricter(z.housing, alt.housing) : z.housing;
  f.inResidentialDistrict = z.residentialFamily;
  if (z.residentialFamily && z.density && p.lotAreaSqft !== null && !alt) {
    f.resWithLotMin = true;
    const oldMin = PRE_2025_1579_LOT_MIN[z.density], newMin = CURRENT_LOT_MIN[z.density];
    const fails = (a: number) => oldMin !== null && a < oldMin;
    const passes = (a: number) => newMin === null || a >= newMin;
    f.belowCurrentMin = newMin !== null && p.lotAreaSqft < newMin;
    if (fails(p.lotAreaSqft) && passes(p.lotAreaSqft)) {
      f.a = true;
      f.aBoth = p.lotAreaAssessorSqft !== null && fails(p.lotAreaAssessorSqft) && passes(p.lotAreaAssessorSqft);
    }
  }
  if (housing === 'by_right') { f.b = true; f.bExcludingCondo = !CONDO.test(p.useDesc ?? '') && !lu.vacant; }
  else if (housing === 'unknown') f.unknownZoning = true;
  return f;
}
