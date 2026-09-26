import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG, FactSchema, CURRENT_LOT_MIN, PRE_2025_1579_LOT_MIN, parseZoning, currentRules, reformRules, REFORM_STATUS } from '../lib';
import { normalizeAddress, parsePin, splitAddress } from '../lib/lookup';
import { ROOT } from '../lib/data/load';
import { scan } from '../scripts/check-pii';
import type { PermittedUses } from '../lib';

const puFile = path.join(ROOT, 'data/rules/permitted-uses.json');
const pu = JSON.parse(fs.readFileSync(puFile, 'utf8')) as PermittedUses;

describe('config', () => {
  it('weights match the brief and sum to 100', () => {
    expect(CONFIG.weights).toEqual({ zoning: 40, environmental: 20, funding: 15, access: 15, site: 10 });
    expect(Object.values(CONFIG.weights).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('zoning base points + reform bonus points = 100', () => {
    const base = Object.values(CONFIG.zoningPoints).reduce((a, b) => a + b, 0);
    const bonus = Object.values(CONFIG.reformBonusPoints).reduce((a, b) => a + b, 0);
    expect(base + bonus).toBe(100);
  });
});

describe('lot-size tables', () => {
  it('current minimums per Bill 2025-1579', () => expect(CURRENT_LOT_MIN).toEqual({ VL: 6000, L: 3000, M: 2400, H: 1200, VH: null }));
  it('pre-2025 minimums are separate (reform-impact only)', () => expect(PRE_2025_1579_LOT_MIN).toMatchObject({ VL: 8000, L: 5000, M: 3200, H: 1800 }));
});

describe('rule sets', () => {
  it('reform is labeled proposed and not enacted', () => {
    expect(reformRules.status).toBe('proposed');
    expect(REFORM_STATUS.enacted).toBe(false);
    expect(reformRules.statusNote).toMatch(/PROPOSED/);
    expect(currentRules.status).toBe('in_effect');
  });
});

describe('permitted-uses.json', () => {
  it('every entry cites §911.02', () => {
    for (const [d, v] of Object.entries(pu.districts)) for (const [t, u] of Object.entries(v.uses)) expect(u.citation, `${d}/${t}`).toMatch(/§911\.02/);
  });
  it('lists unverified districts and never marks them verified', () => {
    expect(pu._meta.unverifiedDistricts.length).toBeGreaterThan(0);
    for (const d of pu._meta.unverifiedDistricts) expect(pu.districts[d]).toBeUndefined();
  });
  it('key cells match the transcribed table', () => {
    expect(pu.districts.R1D.uses.single_unit_detached.code).toBe('P');
    expect(pu.districts.R1D.uses.multi_unit.code).toBe('');
    expect(pu.districts.RM.uses.multi_unit.code).toBe('P');
    expect(pu.districts.HC.housingSummary).toBe('not_permitted');
    expect(pu.districts.UC_E ?? pu.districts['UC-E']).toBeDefined();
  });
  it('parses zoning codes: density suffix, GT subdistricts, unverified districts', () => {
    expect(parseZoning('R1D-VL', pu)).toMatchObject({ column: 'R1D', density: 'VL', residentialFamily: true, housing: 'by_right' });
    expect(parseZoning('GT-C', pu)).toMatchObject({ column: 'GT', housing: 'by_right' });
    expect(parseZoning('SP-5', pu).housing).toBe('unknown');
    expect(parseZoning(null, pu).housing).toBe('unknown');
  });
});

describe('lookup', () => {
  it('parses PINs with or without dashes', () => {
    expect(parsePin('0175G00210000000')).toBe('0175G00210000000');
    expect(parsePin('0175-G-00210-0000-00')).toBe('0175G00210000000');
    expect(parsePin('0175g00210000000')).toBe('0175G00210000000');
    expect(parsePin('5925 Walnut St')).toBeNull();
  });
  it('tolerates St vs Street and case', () => {
    expect(normalizeAddress('5925', 'Walnut Street')).toBe(normalizeAddress('5925', 'WALNUT ST'));
    expect(normalizeAddress('100', 'Fifth Avenue')).toBe(normalizeAddress('100', '5th Ave'));
    expect(splitAddress('5925 Walnut St')).toEqual({ house: '5925', street: 'Walnut St' });
  });
});

describe('fact schema', () => {
  it('rejects unknown confidence values', () => {
    const f = { id: 'x', label: 'x', value: 1, source: 's', sourceUrl: 'u', retrievedAt: '2026-01-01', confidence: 'high', reviewBy: null };
    expect(FactSchema.safeParse(f).success).toBe(true);
    expect(FactSchema.safeParse({ ...f, confidence: 'certain' }).success).toBe(false);
  });
});

describe('PII', () => {
  const have = fs.existsSync(path.join(ROOT, 'data/processed/summary.json'));
  it.skipIf(!have)('no owner names / contractor / mailing address fields in data/raw or data/processed', () => {
    const { problems, files } = scan();
    expect(files).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
});

describe('lookup regression', () => {
  it('a 16-character address is not mistaken for a PIN', () => {
    expect(parsePin('5925 WALNUT STREET')).toBeNull();
    expect(parsePin('0024B00340000A00')).toBe('0024B00340000A00');
  });
});
