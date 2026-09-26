/** Simplified copies of the map layers for the web app's map (display only; scoring uses the full-resolution layers). -> public/layers/*.json */
import fs from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import { readFeatures } from '../lib/data/io';
import { ROOT } from '../lib/data/load';

const SRC = path.join(ROOT, 'data/processed/layers');
const OUT = path.join(ROOT, 'public/layers');
fs.mkdirSync(OUT, { recursive: true });
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
const roundCoords = (c: any): any => (typeof c[0] === 'number' ? [r5(c[0]), r5(c[1])] : c.map(roundCoords));

// [layer, simplify tolerance (deg), property keep-list, filter]
const CFG: [string, number, string[], ((p: any) => boolean)?][] = [
  // slope25 is NOT shipped as a layer (600k+ raster-stairstep vertices even after simplification); the parcel map draws per-parcel overlap pieces instead
  ['landslide', 0.00006, []],
  ['undermined', 0.00006, []],
  ['fema2014', 0.00006, ['fld_zone', 'floodway'], (p) => p.sfha_tf === 'T'],
  ['historic', 0.00004, ['historic_name']],
  ['iz_overlay', 0.00008, ['HOOD']],
  ['transit_buffer', 0.00008, []],
  ['zoning', 0.00003, ['zon_new', 'full_zoning_type'], (p) => p.status !== 'Pending'],
  ['city_limits', 0.0001, []],
];
for (const [key, tol, keep, filter] of CFG) {
  const file = path.join(SRC, `${key}.geojson`);
  if (!fs.existsSync(file)) { console.log(`skip ${key} (unavailable)`); continue; }
  let feats = readFeatures(file).filter((f: any) => !filter || filter(f.properties ?? {}));
  if (key === 'slope25') feats = feats.filter((f: any) => turf.area(f) > 250); // display only: drop specks < 250 m²
  const out: any[] = [];
  for (const f of feats) {
    let g: any = f;
    try { g = turf.simplify(f, { tolerance: tol, highQuality: false, mutate: false }); } catch { /* keep original */ }
    if (!g.geometry) continue;
    out.push({ type: 'Feature', properties: Object.fromEntries(keep.map((k) => [k, f.properties?.[k] ?? null])), geometry: { type: g.geometry.type, coordinates: roundCoords(g.geometry.coordinates) } });
  }
  fs.writeFileSync(path.join(OUT, `${key}.json`), JSON.stringify({ type: 'FeatureCollection', features: out }));
  console.log(key.padEnd(16), out.length, `${(fs.statSync(path.join(OUT, `${key}.json`)).size / 1e6).toFixed(2)} MB`);
}
