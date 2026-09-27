/**
 * Phase 6 worker: scores every SHARD-th parcel (see scripts/precompute.ts, the driver).
 *  - data/scores/index.json          compact rows for search / compare / map (in-scope parcels)
 *  - data/scores/packets/<hood>.json raw engine inputs per parcel (parcel record + overlaps), sharded by neighborhood
 *  - data/scores/meta.json           layer sources, permitted uses, neighborhood values, hoods list
 *  - data/opportunity.json           vacant PUBLIC lots (City/URA/HACP/County), simplified, with scores
 *  - data/reform-impact.json         citywide + by-neighborhood counts (lot-size + ADU rules for ALL residential parcels)
 * Scope: every parcel.
 * All other residential parcels get only the lot-size/ADU classification (Reform Impact).
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeOverlaps, compareRuleSets, currentRules, reformRules, CONFIG, parseZoning } from '../lib';
import { loadEngineData, ParcelStore, ROOT } from '../lib/data/load';
import { classifyImpact } from '../lib/impact';
import { INDEX_COLS, OWNER_CODES, roundGeom, toPacket, type Packet } from '../lib/packets';

const [SHARD, NSHARDS] = [Number(process.argv[2] ?? 0), Number(process.argv[3] ?? 1)];
const TMP = path.join(ROOT, 'data/scores/.tmp');
fs.mkdirSync(TMP, { recursive: true });

const DEMO_PINS = ['0084P00162000000', '0175G00210000000', '0174N00262000000', '0013E00051000000', '0173N00352000000', '0135M00041000000', '0006K00358000000'];
const PUBLIC = new Set(['City', 'URA', 'HACP', 'County']);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';

const store = new ParcelStore();
const data = loadEngineData();
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);


type Imp = { residential: number; a: number; aBoth: number; b: number; bExCondo: number; bVacant: number; resWithLotMin: number; belowMin: number };
const impact = new Map<string, Imp>();
const totals: Imp = { residential: 0, a: 0, aBoth: 0, b: 0, bExCondo: 0, bVacant: 0, resWithLotMin: 0, belowMin: 0 };
const emptyImp = (): Imp => ({ residential: 0, a: 0, aBoth: 0, b: 0, bExCondo: 0, bVacant: 0, resWithLotMin: 0, belowMin: 0 });

const shards = new Map<string, Record<string, Packet>>();
const rows: unknown[][] = [];
const opp: any[] = [];
let scoped = 0, scored = 0;

const pins = store.pins();
const _n = pins.length;
for (let i = SHARD; i < pins.length; i += NSHARDS) {
  const p = store.byPin(pins[i])!;
  const h = p.neighborhood ?? 'Unknown';
  // ---- Reform Impact classification for every parcel ----
  const f = classifyImpact(p, data.permittedUses);
  if (f.residential) {
    const key = p.neighborhood ?? 'Unknown';
    const t = impact.get(key) ?? emptyImp(); impact.set(key, t);
    for (const x of [t, totals]) {
      x.residential++; if (f.a) x.a++; if (f.aBoth) x.aBoth++; if (f.b) x.b++; if (f.bExcludingCondo) x.bExCondo++; if (f.b && f.vacant) x.bVacant++;
      if (f.resWithLotMin) x.resWithLotMin++; if (f.belowCurrentMin) x.belowMin++;
    }
  }
  // ---- full scoring for in-scope parcels ----
  const inScope = true; // every parcel in the snapshot is fully scored (was: vacant + public + demo only)
  if (!inScope) continue;
  scoped++;
  const overlaps = computeOverlaps(p.geometry, data.layers, CONFIG.minOverlapFraction, true);
  const cmp = compareRuleSets(p, data, currentRules, reformRules, CONFIG, overlaps);
  const cur = cmp.current, ref = cmp.reform;
  if (cur.score !== null) scored++;
  const gates = cur.gates.filter((g) => g.triggered).map((g) => g.id).join(',');
  const aduReady = !!ref.subScores?.zoning.rules?.find((r) => r.ruleId === 'ADU-BY-RIGHT' && r.result === 'passed');
  const combine = cur.flags.some((x) => x.id === 'lot-below-minimum');
  const starter = cur.score !== null && cur.score >= 70 && !gates.includes('G');
  (shards.get(h) ?? shards.set(h, {}).get(h)!)[p.pin] = toPacket(p, overlaps);
  rows.push([p.pin, p.address, h as unknown as number, p.ownerType ? OWNER_CODES.indexOf(p.ownerType) : -1, p.vacant === null ? -1 : p.vacant ? 1 : 0, p.lotAreaSqft === null ? null : Math.round(p.lotAreaSqft), p.zoningDistrict,
    cur.score, ref.score, gates, p.centroid[0], p.centroid[1], aduReady ? 1 : 0, combine ? 1 : 0, starter ? 1 : 0]);
  if (p.vacant === true && p.ownerType && PUBLIC.has(p.ownerType)) {
    opp.push({ type: 'Feature', geometry: roundGeom(p.geometry), properties: {
      pin: p.pin, address: p.address, hood: p.neighborhood, owner: p.ownerType, lot: Math.round(p.lotAreaSqft ?? 0), zone: p.zoningDistrict,
      score: cur.score, reform: ref.score, gates, aduReady, combine, starter,
      env: cur.subScores ? Math.round(cur.subScores.environmental.score) : null,
      flags: cur.flags.filter((x) => x.severity !== 'info' || ['phfa-infill', 'gap-financing'].includes(x.id)).map((x) => x.id) } });
  }
  if (scoped % 500 === 0) log(`  shard ${SHARD}: scoped ${scoped} (visited ${Math.floor(i / NSHARDS)})`);
}
log(`in-scope parcels: ${scoped}; scored (no G1/G2): ${scored}`);

fs.writeFileSync(path.join(TMP, `shard-${SHARD}.json`), JSON.stringify({ rows, opp, packets: Object.fromEntries(shards), impact: Object.fromEntries(impact), totals, scoped, scored, visited: Math.ceil((pins.length - SHARD) / NSHARDS) }));
log(`shard ${SHARD}/${NSHARDS} done: scoped ${scoped}, scored ${scored}`);
