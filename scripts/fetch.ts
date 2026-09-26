/**
 * Phase 1: download raw data to data/raw (gitignored) and write data/SOURCES.md.
 * - No secrets, no API keys.
 * - PII: owner-name fields are never requested (explicit outFields / fields lists).
 * - A layer that fails (3 attempts + fallback) is marked "unavailable"; the engine treats it as confidence "unknown".
 * - Files are GeoJSON (WGS84), one feature per line so big files can be streamed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchJson } from './lib/http';

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data/raw');
const ARC = 'https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services';
const today = new Date().toISOString().slice(0, 10);

type LayerCfg = { key: string; service: string; outFields: string; note?: string; required?: boolean };

// propertyow (owner name) is deliberately absent from every outFields list.
const ARC_LAYERS: LayerCfg[] = [
  { key: 'parcels_public', service: 'ParcelsPublic', required: true,
    outFields: 'OBJECTID,pin,mapblocklo,calcacreag,propertyho,propertyad,ownerdesc,classdesc,usedesc,localbuild,Vacant,OwnerCateg,Address,DIST_NAME,hood,zon_new,Shape__Area' },
  { key: 'parcels_pgh', service: 'ParcelsPGH',
    outFields: 'OBJECTID,pin,mapblocklo,calcacreag,parid,propertyho,propertyfr,propertyad,munidesc,neighdesc,ownerdesc,classdesc,usedesc,lotarea',
    note: 'Only a subset of city parcels (see STATUS.md); used as supplemental source for lotarea/neighdesc.' },
  { key: 'city_limits', service: 'City_Limits', outFields: '*', required: true },
  { key: 'slope25', service: 'PGHWebSlope25', outFields: '*' },
  { key: 'landslide', service: 'PGHWebLandslideProne', outFields: '*' },
  { key: 'undermined', service: 'PGHWebUndermined', outFields: '*' },
  { key: 'fema2014', service: 'PGHWebFEMA2014', outFields: '*' },
  { key: 'historic', service: 'PGHWebCHDHistoricDistricts', outFields: '*' },
  { key: 'iz_overlay', service: 'InclusionaryHousingOverlayDistrict', outFields: 'OBJECTID,HOOD,HOOD_NO,SECTORS' },
  { key: 'parking_reduction', service: 'PGHWebParkingReductionOverlay', outFields: '*' },
  { key: 'transit_buffer', service: 'PGHWebMajorTransitBuffer', outFields: '*' },
  { key: 'addresses', service: 'Addresses_GeneralUse',
    outFields: 'address_id,addr_num,st_prefix,st_name,st_type,full_addre,zip_code,status,municipali' },
];

type Manifest = Record<string, {
  key: string; status: 'ok' | 'unavailable'; url: string; retrievedAt: string; count?: number; expected?: number;
  file?: string; license?: string; note?: string; error?: string; sourceUsed?: string;
}>;
const manifest: Manifest = {};

function openOut(file: string) {
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, '{"type":"FeatureCollection","features":[\n');
  let n = 0;
  return {
    add(f: unknown) { fs.writeSync(fd, (n++ ? ',\n' : '') + JSON.stringify(f)); },
    close() { fs.writeSync(fd, '\n]}\n'); fs.closeSync(fd); return n; },
  };
}

async function svcMeta(base: string) {
  try {
    const m = await fetchJson<any>(`${base}?f=json`);
    const parts = [m.copyrightText, m.licenseInfo].filter((x: string) => x && String(x).trim());
    return { license: parts.join(' | ') || 'not stated in service metadata', maxRecordCount: m.maxRecordCount as number };
  } catch {
    return { license: 'not stated in service metadata', maxRecordCount: 1000 };
  }
}

async function fetchArcgis(cfg: LayerCfg, base: string, outName: string, idField = 'OBJECTID') {
  const meta = await svcMeta(base);
  const page = Math.min(meta.maxRecordCount || 1000, 2000);
  const q = (extra: Record<string, string>) =>
    `${base}/query?` + new URLSearchParams({ where: '1=1', f: 'geojson', ...extra }).toString();
  const expected = (await fetchJson<any>(q({ returnCountOnly: 'true', f: 'json' }))).count as number;
  const out = openOut(path.join(RAW, outName));
  let got = 0;
  try {
    for (let offset = 0; offset < expected; offset += page) {
      const j = await fetchJson<any>(q({
        outFields: cfg.outFields, outSR: '4326', geometryPrecision: '6', orderByFields: idField,
        resultOffset: String(offset), resultRecordCount: String(page),
      }));
      const feats = j.features ?? [];
      if (!feats.length) break;
      for (const f of feats) out.add(f);
      got += feats.length;
      process.stdout.write(`\r  ${cfg.key}: ${got}/${expected}`);
    }
  } finally { out.close(); }
  process.stdout.write('\n');
  if (got !== expected) throw new Error(`count mismatch: got ${got}, expected ${expected}`);
  return { count: got, expected, license: meta.license };
}

async function runArc(cfg: LayerCfg) {
  const base = `${ARC}/${cfg.service}/FeatureServer/0`;
  const file = `${cfg.key}.geojson`;
  try {
    const r = await fetchArcgis(cfg, base, file);
    manifest[cfg.key] = { key: cfg.key, status: 'ok', url: base, retrievedAt: today, file: `data/raw/${file}`, note: cfg.note, ...r };
    console.log(`  OK ${cfg.key}: ${r.count} features`);
  } catch (e) {
    manifest[cfg.key] = { key: cfg.key, status: 'unavailable', url: base, retrievedAt: today, error: (e as Error).message, note: cfg.note };
    console.log(`  UNAVAILABLE ${cfg.key}: ${(e as Error).message}`);
  }
}

// Zoning districts: WPRDC GeoJSON first, then PASDA layer 39, then the city's own PGHWebZoning service.
async function runZoning() {
  const key = 'zoning';
  const file = `${key}.geojson`;
  const attempts: { name: string; url: string; run: () => Promise<{ count: number; license: string }> }[] = [];
  const wprdcPkg = 'https://data.wprdc.org/api/3/action/package_show?id=zoning';
  attempts.push({
    name: 'WPRDC zoning GeoJSON', url: 'https://data.wprdc.org/dataset/zoning',
    run: async () => {
      const pkg = await fetchJson<any>(wprdcPkg);
      const res = pkg.result.resources.find((r: any) => String(r.format).toLowerCase() === 'geojson');
      if (!res) throw new Error('no GeoJSON resource in WPRDC package');
      const gj = await fetchJson<any>(res.url);
      const feats = (gj.features ?? []).map((f: any) => {
        // strip user-edit fields (person identifiers)
        const { created_user, last_edited_user, ...p } = f.properties ?? {};
        return { ...f, properties: p };
      });
      if (!feats.length) throw new Error('empty');
      const out = openOut(path.join(RAW, file)); feats.forEach((f: unknown) => out.add(f)); out.close();
      return { count: feats.length, license: `WPRDC dataset license: ${pkg.result.license_title}` };
    },
  });
  const pasda = 'https://mapservices.pasda.psu.edu/server/rest/services/pasda/PittsburghCity/MapServer/39';
  attempts.push({
    name: 'PASDA PittsburghCity layer 39', url: pasda,
    run: async () => {
      const cfg = { key, service: '', outFields: '*' };
      const r = await fetchArcgis(cfg, pasda, file);
      return { count: r.count, license: r.license };
    },
  });
  const city = `${ARC}/PGHWebZoning/FeatureServer/0`;
  attempts.push({
    name: 'City PGHWebZoning (third fallback)', url: city,
    run: async () => {
      const r = await fetchArcgis({ key, service: '', outFields: '*' }, city, file);
      return { count: r.count, license: r.license };
    },
  });
  const errors: string[] = [];
  for (const a of attempts) {
    try {
      const r = await a.run();
      manifest[key] = { key, status: 'ok', url: a.url, retrievedAt: today, file: `data/raw/${file}`, count: r.count, license: r.license, sourceUsed: a.name };
      console.log(`  OK zoning via ${a.name}: ${r.count} features`);
      return;
    } catch (e) { errors.push(`${a.name}: ${(e as Error).message}`); console.log(`  zoning source failed -> ${a.name}`); }
  }
  manifest[key] = { key, status: 'unavailable', url: wprdcPkg, retrievedAt: today, error: errors.join(' || ') };
}

// Property assessments via CKAN datastore API. Owner names and owner mailing addresses are never requested.
const ASSESS_RESOURCE = '65855e14-549e-4992-b5be-d629afc676fa';
const ASSESS_FIELDS = ['PARID','PROPERTYHOUSENUM','PROPERTYFRACTION','PROPERTYADDRESS','MUNICODE','MUNIDESC','NEIGHDESC','OWNERDESC','CLASSDESC','USEDESC','LOTAREA',
  'SALEDATE','SALEPRICE','SALEDESC','PREVSALEDATE','PREVSALEPRICE','COUNTYLAND','COUNTYBUILDING','COUNTYTOTAL','FAIRMARKETLAND','FAIRMARKETBUILDING','FAIRMARKETTOTAL','TAXYEAR','ASOFDATE'];
async function runAssessments() {
  const key = 'assessments';
  const api = 'https://data.wprdc.org/api/3/action/datastore_search';
  try {
    const pkg = await fetchJson<any>('https://data.wprdc.org/api/3/action/package_show?id=property-assessments');
    const limit = 30000;
    const q = (offset: number) => `${api}?` + new URLSearchParams({
      resource_id: ASSESS_RESOURCE, fields: ASSESS_FIELDS.join(','), limit: String(limit), offset: String(offset), sort: '_id',
    });
    const first = await fetchJson<any>(q(0));
    const total = first.result.total as number;
    const file = path.join(RAW, `${key}.ndjson`);
    const fd = fs.openSync(file, 'w');
    let kept = 0, seen = 0;
    for (let off = 0; off < total; off += limit) {
      const j = off === 0 ? first : await fetchJson<any>(q(off));
      for (const r of j.result.records) {
        seen++;
        const mc = Number(r.MUNICODE);
        if (mc >= 101 && mc <= 132) { fs.writeSync(fd, JSON.stringify(r) + '\n'); kept++; } // City of Pittsburgh wards
      }
      process.stdout.write(`\r  assessments: ${seen}/${total} (Pittsburgh kept ${kept})`);
    }
    fs.closeSync(fd); process.stdout.write('\n');
    if (seen !== total) throw new Error(`count mismatch ${seen} vs ${total}`);
    manifest[key] = { key, status: 'ok', url: 'https://data.wprdc.org/dataset/property-assessments', retrievedAt: today, file: `data/raw/${key}.ndjson`,
      count: kept, expected: total, license: `WPRDC dataset license: ${pkg.result.license_title}`,
      note: `Filtered to MUNICODE 101-132 (City of Pittsburgh wards) of ${total} county rows. Only non-owner fields requested.` };
    console.log(`  OK assessments: ${kept} Pittsburgh rows of ${total}`);
  } catch (e) {
    manifest[key] = { key, status: 'unavailable', url: 'https://data.wprdc.org/dataset/property-assessments', retrievedAt: today, error: (e as Error).message };
    console.log(`  UNAVAILABLE assessments: ${(e as Error).message}`);
  }
}

function writeSources() {
  const L = (k: string) => manifest[k];
  const rows = Object.values(manifest).map((m) =>
    `| ${m.key} | ${m.status.toUpperCase()} | ${m.sourceUsed ? m.sourceUsed + ' — ' : ''}${m.url} | ${m.retrievedAt} | ${m.count ?? '—'} | ${(m.license ?? '—').replace(/\|/g, '/')} |`);
  const unavailable = Object.values(manifest).filter((m) => m.status !== 'ok');
  const md = `# Data sources

Generated by \`npm run fetch\` on ${today}. Raw files live in \`data/raw/\` (gitignored); re-run the fetch to regenerate.

| Layer | Status | Source | Retrieved | Records | License |
|---|---|---|---|---|---|
${rows.join('\n')}

## Notes
- City ArcGIS base: \`${ARC}\` (no API key).
- **Parcel base is ParcelsPublic (${L('parcels_public')?.count ?? '?'} parcels), not ParcelsPGH** (${L('parcels_pgh')?.count ?? '?'} parcels — a subset). ParcelsPGH is used only as a supplemental attribute source.
- **Zoning source used: ${L('zoning')?.sourceUsed ?? 'NONE (unavailable)'}**. Base zoning district polygons; parcels are assigned a district by spatial join in Phase 2.
- Property assessments: WPRDC/Allegheny County, CC0 per WPRDC listing. Owner names and mailing-address fields are never requested.
- The Pittsburgh city ArcGIS services do not state a license in their service metadata; licenses above are what the service or WPRDC declares. City of Pittsburgh open data is published via the WPRDC/Pittsburgh GIS Hub — confirm reuse terms there before redistributing raw data.
- Zoning Code Chapter 911 (permitted use table) is cited from the City's Code of Ordinances (ecode360); see \`data/rules/permitted-uses.json\`.
${unavailable.length ? `\n## UNAVAILABLE layers\nThe engine treats these as confidence \`unknown\` (never a pass):\n${unavailable.map((m) => `- **${m.key}**: ${m.error}`).join('\n')}\n` : ''}`;
  fs.writeFileSync(path.join(ROOT, 'data/SOURCES.md'), md);
  fs.writeFileSync(path.join(RAW, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

(async () => {
  fs.mkdirSync(RAW, { recursive: true });
  const only = process.argv.slice(2);
  for (const cfg of ARC_LAYERS) if (!only.length || only.includes(cfg.key)) await runArc(cfg);
  if (!only.length || only.includes('zoning')) await runZoning();
  if (!only.length || only.includes('assessments')) await runAssessments();
  writeSources();
  const req = ARC_LAYERS.filter((l) => l.required).map((l) => manifest[l.key]);
  if (manifest.zoning?.status !== 'ok' || req.some((m) => !m || m.status !== 'ok')) {
    console.log('\nWARNING: a blocking layer is unavailable — see data/SOURCES.md');
    process.exitCode = 2;
  }
})();
