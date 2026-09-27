'use client';
import { useEffect, useMemo, useState } from 'react';
import { affordabilityOf, EMPTY_ASSUMPTIONS, feasibility, type AmiReference, type Assumptions, type Valuation } from '@/lib/finance';
import { FIELDS, SQFT_TO_BEDROOMS, THRESHOLDS } from '@/lib/finance-config';
import type { PermitReference, RentReference } from '@/lib/web/server-data';
import { Term } from './Term';

const $ = (n: number | null | undefined, d = 0) => (n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: d }));
const KEY = 'buildready.assumptions.v1';

/** Compact valuation strip for the top of a lot report. County assessment data only. */
export function ValuationStrip({ v, sourceUrl }: { v: Valuation; sourceUrl: string }) {
  if (!v.available) return <p className="mt-4 rounded-xl border border-line bg-surface2 p-3 text-sm text-muted">No county assessment record found for this parcel (unknown, not zero).</p>;
  const cell = (label: React.ReactNode, value: string, sub?: string) => (
    <div className="rounded-xl bg-surface2 px-3 py-2.5"><div className="text-[11px] uppercase tracking-wider text-muted">{label}</div><div className="mt-0.5 text-lg font-semibold tabular-nums leading-tight">{value}</div>{sub && <div className="text-[11px] text-muted">{sub}</div>}</div>
  );
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted">
        <span><Term k="assessed value">County assessed value</Term>{v.taxYear ? ` · tax year ${v.taxYear}` : ''}{v.asOf ? ` · as of ${v.asOf}` : ''}</span>
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">Source: WPRDC / Allegheny County</a>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cell('Land', $(v.land))}
        {cell('Building', $(v.building), v.building === 0 ? 'no building on record' : undefined)}
        {cell('Total', $(v.total))}
        {cell('Land $/sq ft', v.landPerSqft == null ? '—' : $(v.landPerSqft, 2), v.ratioToHood != null && v.hoodMedianLandPerSqft != null ? `${v.ratioToHood >= 1 ? v.ratioToHood.toFixed(1) + '×' : Math.round(v.ratioToHood * 100) + '% of'} the neighborhood median (${$(v.hoodMedianLandPerSqft, 2)})` : 'neighborhood median unknown')}
      </div>
      {v.sale && <p className="mt-2 text-xs text-muted">Last recorded sale: <b className="font-medium text-fg">{$(v.sale.price)}</b> on {v.sale.date}{v.sale.type ? ` (${v.sale.type})` : ''}. {v.sale.note}</p>}
      <p className="mt-1 text-[11px] leading-relaxed text-muted">Assessed values are not market prices or development costs. Land value is only a rough hint of acquisition cost.</p>
    </div>
  );
}

const GROUPS: { id: 'site' | 'cost' | 'income' | 'debt'; label: string }[] = [
  { id: 'site', label: 'Site' }, { id: 'cost', label: 'Cost' }, { id: 'income', label: 'Income' }, { id: 'debt', label: 'Optional debt' },
];

/** Calculator that only ever uses numbers the user types. Nothing is pre-filled with our own estimates. */
export function FeasibilityCalculator({ v, allowed, zoningCode, rentRef, permitRef, amiRef }: { v: Valuation; allowed: string[]; zoningCode: string | null; rentRef: RentReference; permitRef: PermitReference; amiRef: AmiReference }) {
  const [a, setA] = useState<Assumptions>(EMPTY_ASSUMPTIONS);
  useEffect(() => { try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); setA({ ...EMPTY_ASSUMPTIONS, ...s, landCost: null, units: null }); } } catch { /* storage unavailable */ } }, []);
  useEffect(() => { try { const { landCost: _l, units: _u, ...rest } = a; localStorage.setItem(KEY, JSON.stringify(rest)); } catch { /* storage unavailable */ } }, [a]);
  const r = useMemo(() => feasibility(a), [a]);
  const set = (id: string, val: string) => setA((p) => ({ ...p, [id]: val === '' ? null : Number(val) }));
  const fields = FIELDS.filter((f) => !f.modes || f.modes.includes(a.mode));

  return (
    <details className="no-print card p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wider text-muted">Feasibility calculator · your own numbers</summary>
      <p className="mt-2 text-xs leading-relaxed text-muted">Type your assumptions to see cost against what the income or sales can support. <b className="text-fg">Nothing is pre-filled and none of these numbers are ours.</b> It is arithmetic on your inputs, not a market estimate or advice. Setbacks, height and utilities are not checked.</p>
      <p className="mt-2 text-xs text-muted">{zoningCode ? <>Zoning <b className="text-fg">{zoningCode}</b> allows by right: {allowed.length ? allowed.join(', ') : 'no housing type'}.</> : 'Zoning unknown.'}</p>
      <div className="mt-3 inline-flex rounded-full border border-line bg-surface2 p-1 text-sm">
        {(['rent', 'sale'] as const).map((m) => <button key={m} onClick={() => setA({ ...a, mode: m })} className={`rounded-full px-4 py-1.5 ${a.mode === m ? 'bg-accent font-semibold text-black' : 'text-muted'}`}>{m === 'rent' ? 'Rental' : 'For sale'}</button>)}
      </div>
      <div className="mt-3 space-y-4">
        {GROUPS.map((g) => {
          const fs = fields.filter((f) => f.group === g.id); if (!fs.length) return null;
          return (
            <div key={g.id}>
              <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">{g.label}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {fs.map((f) => (
                  <label key={f.id} className="block text-sm">
                    <span className="flex items-baseline justify-between gap-2"><span>{f.label}</span><span className="text-[11px] text-muted">{f.unit}</span></span>
                    <input type="number" inputMode="decimal" min={0} step={f.step} value={(a as any)[f.id] ?? ''} onChange={(e) => set(f.id, e.target.value)} aria-describedby={`h-${f.id}`} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent sm:h-10" />
                    <span id={`h-${f.id}`} className="mt-0.5 block text-[11px] leading-snug text-muted">{f.help}</span>
                    {f.id === 'landCost' && v.available && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {v.land != null && <button type="button" className="btn text-[11px]" onClick={() => setA({ ...a, landCost: v.land })}>Use assessed land value ({$(v.land)})</button>}
                        {v.sale?.price != null && v.sale.price > 1000 && <button type="button" className="btn text-[11px]" onClick={() => setA({ ...a, landCost: v.sale!.price })}>Use last sale ({$(v.sale.price)})</button>}
                      </span>
                    )}
                    {f.id === 'rentPerUnitMonth' && rentRef && (() => {
                      const nearest = SQFT_TO_BEDROOMS.find((b) => (a.unitSqft ?? 0) <= b.maxSqft) ?? SQFT_TO_BEDROOMS[2];
                      return (
                        <span className="mt-1 block">
                          <span className="flex flex-wrap gap-1.5">
                            {SQFT_TO_BEDROOMS.map((b) => rentRef.byBedroom[b.key] != null && (
                              <button key={b.key} type="button" onClick={() => setA({ ...a, rentPerUnitMonth: rentRef.byBedroom[b.key] })}
                                className={`btn text-[11px] ${b.key === nearest.key ? 'border-accent text-accent' : ''}`}>
                                HUD {b.label} rent: {$(rentRef.byBedroom[b.key])}
                              </button>
                            ))}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted">
                            HUD Fair Market Rent for ZIP {rentRef.zip} (gross rent, not neighborhood-specific — actual rents vary a lot within Pittsburgh; pick the bedroom count closest to your plan).
                            {' '}<a href={String(rentRef.meta.sourceUrl)} target="_blank" rel="noreferrer" className="text-accent hover:underline">Source: HUD USER SAFMR</a>.
                          </span>
                        </span>
                      );
                    })()}
                    {f.id === 'costPerSqft' && permitRef && (
                      <span className="mt-1 block rounded-lg bg-surface2 p-2 text-[11px] leading-relaxed text-muted">
                        For context: {permitRef.count} recent new-construction residential permit{permitRef.count === 1 ? '' : 's'}{permitRef.scope === 'neighborhood' ? ' in this neighborhood' : ' citywide (no neighborhood data)'} had a median declared project value of <b className="text-fg">{$(permitRef.median)}</b> (range {$(permitRef.min)}–{$(permitRef.max)}).
                        This is a total project cost, not $/sq ft — permits don&apos;t record square footage — and may include additions or multi-unit buildings, so it is not filled in automatically.
                        {' '}<a href={String((permitRef.meta as any).sourceUrl)} target="_blank" rel="noreferrer" className="text-accent hover:underline">Source: {String((permitRef.meta as any).source)}</a>.
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-line bg-surface2 p-3 text-sm" aria-live="polite">
        {!r.ok ? <p className="text-muted">Fill in: {r.missing.join(', ')}.</p> : (
          <div className="space-y-1">
            <Row k="Construction" v={$(r.constructionCost)} /><Row k="Soft costs" v={$(r.softCost)} />
            <Row k="Total development cost" v={$(r.totalCost)} strong /><Row k="Per home" v={$(r.costPerUnit)} /><Row k="Per sq ft" v={$(r.costPerSqft)} />
            {a.mode === 'rent' ? <><Row k="Yearly net income" v={$(r.noi)} /><Row k={<Term k="capitalization rate">Supportable value</Term>} v={$(r.supportableValue)} strong /></> : <Row k="Sales revenue" v={$(r.grossRevenue)} strong />}
            <div className={`mt-2 rounded-lg px-3 py-2 ${r.gap! > 0 ? 'bg-[var(--amber)]/10 text-[var(--amber)]' : 'bg-[var(--green)]/10 text-[var(--green)]'}`}>
              {r.gap! > 0 ? <><Term k="funding gap">Funding gap</Term> on your inputs: <b>{$(r.gap)}</b> ({$(r.gapPerUnit)} per home). Cost exceeds what the {a.mode === 'rent' ? 'income supports' : 'sales bring in'}; gap financing or subsidy would be needed.</> : <>On your inputs there is a cushion of <b>{$(Math.abs(r.gap!))}</b> ({$(Math.abs(r.gapPerUnit!))} per home).</>}
            </div>
            {r.debt && (
              <p className="mt-2 text-xs text-muted">Loan {$(r.debt.loan)} · yearly payment {$(r.debt.annualPayment)} · <Term k="debt service coverage">coverage</Term> <b className="text-fg">{r.debt.dscr == null ? '—' : r.debt.dscr.toFixed(2)}</b>
                {r.debt.dscrMin != null ? (r.debt.meetsMin ? ` (meets the ${r.debt.dscrMin} minimum)` : ` (below the ${r.debt.dscrMin} minimum)`) : ' (no threshold applied; confirm the minimum with your lender or PHFA)'}.</p>
            )}
            {THRESHOLDS.dscrMin == null && !r.debt && a.mode === 'rent' && <p className="text-xs text-muted">Add the optional loan boxes to see a coverage ratio.</p>}
            {a.mode === 'rent' && a.rentPerUnitMonth != null && a.rentPerUnitMonth > 0 && (() => {
              const nearest = SQFT_TO_BEDROOMS.find((b) => (a.unitSqft ?? 0) <= b.maxSqft) ?? SQFT_TO_BEDROOMS[2];
              const aff = affordabilityOf(a.rentPerUnitMonth!, nearest.key, amiRef);
              if (!aff) return null;
              const tier = aff.atOrBelow50Ami ? '50% AMI (Very Low Income)' : aff.atOrBelow60Ami ? '60% AMI (the common LIHTC ceiling)' : null;
              return (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted">Affordable to whom?</div>
                  <p className="mt-1 text-sm leading-relaxed">
                    At {$(a.rentPerUnitMonth)}/month for a {nearest.label} home (assumed {aff.householdSize}-person household), a renter would need about <b>{$(aff.incomeNeeded)}/year</b> to pay this at no more than 30% of income — HUD&apos;s standard for &quot;affordable&quot; (paying more is &quot;cost burdened&quot;).
                    That is about <b>{aff.percentOfAmi}% of {amiRef?.areaName ?? 'the area'} median income</b>{tier ? <>, at or below <Term k="AMI">{tier}</Term></> : ', above the standard 50%/60% AMI income-restriction tiers used for subsidized housing'}.
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    Assumes bedroom count from home size (studio–4BR+) and the standard HUD/<Term k="LIHTC">LIHTC</Term> household-size convention (bedrooms + 1). Informational only — it does not change the score or the calculator above, and is not a determination of program eligibility.
                    {' '}<a href={String(amiRef?.meta.sourceUrl ?? '')} target="_blank" rel="noreferrer" className="text-accent hover:underline">Source: HUD USER MTSP Income Limits</a>.
                  </p>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </details>
  );
}

function Row({ k, v, strong }: { k: React.ReactNode; v: string; strong?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-3 ${strong ? 'font-semibold' : 'text-muted'}`}><span>{k}</span><span className="tabular-nums text-fg">{v}</span></div>;
}
