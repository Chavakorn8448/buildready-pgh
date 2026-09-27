'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { assemblageOptions, type Neighbor } from '@/lib/assemblage';
import { Term } from './Term';

const PUB = ['City', 'URA', 'HACP', 'County'];
const label = (n?: Neighbor) => (n?.owner && PUB.includes(n.owner) ? `${n.owner}-owned` : n?.vacant ? 'vacant, private' : 'built, private');

/** "Combine with adjacent lot": real neighbors that would lift a small lot over its district minimum. Lot-size rule only. */
export function AssemblageCard({ self, neighbors, hot, onHot }: { self: { lot: number | null; zone: string | null; vacant: boolean | null }; neighbors: (Neighbor & { geometry?: unknown })[]; hot: string | null; onHot: (pin: string | null) => void }) {
  const res = useMemo(() => assemblageOptions(self, neighbors, 4), [self, neighbors]);
  const byPin = new Map(neighbors.map((n) => [n.pin, n]));
  if (!neighbors.length) return null;
  if (res.minimum === undefined && !self.vacant) return null;
  const title = res.alreadyMeets === false ? 'Combine with an adjacent lot' : 'Adjacent lots';
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="as-h">
      <h2 id="as-h" className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {res.alreadyMeets === false && (
        <p className="mt-2 text-sm leading-relaxed">This lot ({Math.round(self.lot!).toLocaleString()} sq ft) is below the {res.minimum!.toLocaleString()} sq ft <Term k="lot minimum">minimum</Term> for {self.zone}.
          {res.options.length ? ' Combining it with a neighbor would clear the minimum:' : ' No single neighbor or pair of neighbors gets it over the minimum.'}</p>
      )}
      {res.alreadyMeets !== false && <p className="mt-2 text-sm text-muted">{res.minimum === undefined ? 'The lot-size minimum for this district is not modeled, so no combination is tested.' : 'This lot already meets its district minimum.'} Neighbors that share a boundary:</p>}
      {res.alreadyMeets === false && res.options.length > 0 && (
        <ul className="mt-3 space-y-2">
          {res.options.map((o, i) => (
            <li key={o.pins.join('+')} onMouseEnter={() => onHot(o.pins[0])} onMouseLeave={() => onHot(null)} className={`rounded-xl border p-3 text-sm ${o.pins.some((p) => p === hot) ? 'border-accent' : 'border-line'} ${i === 0 ? 'bg-surface2' : ''}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{o.pins.map((p, k) => <span key={p}>{k > 0 && ' + '}<Link className="hover:underline" href={`/parcel/${p}`}>{byPin.get(p)?.address || p}</Link></span>)}</span>
                <span className="tabular-nums text-muted">{o.combinedSqft.toLocaleString()} sq ft combined</span>
              </div>
              <div className="mt-1 text-xs text-muted">{o.pins.length === 1 ? `${label(byPin.get(o.pins[0]))} · ${(byPin.get(o.pins[0])?.lot ?? 0).toLocaleString()} sq ft` : o.pins.map((p) => { const n = byPin.get(p); return `${n?.address ?? p}: ${label(n)} (${(n?.lot ?? 0).toLocaleString()} sq ft)`; }).join(' · ')}{!o.sameZoning ? ' · different zoning district, check the map' : ''}</div>
              <div className="mt-1 text-xs">{o.acquisition === 'public' ? 'All parts are publicly owned: a single public disposition may cover it.' : o.acquisition === 'vacant private' ? 'Includes a vacant private lot that would need to be acquired.' : 'Includes a built private lot that would need to be acquired.'}</div>
            </li>
          ))}
        </ul>
      )}
      {(res.alreadyMeets !== false || res.options.length === 0) && (
        <ul className="mt-2 divide-y divide-line text-sm">
          {neighbors.slice(0, 6).map((n) => <li key={n.pin} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5"><Link className="hover:underline" href={`/parcel/${n.pin}`}>{n.address || n.pin}</Link><span className="text-xs text-muted">{n.owner ?? 'owner unknown'} · {n.vacant ? 'vacant' : 'built'} · {n.lot ? Math.round(n.lot).toLocaleString() + ' sq ft' : 'area unknown'}</span></li>)}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">Tests the lot-size rule only. It does not check setbacks, height, price, willingness to sell, or that the lots can legally be merged (lot consolidation goes through the City). Owner names are never shown, only owner type.</p>
    </section>
  );
}
