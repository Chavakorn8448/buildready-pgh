/** Pure geometry: do two parcels share a boundary? Uses a local metric projection; tolerance and minimum shared length in meters. */
import type { Geom, Pos } from './types';

const M_PER_DEG_LAT = 110540;
const ringOf = (g: Geom): Pos[] => (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]);
const allRings = (g: Geom): Pos[][] => (g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]));

function project(ring: Pos[], lat0: number, lon0: number): [number, number][] {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return ring.map(([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * M_PER_DEG_LAT]);
}

function distPointToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const nearBoundary = (x: number, y: number, ring: [number, number][], tol: number) => {
  for (let i = 0; i < ring.length - 1; i++) if (distPointToSeg(x, y, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]) <= tol) return true;
  return false;
};

/** Length (m) of A's boundary that lies along B's boundary (both endpoints of an A edge within tol of B's outline). */
function sharedLength(a: [number, number][], b: [number, number][], tol: number): number {
  let len = 0;
  for (let i = 0; i < a.length - 1; i++) {
    const [x1, y1] = a[i], [x2, y2] = a[i + 1];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    if (nearBoundary(x1, y1, b, tol) && nearBoundary(x2, y2, b, tol) && nearBoundary(mx, my, b, tol)) len += Math.hypot(x2 - x1, y2 - y1);
  }
  return len;
}

/** Shared boundary length in meters between two parcels (max over their outer rings). 0 = not adjacent. */
export function sharedBoundaryMeters(a: Geom, b: Geom, tolMeters = 0.6): number {
  const p0 = ringOf(a)[0];
  const lon0 = p0[0], lat0 = p0[1];
  let best = 0;
  for (const ra of allRings(a)) for (const rb of allRings(b)) {
    const A = project(ra, lat0, lon0), B = project(rb, lat0, lon0);
    best = Math.max(best, (sharedLength(A, B, tolMeters) + sharedLength(B, A, tolMeters)) / 2);
  }
  return best;
}
