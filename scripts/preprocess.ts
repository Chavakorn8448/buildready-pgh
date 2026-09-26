/**
 * Phase 2: raw -> processed.
 *  - all geometry is WGS84 (fetch asks the server for outSR=4326; verified here by coordinate range)
 *  - owner names never enter data/processed (only owner TYPE)
 *  - joins: ParcelsPublic (base) + assessments (PIN=PARID) + base-zoning polygons (spatial) + city limits
 *  - writes cross-check of spatial zoning vs ParcelsPublic.zon_new
 */
import fs from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import { readFeatures, readNdjson, writeFeatureLines } from '../lib/data/io';
import { bboxOf, bboxIntersects, bboxContains, pointInGeom, SQFT_PER_SQM, ringsOf, type BBox } from '../lib/geo';
import type { Geom, ProcessedParcel, OwnerType } from '../lib/types';

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data/raw');
const OUT = path.join(ROOT, 'data/processed');
fs.mkdirSync(path.join(OUT, 'layers'), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(RAW, 'manifest.json'), 'utf8'));
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);

const layerAvailable = (k: string) => manifest[k]?.status === 'ok';
if (!layerAvailable('parcels_public') || !layerAvailable('zoning') || !layerAvailable('city_limits')) {
  console.error('Blocking layer unavailable (parcels_public / zoning / city_limits) — see data/SOURCES.md');
  process.exit(2);
}

// ---------- overlay / hazard layers (minimal properties only) ----------
const LAYERS: Record<string, string[]> = {
  slope25: [], landslide: [], undermined: [], fema2014: ['fld_zone', 'floodway', 'sfha_tf'],
  historic: ['historic_name', 'type'], iz_overlay: ['HOOD'], parking_reduction: ['name', 'reduction'],
  transit_buffer: [], city_limits: [], zoning: ['zon_new', 'full_zoning_type', 'status'],
};
const layerGeoms: Record<string, { bbox: BBox; geometry: Geom; props: Record<string, any> }[]> = {};
const layerMeta: Record<string, unknown> = {};
for (const [key, keep] of Object.entries(LAYERS)) {
  if (!layerAvailable(key)) { layerMeta[key] = { key, status: 'unavailable', error: manifest[key]?.error ?? 'not fetched' }; continue; }
  const feats = readFeatures(path.join(RAW, `${key}.geojson`)).filter((f: any) => f.geometry);
  const out = feats.map((f: any) => {
    const props: Record<string, any> = {};
    for (const k of keep) props[k] = f.properties?.[k] ?? null;
    return { type: 'Feature', properties: props, geometry: f.geometry };
  });
  // WGS84 sanity check
  const [x, y] = ringsOf(out[0].geometry)[0][0][0];
  if (!(x > -81 && x < -79 && y > 40 && y < 41)) throw new Error(`${key}: coordinates not WGS84 (${x},${y})`);
  writeFeatureLines(path.join(OUT, 'layers', `${key}.geojson`), out);
  layerGeoms[key] = out.map((f: any) => ({ bbox: bboxOf(f.geometry), geometry: f.geometry, props: f.properties }));
  const m = manifest[key];
  layerMeta[key] = { key, status: 'ok', url: m.url, retrievedAt: m.retrievedAt, count: out.length, sourceUsed: m.sourceUsed };
}
for (const k of Object.keys(LAYERS)) if (!layerMeta[k]) layerMeta[k] = { key: k, status: 'unavailable', error: 'not fetched' };
for (const k of ['parcels_public', 'parcels_pgh', 'assessments', 'addresses'])
  layerMeta[k] = manifest[k] ? { key: k, status: manifest[k].status, url: manifest[k].url, retrievedAt: manifest[k].retrievedAt, count: manifest[k].count, error: manifest[k].error } : { key: k, status: 'unavailable' };
fs.writeFileSync(path.join(OUT, 'layers.json'), JSON.stringify(layerMeta, null, 2));
log('layers written');

// ---------- zoning polygons: Approved (or unlabeled) only; Pending = proposed rezonings, excluded ----------
const zoneStatus: Record<string, number> = {};
for (const z of layerGeoms.zoning) zoneStatus[String(z.props.status)] = (zoneStatus[String(z.props.status)] ?? 0) + 1;
const zones = layerGeoms.zoning.filter((z) => z.props.status !== 'Pending' && z.props.zon_new);
log(`zoning polygons by status ${JSON.stringify(zoneStatus)}; using ${zones.length}`);
const city = layerGeoms.city_limits;

// ---------- assessments ----------
const assess = new Map<string, any>();
if (layerAvailable('assessments')) for (const r of readNdjson(path.join(RAW, 'assessments.ndjson'))) assess.set(String(r.PARID).trim(), r);
log(`assessments indexed: ${assess.size}`);
const pgh = new Map<string, any>();
if (layerAvailable('parcels_pgh')) for (const f of readFeatures(path.join(RAW, 'parcels_pgh.geojson'))) pgh.set(f.properties.pin, f.properties);

const isoDate = (s: string | null) => (s && /^\d\d-\d\d-\d{4}$/.test(s) ? `${s.slice(6)}-${s.slice(0, 2)}-${s.slice(3, 5)}` : null);
const num = (v: any) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const OWNER = new Set(['City', 'County', 'HACP', 'URA', 'Private', 'Other']);

function districtsAt(p: number[]): string[] {
  const hit: string[] = [];
  for (const z of zones) if (bboxContains(z.bbox, p) && pointInGeom(p, z.geometry)) hit.push(z.props.zon_new);
  return hit;
}

// ---------- parcels ----------
const feats = readFeatures(path.join(RAW, 'parcels_public.geojson'));
log(`parcels read: ${feats.length}`);
const parcelsOut: ProcessedParcel[] = [];
const seen = new Set<string>();
let dupPins = 0, noGeom = 0, splitCount = 0, noZone = 0, intersectErrors = 0;
const areaCmp = { n: 0, sumRelGeomVsShape: 0, sumRelGeomVsAssessor: 0, nAssessor: 0, over5pctAssessor: 0 };

for (const f of feats) {
  const p = f.properties;
  if (!f.geometry || !p.pin) { noGeom++; continue; }
  const pin = String(p.pin).trim();
  if (seen.has(pin)) { dupPins++; continue; } // keep first record per PIN
  seen.add(pin);
  const geometry = f.geometry as Geom;
  const bbox = bboxOf(geometry);
  const feature = { type: 'Feature', properties: {}, geometry } as any;
  let cen: number[];
  try { cen = turf.pointOnFeature(feature).geometry.coordinates; } catch { cen = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]; }

  // lot area
  const geomSqft = turf.area(feature) * SQFT_PER_SQM;
  const a = assess.get(pin) ?? null;
  const assessorLot = a ? num(a.LOTAREA) : null;
  const shape = num(p.Shape__Area);
  if (shape) { areaCmp.n++; areaCmp.sumRelGeomVsShape += Math.abs(geomSqft - shape) / shape; }
  if (assessorLot && assessorLot > 0) {
    areaCmp.nAssessor++; const r = Math.abs(geomSqft - assessorLot) / assessorLot; areaCmp.sumRelGeomVsAssessor += r; if (r > 0.05) areaCmp.over5pctAssessor++;
  }

  // zoning spatial join: district at an interior point; check shrunken interior samples for split parcels
  const primary = districtsAt(cen);
  let district: string | null = primary[0] ?? null;
  let share: number | null = district ? 1 : null;
  let others: string[] = [];
  if (!district) noZone++;
  else {
    const ring = ringsOf(geometry)[0][0];
    const step = Math.max(1, Math.floor(ring.length / 12));
    let suspicious = primary.length > 1;
    for (let i = 0; i < ring.length && !suspicious; i += step) {
      const s = [cen[0] + (ring[i][0] - cen[0]) * 0.85, cen[1] + (ring[i][1] - cen[1]) * 0.85];
      if (!pointInGeom(s, geometry)) continue;
      const d = districtsAt(s);
      if (d.length && !d.includes(district)) suspicious = true;
    }
    if (suspicious) {
      const shares = new Map<string, number>();
      let total = 0;
      for (const z of zones) {
        if (!bboxIntersects(z.bbox, bbox)) continue;
        try {
          const inter = turf.intersect(turf.featureCollection([feature, { type: 'Feature', properties: {}, geometry: z.geometry } as any]));
          if (inter) { const ar = turf.area(inter); total += ar; shares.set(z.props.zon_new, (shares.get(z.props.zon_new) ?? 0) + ar); }
        } catch { intersectErrors++; }
      }
      const parcelArea = turf.area(feature);
      if (total > 0 && parcelArea > 0) {
        const ranked = [...shares.entries()].sort((x, y) => y[1] - x[1]);
        district = ranked[0][0]; share = Math.min(1, ranked[0][1] / parcelArea);
        others = ranked.slice(1).filter(([, ar]) => ar / parcelArea > 0.05).map(([d]) => d);
        if (others.length) splitCount++;
      }
    }
  }

  const inCity = city.some((c) => bboxContains(c.bbox, cen) && pointInGeom(cen, c.geometry));
  const zp = p.zon_new ? String(p.zon_new).trim() : null;
  const house = String(p.propertyho ?? '').trim();
  const street = String(p.propertyad ?? '').trim();
  const ownerType = OWNER.has(p.OwnerCateg) ? (p.OwnerCateg as OwnerType) : null;

  parcelsOut.push({
    pin, house, street,
    address: house && house !== '0' ? `${house} ${street}` : street ? `0 ${street}` : '',
    neighborhood: p.hood ?? null,
    classDesc: p.classdesc ?? null, useDesc: p.usedesc ?? null,
    ownerType,
    vacant: p.Vacant === 'Vacant' ? true : p.Vacant === 'Not Vacant' ? false : null,
    lotAreaSqft: Math.round(geomSqft * 10) / 10,
    lotAreaSource: 'polygon area (WGS84 geodesic) of ParcelsPublic geometry',
    lotAreaAssessorSqft: assessorLot && assessorLot > 0 ? assessorLot : null,
    zoningDistrict: district, zoningShare: share === null ? null : Math.round(share * 1000) / 1000, zoningOther: others,
    zoningParcelsPublic: zp, zoningAgrees: district && zp ? district === zp : null,
    assessment: a ? {
      landValue: num(a.FAIRMARKETLAND), buildingValue: num(a.FAIRMARKETBUILDING), totalValue: num(a.FAIRMARKETTOTAL),
      saleDate: isoDate(a.SALEDATE), salePrice: num(a.SALEPRICE), saleDesc: a.SALEDESC ?? null,
      taxYear: num(a.TAXYEAR), asOf: a.ASOFDATE ?? null,
    } : null,
    inCityLimits: inCity,
    centroid: [Math.round(cen[0] * 1e6) / 1e6, Math.round(cen[1] * 1e6) / 1e6],
    bbox, geometry,
  });
  if (parcelsOut.length % 20000 === 0) log(`  processed ${parcelsOut.length}`);
}
log(`parcels processed: ${parcelsOut.length} (dupPins ${dupPins}, noGeom ${noGeom}, noZone ${noZone}, split ${splitCount}, intersectErrors ${intersectErrors})`);

// ---------- write parcels + byte-offset index ----------
const fd = fs.openSync(path.join(OUT, 'parcels.ndjson'), 'w');
const index: Record<string, [number, number]> = {};
const byAddress: Record<string, string[]> = {};
let off = 0;
for (const pc of parcelsOut) {
  const line = JSON.stringify(pc) + '\n';
  const len = Buffer.byteLength(line);
  fs.writeSync(fd, line);
  index[pc.pin] = [off, len - 1];
  off += len;
  if (pc.house && pc.street) (byAddress[`${pc.house} ${pc.street}`.toUpperCase()] ??= []).push(pc.pin);
}
fs.closeSync(fd);
fs.writeFileSync(path.join(OUT, 'parcels.index.json'), JSON.stringify({ byPin: index, byAddress }));
log(`parcels.ndjson ${(off / 1e6).toFixed(0)} MB`);

// ---------- zoning cross-check vs ParcelsPublic.zon_new ----------
const pub = new Set(['City', 'URA', 'HACP', 'County']);
const xc = { all: { n: 0, match: 0 }, publicLots: { n: 0, match: 0 } } as any;
const pairs: Record<string, number> = {};
const samples: any[] = [];
for (const pc of parcelsOut) {
  if (pc.zoningAgrees === null) continue;
  const isPub = pc.ownerType !== null && pub.has(pc.ownerType);
  xc.all.n++; if (pc.zoningAgrees) xc.all.match++;
  if (isPub) { xc.publicLots.n++; if (pc.zoningAgrees) xc.publicLots.match++; }
  if (!pc.zoningAgrees) {
    const k = `${pc.zoningDistrict} (polygon) vs ${pc.zoningParcelsPublic} (zon_new)`;
    pairs[k] = (pairs[k] ?? 0) + 1;
    if (samples.length < 100) samples.push({ pin: pc.pin, address: pc.address, polygon: pc.zoningDistrict, zon_new: pc.zoningParcelsPublic, share: pc.zoningShare, ownerType: pc.ownerType });
  }
}
const crosscheck = {
  generatedAt: new Date().toISOString().slice(0, 10),
  zoningPolygonSource: manifest.zoning.sourceUsed,
  ...xc,
  matchRateAll: xc.all.match / xc.all.n, matchRatePublicLots: xc.publicLots.match / xc.publicLots.n,
  parcelsWithNoPolygonDistrict: parcelsOut.filter((p) => !p.zoningDistrict).length,
  parcelsWithoutZonNew: parcelsOut.filter((p) => !p.zoningParcelsPublic).length,
  splitZoningParcels: splitCount,
  topMismatchPairs: Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 25),
  sampleMismatches: samples,
};
fs.writeFileSync(path.join(OUT, 'zoning-crosscheck.json'), JSON.stringify(crosscheck, null, 2));

// ---------- neighborhood value stats (funding fit: "low-value area") ----------
const hoodVals: Record<string, number[]> = {};
for (const pc of parcelsOut) {
  const a = pc.assessment;
  if (!a?.landValue || !pc.lotAreaSqft || pc.lotAreaSqft < 300 || !pc.neighborhood) continue;
  if (pc.classDesc !== 'RESIDENTIAL' && !pc.vacant) continue;
  (hoodVals[pc.neighborhood] ??= []).push(a.landValue / pc.lotAreaSqft);
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const hoods = Object.entries(hoodVals).filter(([, v]) => v.length >= 20).map(([h, v]) => ({ hood: h, medianLandValuePerSqft: Math.round(median(v) * 100) / 100, n: v.length }));
const sortedVals = hoods.map((h) => h.medianLandValuePerSqft).sort((a, b) => a - b);
const stats = {
  definition: 'Median assessed (fair-market) LAND value per sq ft of residential or vacant parcels, by neighborhood (hood), >=20 parcels. lowValueThreshold = 33rd percentile across neighborhoods.',
  source: 'WPRDC property-assessments FAIRMARKETLAND / polygon lot area',
  neighborhoods: hoods.length,
  lowValueThreshold: sortedVals[Math.floor(sortedVals.length / 3)],
  medianOfMedians: sortedVals[Math.floor(sortedVals.length / 2)],
  byHood: Object.fromEntries(hoods.map((h) => [h.hood, h.medianLandValuePerSqft])),
};
fs.writeFileSync(path.join(OUT, 'neighborhood-values.json'), JSON.stringify(stats, null, 2));

// ---------- summary ----------
const summary = {
  generatedAt: new Date().toISOString().slice(0, 10),
  parcels: parcelsOut.length, dupPinsDropped: dupPins, noGeometryDropped: noGeom,
  withAssessment: parcelsOut.filter((p) => p.assessment).length,
  withoutAssessment: parcelsOut.filter((p) => !p.assessment).length,
  inCityLimits: parcelsOut.filter((p) => p.inCityLimits).length,
  outsideCityLimits: parcelsOut.filter((p) => !p.inCityLimits).length,
  zoningJoin: { withDistrict: parcelsOut.filter((p) => p.zoningDistrict).length, none: noZone, splitParcels: splitCount, agreesWithZonNew: xc.all.match, disagrees: xc.all.n - xc.all.match },
  lotAreaChecks: {
    meanRelDiffPolygonVsShapeArea: areaCmp.sumRelGeomVsShape / Math.max(1, areaCmp.n),
    meanRelDiffPolygonVsAssessor: areaCmp.sumRelGeomVsAssessor / Math.max(1, areaCmp.nAssessor),
    assessorDiffOver5pct: areaCmp.over5pctAssessor, assessorCompared: areaCmp.nAssessor,
  },
  ownerTypes: Object.fromEntries([...new Set(parcelsOut.map((p) => p.ownerType))].map((t) => [String(t), parcelsOut.filter((p) => p.ownerType === t).length])),
};
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`crosscheck: all ${(crosscheck.matchRateAll * 100).toFixed(1)}% (${xc.all.n}), public lots ${(crosscheck.matchRatePublicLots * 100).toFixed(1)}% (${xc.publicLots.n})`);
log('done');
