/**
 * Phase 6 driver: spawns one worker per CPU (scripts/precompute-worker.ts), then merges their shards into
 *  - data/scores/index.json          compact rows for search / compare / map (in-scope parcels)
 *  - data/scores/packets/<hood>.json raw engine inputs per parcel (parcel record + overlaps), sharded by neighborhood
 *  - data/scores/meta.json           layer sources, permitted uses, neighborhood values, hoods list
 *  - data/opportunity.json           vacant PUBLIC lots (City/URA/HACP/County), with scores
 *  - data/reform-impact.json         citywide + by-neighborhood counts (lot-size + ADU rules for ALL residential parcels)
 * Scope: every parcel is scored under both rule sets. The web app reads these files only (no live API).
 */
import { spawn } from 'node:child_process';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONFIG } from '../lib';
import { loadEngineData, ROOT } from '../lib/data/load';
import { INDEX_COLS, OWNER_CODES } from '../lib/packets';

const OUT = path.join(ROOT, 'data/scores');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'packets'), { recursive: true });
fs.mkdirSync(path.join(OUT, '.tmp'), { recursive: true });
const N = Math.max(1, Math.min(8, Number(process.env.SHARDS) || os.cpus().length - 1));
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';

async function main() {
  log(`spawning ${N} workers`);
  await Promise.all(Array.from({ length: N }, (_, i) => new Promise<void>((res, rej) => {
    const c = spawn('node', ['--max-old-space-size=6144', '--import', 'tsx', 'scripts/precompute-worker.ts', String(i), String(N)], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
    c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`worker ${i} exited ${code}`))));
  })));
  log('merging');
  const parts = Array.from({ length: N }, (_, i) => JSON.parse(fs.readFileSync(path.join(OUT, '.tmp', `shard-${i}.json`), 'utf8')));
  const names = [...new Set(parts.flatMap((p) => [...Object.keys(p.impact), ...Object.keys(p.packets)]))].sort();
  const hoods = names.map((name, id) => ({ id, name, slug: slug(name), scoped: 0 }));
  const hid = new Map(hoods.map((h) => [h.name, h.id]));

  const rows: any[][] = [];
  const opp: any[] = [];
  const packets = new Map<string, Record<string, unknown>>();
  const emptyImp = (): Record<string, number> => ({ residential: 0, a: 0, aBoth: 0, b: 0, bExCondo: 0, bVacant: 0, resWithLotMin: 0, belowMin: 0 });
  const totals = emptyImp();
  const impact = new Map<string, Record<string, number>>();
  let scoped = 0, scored = 0, visited = 0;
  for (const p of parts) {
    scoped += p.scoped; scored += p.scored; visited += p.visited;
    for (const r of p.rows) { r[2] = hid.get(r[2])!; rows.push(r); hoods[r[2]].scoped++; }
    opp.push(...p.opp);
    for (const [h, obj] of Object.entries(p.packets)) packets.set(h, { ...(packets.get(h) ?? {}), ...(obj as object) });
    for (const [h, t] of Object.entries(p.impact) as [string, Record<string, number>][]) {
      const x = impact.get(h) ?? emptyImp(); impact.set(h, x);
      for (const k of Object.keys(t)) x[k] += t[k];
    }
    for (const k of Object.keys(p.totals)) totals[k] += p.totals[k];
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  let bytes = 0;
  for (const [h, obj] of packets) { const s = JSON.stringify(obj); bytes += s.length; fs.writeFileSync(path.join(OUT, 'packets', `${slug(h)}.json.gz`), zlib.gzipSync(s, { level: 9 })); }
  log(`packets: ${packets.size} shards, ${(bytes / 1e6).toFixed(1)} MB raw`);

  const data = loadEngineData();
  fs.writeFileSync(path.join(OUT, 'index.json.gz'), zlib.gzipSync(JSON.stringify({ cols: INDEX_COLS, owners: OWNER_CODES, hoods, rows }), { level: 9 }));
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10), config: CONFIG, layerMeta: data.layerMeta, permittedUses: data.permittedUses, hoodValues: data.hoodValues,
    scope: 'every City of Pittsburgh parcel in the snapshot (142k); scored under both rule sets',
    counts: { parcelsInSnapshot: visited, inScope: scoped, scored },
  }));
  opp.sort((a, b) => (b.properties.score ?? -1) - (a.properties.score ?? -1));
  fs.writeFileSync(path.join(ROOT, 'data/opportunity.json'), JSON.stringify({ type: 'FeatureCollection', generatedAt: new Date().toISOString().slice(0, 10), features: opp }));
  const byHood = [...impact.entries()].map(([name, t]) => ({ name, ...t }) as Record<string, any>).sort((x, y) => y.a + y.b - (x.a + x.b));
  fs.writeFileSync(path.join(ROOT, 'data/reform-impact.json'), JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    bills: { current: 'Bill 2025-1579 (in effect; Passed Finally 5/6/2025, signed 5/7/2025)', proposed: 'Bill 2025-1545 (PROPOSED; Held In Council; public hearing 2026-09-23)' },
    definitions: {
      a: 'Residential parcels (dwelling use or vacant) in R1D/R1A/R2/R3/RM that failed the pre-2025-1579 minimum lot size but pass the current one (map-polygon lot area; zoning sources agree).',
      aBoth: 'Subset of a where the county assessor lot area agrees.',
      b: 'Residential parcels (dwelling use or vacant) where the verified use table allows housing by right, i.e. eligible for by-right ADUs under the PROPOSED bill (upper bound: assumes no by-right ADU today).',
      bExCondo: 'b excluding vacant lots and condominium/mobile-home/HUD/etc. uses.',
      belowMin: 'Residential parcels smaller than the CURRENT minimum lot size.',
    },
    limits: 'Counts the lot-size rule and the ADU eligibility rule only; setbacks, height, building code and utilities are not checked.',
    citywide: totals, byNeighborhood: byHood,
  }, null, 1));
  fs.rmSync(path.join(OUT, '.tmp'), { recursive: true, force: true });
  const sz = (f: string) => (fs.statSync(f).size / 1e6).toFixed(1) + ' MB';
  log(`index ${sz(path.join(OUT, 'index.json.gz'))} (gz), opportunity ${sz(path.join(ROOT, 'data/opportunity.json'))} (${opp.length} lots), reform-impact ${sz(path.join(ROOT, 'data/reform-impact.json'))}`);
  console.log(JSON.stringify({ scoped, scored, totals, hoods: hoods.length }));
  void OWNER_CODES;
}
main().catch((e) => { console.error(e); process.exit(1); });
