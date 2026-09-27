import { describe, expect, it } from 'vitest';
import { summarize } from '../lib/summary';
import type { ScoreResult } from '../lib/score';

const base = (over: Partial<ScoreResult>): ScoreResult => ({ parcelId: 'X', address: '1 TEST ST', neighborhood: 'T', ruleSet: { id: 'current', label: 'Current', status: 'in_effect', statusNote: '' }, score: 80, uncappedScore: 80, gates: [], subScores: null, flags: [], facts: [], overlaps: null, ...over } as ScoreResult);
const flag = (id: string, text = 't', reviewBy: string | null = null) => ({ id, text, severity: 'warn' as const, reviewBy, factIds: [] });

describe('bottom-line summary (test fixtures)', () => {
  it('strong: no barriers, favorable flags listed, PWSA + zoning steps always present', () => {
    const s = summarize(base({ flags: [flag('public-owner', 'x', 'City property-disposition process')] }), { byRight: true });
    expect(s.verdict).toBe('strong');
    expect(s.inFavor.map((x) => x.id)).toContain('public-owner');
    expect(s.nextSteps[0].who).toBe('City Zoning Administrator');
    expect(s.nextSteps.at(-1)!.who).toBe('PWSA');
  });
  it('capped by G3: hard, barrier first, ZBA step', () => {
    const s = summarize(base({ score: 34, uncappedScore: 60, gates: [{ id: 'G3', name: 'n', triggered: true, effect: 'cap', cap: 40, message: 'Housing not permitted in HC: use variance or rezoning needed; score capped at 40.', reviewBy: 'Zoning Board of Adjustment' }], flags: [flag('use-variance'), flag('hazard-slope25', 'Slope 25%+ covers 28% of the parcel (pin 40.1, -79.9).')] }));
    expect(s.verdict).toBe('hard');
    expect(s.barriers[0].id).toBe('use-variance');
    expect(s.nextSteps.some((x) => x.who === 'Zoning Board of Adjustment')).toBe(true);
    expect(s.barriers.find((b) => b.id === 'hazard-slope25')!.text).not.toMatch(/pin/);
  });
  it('no score explains why', () => {
    const s = summarize(base({ score: null, gates: [{ id: 'G1', name: 'n', triggered: true, effect: 'no_score', message: 'Parcel is outside City of Pittsburgh limits: no score — check municipal code.', reviewBy: 'x' }] }));
    expect(s.verdict).toBe('no-score');
  });
});
