/**
 * Adjacency for the assemblage finder. For every vacant parcel and every residential parcel below its district minimum, finds
 * the parcels that share a boundary (>= 3 m along the outline). Writes data/scores/adjacency.json.gz and adds
 * `adj` (neighbors that are vacant or public) and `assemble` (a combination passes the minimum) to data/opportunity.json.
 * Run after `npm run preprocess` (needs data/processed/parcels.ndjson). ~ a few minutes.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { sharedBoundaryMeters } from '../lib/adjacency';
import { assemblageOptions } from '../lib/assemblage';
import { bboxIntersects } from '../lib/geo';
import { loadEngineData, ParcelStore, ROOT } from '../lib/data/load';
import { parseZoning, CURRENT_LOT_MIN } from '../lib';
import type { ProcessedParcel } from '../lib/types';

const store = new ParcelStore();
const data = loadEngineData();
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);

const pins = store.pins();
const all: { pin: string; bbox: [number, number, number, number] }[] = [];
const CELL = 0.002;
const grid = new Map<string, number[]>();
const key = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
const recs: ProcessedParcel[] = [];
for (const pin of pins) {
  const p = store.byPin(pin)!; recs.push(p);
  const i = recs.length - 1;
  all.push({ pin, bbox: p.bbox });
  for (let x = Math.floor(p.bbox[0] / CELL); x <= Math.floor(p.bbox[2] / CELL); x++) for (let y = Math.floor(p.bbox[1] / CELL); y <= Math.floor(p.bbox[3] / CELL); y++) {
    const k = `${x}:${y}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  }
}
log(`indexed ${recs.length} parcels`);

const PAD = 0.00001; // ~1 m
const isPublic = (p: ProcessedParcel) => p.ownerType !== null && ['City', 'URA', 'HACP', 'County'].includes(p.ownerType);
const out: Record<string, string[]> = {};
const info = new Map<string, { neighbors: { pin: string; owner: string | null; vacant: boolean | null; lot: number | null; zone: string | null; address: string }[] }>();
let done = 0;
for (let i = 0; i < recs.length; i++) {
  const p = recs[i];
  const z = parseZoning(p.zoningDistrict, data.permittedUses);
  const belowMin = z.residentialFamily && z.density && CURRENT_LOT_MIN[z.density] !== null && p.lotAreaSqft !== null && p.lotAreaSqft < CURRENT_LOT_MIN[z.density]!;
  if (!(p.vacant === true || belowMin)) continue;
  const box: [number, number, number, number] = [p.bbox[0] - PAD, p.bbox[1] - PAD, p.bbox[2] + PAD, p.bbox[3] + PAD];
  const cand = new Set<number>();
  for (let x = Math.floor(box[0] / CELL); x <= Math.floor(box[2] / CELL); x++) for (let y = Math.floor(box[1] / CELL); y <= Math.floor(box[3] / CELL); y++) for (const j of grid.get(`${x}:${y}`) ?? []) if (j !== i) cand.add(j);
  const found: { j: number; len: number }[] = [];
  for (const j of cand) {
    if (!bboxIntersects(box, recs[j].bbox)) continue;
    const len = sharedBoundaryMeters(p.geometry, recs[j].geometry);
    if (len >= 3) found.push({ j, len });
  }
  found.sort((a, b) => b.len - a.len);
  const top = found.slice(0, 8);
  if (top.length) {
    out[p.pin] = top.map((f) => recs[f.j].pin);
    info.set(p.pin, { neighbors: top.map((f) => ({ pin: recs[f.j].pin, owner: recs[f.j].ownerType, vacant: recs[f.j].vacant, lot: recs[f.j].lotAreaSqft, zone: recs[f.j].zoningDistrict, address: recs[f.j].address })) });
  }
  if (++done % 5000 === 0) log(`  ${done} parcels checked`);
}
fs.writeFileSync(path.join(ROOT, 'data/scores/adjacency.json.gz'), zlib.gzipSync(JSON.stringify(out), { level: 9 }));
log(`adjacency: ${Object.keys(out).length} parcels with neighbors, ${(fs.statSync(path.join(ROOT, 'data/scores/adjacency.json.gz')).size / 1e6).toFixed(1)} MB gz`);

// patch opportunity.json
const oppFile = path.join(ROOT, 'data/opportunity.json');
const opp = JSON.parse(fs.readFileSync(oppFile, 'utf8'));
let withAdj = 0, canAssemble = 0;
for (const f of opp.features) {
  const pr = f.properties; const ni = info.get(pr.pin);
  const cands = (ni?.neighbors ?? []).filter((n) => n.vacant === true || (n.owner !== null && ['City', 'URA', 'HACP', 'County'].includes(n.owner)));
  pr.adj = cands.length;
  const res = assemblageOptions({ lot: pr.lot, zone: pr.zone }, cands.map((n) => ({ ...n })), 1);
  pr.assemble = res.alreadyMeets === false && res.options.length > 0;
  if (pr.adj) withAdj++; if (pr.assemble) canAssemble++;
}
fs.writeFileSync(oppFile, JSON.stringify(opp));
log(`opportunity lots with adjacent vacant/public lots: ${withAdj}; undersized lots that can reach the minimum by combining with vacant/public neighbors: ${canAssemble}`);
