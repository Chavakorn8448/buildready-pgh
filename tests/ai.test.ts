import { describe, expect, it } from 'vitest';
import { callClaude, validateExplanation, validateText, type EvidencePacket } from '../lib/ai/explain';

const packet: EvidencePacket = {
  parcel: { id: 'X', address: '1 TEST ST', neighborhood: 'Test', ruleSet: 'Current code', ruleSetStatus: 'in_effect', score: 60 },
  gates: [{ id: 'G3', triggered: true, message: 'capped', reviewBy: 'Zoning Board of Adjustment' }],
  subScores: null,
  facts: [{ id: 'zoning.district', label: 'z', value: 'HC', confidence: 'high', source: 's' }, { id: 'lot.area', label: 'a', value: 1000, confidence: 'high', source: 's' }],
  flags: [{ id: 'use-variance', text: 't', reviewBy: 'Zoning Board of Adjustment', factIds: ['zoning.district'], proposed: false }],
};

describe('AI explanation validator (test fixtures, no model call)', () => {
  it('keeps cited sentences and drops uncited or wrongly cited ones', () => {
    const ids = new Set(['zoning.district', 'lot.area']);
    const v = validateText('Housing is not allowed in HC [zoning.district]. This will surely be approved. It is 1,000 sq ft [lot.area, made.up]. Lot is small [lot.area].', ids);
    expect(v.kept).toBe('Housing is not allowed in HC [zoning.district]. Lot is small [lot.area].');
    expect(v.dropped).toBe(2);
  });
  it('drops unknown flag ids, ends next steps with the engine-provided review office', () => {
    const ex = validateExplanation({ flags: [{ id: 'use-variance', text: 'Needs a variance [zoning.district].' }, { id: 'bogus', text: 'x [lot.area].' }], nextSteps: ['Ask about rezoning [zoning.district].', 'No citation here.'] }, packet, 'test-model', '2026-09-26');
    expect(Object.keys(ex.flags)).toEqual(['use-variance']);
    expect(ex.nextSteps).toHaveLength(2);
    expect(ex.nextSteps[1]).toMatch(/^Confirm with: Zoning Board of Adjustment/);
    expect(ex.dropped).toBe(1);
  });
  it('handles a malformed model reply (not an array) without throwing', () => {
    const ex = validateExplanation({ flags: { 'use-variance': 'old-shape string, not an array' }, nextSteps: 'not an array either' }, packet, 'test-model', '2026-09-26');
    expect(ex.flags).toEqual({});
    expect(ex.nextSteps).toEqual([]);
  });
  it('callClaude parses JSON from the model reply (mock fetch) and requests the structured-output schema', async () => {
    let sentBody: any;
    const fake = (async (_url: string, init: any) => { sentBody = JSON.parse(init.body); return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ text: '{"flags":[],"nextSteps":[]}' }] }), { status: 200 }); }) as unknown as typeof fetch;
    const r = await callClaude(packet, { apiKey: 'test', fetchImpl: fake });
    expect(r.json).toEqual({ flags: [], nextSteps: [] });
    expect(sentBody.output_config.format).toEqual({ type: 'json_schema', schema: expect.objectContaining({ type: 'object' }) });
  });
  it('callClaude surfaces a max_tokens cutoff as an error instead of a bad parse', async () => {
    const fake = (async () => new Response(JSON.stringify({ stop_reason: 'max_tokens', usage: { output_tokens: 4096 }, content: [{ text: '{"flags":[' }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(callClaude(packet, { apiKey: 'test', fetchImpl: fake })).rejects.toThrow(/max_tokens/);
  });
});
