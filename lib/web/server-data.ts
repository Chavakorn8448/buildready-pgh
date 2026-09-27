/** Server-side loaders for precomputed data (reads data/ only; no network). Never import from client components. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { INDEX_COLS, OWNER_CODES, type IndexRow, type Packet } from '../packets';
import { normalizeAddress, normalizeStreet, parsePin, splitAddress } from '../lookup';

const ROOT = process.cwd();
const D = (...p: string[]) => path.join(ROOT, 'data', ...p);
/** Reads a JSON file that may be stored gzipped (data/scores is committed as .json.gz to keep the deploy small). */
function readJson(file: string): any {
  if (fs.existsSync(file + '.gz')) return JSON.parse(zlib.gunzipSync(fs.readFileSync(file + '.gz')).toString('utf8'));
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

let _meta: any, _index: { rows: IndexRow[]; hoods: { id: number; name: string; slug: string; scoped: number }[]; norm: string[] } | null = null;
const _shards = new Map<string, Record<string, Packet>>();
const _byPin = new Map<string, IndexRow>();

export function getMeta() {
  return (_meta ??= JSON.parse(fs.readFileSync(D('scores', 'meta.json'), 'utf8')));
}

export function getIndex() {
  if (_index) return _index;
  const raw = readJson(D('scores', 'index.json'));
  const rows: IndexRow[] = raw.rows.map((r: any[]) => ({
    pin: r[0], address: r[1], hood: r[2], owner: r[3] >= 0 ? OWNER_CODES[r[3]] : null, vacant: r[4] < 0 ? null : r[4] === 1, lot: r[5], zone: r[6],
    score: r[7], reform: r[8], gates: r[9], lon: r[10], lat: r[11], aduReady: r[12] === 1, combine: r[13] === 1, starter: r[14] === 1,
  }));
  for (const r of rows) _byPin.set(r.pin, r);
  const norm = rows.map((r) => { const sp = splitAddress(r.address); return sp ? normalizeAddress(sp.house, sp.street) : r.address.toUpperCase(); });
  return (_index = { rows, hoods: raw.hoods, norm });
}

export function getRow(pin: string): IndexRow | undefined { getIndex(); return _byPin.get(pin); }

export function getPacket(pin: string): { packet: Packet; row: IndexRow; hood: string } | null {
  const idx = getIndex();
  const row = _byPin.get(pin);
  if (!row) return null;
  const hood = idx.hoods[row.hood];
  let shard = _shards.get(hood.slug);
  if (!shard) { shard = readJson(D('scores', 'packets', `${hood.slug}.json`)); _shards.set(hood.slug, shard!); }
  const packet = shard![pin];
  return packet ? { packet, row, hood: hood.name } : null;
}

export function getOpportunity() {
  return fs.readFileSync(D('opportunity.json'), 'utf8');
}
export function getReformImpact() { return JSON.parse(fs.readFileSync(D('reform-impact.json'), 'utf8')); }
export function getValidation() { const f = D('validation.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; }

export function getAiCache(pin: string, ruleSet: string): Record<string, any> | null {
  const f = D('ai-cache', `${pin}_${ruleSet}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

/** PIN or address search over the precomputed snapshot. */
export function search(q: string, limit = 8): { rows: IndexRow[]; note?: string } {
  const idx = getIndex();
  const pin = parsePin(q);
  if (pin) { const r = _byPin.get(pin); return { rows: r ? [r] : [], note: r ? undefined : `Parcel ${pin} is not in the City of Pittsburgh snapshot.` }; }
  const sp = splitAddress(q);
  const needle = sp ? normalizeAddress(sp.house, sp.street) : normalizeStreet(q);
  if (needle.length < 2) return { rows: [] };
  const exact: IndexRow[] = [], starts: IndexRow[] = [], contains: IndexRow[] = [];
  for (let i = 0; i < idx.rows.length; i++) {
    const a = idx.norm[i];
    if (a === needle) exact.push(idx.rows[i]);
    else if (a.startsWith(needle)) starts.push(idx.rows[i]);
    else if (a.includes(needle)) contains.push(idx.rows[i]);
    if (exact.length + starts.length > 200) break;
  }
  const rows = [...exact, ...starts, ...contains].slice(0, limit);
  return { rows, note: rows.length ? undefined : 'No match in the City of Pittsburgh snapshot. Try the house number and street, e.g. 5815 5th Ave.' };
}

let _adj: Record<string, string[]> | null = null;
/** Adjacent parcels (shared boundary) for vacant and undersized parcels, with the fields the assemblage finder needs. */
export function getNeighbors(pin: string): { pin: string; address: string; owner: string | null; vacant: boolean | null; lot: number | null; zone: string | null; geometry: any }[] {
  if (!_adj) { const f = D('scores', 'adjacency.json'); try { _adj = readJson(f); } catch { _adj = {}; } }
  const out: any[] = [];
  for (const q of _adj![pin] ?? []) {
    const row = getRow(q); if (!row) continue;
    const pk = getPacket(q);
    out.push({ pin: q, address: row.address, owner: row.owner, vacant: row.vacant, lot: row.lot, zone: row.zone, geometry: pk?.packet.p.geometry ?? null });
  }
  return out;
}
