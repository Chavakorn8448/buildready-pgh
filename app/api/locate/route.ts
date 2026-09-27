import { locate } from '@/lib/web/server-data';

/** GET /api/locate?lon=..&lat=.. -> the parcel polygon that contains the point, with its summary (real record, never an estimate). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lon = Number(u.searchParams.get('lon')), lat = Number(u.searchParams.get('lat'));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return Response.json({ error: 'lon and lat required' }, { status: 400 });
  const r = locate(lon, lat);
  if (!r.found) return Response.json({ found: false, reason: r.reason });
  const p = r.row;
  return Response.json({ found: true, parcel: { pin: p.pin, address: p.address, hood: r.hood, owner: p.owner, vacant: p.vacant, lot: p.lot, zone: p.zone, score: p.score, reform: p.reform, gates: p.gates }, geometry: r.geometry });
}
