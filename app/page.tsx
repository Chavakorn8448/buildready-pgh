import Link from 'next/link';
import { SearchBox } from '@/components/SearchBox';
import { getMeta, getReformImpact } from '@/lib/web/server-data';

const EXAMPLES = [
  { pin: '0174N00262000000', title: '0 Tioga St, Homewood South', blurb: 'City-owned vacant lot, by-right housing, near transit' },
  { pin: '0084P00162000000', title: '5925 Walnut St, Shadyside', blurb: 'Existing apartment building, RM-M' },
  { pin: '0013E00051000000', title: '1817 Saint Patrick St, South Side Slopes', blurb: 'Steep, landslide-prone, undermined hillside lot' },
  { pin: '0173N00352000000', title: '7032 Upland St, Homewood North', blurb: 'Lot smaller than its district minimum' },
];

export default function Home() {
  const meta = getMeta();
  const impact = getReformImpact();
  const n = (x: number) => x.toLocaleString('en-US');
  return (
    <main>
      <section className="mx-auto max-w-4xl px-4 pb-8 pt-10 text-center sm:px-5 sm:pb-10 sm:pt-20">
        <p className="mb-4 inline-block rounded-full border border-line px-3 py-1 text-xs text-muted">AI for Housing Hackathon · Track 1: Development Feasibility</p>
        <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">See what&apos;s blocking a Pittsburgh lot, and where to build first.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-muted sm:mt-5 sm:text-lg">A source-grounded Development Ease Score for City of Pittsburgh parcels, with the zoning, environmental, and policy flags that need a human review. Every number links to its data.</p>
        <div className="mx-auto mt-9 max-w-2xl"><SearchBox autoFocus /></div>
        <p className="mt-3 text-xs text-muted">Try an address or a 16-character parcel ID (dashes optional). The snapshot covers every vacant and publicly owned lot ({n(meta.counts.inScope)} parcels) plus demo parcels.</p>
      </section>

      <section className="mx-auto grid max-w-5xl gap-3 px-4 pb-10 sm:grid-cols-2 sm:gap-4 sm:px-5 sm:pb-12">
        {EXAMPLES.map((e) => (
          <Link key={e.pin} href={`/parcel/${e.pin}`} className="card p-5 transition hover:border-[#3a4150]">
            <div className="font-medium">{e.title}</div>
            <div className="mt-1 text-sm text-muted">{e.blurb}</div>
            <div className="mt-3 font-mono text-xs text-muted">{e.pin}</div>
          </Link>
        ))}
      </section>

      <section className="mx-auto grid max-w-5xl gap-3 px-4 pb-12 sm:px-5 md:grid-cols-3 md:gap-4 md:pb-16">
        <Link href="/map" className="card p-6 transition hover:border-[#3a4150]"><h2 className="font-semibold">Opportunity map</h2><p className="mt-2 text-sm text-muted">Every vacant public lot, colored by score. Filter by neighborhood or owner and ask questions.</p></Link>
        <Link href="/impact" className="card p-6 transition hover:border-[#3a4150]"><h2 className="font-semibold">Reform impact</h2><p className="mt-2 text-sm text-muted"><b className="text-fg">{n(impact.citywide.a)}</b> lots no longer need a lot-size variance; up to <b className="text-fg">{n(impact.citywide.b)}</b> could gain by-right ADUs if Bill 2025-1545 passes.</p></Link>
        <Link href="/compare" className="card p-6 transition hover:border-[#3a4150]"><h2 className="font-semibold">Compare lots</h2><p className="mt-2 text-sm text-muted">Put two to five parcels side by side and sort by any sub-score.</p></Link>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 text-center text-sm leading-relaxed text-muted sm:px-5 sm:pb-20">
        <p>The engine is plain, deterministic rules: no model sets a score. AI only explains flags and answers questions, and only with facts the engine returned. Unknown data is shown as unverified, never as a pass. Decision support only.</p>
      </section>
    </main>
  );
}
