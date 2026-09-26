import type { Geom } from './types';

export type UseCell = { code: string; status: string; citation: string };
export type PermittedUses = {
  _meta: { source: { primary: string; primaryUrl: string; retrievedAt: string; notVerifiedAgainst: string }; mapCodeToColumn: Record<string, string>; unverifiedDistricts: string[]; unverifiedReasons: Record<string, string> };
  districts: Record<string, { verified: boolean; housingSummary: 'by_right' | 'exception_only' | 'not_permitted'; uses: Record<string, UseCell> }>;
};

export const RESIDENTIAL_FAMILIES = ['R1D', 'R1A', 'R2', 'R3', 'RM'] as const;
export type Density = 'VL' | 'L' | 'M' | 'H' | 'VH';

export type ZoningInfo = {
  code: string | null; // map code, e.g. R1D-L
  column: string | null; // use-table column, e.g. R1D
  density: Density | null;
  residentialFamily: boolean;
  housing: 'by_right' | 'exception_only' | 'not_permitted' | 'unknown';
  citations: string[]; // use-table cells backing the housing result
  note: string | null;
};

export function parseZoning(code: string | null, pu: PermittedUses): ZoningInfo {
  if (!code) return { code, column: null, density: null, residentialFamily: false, housing: 'unknown', citations: [], note: 'no zoning district found for this parcel' };
  const m = /^(R1D|R1A|R2|R3|RM)-(VL|L|M|H|VH)$/.exec(code);
  const column = m ? m[1] : pu._meta.mapCodeToColumn[code] ?? (pu.districts[code] ? code : null);
  const density = (m ? (m[2] as Density) : null);
  const d = column ? pu.districts[column] : null;
  if (!d || !d.verified) {
    return { code, column, density, residentialFamily: false, housing: 'unknown', citations: [], note: pu._meta.unverifiedReasons[code] ?? 'district not in the verified use table' };
  }
  return {
    code, column, density, residentialFamily: (RESIDENTIAL_FAMILIES as readonly string[]).includes(column!),
    housing: d.housingSummary,
    citations: Object.values(d.uses).filter((u) => u.code).map((u) => u.citation),
    note: null,
  };
}

/** Least-permissive of two housing outcomes (used when two zoning sources disagree). */
export function stricter(a: ZoningInfo['housing'], b: ZoningInfo['housing']): ZoningInfo['housing'] {
  const rank = { by_right: 3, exception_only: 2, not_permitted: 1, unknown: 0 } as const;
  return rank[a] <= rank[b] ? a : b;
}

/** Lot minimums by density suffix, current (Bill 2025-1579, Passed Finally 5/6/2025, signed 5/7/2025; §903.03). null = no minimum. */
export const CURRENT_LOT_MIN: Record<Density, number | null> = { VL: 6000, L: 3000, M: 2400, H: 1200, VH: null };
/** Pre-2025-1579 minimums. ONLY for the reform-impact count, never scoring. VH from the bill's struck text. */
export const PRE_2025_1579_LOT_MIN: Record<Density, number | null> = { VL: 8000, L: 5000, M: 3200, H: 1800, VH: 1200 };
export type { Geom };
