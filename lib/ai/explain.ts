/**
 * Phase 8: AI explanations. The engine produces every score and fact; the model only rewrites flags in plain English.
 * Guardrails: evidence packet in, JSON out, a validator drops any sentence that lacks a valid [fact-id] citation,
 * and the UI falls back to the engine's own flag text when no valid explanation is cached.
 */
import type { ScoreResult } from '../score';

export type EvidencePacket = {
  parcel: { id: string; address: string; neighborhood: string | null; ruleSet: string; ruleSetStatus: string; score: number | null };
  gates: { id: string; triggered: boolean; message: string; reviewBy: string | null }[];
  subScores: Record<string, { score: number; weight: number }> | null;
  facts: { id: string; label: string; value: string | number | boolean | null; confidence: string; source: string }[];
  flags: { id: string; text: string; reviewBy: string | null; factIds: string[]; proposed: boolean }[];
};

export type Explanation = { flags: Record<string, string>; nextSteps: string[]; model: string; generatedAt: string; dropped: number };

export function buildEvidencePacket(r: ScoreResult): EvidencePacket {
  return {
    parcel: { id: r.parcelId, address: r.address, neighborhood: r.neighborhood, ruleSet: r.ruleSet.label, ruleSetStatus: r.ruleSet.status, score: r.score },
    gates: r.gates.map((g) => ({ id: g.id, triggered: g.triggered, message: g.message, reviewBy: g.reviewBy })),
    subScores: r.subScores ? Object.fromEntries(Object.entries(r.subScores).map(([k, s]) => [k, { score: s.score, weight: s.weight }])) : null,
    facts: r.facts.map((f) => ({ id: f.id, label: f.label, value: f.value, confidence: f.confidence, source: f.source })),
    flags: r.flags.map((f) => ({ id: f.id, text: f.text, reviewBy: f.reviewBy, factIds: f.factIds, proposed: !!f.proposed })),
  };
}

export const SYSTEM_PROMPT = `You explain results from a rule-based housing development feasibility tool for City of Pittsburgh parcels.
You are given an EVIDENCE PACKET (JSON). Write for a small developer or nonprofit staff member: plain English, no jargon without a short explanation.
Rules you must follow:
1. Use ONLY facts in the packet. Never add outside knowledge, numbers, dates, or names.
2. Every sentence must end with at least one citation of a fact id from packet.facts in square brackets, exactly like [zoning.district] or [lot.area, lot.area_assessor]. A sentence without a valid citation will be deleted.
3. If a fact's value is null or its confidence is "unknown", say it is unknown or unverified. Never guess.
4. If ruleSetStatus is "proposed", say the rule is proposed and not law.
5. Do not give legal, financial, or zoning advice, do not make a zoning determination, and do not change or restate the score as your own judgment.
6. Output matches the required JSON schema: {"flags": [{"id": "<flag id from packet.flags>", "text": "<1-2 short sentences>"}, ...], "nextSteps": ["<step>", ...]}. Include one array entry per flag in packet.flags, in the same order. nextSteps has 3-5 short imperative steps; the last step must name the human review office(s) to confirm with (use the reviewBy values from packet.flags), and every step needs a citation too.`;

/** Fixed-shape JSON schema for Claude's structured-outputs feature (output_config.format): guarantees parseable
 * JSON on every call. Flag ids vary per parcel, so they cannot be object keys (structured outputs requires a
 * fixed, enumerable shape) — the model returns an array of {id, text} pairs instead; validateExplanation()
 * turns that back into the Record<string,string> the rest of the app reads. */
export const EXPLANATION_SCHEMA = {
  type: 'object',
  properties: {
    flags: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'], additionalProperties: false } },
    nextSteps: { type: 'array', items: { type: 'string' } },
  },
  required: ['flags', 'nextSteps'],
  additionalProperties: false,
} as const;

/** Splits on . ! ? followed by whitespace/end, but never inside [brackets] (fact ids contain dots) or inside numbers like 1.5. */
function sentences(text: string): string[] {
  const out: string[] = []; let cur = ''; let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]; cur += c;
    if (c === '[') depth++; else if (c === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && '.!?'.includes(c) && (i + 1 === text.length || /\s/.test(text[i + 1]))) { out.push(cur); cur = ''; }
  }
  if (cur.trim()) out.push(cur);
  return out;
}
const CITE = /\[([a-z0-9_.,\s-]+)\]/gi;

/** Keeps only sentences whose every [citation] is a real fact id and that have at least one citation. */
export function validateText(text: string, factIds: Set<string>): { kept: string; dropped: number } {
  const kept: string[] = []; let dropped = 0;
  for (const raw of sentences(text)) {
    const s = raw.trim(); if (!s) continue;
    const cites = [...s.matchAll(CITE)].flatMap((m) => m[1].split(',').map((x) => x.trim()).filter(Boolean));
    if (cites.length === 0 || cites.some((c) => !factIds.has(c))) { dropped++; continue; }
    kept.push(s);
  }
  return { kept: kept.join(' '), dropped };
}

export function validateExplanation(raw: unknown, packet: EvidencePacket, model: string, now = new Date().toISOString().slice(0, 10)): Explanation {
  const factIds = new Set(packet.facts.map((f) => f.id));
  const flagIds = new Set(packet.flags.map((f) => f.id));
  const j: any = raw && typeof raw === 'object' ? raw : {};
  const flags: Record<string, string> = {}; let dropped = 0;
  for (const item of Array.isArray(j.flags) ? j.flags : []) {
    const id = item?.id, text = item?.text;
    if (typeof id !== 'string' || !flagIds.has(id) || typeof text !== 'string') continue;
    const v = validateText(text, factIds); dropped += v.dropped;
    if (v.kept) flags[id] = v.kept;
  }
  const nextSteps: string[] = [];
  for (const step of Array.isArray(j.nextSteps) ? j.nextSteps : []) {
    if (typeof step !== 'string') continue;
    const v = validateText(step, factIds); dropped += v.dropped;
    if (v.kept) nextSteps.push(v.kept);
  }
  // human-in-the-loop: always end with the review office(s), from engine data (not from the model)
  const offices = [...new Set([...packet.gates.filter((g) => g.triggered).map((g) => g.reviewBy), ...packet.flags.map((f) => f.reviewBy)].filter(Boolean) as string[])];
  if (nextSteps.length && offices.length) nextSteps.push(`Confirm with: ${offices.slice(0, 5).join('; ')}.`);
  return { flags, nextSteps, model, generatedAt: now, dropped };
}

export async function callClaude(packet: EvidencePacket, opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): Promise<{ json: unknown; model: string }> {
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
  const f = opts.fetchImpl ?? fetch;
  const res = await f('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: 4096, system: SYSTEM_PROMPT,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: EXPLANATION_SCHEMA } },
      messages: [{ role: 'user', content: `EVIDENCE PACKET:\n${JSON.stringify(packet)}` }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body: any = await res.json();
  // Sonnet 5 runs adaptive thinking by default; its output tokens share the max_tokens budget with the
  // visible JSON, so a run that hits the cap mid-JSON must be surfaced (not silently parsed as "no JSON").
  if (body.stop_reason === 'max_tokens') throw new Error(`Claude API: hit max_tokens before finishing (stop_reason=max_tokens, output_tokens=${body.usage?.output_tokens})`);
  const text: string = (body.content ?? []).map((c: any) => c.text ?? '').join('');
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error('model returned no JSON');
  return { json: JSON.parse(m[0]), model };
}
