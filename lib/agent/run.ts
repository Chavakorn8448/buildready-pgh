/**
 * Ask agent: Claude tool-use loop when ANTHROPIC_API_KEY is set, otherwise a deterministic engine-only router that calls
 * the same tools. Guardrails (both modes): max 8 tool calls, every answer ends with "Confirm with" offices, no zoning
 * determinations / legal / financial advice, and numbers in an answer must come from tool results.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getIndex } from '../web/server-data';
import { runTool, TOOL_DEFS, type ToolName } from './tools';

export type Trace = { tool: string; args: any; summary: string };
export type AskResult = { answer: string; pins: string[]; trace: Trace[]; mode: 'claude' | 'engine-only' | 'cached' | 'refused'; confirmWith: string[]; sourceMode?: string };
const MAX_TOOL_CALLS = 8;
const DEFAULT_OFFICES = ['City Zoning Administrator', 'Zoning Board of Adjustment'];

export const REFUSAL = /\b(is it legal|legally|sue|lawsuit|tax advice|financial advice|should i (buy|invest)|guarantee|will (it|they|the board|the city) approve|approve my variance|zoning determination|determine (if|whether) (it|this) (is|complies)|proof of compliance|contract)\b/i;
export const SYSTEM = `You are the Ask assistant for BuildReady PGH, a decision-support tool for City of Pittsburgh housing development.
Use the tools to answer; you may make at most ${MAX_TOOL_CALLS} tool calls per question. Rules:
- State ONLY numbers, names, scores and zoning facts that appear in tool results. Cite fact ids in square brackets like [zoning.district] when a tool result provides them. If tools do not return it, say it is unknown.
- Scores come from the engine only; never estimate or adjust a score. Bill 2025-1545 is PROPOSED, not law; label anything depending on it as proposed.
- Never make a zoning determination and never give legal, financial, or tax advice; decline politely and point to the review office.
- Keep answers short: a 2-5 sentence answer, then a compact list. End with a line "Confirm with: <offices>" using reviewBy offices from the tool results (default: City Zoning Administrator; Zoning Board of Adjustment).
- Water and sewer capacity is unknown until PWSA issues an availability letter.`;

const norm = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const money = (x: unknown) => Number(x).toLocaleString('en-US');

function summarize(tool: string, r: any): string {
  if (r?.error) return `error: ${r.error}`;
  if (tool === 'search_parcels') return `${r.total} matches; showing ${r.rows.length}${r.rows[0] ? `, top ${r.rows[0].address} (${r.rows[0].score ?? 'no score'})` : ''}`;
  if (tool === 'get_parcel') return `${r.address}: score ${r.score ?? 'none'}, ${r.gates.length} gate(s), ${r.flags.length} flag(s)`;
  if (tool === 'reform_impact') return `${r.neighborhood ?? 'citywide'}: ${money(r.noLongerNeedLotSizeVariance_Bill2025_1579_inEffect)} no longer need variance; ${money(r.gainByRightAdu_Bill2025_1545_PROPOSED)} gain ADU (proposed)`;
  return JSON.stringify(r).slice(0, 120);
}

function collectPins(results: any[]): string[] {
  const pins: string[] = [];
  for (const r of results) { for (const row of r?.rows ?? []) pins.push(row.pin); if (r?.pin) pins.push(r.pin); for (const x of r?.results ?? []) if (x.pin) pins.push(x.pin); }
  return [...new Set(pins)].slice(0, 30);
}
function collectOffices(results: any[]): string[] {
  const o = new Set<string>();
  const walk = (x: any) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(walk); if (typeof x.reviewBy === 'string' && x.reviewBy) o.add(x.reviewBy); Object.values(x).forEach(walk); };
  results.forEach(walk);
  return [...o].slice(0, 5);
}

/**
 * Every number with 2+ digits in the answer must occur in the tool results, the tool-call args (e.g. a min_score
 * filter the model set), or the user's own question (echoing back a number the user supplied is not a hallucination
 * risk) — formatting-insensitive.
 */
export function ungroundedNumbers(answer: string, results: unknown[], question = '', traceArgs: unknown[] = []): string[] {
  const hay = JSON.stringify([results, traceArgs, question]).replace(/,/g, '');
  const bad: string[] = [];
  for (const m of answer.replace(/\[[^\]]*\]/g, '').matchAll(/\d[\d,]*\.?\d*/g)) {
    const raw = m[0].replace(/,/g, '').replace(/\.$/, '');
    if (raw.length < 2 || /^(2025|2026|1579|1545|915|911|903|1000|1500)$/.test(raw)) continue; // bill/code numbers and dates named in the system prompt
    if (!hay.includes(raw)) bad.push(m[0]);
  }
  return [...new Set(bad)];
}

/* ---------------- deterministic engine-only router ---------------- */
const OWNER_WORDS: [RegExp, string][] = [[/\bcity[- ]owned|\bcity\b/i, 'City'], [/\bura\b/i, 'URA'], [/\bhacp\b|housing authority/i, 'HACP'], [/\bcounty\b/i, 'County']];
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

export function offlineAnswer(question: string): AskResult {
  const q = question.trim();
  const trace: Trace[] = []; const results: any[] = [];
  const call = (tool: ToolName, args: any) => { const r = runTool(tool, args); trace.push({ tool, args, summary: summarize(tool, r) }); results.push(r); return r; };
  const hoods: { id: number; name: string }[] = getIndex().hoods;
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let hood: { id: number; name: string } | undefined = hoods.filter((h) => new RegExp(`\\b${esc(h.name)}\\b`, 'i').test(q)).sort((a, b) => b.name.length - a.name.length)[0];
  if (!hood) { // "Homewood" -> all Homewood North/South/West (prefix on the first word)
    const first = [...new Set(hoods.map((h) => h.name.split(' ')[0]))].filter((w) => w.length > 3 && new RegExp(`\\b${esc(w)}\\b`, 'i').test(q)).sort((a, b) => b.length - a.length)[0];
    if (first) hood = { id: -1, name: first };
  }
  const owner = OWNER_WORDS.find(([re]) => re.test(q))?.[1];
  const wantsCount = /\bhow many\b|\bcount\b|\bnumber of\b/i.test(q);
  const reform = /\b(adu|reform|1545|if .*passes?|proposed)\b/i.test(q);
  const topN = (() => { const m = /\btop\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(q); return m ? Number(m[1]) || NUM_WORDS[m[1].toLowerCase()] : 5; })();
  const minScore = (() => { const m = /(\d{2,3})\s*(or (higher|more|above)|\+|plus)|(score|scores)[^.]*?(?:at least|above|over|>=?)\s*(\d{2,3})/i.exec(q); return m ? Number(m[1] ?? m[5]) : undefined; })();
  const duplex = /\bduplex|two[- ]unit|two[- ]family\b/i.test(q);
  const small = /smaller than|below (its|the) (district )?minimum|combine/i.test(q);
  let answer = '';

  if (wantsCount) {
    const r = call('reform_impact', hood ? { neighborhood: hood.name } : {});
    if (r.error) answer = r.error;
    else answer = `${r.neighborhood ?? 'Citywide'}: ${money(r.noLongerNeedLotSizeVariance_Bill2025_1579_inEffect)} residential lots no longer need a lot-size variance under Bill 2025-1579 (in effect), and up to ${money(r.gainByRightAdu_Bill2025_1545_PROPOSED)} would gain by-right ADU potential if Bill 2025-1545 passes (PROPOSED, not law; an upper bound because current by-right ADU coverage is not in the data). Limits: ${r.limits}`;
  } else {
    const args: any = { limit: Math.max(topN, 5), vacant: true, ruleset: reform ? 'reform' : 'current' };
    if (hood) args.neighborhood = hood.name; if (owner) args.owner = owner; if (minScore) args.min_score = minScore; if (small) args.below_district_minimum = true;
    if (duplex) { args.allows_by_right = 'two_unit'; }
    let s = call('search_parcels', args);
    let note = '';
    if (duplex && reform) { // a house + ADU is a two-unit outcome on R1D/R1A lots: also allow ADU-ready lots
      const s2 = call('search_parcels', { ...args, allows_by_right: undefined, adu_ready_under_reform: true });
      const merged = new Map<string, any>(); for (const r of [...s.rows, ...s2.rows]) merged.set(r.pin, r);
      s = { ...s, rows: [...merged.values()].sort((a, b) => (b.scoreIfReformPasses ?? -1) - (a.scoreIfReformPasses ?? -1)), total: Math.max(s.total, s2.total) };
      note = ' A lot counts if a two-unit building is allowed by right in its zoning, or if it would be ADU-ready (house + ADU) under the proposed bill.';
    }
    const rows = s.rows.slice(0, topN);
    if (!rows.length) answer = `No lots in the snapshot match${hood ? ` in ${hood.name}` : ''}. Try different filters.`;
    else {
      const detail = rows.map((r: any) => call('get_parcel', { pin: r.pin, ruleset: reform ? 'reform' : 'current' }));
      const lines = detail.map((d: any, i: number) => {
        const blockers = [...d.gates.map((g: any) => `${g.id}: ${g.message}`), ...d.flags.filter((f: any) => (f.severity === 'warn' || f.severity === 'block')).map((f: any) => f.text)];
        return `${i + 1}. ${d.address} (${d.pin}), ${d.neighborhood}: score ${d.score ?? 'none'}${reform ? ` (current code ${d.scoreCurrent})` : ''}. ${blockers.length ? 'Blocking or to review: ' + blockers.join(' | ') : 'No gate or warning flags.'}`;
      });
      answer = `${s.total} matching lots${hood ? ` in ${hood.name}` : ''}${owner ? ` owned by ${owner}` : ''}; the top ${rows.length} by score${reform ? ' under the PROPOSED Bill 2025-1545 rules' : ''}:${note}\n${lines.join('\n')}\nWater and sewer capacity is unknown for every lot until PWSA issues an availability letter.`;
    }
  }
  const confirm = collectOffices(results); const offices = confirm.length ? confirm : DEFAULT_OFFICES;
  return { answer: `${answer}\nConfirm with: ${offices.join('; ')}.`, pins: collectPins(results), trace, mode: 'engine-only', confirmWith: offices };
}

/* ---------------- Claude tool-use loop ---------------- */
async function claudeAnswer(question: string, apiKey: string): Promise<AskResult> {
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
  const trace: Trace[] = []; const results: any[] = [];
  const messages: any[] = [{ role: 'user', content: question }];
  let calls = 0;
  for (let turn = 0; turn < MAX_TOOL_CALLS + 2; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 3000, output_config: { effort: 'medium' }, system: SYSTEM, tools: calls >= MAX_TOOL_CALLS ? [] : TOOL_DEFS, messages }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body: any = await res.json();
    // Sonnet 5 runs adaptive thinking by default, sharing max_tokens with tool_use/text output; a cap hit
    // mid tool-call or mid-answer must not be treated as a normal turn (partial JSON, a cut-off answer).
    if (body.stop_reason === 'max_tokens') throw new Error(`Claude API: hit max_tokens before finishing (output_tokens=${body.usage?.output_tokens})`);
    messages.push({ role: 'assistant', content: body.content });
    const uses = (body.content ?? []).filter((c: any) => c.type === 'tool_use');
    if (body.stop_reason !== 'tool_use' || uses.length === 0) {
      let answer = (body.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim();
      const offices = collectOffices(results).length ? collectOffices(results) : DEFAULT_OFFICES;
      if (!/confirm with:/i.test(answer)) answer += `\nConfirm with: ${offices.join('; ')}.`;
      const bad = ungroundedNumbers(answer, results, question, trace.map((t) => t.args));
      if (bad.length) answer += `\n(Note: these numbers could not be matched to tool results and should be treated as unverified: ${bad.join(', ')}.)`;
      return { answer, pins: collectPins(results), trace, mode: 'claude', confirmWith: offices };
    }
    const toolResults: any[] = [];
    for (const u of uses) {
      if (calls >= MAX_TOOL_CALLS) { toolResults.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify({ error: 'tool call limit reached; answer with what you have' }), is_error: true }); continue; }
      calls++;
      let r: any; try { r = runTool(u.name, u.input ?? {}); } catch (e) { r = { error: (e as Error).message }; }
      trace.push({ tool: u.name, args: u.input, summary: summarize(u.name, r) }); results.push(r);
      toolResults.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r) });
    }
    messages.push({ role: 'user', content: toolResults });
  }
  throw new Error('agent did not finish');
}

export function loadShowcase(): Record<string, AskResult> {
  const f = path.join(process.cwd(), 'data/ask-cache.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
}

export async function ask(question: string, opts: { useCache?: boolean } = {}): Promise<AskResult> {
  const q = question.trim().slice(0, 600);
  if (!q) throw new Error('empty question');
  // Declined on purpose by the guardrail, checked before the API key even matters — this is not a fallback,
  // so it must never be labeled as if the key were missing (mode: 'engine-only' means "no key / live call failed").
  if (REFUSAL.test(q)) return { answer: `I can't make zoning determinations or give legal, financial, or tax advice. I can show what the data says about a lot (score, flags, sources) and who to confirm with.\nConfirm with: ${DEFAULT_OFFICES.join('; ')}.`, pins: [], trace: [], mode: 'refused', confirmWith: DEFAULT_OFFICES };
  if (opts.useCache !== false) { const hit = loadShowcase()[norm(q)]; if (hit) return { ...hit, sourceMode: hit.mode, mode: 'cached' }; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) { try { return await claudeAnswer(q, key); } catch (e) { console.error('claude agent failed, falling back to engine-only:', (e as Error).message); } }
  return offlineAnswer(q);
}
export { norm as normalizeQuestion };
