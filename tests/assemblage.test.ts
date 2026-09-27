import { describe, expect, it } from 'vitest';
import { sharedBoundaryMeters } from '../lib/adjacency';
import { assemblageOptions, minimumFor } from '../lib/assemblage';
import type { Geom } from '../lib/types';

// test fixtures: two 10 m x 20 m rectangles side by side near Pittsburgh, and one 50 m away
const M = (dx: number, dy: number) => [-79.98 + dx / (111320 * Math.cos((40.44 * Math.PI) / 180)), 40.44 + dy / 110540];
const rect = (x0: number, y0: number, w: number, h: number): Geom => ({ type: 'Polygon', coordinates: [[M(x0, y0), M(x0 + w, y0), M(x0 + w, y0 + h), M(x0, y0 + h), M(x0, y0)]] });

describe('shared boundary', () => {
  it('detects a shared 20 m edge and rejects a distant lot', () => {
    expect(sharedBoundaryMeters(rect(0, 0, 10, 20), rect(10, 0, 10, 20))).toBeGreaterThan(18);
    expect(sharedBoundaryMeters(rect(0, 0, 10, 20), rect(60, 0, 10, 20))).toBe(0);
  });
  it('a corner touch is not adjacency', () => {
    expect(sharedBoundaryMeters(rect(0, 0, 10, 20), rect(10, 20, 10, 20))).toBeLessThan(3);
  });
});

describe('assemblage options', () => {
  it('looks up minimums by density suffix', () => {
    expect(minimumFor('RM-M')).toBe(2400);
    expect(minimumFor('R1D-VH')).toBeNull();
    expect(minimumFor('LNC')).toBeUndefined();
  });
  it('finds the smallest passing combination and prefers public neighbors', () => {
    const r = assemblageOptions({ lot: 1200, zone: 'RM-M' }, [
      { pin: 'A', address: '1 A ST', owner: 'Private', vacant: false, lot: 1300, zone: 'RM-M' },
      { pin: 'B', address: '2 B ST', owner: 'City', vacant: true, lot: 1300, zone: 'RM-M' },
      { pin: 'C', address: '3 C ST', owner: 'URA', vacant: true, lot: 500, zone: 'RM-M' },
    ]);
    expect(r.minimum).toBe(2400); expect(r.alreadyMeets).toBe(false);
    expect(r.options[0]).toMatchObject({ pins: ['B'], combinedSqft: 2500, meetsMinimum: true, acquisition: 'public' });
    expect(r.options.every((o) => o.meetsMinimum)).toBe(true);
    expect(r.options.some((o) => o.pins.length === 1 && o.pins[0] === 'C')).toBe(false); // 1,700 sq ft alone does not pass
  });
  it('returns no options when no minimum is modeled', () => {
    expect(assemblageOptions({ lot: 900, zone: 'LNC' }, [{ pin: 'A', address: 'x', owner: null, vacant: true, lot: 900, zone: 'LNC' }]).options).toEqual([]);
  });
});

describe('assemblage guardrails', () => {
  it('drops combinations dominated by one huge lot', () => {
    const r = assemblageOptions({ lot: 1200, zone: 'RM-M' }, [{ pin: 'BIG', address: 'BIG', owner: 'Private', vacant: false, lot: 51910, zone: 'RM-M' }, { pin: 'S', address: 'S', owner: 'Private', vacant: false, lot: 1300, zone: 'RM-M' }]);
    expect(r.options.map((o) => o.pins.join('+'))).toEqual(['S']);
  });
});
