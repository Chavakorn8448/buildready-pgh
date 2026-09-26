import type { Geom, Pos } from './types';

export type BBox = [number, number, number, number];

export function ringsOf(g: Geom): Pos[][][] {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

export function bboxOf(g: Geom): BBox {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const poly of ringsOf(g)) for (const p of poly[0]) {
    if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0];
    if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1];
  }
  return [a, b, c, d];
}

export const bboxIntersects = (a: BBox, b: BBox) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export const bboxContains = (b: BBox, p: Pos) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

function inRing(p: Pos, ring: Pos[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Ray-casting point-in-polygon with holes. Boundary points are not guaranteed either way. */
export function pointInGeom(p: Pos, g: Geom): boolean {
  for (const poly of ringsOf(g)) {
    if (!inRing(p, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (inRing(p, poly[h])) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}

export const SQFT_PER_SQM = 10.763910416709722;
