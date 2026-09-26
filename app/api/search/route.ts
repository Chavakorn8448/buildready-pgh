import { getIndex, search } from '@/lib/web/server-data';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const { rows, note } = search(q, 8);
  const hoods = getIndex().hoods;
  return Response.json({
    hits: rows.map((r) => ({ pin: r.pin, address: r.address, hood: hoods[r.hood]?.name ?? '', score: r.score, zone: r.zone, owner: r.owner, vacant: r.vacant })),
    note,
  });
}
