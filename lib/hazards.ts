import * as turf from '@turf/turf';
import { bboxOf, bboxIntersects, type BBox } from './geo';
import type { Geom } from './types';

export type LayerFeature = { bbox: BBox; geometry: Geom; props: Record<string, any> };
export type LayerData = Record<string, LayerFeature[] | undefined>; // undefined = layer unavailable

export type Overlap = {
  layer: string;
  status: 'ok' | 'unavailable';
  intersects: boolean; // overlap share >= minOverlapFraction
  overlapSqft: number;
  overlapFraction: number;
  /** Map pin: a point guaranteed inside the largest overlap piece (for the future map). */
  pin: [number, number] | null;
  matched: Record<string, any>[]; // properties of the matched layer features
  geometryErrors: number;
  /** Overlap pieces (only when opts.keepGeometry): what to draw on the parcel map. */
  pieces?: Geom[];
};

const SQFT = 10.763910416709722;

/** Turf intersection of the parcel polygon with every feature of one layer. Pure. */
export function overlapWithLayer(
  layer: string, parcelGeom: Geom, parcelBBox: BBox, features: LayerFeature[] | undefined,
  opts: { minOverlapFraction: number; filter?: (props: Record<string, any>) => boolean; keepGeometry?: boolean },
): Overlap {
  if (!features) return { layer, status: 'unavailable', intersects: false, overlapSqft: 0, overlapFraction: 0, pin: null, matched: [], geometryErrors: 0 };
  const parcel = { type: 'Feature', properties: {}, geometry: parcelGeom } as any;
  // fast path: no candidate feature near the parcel -> no overlap (avoids turf.area on ~all parcels x layers)
  const candidates = features.filter((f) => bboxIntersects(f.bbox, parcelBBox) && (!opts.filter || opts.filter(f.props)));
  if (!candidates.length) return { layer, status: 'ok', intersects: false, overlapSqft: 0, overlapFraction: 0, pin: null, matched: [], geometryErrors: 0 };
  const parcelArea = turf.area(parcel);
  let total = 0, errors = 0;
  let best: { area: number; piece: any } | null = null;
  const pieces: Geom[] = [];
  const matched: Record<string, any>[] = [];
  for (const f of candidates) {
    try {
      const inter = turf.intersect(turf.featureCollection([parcel, { type: 'Feature', properties: {}, geometry: f.geometry } as any]));
      if (!inter) continue;
      const a = turf.area(inter);
      if (a <= 0) continue;
      if (opts.keepGeometry) pieces.push(inter.geometry as Geom);
      total += a; matched.push({ ...f.props, _overlapSqft: Math.round(a * SQFT * 10) / 10 });
      if (!best || a > best.area) best = { area: a, piece: inter };
    } catch { errors++; }
  }
  const fraction = parcelArea > 0 ? Math.min(1, total / parcelArea) : 0;
  const intersects = fraction >= opts.minOverlapFraction;
  let pin: [number, number] | null = null;
  if (intersects && best) {
    const pt = turf.pointOnFeature(best.piece).geometry.coordinates;
    pin = [Math.round(pt[0] * 1e6) / 1e6, Math.round(pt[1] * 1e6) / 1e6];
  }
  return {
    layer, status: 'ok', intersects, overlapSqft: Math.round(Math.min(total, parcelArea) * SQFT * 10) / 10,
    overlapFraction: Math.round(fraction * 1000) / 1000, pin, matched: intersects ? matched : [], geometryErrors: errors,
    ...(opts.keepGeometry && intersects ? { pieces } : {}),
  };
}

export const HAZARD_LAYERS = ['slope25', 'landslide', 'undermined', 'fema2014'] as const;
export const OVERLAY_LAYERS = ['historic', 'iz_overlay', 'transit_buffer', 'parking_reduction'] as const;

export type ParcelOverlaps = Record<(typeof HAZARD_LAYERS)[number] | (typeof OVERLAY_LAYERS)[number], Overlap>;

export function computeOverlaps(parcelGeom: Geom, layers: LayerData, minOverlapFraction: number, keepGeometry = false): ParcelOverlaps {
  const bbox = bboxOf(parcelGeom);
  const out: any = {};
  for (const k of [...HAZARD_LAYERS, ...OVERLAY_LAYERS]) {
    out[k] = overlapWithLayer(k, parcelGeom, bbox, layers[k], {
      minOverlapFraction, keepGeometry,
      // FEMA: only Special Flood Hazard Areas count as flood hazard; zone-X shading does not
      filter: k === 'fema2014' ? (p) => p.sfha_tf === 'T' : undefined,
    });
  }
  return out;
}
