/**
 * "Combine with adjacent lot": which neighboring lots would lift a small lot over its district's minimum lot size?
 * Pure arithmetic on real lot areas. Only the lot-size rule is tested (setbacks, height, ownership and price are not).
 */
import { CURRENT_LOT_MIN, type Density } from './zoning';

export type Neighbor = { pin: string; address: string; owner: string | null; vacant: boolean | null; lot: number | null; zone: string | null; sharedMeters?: number };
export type Option = {
  pins: string[]; label: string; combinedSqft: number; meetsMinimum: boolean | null;
  acquisition: 'public' | 'vacant private' | 'private';
  sameZoning: boolean;
};

const PUBLIC = new Set(['City', 'URA', 'HACP', 'County']);
const acq = (n: Neighbor): Option['acquisition'] => (n.owner && PUBLIC.has(n.owner) ? 'public' : n.vacant ? 'vacant private' : 'private');
const rank: Record<Option['acquisition'], number> = { public: 0, 'vacant private': 1, private: 2 };

/** minimum lot size for a district code like R1D-L, or undefined when no minimum is modeled for it. null = no minimum. */
export function minimumFor(zone: string | null): number | null | undefined {
  const m = zone ? /^(?:R1D|R1A|R2|R3|RM)-(VL|L|M|H|VH)$/.exec(zone) : null;
  return m ? CURRENT_LOT_MIN[m[1] as Density] : undefined;
}

export function assemblageOptions(self: { lot: number | null; zone: string | null }, neighbors: Neighbor[], maxOptions = 4): { minimum: number | null | undefined; alreadyMeets: boolean | null; options: Option[] } {
  const minimum = minimumFor(self.zone);
  const usable = neighbors.filter((n) => n.lot != null && n.lot > 0);
  const alreadyMeets = self.lot == null || minimum === undefined ? null : minimum === null ? true : self.lot >= minimum;
  if (self.lot == null || minimum === undefined) return { minimum, alreadyMeets, options: [] };
  const opts: Option[] = [];
  const mk = (ns: Neighbor[]): Option => {
    const total = self.lot! + ns.reduce((s, n) => s + n.lot!, 0);
    const worst = ns.map(acq).sort((a, b) => rank[b] - rank[a])[0];
    return { pins: ns.map((n) => n.pin), label: ns.map((n) => n.address || n.pin).join(' + '), combinedSqft: Math.round(total), meetsMinimum: minimum === null ? true : total >= minimum, acquisition: worst, sameZoning: ns.every((n) => n.zone === self.zone) };
  };
  for (let i = 0; i < usable.length; i++) {
    opts.push(mk([usable[i]]));
    for (let j = i + 1; j < usable.length; j++) opts.push(mk([usable[i], usable[j]]));
  }
  // prefer options that pass, then fewer lots, then easier acquisition, then closer to the minimum (least land taken)
  // ignore combinations dominated by one huge lot (not a realistic assemblage): cap at 5x the minimum (or 10,000 sq ft)
  const cap = Math.max(10000, (minimum ?? 0) * 5);
  const passing = opts.filter((o) => o.meetsMinimum && o.combinedSqft <= cap);
  passing.sort((a, b) => a.pins.length - b.pins.length || rank[a.acquisition] - rank[b.acquisition] || Number(b.sameZoning) - Number(a.sameZoning) || a.combinedSqft - b.combinedSqft);
  return { minimum, alreadyMeets, options: (alreadyMeets ? opts.sort((a, b) => a.pins.length - b.pins.length || rank[a.acquisition] - rank[b.acquisition]) : passing).slice(0, maxOptions) };
}
