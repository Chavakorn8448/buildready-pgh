/** Pure financial-snapshot helpers. No invented numbers: valuation comes from the county assessment; the calculator uses only user inputs. */
import { AFFORDABILITY_RENT_SHARE, BEDROOMS_TO_HOUSEHOLD_SIZE, MARKET_LIKE_SALE_TYPES, THRESHOLDS } from './finance-config';
import type { ProcessedParcel } from './types';

export type Valuation = {
  available: boolean;
  land: number | null; building: number | null; total: number | null;
  landPerSqft: number | null; hoodMedianLandPerSqft: number | null; ratioToHood: number | null;
  taxYear: number | null; asOf: string | null;
  sale: { date: string; price: number | null; type: string | null; marketLike: boolean; note: string } | null;
};

export function valuationOf(p: Pick<ProcessedParcel, 'assessment' | 'lotAreaSqft' | 'neighborhood'>, hoodMedians: Record<string, number>): Valuation {
  const a = p.assessment;
  if (!a) return { available: false, land: null, building: null, total: null, landPerSqft: null, hoodMedianLandPerSqft: null, ratioToHood: null, taxYear: null, asOf: null, sale: null };
  const landPsf = a.landValue != null && p.lotAreaSqft && p.lotAreaSqft > 0 ? a.landValue / p.lotAreaSqft : null;
  const med = p.neighborhood ? hoodMedians[p.neighborhood] ?? null : null;
  let sale: Valuation['sale'] = null;
  if (a.saleDate) {
    const marketLike = !!a.saleDesc && MARKET_LIKE_SALE_TYPES.includes(a.saleDesc);
    const cheap = a.salePrice != null && a.salePrice <= 1000;
    sale = {
      date: a.saleDate, price: a.salePrice ?? null, type: a.saleDesc ?? null, marketLike: marketLike && !cheap,
      note: cheap ? 'Nominal price: likely a transfer, not a market sale.' : marketLike ? 'Recorded as a valid sale.' : `Sale type "${a.saleDesc ?? 'unknown'}": may not reflect market value.`,
    };
  }
  return {
    available: true, land: a.landValue ?? null, building: a.buildingValue ?? null, total: a.totalValue ?? null,
    landPerSqft: landPsf, hoodMedianLandPerSqft: med, ratioToHood: landPsf != null && med ? landPsf / med : null,
    taxYear: a.taxYear ?? null, asOf: a.asOf ?? null, sale,
  };
}

export type Assumptions = {
  mode: 'rent' | 'sale';
  landCost: number | null; units: number | null; unitSqft: number | null; costPerSqft: number | null; softPct: number | null;
  rentPerUnitMonth: number | null; opexPct: number | null; capRatePct: number | null; salePricePerUnit: number | null;
  loanPct: number | null; ratePct: number | null; termYears: number | null;
};
export const EMPTY_ASSUMPTIONS: Assumptions = { mode: 'rent', landCost: null, units: null, unitSqft: null, costPerSqft: null, softPct: null, rentPerUnitMonth: null, opexPct: null, capRatePct: null, salePricePerUnit: null, loanPct: null, ratePct: null, termYears: null };

export type FeasibilityResult = {
  ok: boolean;
  missing: string[];
  totalCost?: number; constructionCost?: number; softCost?: number; costPerUnit?: number; costPerSqft?: number;
  noi?: number; supportableValue?: number; grossRevenue?: number;
  gap?: number; // positive = cost exceeds what income or sales support (shortfall); negative = cushion
  gapPerUnit?: number;
  debt?: { loan: number; annualPayment: number; dscr: number | null; dscrMin: number | null; meetsMin: boolean | null };
};

const pos = (x: number | null): x is number => x != null && Number.isFinite(x) && x >= 0;

/** Deterministic arithmetic on the user's own inputs. Not a market estimate. */
export function feasibility(a: Assumptions): FeasibilityResult {
  const need: [keyof Assumptions, string][] = [['landCost', 'Land cost'], ['units', 'Homes planned'], ['unitSqft', 'Average home size'], ['costPerSqft', 'Construction cost']];
  if (a.mode === 'rent') need.push(['rentPerUnitMonth', 'Rent per home'], ['opexPct', 'Operating costs and vacancy'], ['capRatePct', 'Capitalization rate']);
  else need.push(['salePricePerUnit', 'Sale price per home']);
  const missing = need.filter(([k]) => !pos(a[k] as number | null)).map(([, l]) => l);
  if (a.mode === 'rent' && pos(a.capRatePct) && a.capRatePct === 0 && !missing.includes('Capitalization rate')) missing.push('Capitalization rate');
  if (missing.length) return { ok: false, missing };
  const units = a.units!, sqft = a.unitSqft!;
  const construction = units * sqft * a.costPerSqft!;
  const soft = construction * ((a.softPct ?? 0) / 100);
  const totalCost = a.landCost! + construction + soft;
  const out: FeasibilityResult = { ok: true, missing: [], totalCost, constructionCost: construction, softCost: soft, costPerUnit: totalCost / units, costPerSqft: totalCost / (units * sqft) };
  if (a.mode === 'rent') {
    const noi = a.rentPerUnitMonth! * 12 * units * (1 - a.opexPct! / 100);
    const value = noi / (a.capRatePct! / 100);
    out.noi = noi; out.supportableValue = value; out.gap = totalCost - value;
    if (pos(a.loanPct) && pos(a.ratePct) && pos(a.termYears) && a.termYears! > 0) {
      const loan = totalCost * (a.loanPct! / 100), r = a.ratePct! / 100 / 12, n = a.termYears! * 12;
      const monthly = r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
      const annual = monthly * 12;
      const dscr = annual > 0 ? noi / annual : null;
      out.debt = { loan, annualPayment: annual, dscr, dscrMin: THRESHOLDS.dscrMin, meetsMin: dscr !== null && THRESHOLDS.dscrMin !== null ? dscr >= THRESHOLDS.dscrMin : null };
    }
  } else {
    out.grossRevenue = units * a.salePricePerUnit!; out.gap = totalCost - out.grossRevenue;
  }
  out.gapPerUnit = out.gap! / units;
  return out;
}

/** Housing types the verified use table allows by right in the parcel's zoning column (for the "what can I build" hint). */
export function byRightTypes(uses: Record<string, { code: string }> | null | undefined): string[] {
  if (!uses) return [];
  const label: Record<string, string> = { single_unit_detached: 'single-unit detached', single_unit_attached: 'single-unit attached', two_unit: 'two-unit', three_unit: 'three-unit', multi_unit: 'multi-unit (4+)' };
  return Object.entries(uses).filter(([, u]) => u.code === 'P' || u.code === 'P/S').map(([k]) => label[k] ?? k);
}

export type AmiReference = { areaMedianIncome: number; areaName: string; byHouseholdSize: Record<string, { '50': number; '60': number }>; meta: Record<string, unknown> } | null;

export type AffordabilityRow = {
  bedrooms: '0BR' | '1BR' | '2BR' | '3BR' | '4BR';
  householdSize: number;
  monthlyRent: number;
  /** Annual gross household income needed so this rent is exactly 30% of income (HUD's cost-burden standard). */
  incomeNeeded: number;
  /** incomeNeeded as a percent of the area median income for a household of this size (100 = exactly the median). */
  percentOfAmi: number;
  /** Whether that income is at or below the standard 60% AMI ceiling commonly used to restrict LIHTC units. */
  atOrBelow60Ami: boolean;
  atOrBelow50Ami: boolean;
};

/**
 * What income a rent implies, and how that compares to the area's LIHTC-style income limits (50%/60% AMI).
 * This never changes the Development Ease Score; it answers a different question ("affordable to whom?"),
 * per HUD's standard 30%-of-income definition of affordable housing.
 */
export function affordabilityOf(monthlyRent: number, bedrooms: '0BR' | '1BR' | '2BR' | '3BR' | '4BR', ami: AmiReference): AffordabilityRow | null {
  if (!ami || !(monthlyRent > 0)) return null;
  const householdSize = BEDROOMS_TO_HOUSEHOLD_SIZE[bedrooms];
  const limits = ami.byHouseholdSize[String(householdSize)];
  if (!limits) return null;
  const incomeNeeded = Math.round((monthlyRent * 12) / AFFORDABILITY_RENT_SHARE);
  // AMI 100% for this household size scales from the 60% limit (60% limit / 0.6), consistent with how MTSP derives its columns
  const ami100 = limits['60'] / 0.6;
  return {
    bedrooms, householdSize, monthlyRent, incomeNeeded,
    percentOfAmi: Math.round((incomeNeeded / ami100) * 100),
    atOrBelow60Ami: incomeNeeded <= limits['60'],
    atOrBelow50Ami: incomeNeeded <= limits['50'],
  };
}
