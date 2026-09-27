import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/PrintButton';
import { getAiCache, getMeta, getPacket } from '@/lib/web/server-data';
import { comparePacket, type RuleSetId } from '@/lib/web/run';
import { metaFor } from '@/lib/web/flagMeta';
import { valuationOf } from '@/lib/finance';

export default async function Memo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rs?: string }> }) {
  const { id } = await params;
  const { rs: rsq } = await searchParams;
  const rs: RuleSetId = rsq === 'reform-2025-1545' ? 'reform-2025-1545' : 'current';
  const found = getPacket(id.toUpperCase());
  if (!found) notFound();
  const meta = getMeta();
  const cmp = comparePacket(found.packet, meta);
  const r = rs === 'reform-2025-1545' ? cmp.reform : cmp.current;
  const ai = getAiCache(id.toUpperCase(), rs);
  const p = found.packet.p;
  const val = valuationOf(p as any, meta.hoodValues.byHood);
  const usd = (n: number | null) => (n == null ? 'unknown' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
  return (
    <main className="mx-auto max-w-3xl break-words px-4 py-6 text-[13px] leading-relaxed sm:px-8 sm:py-8 print:max-w-none print:p-0" style={{ background: '#fff', color: '#111' }}>
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-300 pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">BuildReady PGH · site memo</div>
          <h1 className="text-xl font-semibold">{p.address || '(no street address)'}</h1>
          <div className="text-neutral-600">{found.hood} · parcel {p.pin} · zoning {p.zoningDistrict ?? 'unknown'} · {p.ownerType ?? 'owner unknown'}-owned · {p.vacant ? 'vacant' : 'built'} · {p.lotAreaSqft ? Math.round(p.lotAreaSqft).toLocaleString() + ' sq ft' : 'lot area unknown'}</div>
        </div>
        <div className="text-right"><div className="text-4xl font-semibold">{r.score ?? '—'}</div><div className="text-[11px] text-neutral-500">Development Ease Score / 100</div></div>
      </header>
      <p className="mt-2 text-neutral-600"><b>Rule set:</b> {r.ruleSet.label}{r.ruleSet.status === 'proposed' ? ` — ${r.ruleSet.statusNote}` : ''} · data snapshot {meta.generatedAt}</p>
      {val.available && <p className="mt-2"><b>County assessed value</b> (tax year {val.taxYear ?? '?'}; not a market price): land {usd(val.land)}, building {usd(val.building)}, total {usd(val.total)}{val.landPerSqft != null ? `; land $${val.landPerSqft.toFixed(2)}/sq ft` : ''}{val.hoodMedianLandPerSqft != null ? ` vs neighborhood median $${val.hoodMedianLandPerSqft.toFixed(2)}` : ''}.{val.sale ? ` Last sale ${usd(val.sale.price)} on ${val.sale.date} (${val.sale.type ?? 'type unknown'}). ${val.sale.note}` : ''}</p>}
      {r.gates.filter((g) => g.triggered).map((g) => <p key={g.id} className="mt-2 rounded border border-red-300 bg-red-50 p-2"><b>{g.id} {g.name}:</b> {g.message} {g.reviewBy && `Confirm with: ${g.reviewBy}.`}</p>)}
      {r.subScores && (
        <div className="mt-4 overflow-x-auto"><table className="w-full border-collapse text-left"><thead><tr className="border-b border-neutral-300"><th className="py-1">Sub-score</th><th>Score</th><th>Weight</th><th>Notes</th></tr></thead><tbody>
          {Object.entries(r.subScores).map(([k, s]) => <tr key={k} className="border-b border-neutral-200 align-top"><td className="py-1 capitalize">{k}</td><td>{Math.round(s.score)}</td><td>{s.weight}</td><td className="text-neutral-600">{s.notes.join('; ')}</td></tr>)}
        </tbody></table></div>
      )}
      <h2 className="mt-5 font-semibold">Flags to review</h2>
      <ul className="mt-1 space-y-2">
        {r.flags.map((f) => {
          const src = f.factIds.map((i) => r.facts.find((x) => x.id === i)).find((x) => x?.sourceUrl);
          return <li key={f.id} className="border-l-2 border-neutral-300 pl-3"><b>{metaFor(f.id).title}{f.proposed ? ' (PROPOSED)' : ''}.</b> {f.text}{ai?.flags?.[f.id] ? <> <i>{ai.flags[f.id]}</i></> : null}<div className="text-neutral-600">Confirm with: {f.reviewBy ?? '—'}{src ? ` · Source: ${src.source} (${src.sourceUrl})` : ''}</div></li>;
        })}
      </ul>
      {ai?.nextSteps?.length ? <><h2 className="mt-5 font-semibold">Next steps</h2><ol className="list-decimal pl-5">{ai.nextSteps.map((s: string, i: number) => <li key={i}>{s}</li>)}</ol></> : null}
      <h2 className="mt-5 font-semibold">Sources</h2>
      <ul className="break-all text-[11px] text-neutral-600">{[...new Map(r.facts.map((f) => [f.sourceUrl, f])).values()].map((f) => <li key={f.sourceUrl}>{f.source} — {f.sourceUrl} (retrieved {f.retrievedAt})</li>)}</ul>
      <p className="mt-5 border-t border-neutral-300 pt-2 text-[11px] text-neutral-600">Decision support only, not legal, financial, or zoning advice. Zoning determinations come from the City Zoning Administrator or Zoning Board of Adjustment. Public data as provided, may be stale; no setback, height, building-code, or water/sewer capacity checks (request a PWSA availability letter).</p>
    </main>
  );
}
