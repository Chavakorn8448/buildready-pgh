import fs from 'node:fs';

/** Reads our one-feature-per-line GeoJSON (see scripts/fetch.ts) or plain GeoJSON. */
export function readFeatures<T = any>(file: string): T[] {
  const txt = fs.readFileSync(file, 'utf8');
  if (txt.startsWith('{"type":"FeatureCollection","features":[\n')) {
    const out: T[] = [];
    for (const raw of txt.split('\n')) {
      if (!raw || raw[0] !== '{' || raw.startsWith('{"type":"FeatureCollection"')) continue;
      out.push(JSON.parse(raw.endsWith(',') ? raw.slice(0, -1) : raw));
    }
    return out;
  }
  return JSON.parse(txt).features;
}

export function readNdjson<T = any>(file: string): T[] {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function writeFeatureLines(file: string, feats: unknown[]) {
  fs.writeFileSync(file, '{"type":"FeatureCollection","features":[\n' + feats.map((f) => JSON.stringify(f)).join(',\n') + '\n]}\n');
}
