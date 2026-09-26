/**
 * Phase 12: agent tools. Thin wrappers over the deterministic engine and the local snapshot (no network).
 * Every result is small JSON that carries its source names so the model (or offline router) can cite them.
 */
import { getIndex, getMeta, getPacket, getReformImpact } from '../web/server-data';
import { comparePacket, runPacket, type RuleSetId } from '../web/run';
import { parseZoning } from '../zoning';
import { CURRENT_LOT_MIN } from '../zoning';
import { hazardsOf } from './hazards';

export type ToolName = 'search_parcels' | 'get_parcel' | 'score_parcels' | 'check_hazards' | 'lookup_zoning_rule' | 'reform_impact' | 'draft_site_memo';
const SRC = 'BuildReady PGH snapshot (City of Pittsburgh ArcGIS, WPRDC assessments, Zoning Code §911.02/§903.03, Bills 2025-1579 and 2025-1545)';
const rsOf = (x: unknown): RuleSetId => (x === 'reform' || x === 'reform-2025-1545' ? 'reform-2025-1545' : 'current');
const HOUSING_TYPES = ['single_unit_detached', 'single_unit_attached', 'two_unit', 'three_unit', 'multi_unit'] as const;

export const TOOL_DEFS = [
  { name: 'search_parcels', description: 'Search the snapshot of vacant and publicly owned City of Pittsburgh lots. All filters optional. Returns up to `limit` (max 20) rows sorted by score under the chosen rule set, plus the total match count.',
    input_schema: { type: 'object', properties: {
      neighborhood: { type: 'string' }, owner: { type: 'string', enum: ['City', 'URA', 'HACP', 'County', 'Private', 'Other'] }, vacant: { type: 'boolean' },
      zoning: { type: 'string', description: 'zoning map code prefix, e.g. R1A or RM-M' }, min_lot_sqft: { type: 'number' }, max_lot_sqft: { type: 'number' },
      min_score: { type: 'number' }, max_score: { type: 'number' }, no_gates: { type: 'boolean' },
      ruleset: { type: 'string', enum: ['current', 'reform'] }, allows_by_right: { type: 'string', enum: [...HOUSING_TYPES], description: 'require this housing type by right in the base zoning' },
      adu_ready_under_reform: { type: 'boolean' }, below_district_minimum: { type: 'boolean' }, limit: { type: 'number' } } } },
  { name: 'get_parcel', description: 'Evidence packet for one parcel: score, gates, sub-scores, flags (with reviewBy offices) and cited facts under a rule set.',
    input_schema: { type: 'object', properties: { pin: { type: 'string' }, ruleset: { type: 'string', enum: ['current', 'reform'] } }, required: ['pin'] } },
  { name: 'score_parcels', description: 'Scores for up to 10 parcels under a rule set.', input_schema: { type: 'object', properties: { pins: { type: 'array', items: { type: 'string' } }, ruleset: { type: 'string', enum: ['current', 'reform'] } }, required: ['pins'] } },
  { name: 'check_hazards', description: 'Slope, landslide, undermined, flood, historic, inclusionary overlaps for a parcel, with map pins.', input_schema: { type: 'object', properties: { pin: { type: 'string' } }, required: ['pin'] } },
  { name: 'lookup_zoning_rule', description: 'Which housing types a zoning district allows (by right / exception / not at all) with the Zoning Code section, plus the current lot minimum for R-district density suffixes.', input_schema: { type: 'object', properties: { district: { type: 'string', description: 'e.g. R1D-L, RM-M, LNC' } }, required: ['district'] } },
  { name: 'reform_impact', description: 'Counts of lots that no longer need a lot-size variance (Bill 2025-1579, in effect) and lots that would gain by-right ADU potential (Bill 2025-1545, PROPOSED), citywide or for one neighborhood.', input_schema: { type: 'object', properties: { neighborhood: { type: 'string' } } } },
  { name: 'draft_site_memo', description: 'Site memo text (score, flags, sources, review offices) for up to 3 parcels.', input_schema: { type: 'object', properties: { pins: { type: 'array', items: { type: 'string' } }, ruleset: { type: 'string', enum: ['current', 'reform'] } }, required: ['pins'] } },
] as const;

/** exact name, else every neighborhood whose name starts with the text (e.g. "Homewood" -> North/South/West), else contains. */
const hoodMatch = (name: string): { id: number; name: string }[] => {
  const q = name.trim().toLowerCase();
  const hs: { id: number; name: string }[] = getIndex().hoods;
  const exact = hs.filter((h) => h.name.toLowerCase() === q);
  if (exact.length) return exact;
  const starts = hs.filter((h) => h.name.toLowerCase().startsWith(q));
  return starts.length ? starts : hs.filter((h) => h.name.toLowerCase().includes(q));
};

function compactResult(pin: string, rs: RuleSetId, full = false) {
  const f = getPacket(pin); if (!f) return { error: `parcel ${pin} not in the snapshot (covers vacant and publicly owned lots plus demo parcels)` };
  const r = runPacket(f.packet, getMeta(), rs);
  const cmp = comparePacket(f.packet, getMeta());
  const out: any = {
    pin, address: f.packet.p.address, neighborhood: f.hood, ruleSet: r.ruleSet.label, ruleSetStatus: r.ruleSet.status, score: r.score, uncappedScore: r.uncappedScore,
    scoreCurrent: cmp.current.score, scoreIfReformPasses: cmp.reform.score,
    gates: r.gates.filter((g) => g.triggered).map((g) => ({ id: g.id, effect: g.effect, cap: g.cap, message: g.message, reviewBy: g.reviewBy })),
    subScores: r.subScores ? Object.fromEntries(Object.entries(r.subScores).map(([k, s]) => [k, Math.round(s.score)])) : null,
    flags: r.flags.filter((x) => x.id !== 'water-sewer' || full).map((x) => ({ id: x.id, severity: x.severity, text: x.text, reviewBy: x.reviewBy, proposed: !!x.proposed, factIds: x.factIds })),
    source: SRC,
  };
  if (full) out.facts = r.facts.map((x) => ({ id: x.id, label: x.label, value: x.value, confidence: x.confidence, source: x.source, sourceUrl: x.sourceUrl, retrievedAt: x.retrievedAt }));
  return out;
}

export function runTool(name: ToolName, args: any): any {
  const meta = getMeta();
  switch (name) {
    case 'search_parcels': {
      const idx = getIndex();
      const rs = rsOf(args.ruleset);
      const hoodSet = args.neighborhood ? hoodMatch(String(args.neighborhood)) : undefined;
      if (args.neighborhood && !hoodSet?.length) return { error: `unknown neighborhood "${args.neighborhood}"`, source: SRC };
      const z = args.zoning ? String(args.zoning).toUpperCase() : null;
      const matches = idx.rows.filter((r) => {
        if (hoodSet && !hoodSet.some((h) => h.id === r.hood)) return false;
        if (args.owner && r.owner !== args.owner) return false;
        if (args.vacant !== undefined && r.vacant !== args.vacant) return false;
        if (z && !(r.zone ?? '').toUpperCase().startsWith(z)) return false;
        if (args.min_lot_sqft !== undefined && (r.lot ?? 0) < args.min_lot_sqft) return false;
        if (args.max_lot_sqft !== undefined && (r.lot ?? 1e12) > args.max_lot_sqft) return false;
        const sc = rs === 'reform-2025-1545' ? r.reform : r.score;
        if (args.min_score !== undefined && (sc === null || sc < args.min_score)) return false;
        if (args.max_score !== undefined && (sc === null || sc > args.max_score)) return false;
        if (args.no_gates && r.gates) return false;
        if (args.adu_ready_under_reform && !r.aduReady) return false;
        if (args.below_district_minimum && !r.combine) return false;
        if (args.allows_by_right) {
          const c = parseZoning(r.zone, meta.permittedUses).column; const code = c ? meta.permittedUses.districts[c]?.uses?.[args.allows_by_right]?.code : '';
          if (!(code === 'P' || code === 'P/S')) return false;
        }
        return true;
      });
      const sc = (r: (typeof matches)[number]) => (rs === 'reform-2025-1545' ? r.reform : r.score) ?? -1;
      matches.sort((a, b) => sc(b) - sc(a));
      const limit = Math.max(1, Math.min(20, Number(args.limit) || 10));
      return { total: matches.length, ruleSet: rs, rows: matches.slice(0, limit).map((r) => ({ pin: r.pin, address: r.address, neighborhood: idx.hoods[r.hood].name, owner: r.owner, vacant: r.vacant, lotSqft: r.lot, zoning: r.zone, score: r.score, scoreIfReformPasses: r.reform, gates: r.gates || null, aduReadyUnderReform: r.aduReady, belowDistrictMinimum: r.combine })), source: SRC };
    }
    case 'get_parcel': return compactResult(String(args.pin).toUpperCase(), rsOf(args.ruleset), true);
    case 'score_parcels': return { results: (args.pins as string[]).slice(0, 10).map((p) => { const r = compactResult(String(p).toUpperCase(), rsOf(args.ruleset)); return r.error ? r : { pin: r.pin, address: r.address, score: r.score, scoreCurrent: r.scoreCurrent, scoreIfReformPasses: r.scoreIfReformPasses, gates: r.gates.map((g: any) => g.id) }; }), source: SRC };
    case 'check_hazards': { const f = getPacket(String(args.pin).toUpperCase()); return f ? { pin: f.row.pin, hazards: hazardsOf(f.packet), source: 'City of Pittsburgh ArcGIS hazard layers (snapshot ' + meta.generatedAt + ')' } : { error: 'parcel not in snapshot' }; }
    case 'lookup_zoning_rule': {
      const z = parseZoning(String(args.district).toUpperCase(), meta.permittedUses);
      const col = z.column ? meta.permittedUses.districts[z.column] : null;
      return { district: args.district, useTableColumn: z.column, verified: !!col, housing: z.housing, uses: col ? Object.fromEntries(Object.entries(col.uses).map(([t, u]: any) => [t, { code: u.code || '(blank: not permitted)', status: u.status, citation: u.citation }])) : null, lotMinimumSqft: z.density ? (CURRENT_LOT_MIN[z.density] ?? 'none') : null, lotMinimumCitation: z.density ? 'Zoning Code §903.03 as amended by Bill 2025-1579 (in effect)' : null, note: z.note, tableSource: meta.permittedUses._meta.source.primary + ' (not verified against live code)', source: SRC };
    }
    case 'reform_impact': {
      const d = getReformImpact();
      const pick = (t: any) => ({ residentialParcels: t.residential, noLongerNeedLotSizeVariance_Bill2025_1579_inEffect: t.a, ofWhichAssessorAreaAgrees: t.aBoth, gainByRightAdu_Bill2025_1545_PROPOSED: t.b, belowCurrentMinimum: t.belowMin });
      if (args.neighborhood) { const q = String(args.neighborhood).toLowerCase(); const h = d.byNeighborhood.find((x: any) => x.name.toLowerCase() === q) ?? d.byNeighborhood.find((x: any) => x.name.toLowerCase().includes(q)); return h ? { neighborhood: h.name, ...pick(h), proposedBillStatus: d.bills.proposed, limits: d.limits, source: SRC } : { error: `unknown neighborhood "${args.neighborhood}"` }; }
      return { scope: 'citywide', ...pick(d.citywide), proposedBillStatus: d.bills.proposed, limits: d.limits, source: SRC };
    }
    case 'draft_site_memo': {
      const rs = rsOf(args.ruleset);
      return { memos: (args.pins as string[]).slice(0, 3).map((p) => {
        const r = compactResult(String(p).toUpperCase(), rs); if (r.error) return r;
        const lines = [`SITE MEMO: ${r.address} (${r.pin}), ${r.neighborhood}`, `Rule set: ${r.ruleSet}${r.ruleSetStatus === 'proposed' ? ' (PROPOSED, not law)' : ''}. Score: ${r.score ?? 'no score'}.`,
          ...r.gates.map((g: any) => `Gate ${g.id}: ${g.message} Confirm with: ${g.reviewBy}.`), ...r.flags.filter((f: any) => f.severity !== 'info' || f.id === 'phfa-infill').map((f: any) => `- ${f.text} Confirm with: ${f.reviewBy ?? 'n/a'}.`), 'Water/sewer: unknown, request a PWSA availability letter.', 'Decision support only, not legal, financial, or zoning advice.'];
        return { pin: r.pin, memo: lines.join('\n'), printableMemoUrl: `/parcel/${r.pin}/memo?rs=${rs}` };
      }), source: SRC };
    }
  }
}
