/**
 * Compact "packets" written by scripts/precompute.ts and read by the web app.
 * A packet holds the raw inputs of the pure engine (parcel record + precomputed overlaps), NOT scores,
 * so the web app runs the very same engine in the browser (reform toggle, editable weights) with no live API.
 */
import type { Overlap, ParcelOverlaps } from './hazards';
import { HAZARD_LAYERS, OVERLAY_LAYERS } from './hazards';
import type { Geom, ProcessedParcel } from './types';

export type PacketOverlap = 0 | 'u' | { f: number; q: number; pin: [number, number] | null; m: Record<string, any>[]; e?: number; g?: Geom[] };
export type Packet = {
  p: Omit<ProcessedParcel, 'bbox' | 'geometry' | 'house' | 'street' | 'lotAreaSource' | 'zoningAgrees'> & { geometry: Geom };
  o: Record<string, PacketOverlap>;
};

const KEEP = ['historic_name', 'HOOD', 'floodway', 'fld_zone', 'name', 'reduction', '_overlapSqft'];
const layers = [...HAZARD_LAYERS, ...OVERLAY_LAYERS];

const round = (x: number) => Math.round(x * 1e5) / 1e5;
export function roundGeom(g: Geom): Geom {
  const ring = (r: number[][]) => {
    const out: number[][] = [];
    for (const [x, y] of r) {
      const pt = [round(x), round(y)];
      const last = out[out.length - 1];
      if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt);
    }
    return out;
  };
  return g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: g.coordinates.map(ring) }
    : { type: 'MultiPolygon', coordinates: g.coordinates.map((poly) => poly.map(ring)) };
}

export function packOverlaps(o: ParcelOverlaps): Record<string, PacketOverlap> {
  const out: Record<string, PacketOverlap> = {};
  for (const k of layers) {
    const x = o[k];
    out[k] = x.status === 'unavailable' ? 'u' : !x.intersects ? 0 : {
      f: x.overlapFraction, q: x.overlapSqft, pin: x.pin,
      m: x.matched.map((m) => Object.fromEntries(Object.entries(m).filter(([kk]) => KEEP.includes(kk)))),
      ...(x.geometryErrors ? { e: x.geometryErrors } : {}),
      ...(x.pieces?.length ? { g: x.pieces.map(roundGeom) } : {}),
    };
  }
  return out;
}

export function unpackOverlaps(o: Record<string, PacketOverlap>): ParcelOverlaps {
  const out: any = {};
  for (const k of layers) {
    const x = o[k];
    const base: Overlap = { layer: k, status: 'ok', intersects: false, overlapSqft: 0, overlapFraction: 0, pin: null, matched: [], geometryErrors: 0 };
    if (x === 'u') out[k] = { ...base, status: 'unavailable' };
    else if (x === 0 || x === undefined) out[k] = base;
    else out[k] = { ...base, intersects: true, overlapFraction: x.f, overlapSqft: x.q, pin: x.pin, matched: x.m, geometryErrors: x.e ?? 0, ...(x.g ? { pieces: x.g } : {}) };
  }
  return out as ParcelOverlaps;
}

/** Slim record: only what the engine and the UI read (derived/duplicate fields are rebuilt in fromPacket). */
export function toPacket(p: ProcessedParcel, o: ParcelOverlaps): Packet {
  const a = p.assessment;
  return {
    p: {
      pin: p.pin, address: p.address, neighborhood: p.neighborhood, classDesc: p.classDesc, useDesc: p.useDesc, ownerType: p.ownerType, vacant: p.vacant,
      lotAreaSqft: p.lotAreaSqft, lotAreaAssessorSqft: p.lotAreaAssessorSqft, zoningDistrict: p.zoningDistrict, zoningShare: p.zoningShare, zoningOther: p.zoningOther,
      zoningParcelsPublic: p.zoningParcelsPublic, inCityLimits: p.inCityLimits, centroid: p.centroid, geometry: roundGeom(p.geometry),
      assessment: a ? { landValue: a.landValue, buildingValue: a.buildingValue, totalValue: a.totalValue, saleDate: a.saleDate, salePrice: a.salePrice, saleDesc: a.saleDesc, taxYear: a.taxYear, asOf: a.asOf } : null,
    } as Packet['p'],
    o: packOverlaps(o),
  };
}

export function fromPacket(k: Packet): { parcel: ProcessedParcel; overlaps: ParcelOverlaps } {
  const g = k.p.geometry;
  const xs: number[] = [], ys: number[] = [];
  for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) for (const [x, y] of poly[0]) { xs.push(x); ys.push(y); }
  const bbox: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const sp = /^(\S+)\s+(.*)$/.exec(k.p.address ?? '');
  return {
    parcel: {
      house: sp?.[1] ?? '', street: sp?.[2] ?? '', lotAreaSource: 'polygon area (WGS84 geodesic) of ParcelsPublic geometry',
      zoningAgrees: k.p.zoningDistrict && k.p.zoningParcelsPublic ? k.p.zoningDistrict === k.p.zoningParcelsPublic : null,
      ...k.p, bbox,
    } as unknown as ProcessedParcel,
    overlaps: unpackOverlaps(k.o),
  };
}

/** Compact index row layout (data/scores/index.json). */
export const INDEX_COLS = ['pin', 'address', 'hood', 'owner', 'vacant', 'lot', 'zone', 'score', 'reform', 'gates', 'lon', 'lat', 'aduReady', 'combine', 'starter'] as const;
export const OWNER_CODES = ['City', 'URA', 'HACP', 'County', 'Private', 'Other'] as const;
export type IndexRow = {
  pin: string; address: string; hood: number; owner: string | null; vacant: boolean | null; lot: number | null; zone: string | null;
  score: number | null; reform: number | null; gates: string; lon: number; lat: number; aduReady: boolean; combine: boolean; starter: boolean;
};
