/** File-system loaders (kept out of the pure engine). Reads data/processed produced by `npm run preprocess`. */
import fs from 'node:fs';
import path from 'node:path';
import { bboxOf } from '../geo';
import type { LayerData } from '../hazards';
import { normalizeAddress, normalizeStreet, parsePin, splitAddress } from '../lookup';
import type { EngineData } from '../score';
import type { LayerMeta, ProcessedParcel } from '../types';
import type { PermittedUses } from '../zoning';
import { readFeatures } from './io';

export const ROOT = path.resolve(__dirname, '../..');
const PROC = path.join(ROOT, 'data/processed');

const LAYER_KEYS = ['slope25', 'landslide', 'undermined', 'fema2014', 'historic', 'iz_overlay', 'parking_reduction', 'transit_buffer', 'city_limits', 'zoning'];

export function loadEngineData(): EngineData {
  if (!fs.existsSync(path.join(PROC, 'layers.json'))) throw new Error('data/processed missing: run `npm run fetch && npm run preprocess` first');
  const layerMeta = JSON.parse(fs.readFileSync(path.join(PROC, 'layers.json'), 'utf8')) as Record<string, LayerMeta>;
  const layers: LayerData = {};
  for (const k of LAYER_KEYS) {
    if (layerMeta[k]?.status !== 'ok') { layers[k] = undefined; continue; } // unavailable -> engine marks "unknown"
    layers[k] = readFeatures(path.join(PROC, 'layers', `${k}.geojson`)).map((f: any) => ({ bbox: bboxOf(f.geometry), geometry: f.geometry, props: f.properties ?? {} }));
  }
  const permittedUses = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rules/permitted-uses.json'), 'utf8')) as PermittedUses;
  const hoodValues = JSON.parse(fs.readFileSync(path.join(PROC, 'neighborhood-values.json'), 'utf8'));
  return { layers, layerMeta, permittedUses, hoodValues };
}

type Index = { byPin: Record<string, [number, number]>; byAddress: Record<string, string[]> };

export class ParcelStore {
  private fd: number;
  private index: Index;
  private normAddr: Map<string, string[]> | null = null;
  constructor() {
    const f = path.join(PROC, 'parcels.ndjson');
    if (!fs.existsSync(f)) throw new Error('data/processed/parcels.ndjson missing: run `npm run preprocess`');
    this.fd = fs.openSync(f, 'r');
    this.index = JSON.parse(fs.readFileSync(path.join(PROC, 'parcels.index.json'), 'utf8'));
  }
  close() { fs.closeSync(this.fd); }
  get size() { return Object.keys(this.index.byPin).length; }
  pins(): string[] { return Object.keys(this.index.byPin); }
  byPin(pin: string): ProcessedParcel | null {
    const e = this.index.byPin[pin];
    if (!e) return null;
    const buf = Buffer.alloc(e[1]);
    fs.readSync(this.fd, buf, 0, e[1], e[0]);
    return JSON.parse(buf.toString('utf8'));
  }
  /** Matches house no. + street, tolerating St/Street, case, directionals. */
  pinsByAddress(house: string, street: string): string[] {
    if (!this.normAddr) {
      this.normAddr = new Map();
      for (const [k, pins] of Object.entries(this.index.byAddress)) {
        const sp = splitAddress(k);
        if (!sp) continue;
        const nk = normalizeAddress(sp.house, sp.street);
        this.normAddr.set(nk, [...(this.normAddr.get(nk) ?? []), ...pins]);
      }
    }
    return this.normAddr.get(normalizeAddress(house, street)) ?? [];
  }
  /** PIN or address. Returns matches (0, 1, or several). */
  lookup(input: string): { kind: 'pin' | 'address'; parcels: ProcessedParcel[]; note?: string } {
    const pin = parsePin(input);
    if (pin) { const p = this.byPin(pin); return { kind: 'pin', parcels: p ? [p] : [], note: p ? undefined : `PIN ${pin} is not in the City of Pittsburgh parcel data` }; }
    const sp = splitAddress(input);
    if (!sp) return { kind: 'address', parcels: [], note: `could not parse "${input}" as a 16-character parcel ID or a "<number> <street>" address` };
    const pins = [...new Set(this.pinsByAddress(sp.house, sp.street))];
    return { kind: 'address', parcels: pins.map((p) => this.byPin(p)!).filter(Boolean), note: pins.length ? undefined : `no parcel found at "${sp.house} ${normalizeStreet(sp.street)}"` };
  }
}
