import { describe, expect, it } from 'vitest';
import { REFUSAL, ungroundedNumbers } from '../lib/agent/run';

describe('ungroundedNumbers (agent grounding guardrail)', () => {
  it('does not flag a number the user supplied in their own question (e.g. "score 70 or higher")', () => {
    expect(ungroundedNumbers('Lots scoring 70 or higher were found.', [{ total: 5 }], 'Which lots score 70 or higher?')).toEqual([]);
  });
  it('does not flag a number that only appears in a tool-call argument (e.g. a filter the model set)', () => {
    expect(ungroundedNumbers('Filtered to lots of at least 500 sq ft.', [{ ok: true }], 'find big lots', [{ min_lot_sqft: 500 }])).toEqual([]);
  });
  it('still flags a number that appears nowhere (question, args, or results)', () => {
    expect(ungroundedNumbers('There are 4,271 such lots.', [{ total: 12 }], 'how many lots?')).toEqual(['4,271']);
  });
  it('ignores citations, short numbers, and the bill/code numbers named in the system prompt', () => {
    expect(ungroundedNumbers('Per Bill 2025-1545 (Code Ch. 915), 8 lots qualify [reform.status].', [{ n: 8 }], '')).toEqual([]);
  });
});

describe('REFUSAL pattern (legal/financial/determination questions)', () => {
  it('catches common phrasings', () => {
    for (const q of ['Is it legal to build here?', 'Should I invest in this lot?', 'Will the board approve my variance?', 'Can you guarantee this will be approved?']) expect(REFUSAL.test(q)).toBe(true);
  });
  it('leaves ordinary questions alone', () => {
    for (const q of ['What is blocking this lot?', 'Top 3 vacant lots in Homewood', 'How many lots gain ADU potential?']) expect(REFUSAL.test(q)).toBe(false);
  });
});
