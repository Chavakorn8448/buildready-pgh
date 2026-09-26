'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { comparePacket, type Meta } from '@/lib/web/run';
import type { Packet } from '@/lib/packets';
import { SearchBox } from './SearchBox';
import { bandColor } from './ScoreDial';

type Item = { pin: string; hood: string; packet: Packet };
const COLS = [
  { key: 'score', label: 'Score' }, { key: 'reform', label: 'If Bill 2025-1545 passes' }, { key: 'zoning', label: 'Zoning fit' }, { key: 'environmental', label: 'Environmental' },
  { key: 'funding', label: 'Funding fit' }, { key: 'access', label: 'Transit access' }, { key: 'site', label: 'Site & title' },
] as const;

export default function CompareView({ items, meta }: { items: Item[]; meta: Meta }) {
  const router = useRouter();
  const [sort, setSort] = useState<string>('score');
  const [desc, setDesc] = useState(true);
  const rows = useMemo(() => items.map((it) => {
    const c = comparePacket(it.packet, meta);
    const g = (k: string) => (c.current.subScores as any)?.[k]?.score ?? null;
    return { it, c, vals: { score: c.current.score, reform: c.reform.score, zoning: g('zoning'), environmental: g('environmental'), funding: g('funding'), access: g('access'), site: g('site') } as Record<string, number | null> };
  }), [items, meta]);
  const sorted = [...rows].sort((a, b) => { const x = a.vals[sort] ?? -1, y = b.vals[sort] ?? -1; return desc ? y - x : x - y; });
  const ids = items.map((i) => i.pin);
  const go = (next: string[]) => router.push(next.length ? `/compare?ids=${next.join(',')}` : '/compare');

  return (
    <div className="mx-auto max-w-[1300px] px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold tracking-tight">Compare parcels</h1><p className="mt-1 text-sm text-muted">Two to five lots side by side. Click a column to sort.</p></div>
        <div className="w-full max-w-md">{ids.length < 5 ? <SearchBox size="sm" placeholder="Add a parcel (address or ID)" onPick={(h) => go([...new Set([...ids, h.pin])])} /> : <p className="text-sm text-muted">Maximum of 5 parcels.</p>}</div>
      </div>
      {items.length === 0 ? <p className="card p-8 text-center text-muted">Add parcels with the search box above.</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead><tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <th className="p-4">Parcel</th>
              {COLS.map((c) => <th key={c.key} className="cursor-pointer p-4 hover:text-fg" onClick={() => { if (sort === c.key) setDesc(!desc); else { setSort(c.key); setDesc(true); } }}>{c.label}{sort === c.key ? (desc ? ' ↓' : ' ↑') : ''}</th>)}
              <th className="p-4">Flags</th><th className="p-4" />
            </tr></thead>
            <tbody>
              {sorted.map(({ it, c, vals }) => {
                const p = it.packet.p;
                const flags = c.current.flags.filter((f) => f.severity !== 'info');
                return (
                  <tr key={it.pin} className="border-b border-line align-top last:border-0">
                    <td className="p-4"><Link href={`/parcel/${it.pin}`} className="font-medium hover:underline">{p.address || '(no address)'}</Link><div className="text-xs text-muted">{it.hood} · {p.zoningDistrict ?? '?'} · {p.ownerType ?? '?'} · {p.vacant ? 'vacant' : 'built'}</div><div className="font-mono text-[11px] text-muted">{it.pin}</div>
                      {c.current.gates.filter((g) => g.triggered).map((g) => <div key={g.id} className="mt-1 text-[11px] text-[var(--amber)]">{g.id}: {g.effect === 'no_score' ? 'no score' : `capped at ${g.cap}`}</div>)}</td>
                    {COLS.map((col) => { const v = vals[col.key]; return <td key={col.key} className="p-4 tabular-nums"><span style={{ color: bandColor(v) }} className={col.key === 'score' ? 'text-lg font-semibold' : ''}>{v === null ? '—' : Math.round(v)}</span>{col.key === 'reform' && vals.score !== null && v !== null && <span className="ml-1 text-xs text-muted">({v - vals.score >= 0 ? '+' : ''}{Math.round(v - vals.score)})</span>}</td>; })}
                    <td className="max-w-[260px] p-4 text-xs text-muted">{flags.length ? flags.map((f) => f.id.replace(/-/g, ' ')).join(', ') : 'none'}</td>
                    <td className="p-4"><button className="btn" onClick={() => go(ids.filter((x) => x !== it.pin))}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
