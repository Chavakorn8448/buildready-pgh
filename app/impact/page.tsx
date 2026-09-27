import { getReformImpact, getValidation } from '@/lib/web/server-data';
import { Term } from '@/components/Term';

export const metadata = { title: 'Reform impact · BuildReady PGH' };
const n = (x: number) => x.toLocaleString('en-US');

function Bars({ rows, color }: { rows: { name: string; v: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[104px_1fr_48px] items-center gap-2 text-xs sm:grid-cols-[150px_1fr_64px] sm:gap-3 sm:text-sm">
          <span className="truncate text-muted" title={r.name}>{r.name}</span>
          <div className="h-3 overflow-hidden rounded-full bg-surface2"><div className="h-full rounded-full" style={{ width: `${(r.v / max) * 100}%`, background: color }} /></div>
          <span className="text-right tabular-nums">{n(r.v)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Impact() {
  const d = getReformImpact();
  const v = getValidation();
  const top = (k: string) => [...d.byNeighborhood].sort((a: any, b: any) => b[k] - a[k]).slice(0, 15).map((r: any) => ({ name: r.name, v: r[k] }));
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5 sm:py-12">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What Pittsburgh&apos;s zoning reforms unlock</h1>
      <p className="mt-2 text-muted">Counts across every City of Pittsburgh parcel in the data snapshot, from the same rules the Lot Report uses.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="card p-5 sm:p-6">
          <div className="text-xs uppercase tracking-wider text-muted">In effect since May 7, 2025 · Bill 2025-1579</div>
          <div className="mt-2 text-4xl font-semibold tabular-nums sm:text-5xl">{n(d.citywide.a)}</div>
          <p className="mt-2 text-sm text-muted">residential lots no longer need a <Term k="lot minimum">lot-size</Term> <Term k="variance">variance</Term>. They failed the old minimums (8,000 / 5,000 / 3,200 / 1,800 sq ft) but pass the new ones. For {n(d.citywide.aBoth)} of them the county assessor&apos;s lot area agrees.</p>
        </div>
        <div className="card p-5 sm:p-6">
          <div className="mb-0 text-xs uppercase tracking-wider text-[var(--amber)]">PROPOSED · Bill 2025-1545 · not law</div>
          <div className="mt-2 text-4xl font-semibold tabular-nums sm:text-5xl">{n(d.citywide.b)}</div>
          <p className="mt-2 text-sm text-muted">more lots could gain by-right <Term k="ADU">ADU</Term> potential (up to 2 per lot, 1,000 sq ft, 30 ft, no owner-occupancy) if it passes. An upper bound: it assumes none is allowed by right today. Status: {d.bills.proposed}.</p>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Lots that no longer need a lot-size variance, by neighborhood</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Top 15 of {d.byNeighborhood.length} neighborhoods</p>
        <div className="card p-4 sm:p-5"><Bars rows={top('a')} color="var(--accent)" /></div>
      </section>
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Lots gaining by-right ADU potential if Bill 2025-1545 passes, by neighborhood</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Top 15 of {d.byNeighborhood.length} neighborhoods · proposed, not law</p>
        <div className="card p-4 sm:p-5"><Bars rows={top('b')} color="var(--amber)" /></div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">How we know the score means something</h2>
        {v ? (
          <div className="card mt-3 p-4 sm:p-6">
            <p className="text-sm text-muted">{v.summary}</p>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead><tr className="border-b border-line text-xs uppercase tracking-wider text-muted"><th className="py-2">Score band (2019 snapshot)</th><th>Lots</th><th>Later built new homes</th><th>Build rate</th></tr></thead><tbody>
              {v.bands.map((b: any) => <tr key={b.band} className="border-b border-line last:border-0"><td className="py-2">{b.band}</td><td>{n(b.n)}</td><td>{n(b.built)}</td><td className="tabular-nums">{(b.rate * 100).toFixed(2)}%</td></tr>)}
            </tbody></table></div>
            {v.notes?.length ? <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">{v.notes.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul> : null}
            <p className="mt-4 text-sm">Past building reflects market demand as well as feasibility, so we use it to test our score, not replace it.</p>
            <p className="mt-2 text-xs text-muted">{v.caveat}</p>
          </div>
        ) : <p className="card mt-3 p-6 text-sm text-muted">Validation backtest not available in this build.</p>}
      </section>

      <section className="mt-12 card p-6 text-sm leading-relaxed text-muted">
        <h2 className="mb-2 text-base font-semibold text-fg">Methods and limits</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Counts the lot-size rule and by-right ADU eligibility only; setbacks, height, building code, and water/sewer are not checked.</li>
          <li>&quot;Residential lots&quot; means a lot with a dwelling use or vacant land where the verified zoning use table allows housing. Lots in unverified districts (planned-development, special-purpose, public-realm) are excluded.</li>
          <li>Lot area is the map polygon area; where the county assessor disagrees the count is shown separately.</li>
          <li>Sources: City of Pittsburgh ArcGIS parcels and zoning, WPRDC property assessments, Council files 2025-1579 and 2025-1545 (Legistar). Snapshot {d.generatedAt}. Decision support only.</li>
        </ul>
      </section>
    </main>
  );
}
