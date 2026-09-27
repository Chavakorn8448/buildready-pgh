import { describe, expect, it } from 'vitest';
import { byRightTypes, EMPTY_ASSUMPTIONS, feasibility, valuationOf } from '../lib/finance';
import { PRESETS } from '../lib/finance-config';
import { CONFIG } from '../lib/config';

describe('valuation', () => {
  it('reads assessed values and compares land $/sq ft with the neighborhood median', () => {
    const v = valuationOf({ assessment: { landValue: 174000, buildingValue: 466500, totalValue: 640500, saleDate: '2019-09-26', salePrice: 743000, saleDesc: 'CORP TRANSFER', taxYear: 2026, asOf: '2026-09-01' }, lotAreaSqft: 6804.3, neighborhood: 'Shadyside' }, { Shadyside: 39.94 });
    expect(v.total).toBe(640500);
    expect(Math.round(v.landPerSqft!)).toBe(26);
    expect(v.ratioToHood!).toBeCloseTo(26 / 39.94, 1);
    expect(v.sale!.marketLike).toBe(false); // CORP TRANSFER is not treated as a market sale
    expect(v.sale!.note).toMatch(/may not reflect market value/);
  });
  it('flags nominal-price transfers and handles missing assessments', () => {
    const v = valuationOf({ assessment: { landValue: 700, buildingValue: 0, totalValue: 700, saleDate: '2012-11-28', salePrice: 1, saleDesc: 'VALID SALE', taxYear: 2026, asOf: null }, lotAreaSqft: 4000, neighborhood: null }, {});
    expect(v.sale!.marketLike).toBe(false);
    expect(v.hoodMedianLandPerSqft).toBeNull();
    expect(valuationOf({ assessment: null, lotAreaSqft: 1, neighborhood: null }, {}).available).toBe(false);
  });
});

describe('feasibility calculator (user inputs only)', () => {
  it('reports what is missing instead of guessing', () => {
    const r = feasibility({ ...EMPTY_ASSUMPTIONS, landCost: 50000 });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('Construction cost');
  });
  it('rental mode: cost, supportable value, gap, and debt coverage', () => {
    const r = feasibility({ ...EMPTY_ASSUMPTIONS, mode: 'rent', landCost: 100000, units: 2, unitSqft: 1000, costPerSqft: 200, softPct: 10, rentPerUnitMonth: 1500, opexPct: 40, capRatePct: 6, loanPct: 70, ratePct: 6, termYears: 30 });
    expect(r.ok).toBe(true);
    expect(r.constructionCost).toBe(400000);
    expect(r.totalCost).toBe(100000 + 400000 + 40000);
    expect(r.noi).toBeCloseTo(1500 * 12 * 2 * 0.6, 5); // 21,600
    expect(r.supportableValue).toBeCloseTo(21600 / 0.06, 5); // 360,000
    expect(r.gap).toBeCloseTo(540000 - 360000, 5);
    expect(r.debt!.loan).toBeCloseTo(378000, 5);
    expect(r.debt!.dscr!).toBeGreaterThan(0.4);
    expect(r.debt!.meetsMin).toBeNull(); // no threshold configured by default
  });
  it('sale mode: negative gap means a cushion', () => {
    const r = feasibility({ ...EMPTY_ASSUMPTIONS, mode: 'sale', landCost: 50000, units: 1, unitSqft: 1200, costPerSqft: 150, softPct: 0, salePricePerUnit: 300000 });
    expect(r.totalCost).toBe(50000 + 180000);
    expect(r.gap).toBe(230000 - 300000);
  });
});

describe('presets and hints', () => {
  it('default preset equals the model weights; every preset sums to 100', () => {
    expect(PRESETS[0].weights).toEqual(CONFIG.weights);
    for (const p of PRESETS) expect(Object.values(p.weights).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('lists housing types allowed by right', () => {
    expect(byRightTypes({ single_unit_detached: { code: 'P' }, two_unit: { code: '' }, multi_unit: { code: 'A' }, single_unit_attached: { code: 'P/S' } })).toEqual(['single-unit detached', 'single-unit attached']);
  });
});
