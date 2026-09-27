import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getRow, locate } from '../lib/web/server-data';

const have = fs.existsSync('data/scores/index.json.gz');
describe.skipIf(!have)('click-to-select (locate)', () => {
  it('returns the parcel under a point (real records: 5815 5th Ave and 5925 Walnut St)', () => {
    for (const pin of ['0085B00078000000', '0084P00162000000']) {
      const row = getRow(pin)!;
      const r = locate(row.lon, row.lat);
      expect(r.found && r.row.pin).toBe(pin);
    }
  });
  it('a point with no parcel (street/water gap) or outside the city is not a parcel', () => {
    expect(locate(-80.02, 40.426).found).toBe(false); // snapshot check: no parcel polygon at this point (river/street area west of Mt. Washington)
    expect(locate(-75.0, 40.0)).toMatchObject({ found: false, reason: expect.stringMatching(/outside/) });
  });
});
