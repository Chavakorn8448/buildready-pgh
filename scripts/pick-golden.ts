/** Helper used once to choose the 5 golden parcels from real data (prints candidates; nothing is generated). */
import { bboxIntersects } from '../lib/geo';
import { loadEngineData, ParcelStore } from '../lib/data/load';
import { CURRENT_LOT_MIN, compareRuleSets, currentRules, reformRules, scoreParcel, parseZoning } from '../lib';

const store = new ParcelStore();
const data = loadEngineData();
const line = (tag: string, s: ReturnType<typeof scoreParcel>, extra = '') =>
  console.log(`${tag} ${s.parcelId} ${s.address.padEnd(28)} ${(s.neighborhood ?? '').padEnd(18)} score=${s.score} ${extra}`);

const haz = ['slope25', 'landslide', 'fema2014'].flatMap((k) => data.layers[k] ?? []);
const pins = store.pins();
const c1: any[] = [], c2: any[] = [], c3: any[] = [], c4: any[] = [];
let n = 0;
for (const pin of pins) {
  const p = store.byPin(pin)!;
  const z = parseZoning(p.zoningDistrict, data.permittedUses);
  // 1: vacant city-owned
  if (p.ownerType === 'City' && p.vacant && z.housing === 'by_right' && p.zoningShare === 1 && !p.zoningOther.length && p.zoningAgrees) {
    if (++n % 3 === 0 || true) c1.push(p);
  }
  // 3: below minimum, both sources agree
  if (z.residentialFamily && z.density && CURRENT_LOT_MIN[z.density] !== null && p.zoningAgrees && p.lotAreaAssessorSqft && p.lotAreaSqft && p.classDesc === 'RESIDENTIAL') {
    const min = CURRENT_LOT_MIN[z.density]!;
    if (p.lotAreaSqft < min * 0.9 && p.lotAreaAssessorSqft < min * 0.9 && p.lotAreaSqft > min * 0.5 && p.zoningShare === 1) c3.push(p);
  }
  // 2/4: hazard candidates by bbox
  if (p.zoningAgrees && p.classDesc === 'RESIDENTIAL' && haz.some((f) => bboxIntersects(f.bbox, p.bbox as any))) (c2).push(p);
}
console.log({ c1: c1.length, c3: c3.length, hazBbox: c2.length });

// 1: score city-owned vacant, keep top
const top1 = c1.map((p) => scoreParcel(p, data, currentRules)).filter((s) => s.score !== null).sort((a, b) => b.score! - a.score!).slice(0, 8);
top1.forEach((s) => line('G1 vacant-city', s, `access=${s.subScores!.access.score}`));

// 2/4: hazards
const hz = c2.slice(0, 4000).map((p) => scoreParcel(p, data, currentRules)).filter((s) => s.score !== null);
const slope = hz.filter((s) => (s.overlaps!.slope25.overlapFraction >= 0.3 || s.overlaps!.landslide.overlapFraction >= 0.3)).sort((a, b) => (b.overlaps!.slope25.overlapFraction + b.overlaps!.landslide.overlapFraction) - (a.overlaps!.slope25.overlapFraction + a.overlaps!.landslide.overlapFraction));
slope.slice(0, 8).forEach((s) => line('G2 slope/landslide', s, `slope=${s.overlaps!.slope25.overlapFraction} landslide=${s.overlaps!.landslide.overlapFraction}`));
const flood = hz.filter((s) => s.overlaps!.fema2014.overlapFraction >= 0.3).sort((a, b) => b.overlaps!.fema2014.overlapFraction - a.overlaps!.fema2014.overlapFraction);
console.log('flood candidates scanned', hz.length);
flood.slice(0, 8).forEach((s) => line('G4 flood', s, `flood=${s.overlaps!.fema2014.overlapFraction}`));

// 3
c3.slice(0, 3000).map((p) => scoreParcel(p, data, currentRules)).filter((s) => s.flags.some((f) => f.id === 'lot-below-minimum')).slice(0, 8).forEach((s) => line('G3 below-min', s, s.flags.find((f) => f.id === 'lot-below-minimum')!.text));

// 5
let shown = 0;
for (const p of c2.slice(0, 200)) {
  const c = compareRuleSets(p, data, currentRules, reformRules);
  if (c.delta !== null && c.delta > 0 && shown < 6) { shown++; line('G5 reform', c.reform, `delta=${c.delta} current=${c.current.score}`); }
}
