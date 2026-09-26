/**
 * Golden parcels: 5 real parcels picked from the data (see STATUS.md for why each was chosen).
 * Expected values are snapshots of the engine on data fetched 2026-09-26; they exist so a human can hand-check the
 * zoning district / hazard facts against the official zoning map, and so refactors don't silently change results.
 * Needs `npm run fetch && npm run preprocess` first (skipped otherwise).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { compareRuleSets, currentRules, FactSchema, reformRules, scoreParcel } from '../lib';
import { loadEngineData, ParcelStore, ROOT } from '../lib/data/load';

const have = fs.existsSync(path.join(ROOT, 'data/processed/parcels.ndjson'));
const d = describe.skipIf(!have);

d('golden parcels', () => {
  let store: ParcelStore;
  let data: ReturnType<typeof loadEngineData>;
  beforeAll(() => { store = new ParcelStore(); data = loadEngineData(); });
  const get = (pin: string) => store.lookup(pin).parcels[0];
  const fact = (r: ReturnType<typeof scoreParcel>, id: string) => r.facts.find((f) => f.id === id)!;

  it('1. vacant city-owned lot scores high (0 TIOGA ST, R1A-VH)', () => {
    const p = get('0174N00262000000');
    const r = scoreParcel(p, data, currentRules);
    expect(p.ownerType).toBe('City');
    expect(p.vacant).toBe(true);
    expect(fact(r, 'zoning.district').value).toBe('R1A-VH');
    expect(r.gates.filter((g) => g.triggered)).toEqual([]);
    expect(r.score).toBe(94);
    expect(r.subScores!.site.score).toBe(100);
    expect(r.subScores!.access.score).toBe(100); // inside major transit buffer
    expect(r.flags.map((f) => f.id)).toEqual(expect.arrayContaining(['phfa-infill', 'gap-financing', 'public-owner', 'water-sewer']));
  });

  it('2. lot with 25%+ slope and landslide overlap (1817 SAINT PATRICK ST, H district)', () => {
    const r = scoreParcel(get('0013E00051000000'), data, currentRules);
    expect(fact(r, 'zoning.district').value).toBe('H');
    expect(r.overlaps!.slope25.overlapFraction).toBeGreaterThan(0.9);
    expect(r.overlaps!.landslide.overlapFraction).toBeGreaterThan(0.9);
    expect(r.overlaps!.slope25.pin).toHaveLength(2);
    const slope = r.flags.find((f) => f.id === 'hazard-slope25')!;
    expect(slope.reviewBy).toBe('geotechnical review (Code Ch. 915)');
    expect(r.flags.find((f) => f.id === 'hazard-landslide')!.reviewBy).toBe('geotechnical review (Code Ch. 915)');
    expect(r.gates.find((g) => g.id === 'G3')).toMatchObject({ triggered: true, cap: 70 }); // Hillside: dwellings only by administrator exception
    expect(r.score).toBe(34);
  });

  it('3. lot smaller than its district minimum (7032 UPLAND ST, R2-L: 1,774 < 3,000 sq ft)', () => {
    const p = get('0173N00352000000');
    const r = scoreParcel(p, data, currentRules);
    expect(fact(r, 'zoning.district').value).toBe('R2-L');
    expect(p.lotAreaSqft!).toBeLessThan(3000);
    expect(p.lotAreaAssessorSqft!).toBeLessThan(3000);
    const rule = r.subScores!.zoning.rules!.find((x) => x.ruleId === 'ZONING-LOT-MIN')!;
    expect(rule.result).toBe('failed');
    const flag = r.flags.find((f) => f.id === 'lot-below-minimum')!;
    expect(flag.text).toMatch(/variance likely, or combine with adjacent lot/);
    expect(flag.reviewBy).toBe('Zoning Board of Adjustment');
    expect(r.score).toBe(58);
  });

  it('4. lot in a flood zone (0 BALDWIN RD, R2-L, vacant, FEMA SFHA)', () => {
    const r = scoreParcel(get('0135M00041000000'), data, currentRules);
    expect(fact(r, 'zoning.district').value).toBe('R2-L');
    expect(r.overlaps!.fema2014.overlapFraction).toBeGreaterThan(0.9);
    expect(r.overlaps!.fema2014.pin).toHaveLength(2);
    expect(r.flags.map((f) => f.id)).toContain('hazard-flood');
    expect(r.subScores!.environmental.score).toBeLessThan(100);
    expect(r.score).toBe(77);
  });

  it('5. lot where --reform changes the result (423 EDITH ST, R1A-H)', () => {
    const c = compareRuleSets(get('0006K00358000000'), data, currentRules, reformRules);
    expect(c.current.score).toBe(61);
    expect(c.reform.score).toBe(67);
    expect(c.delta).toBe(6);
    expect(c.flagsAdded.map((f) => f.id)).toContain('affordable-housing-bonus');
    expect(c.flagsChanged.map((f) => f.id).sort()).toEqual(['adu', 'parking-minimum']);
    expect(c.reform.ruleSet.status).toBe('proposed');
    expect(c.reform.flags.filter((f) => f.proposed).every((f) => /PROPOSED/.test(f.text))).toBe(true);
  });

  it('every fact is schema-valid, has a source URL, and unknown data is never "high"', () => {
    for (const pin of ['0174N00262000000', '0013E00051000000', '0173N00352000000', '0135M00041000000', '0006K00358000000']) {
      const r = scoreParcel(get(pin), data, currentRules);
      for (const f of r.facts) {
        expect(FactSchema.safeParse(f).success, f.id).toBe(true);
        expect(f.sourceUrl, f.id).toMatch(/^https?:\/\//);
        if (f.value === null) expect(f.confidence, f.id).toBe('unknown');
      }
      expect(r.flags.some((f) => f.id === 'water-sewer' && f.reviewBy === 'PWSA')).toBe(true);
    }
  });

  it('the two CLI examples resolve (PIN and address)', () => {
    expect(store.lookup('0175G00210000000').parcels[0].address).toBe('0 ROSEDALE ST');
    expect(store.lookup('0175-G-00210-0000-00').parcels[0].pin).toBe('0175G00210000000');
    const w = store.lookup('5925 Walnut St').parcels;
    expect(w).toHaveLength(1);
    expect(store.lookup('5925 WALNUT STREET').parcels[0].pin).toBe(w[0].pin);
  });

  it('gates: outside city -> no score; non-residential no-potential -> no score; unverified district capped', () => {
    const base = get('0174N00262000000');
    const g1 = scoreParcel({ ...base, inCityLimits: false }, data, currentRules); // test fixture: real parcel with the flag flipped
    expect(g1.score).toBeNull();
    expect(g1.gates.find((g) => g.id === 'G1')!.triggered).toBe(true);
    const g2 = scoreParcel({ ...base, vacant: false, useDesc: 'MUNICIPAL GOVERNMENT', classDesc: 'GOVERNMENT' }, data, currentRules);
    expect(g2.score).toBeNull();
    expect(g2.gates.find((g) => g.id === 'G2')!.triggered).toBe(true);
    const g3 = scoreParcel({ ...base, zoningDistrict: 'HC', zoningParcelsPublic: 'HC' }, data, currentRules);
    expect(g3.gates.find((g) => g.id === 'G3')).toMatchObject({ triggered: true, cap: 40 });
    expect(g3.score!).toBeLessThanOrEqual(40);
    expect(g3.flags.find((f) => f.id === 'use-variance')!.reviewBy).toBe('Zoning Board of Adjustment');
    const g3u = scoreParcel({ ...base, zoningDistrict: 'SP-5', zoningParcelsPublic: 'SP-5' }, data, currentRules);
    expect(g3u.score!).toBeLessThanOrEqual(40); // unverified district never passes
  });
});
