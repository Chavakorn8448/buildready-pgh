/** Classifies assessor use/class text into what the engine needs. Pure. */
const RESIDENTIAL_USE = /(FAMILY|ROWHOUSE|TOWNHOUSE|CONDOMINIUM$|CONDOMINIUM UNIT|APART|APRTM|MOBILE HOME|^DWG|HUD PROJ|METRO HOUSING|INDEPENDENT LIVING|GROUP HOME|RES AUX|BUILDERS LOT|COMMON AREA|RETL\/APT|OFFICE\/APARTMENTS)/;

export function isResidentialUse(useDesc: string | null): boolean {
  return !!useDesc && RESIDENTIAL_USE.test(useDesc);
}

export type LandUse = { residentialUse: boolean; vacant: boolean | null; known: boolean };

export function landUseOf(p: { useDesc: string | null; classDesc: string | null; vacant: boolean | null }): LandUse {
  return {
    residentialUse: isResidentialUse(p.useDesc) || p.classDesc === 'RESIDENTIAL',
    vacant: p.vacant,
    known: !!(p.useDesc || p.classDesc) && p.vacant !== null,
  };
}
