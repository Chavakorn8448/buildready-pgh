import { describe, expect, it } from 'vitest';
import { affordabilityOf, byRightTypes, EMPTY_ASSUMPTIONS, feasibility, valuationOf } from '../lib/finance';
import { PRESETS, THRESHOLDS } from '../lib/finance-config';
import { CONFIG } from '../lib/config';
import { getPermitReference, getRentReference } from '../lib/web/server-data';
import fs from 'node:fs';

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
    expect(r.debt!.meetsMin).toBe(false); // dscr ~0.44 is below the configured 1.2 rule-of-thumb threshold
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

describe('financial reference data (real, sourced; only used as suggestions)', () => {
  const have = fs.existsSync('data/rules/safmr-pittsburgh.json') && fs.existsSync('data/rules/permit-reference.json') && fs.existsSync('data/rules/parcel-zip.json.gz');
  it.skipIf(!have)('resolves HUD rent and permit context for a known parcel', () => {
    const rent = getRentReference('0084P00162000000'); // 5925 Walnut St, Shadyside
    expect(rent).not.toBeNull();
    expect(rent!.zip).toBe('15232');
    expect(rent!.byBedroom['2BR']).toBeGreaterThan(0);
    const permit = getPermitReference('Shadyside');
    expect(permit).not.toBeNull();
    expect(permit!.count).toBeGreaterThan(0);
    expect(permit!.median).toBeGreaterThan(5000); // the $5,000 floor excludes implausible low values
  });
  it.skipIf(!have)('the DSCR threshold is a labeled rule of thumb, not silently applied', () => {
    expect(THRESHOLDS.dscrMin).toBe(1.2);
    expect(THRESHOLDS.dscrLabel.toLowerCase()).toMatch(/rule of thumb/);
  });
});

describe('affordability check (AMI, informational only — never touches the score)', () => {
  const ami = {
    areaMedianIncome: 110400, areaName: 'Pittsburgh, PA HUD Metro FMR Area', meta: { sourceUrl: 'https://www.huduser.gov/portal/datasets/mtsp/mtsp26/MTSP-Data-FY26.xlsx' },
    byHouseholdSize: { '1': { '50': 38650, '60': 46380 }, '2': { '50': 44200, '60': 53040 }, '3': { '50': 49700, '60': 59640 } },
  };
  it('converts a monthly rent into the required income and its share of AMI', () => {
    const r = affordabilityOf(1200, '1BR', ami);
    expect(r).not.toBeNull();
    expect(r!.householdSize).toBe(2); // HUD "bedrooms + 1" convention
    expect(r!.incomeNeeded).toBe(Math.round((1200 * 12) / 0.3));
    expect(r!.atOrBelow60Ami).toBe(r!.incomeNeeded <= 53040);
    expect(r!.atOrBelow50Ami).toBe(r!.incomeNeeded <= 44200);
  });
  it('a high rent exceeds both AMI tiers; a low rent qualifies for both', () => {
    expect(affordabilityOf(3000, '2BR', ami)).toMatchObject({ atOrBelow50Ami: false, atOrBelow60Ami: false });
    expect(affordabilityOf(900, '2BR', ami)).toMatchObject({ atOrBelow50Ami: true, atOrBelow60Ami: true });
  });
  it('returns null without data, never invents a number', () => {
    expect(affordabilityOf(1200, '1BR', null)).toBeNull();
    expect(affordabilityOf(0, '1BR', ami)).toBeNull();
  });
});
