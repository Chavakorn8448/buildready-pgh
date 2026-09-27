/**
 * Maps each parcel to a ZIP code, for the HUD SAFMR rent reference (data/rules/safmr-pittsburgh.json).
 * We don't fetch PROPERTYZIP for parcels (not requested in scripts/fetch.ts), so this uses the Addresses_GeneralUse
 * point layer (has zip_code) and assigns each parcel the zip of its nearest address point within 400 m.
 * Output: data/rules/parcel-zip.json.gz — {pin: zip}, only for parcels matched (not every parcel has a nearby address point).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { readFeatures } from '../lib/data/io';
import { ParcelStore, ROOT } from '../lib/data/load';

const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);

const CELL = 0.003; // ~250m
const key = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
const grid = new Map<string, { lon: number; lat: number; zip: string }[]>();
let nAddr = 0;
for (const f of readFeatures(path.join(ROOT, 'data/raw/addresses.geojson'))) {
  const z = f.properties?.zip_code ? String(f.properties.zip_code).trim().slice(0, 5) : null;
  if (!z || !f.geometry || f.geometry.type !== 'Point') continue;
  const [lon, lat] = f.geometry.coordinates;
  const k = key(lon, lat);
  (grid.get(k) ?? grid.set(k, []).get(k)!).push({ lon, lat, zip: z });
  nAddr++;
}
log(`indexed ${nAddr} address points`);

const store = new ParcelStore();
const out: Record<string, string> = {};
let matched = 0, checked = 0;
const MAX_M = 400;
for (const pin of store.pins()) {
  checked++;
  const p = store.byPin(pin)!;
  const [lon, lat] = p.centroid;
  const cx = Math.floor(lon / CELL), cy = Math.floor(lat / CELL);
  let best: { d: number; zip: string } | null = null;
  for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const a of grid.get(`${x}:${y}`) ?? []) {
    const d = Math.hypot((a.lon - lon) * 85000, (a.lat - lat) * 111000); // meters, rough at this latitude
    if (d <= MAX_M && (!best || d < best.d)) best = { d, zip: a.zip };
  }
  if (best) { out[pin] = best.zip; matched++; }
  if (checked % 30000 === 0) log(`  ${checked} parcels checked`);
}
const file = path.join(ROOT, 'data/rules/parcel-zip.json.gz');
fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(out), { level: 9 }));
log(`matched ${matched} of ${checked} parcels to a zip within ${MAX_M} m; wrote ${(fs.statSync(file).size / 1e6).toFixed(2)} MB gz`);
