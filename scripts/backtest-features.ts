/**
 * Validation backtest, step A: engine features for the 2019 cohort (parcels vacant in the Aug-2019 assessment snapshot).
 * Inputs are the 2019 assessment values (vacancy, use/class, lot area, land value), NOT today's data, because today's data
 * leaks the answer (built lots are no longer vacant). Geometry/hazards/zoning come from today's layers (static geography).
 * Neighborhood "low-value" cutoffs are recomputed from the 2019 assessments. Owner type is unknown for 2019 (ParcelsPublic
 * owner categories are current), so Site & title only credits vacancy.
 * Run: npx tsx scripts/backtest-features.ts   (spawns workers; writes ml/data/features.csv)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONFIG, computeOverlaps, currentRules, reformRules, scoreParcel } from '../lib';
import { loadEngineData, ParcelStore, ROOT } from '../lib/data/load';
import { readNdjson } from '../lib/data/io';
import type { ProcessedParcel } from '../lib/types';

const ML = path.join(ROOT, 'ml/data');
const isWorker = process.argv[2] === 'worker';

function hoodValues2019(store: ParcelStore, rows: any[]) {
  const by: Record<string, number[]> = {};
  for (const r of rows) {
    if (!r.land || !r.lot || r.lot < 300) continue;
    if (r.class !== 'RESIDENTIAL' && !r.vacant) continue;
    const p = store.byPin(r.pin); if (!p?.neighborhood) continue;
    (by[p.neighborhood] ??= []).push(r.land / r.lot);
  }
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const hoods = Object.entries(by).filter(([, v]) => v.length >= 20).map(([h, v]) => [h, Math.round(med(v) * 100) / 100] as const);
  const sorted = hoods.map(([, v]) => v).sort((a, b) => a - b);
  return { lowValueThreshold: sorted[Math.floor(sorted.length / 3)], medianOfMedians: sorted[Math.floor(sorted.length / 2)], byHood: Object.fromEntries(hoods) };
}

if (isWorker) {
  const shard = Number(process.argv[3]), n = Number(process.argv[4]);
  const store = new ParcelStore();
  const data = loadEngineData();
  const rows = readNdjson(path.join(ML, 'assess_2019_min.ndjson'));
  data.hoodValues = hoodValues2019(store, rows);
  const cohort = rows.filter((r) => r.vacant);
  const out: string[] = [];
  let missing = 0;
  for (let i = shard; i < cohort.length; i += n) {
    const r = cohort[i];
    const p = store.byPin(r.pin);
    if (!p) { missing++; continue; }
    // 2019 view of the parcel (fields not known in 2019 are set to unknown, never to today's values)
    const p19: ProcessedParcel = { ...p, vacant: true, useDesc: r.use, classDesc: r.class, ownerType: null, lotAreaSqft: r.lot && r.lot > 0 ? r.lot : null, lotAreaAssessorSqft: null,
      assessment: r.land != null ? { landValue: r.land, buildingValue: 0, totalValue: r.land, saleDate: null, salePrice: null, saleDesc: null, taxYear: 2019, asOf: '2019-08' } : null };
    const ov = computeOverlaps(p.geometry, data.layers, CONFIG.minOverlapFraction);
    const c = scoreParcel(p19, data, currentRules, CONFIG, ov);
    const rf = scoreParcel(p19, data, reformRules, CONFIG, ov);
    const sub = c.subScores;
    out.push([r.pin, p.neighborhood ?? '', p.zoningDistrict ?? '', c.score ?? '', rf.score ?? '', c.gates.filter((g) => g.triggered).map((g) => g.id).join('|'),
      sub?.zoning.score ?? '', sub?.environmental.score ?? '', sub?.funding.score ?? '', sub?.access.score ?? '', sub?.site.score ?? '',
      ov.slope25.overlapFraction, ov.landslide.overlapFraction, ov.undermined.overlapFraction, ov.fema2014.overlapFraction, ov.historic.overlapFraction, ov.iz_overlay.overlapFraction, ov.transit_buffer.overlapFraction,
      p19.lotAreaSqft ?? '', r.land ?? '', c.flags.some((f) => f.id === 'lot-below-minimum') ? 1 : 0].join(','));
    if (out.length % 500 === 0) console.log(`shard ${shard}: ${out.length}`);
  }
  fs.writeFileSync(path.join(ML, `features-${shard}.csv`), out.join('\n') + '\n');
  console.log(`shard ${shard} done: ${out.length} scored, ${missing} PINs no longer in the parcel layer`);
} else {
  const N = Math.max(1, Math.min(8, os.cpus().length - 1));
  const HEADER = 'pin,hood,zone,score,score_reform,gates,zoning,environmental,funding,access,site,slope,landslide,undermined,flood,historic,iz,transit,lot_sqft,land_value,below_min';
  Promise.all(Array.from({ length: N }, (_, i) => new Promise<void>((res, rej) => {
    const c = spawn('node', ['--max-old-space-size=6144', '--import', 'tsx', 'scripts/backtest-features.ts', 'worker', String(i), String(N)], { cwd: ROOT, stdio: 'inherit' });
    c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`worker ${i} exit ${code}`))));
  }))).then(() => {
    const parts = Array.from({ length: N }, (_, i) => fs.readFileSync(path.join(ML, `features-${i}.csv`), 'utf8').trim()).filter(Boolean);
    fs.writeFileSync(path.join(ML, 'features.csv'), HEADER + '\n' + parts.join('\n') + '\n');
    for (let i = 0; i < N; i++) fs.rmSync(path.join(ML, `features-${i}.csv`));
    console.log('wrote ml/data/features.csv');
  }).catch((e) => { console.error(e); process.exit(1); });
}
