'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CONFIG } from '@/lib/config';
import { fromPacket, type Packet } from '@/lib/packets';
import { comparePacket, runPacket, withWeights, type Meta, type RuleSetId } from '@/lib/web/run';
import { metaFor, TONE_CLASS, type Tone } from '@/lib/web/flagMeta';
import { Term } from './Term';
import { FeasibilityCalculator, ValuationStrip } from './FinancialSnapshot';
import { BottomLine } from './BottomLine';
import { AssemblageCard } from './AssemblageCard';
import { summarize } from '@/lib/summary';
import { byRightTypes, valuationOf, type AmiReference } from '@/lib/finance';
import { PRESETS } from '@/lib/finance-config';
import { parseZoning } from '@/lib/zoning';
import { bandColor, ScoreDial, useTween } from './ScoreDial';
import type { MapPin } from './ParcelMap';
import { LAYER_DEFS } from './ParcelMap';
import type { Fact } from '@/lib/types';

const ParcelMap = dynamic(() => import('./ParcelMap'), { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-surface" /> });

export type AiEntry = { flags: Record<string, string>; nextSteps: string[]; model: string; generatedAt: string };
const SUB_LABEL: Record<string, { label: string; tip: string }> = {
  zoning: { label: 'Zoning fit', tip: 'Is housing allowed here, is the lot big enough, and do overlays add steps?' },
  environmental: { label: 'Environmental', tip: 'Steep slope, landslide-prone ground, old mines, flood zone.' },
  funding: { label: 'Funding fit', tip: 'Vacant infill in a low-value area can score well for PHFA; low values also mean gap financing is likely.' },
  access: { label: 'Transit access', tip: 'Inside the 1,500 ft major transit buffer earns full points.' },
  site: { label: 'Site & title', tip: 'Vacancy and public ownership (City, URA, HACP) make acquisition easier.' },
};

export default function ParcelView({ packet, meta, hood, ai, neighbors = [], rentRef = null, permitRef = null, amiRef = null }: { packet: Packet; meta: Meta; hood: string; ai: Partial<Record<RuleSetId, AiEntry>>; neighbors?: { pin: string; address: string; owner: string | null; vacant: boolean | null; lot: number | null; zone: string | null; geometry: any }[]; rentRef?: import('@/lib/web/server-data').RentReference; permitRef?: import('@/lib/web/server-data').PermitReference; amiRef?: AmiReference }) {
  const [rs, setRs] = useState<RuleSetId>('current');
  const [weights, setWeights] = useState<Record<keyof typeof CONFIG.weights, number>>({ ...CONFIG.weights });
  const [hot, setHot] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [hotNbr, setHotNbr] = useState<string | null>(null);
  useEffect(() => { if (window.innerWidth >= 1024) setLayersOpen(true); }, []);
  const [vis, setVis] = useState<Record<string, boolean>>({ pieces: true, zoning: false, transit_buffer: true, fema2014: false, landslide: false, undermined: false, historic: false, iz_overlay: false, adjacent: true });
  const config = useMemo(() => withWeights(weights), [weights]);
  const cmp = useMemo(() => comparePacket(packet, meta, config), [packet, meta, config]);
  const res = rs === 'reform-2025-1545' ? cmp.reform : cmp.current;
  const { parcel } = useMemo(() => fromPacket(packet), [packet]);
  const factById = useMemo(() => new Map(res.facts.map((f) => [f.id, f])), [res]);
  const valuation = useMemo(() => valuationOf(parcel, meta.hoodValues.byHood), [parcel, meta]);
  const zInfo = useMemo(() => parseZoning(parcel.zoningDistrict, meta.permittedUses), [parcel, meta]);
  const allowed = useMemo(() => byRightTypes(zInfo.column ? meta.permittedUses.districts[zInfo.column]?.uses : null), [zInfo, meta]);
  const assessSource = meta.layerMeta.assessments?.url ?? 'https://data.wprdc.org/dataset/property-assessments';
  const summary = useMemo(() => summarize(res, { transit: (res.overlaps?.transit_buffer.overlapFraction ?? 0) >= 0.5, byRight: zInfo.housing === 'by_right' }), [res, zInfo]);
  const nbrGeo = useMemo(() => neighbors.filter((n) => n.geometry).map((n) => ({ pin: n.pin, geometry: n.geometry })), [neighbors]);
  const capGate = res.gates.find((g) => g.id === 'G3' && g.triggered);
  const noScoreGate = res.gates.find((g) => g.effect === 'no_score' && g.triggered);
  const isDefaultWeights = Object.entries(CONFIG.weights).every(([k, v]) => (weights as any)[k] === v);

  // ---- pins from flags ----
  const { pins, numberOf } = useMemo(() => {
    const out: MapPin[] = []; const nums = new Map<string, number>();
    for (const f of res.flags) {
      const m = metaFor(f.id);
      if (!m.pin || m.tone === 'gray') continue;
      const ov = m.pin === 'centroid' ? null : (packet.o[m.pin] as any);
      const at = ov && typeof ov === 'object' && ov.pin ? ov.pin : parcel.centroid;
      const n = out.length + 1; nums.set(f.id, n);
      out.push({ n, tone: m.tone, lon: at[0], lat: at[1], flagId: f.id, label: m.title });
    }
    return { pins: out, numberOf: nums };
  }, [res, packet, parcel]);
  const pieces = useMemo(() => {
    const p: Record<string, any[]> = {};
    for (const [k, v] of Object.entries(packet.o)) if (v && typeof v === 'object' && (v as any).g) p[k] = (v as any).g;
    return p;
  }, [packet]);

  const flags = [...res.flags].sort((a, b) => order(a) - order(b));
  function order(f: { id: string; severity: string }) { const t = metaFor(f.id).tone; return { red: 0, amber: 1, green: 2, gray: 3 }[t as Tone] * 10 + (numberOf.get(f.id) ?? 9); }
  const aiFlags = ai[rs]?.flags ?? {};
  const delta = cmp.delta;

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 px-3 py-3 sm:gap-5 sm:px-5 sm:py-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* LEFT: map */}
      <div className="no-print lg:sticky lg:top-[76px] lg:h-[calc(100vh-96px)]">
        <div className="relative h-[46dvh] min-h-[300px] lg:h-full">
          <ParcelMap geometry={parcel.geometry} centroid={parcel.centroid} pins={pins} pieces={pieces} hot={hot} onHover={setHot} visible={vis} neighbors={nbrGeo} hotNeighbor={hotNbr} pin={parcel.pin} />
          <div className="absolute left-2 top-2 max-w-[calc(100%-64px)] rounded-xl border border-line bg-bg/90 p-2 text-xs backdrop-blur sm:left-3 sm:top-3 sm:p-2.5">
            <button onClick={() => setLayersOpen(!layersOpen)} aria-expanded={layersOpen} className="flex w-full items-center justify-between gap-3 font-medium text-muted">
              <span>Map layers</span><span aria-hidden>{layersOpen ? '−' : '+'}</span>
            </button>
            {layersOpen && (
              <>
                <div className="mt-1.5 grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2 sm:gap-y-1">
                  {nbrGeo.length > 0 && <Check label="Adjacent lots" on={vis.adjacent !== false} set={(v) => setVis({ ...vis, adjacent: v })} color="#8ab4ff" />}
                  <Check label="Overlap on this lot" on={vis.pieces} set={(v) => setVis({ ...vis, pieces: v })} color="#ff8a4c" />
                  {LAYER_DEFS.map((d) => <Check key={d.key} label={d.label} on={!!vis[d.key]} set={(v) => setVis({ ...vis, [d.key]: v })} color={d.color} />)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[11px] text-muted">
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: 'var(--red)' }} />gate</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: 'var(--amber)' }} />friction</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: 'var(--green)' }} />in your favor</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: panel */}
      <div className="space-y-5">
        <section className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{parcel.address || '(no street address)'}</h1>
              <p className="mt-1 text-sm text-muted">
                {hood} · <Term k="zoning district">zoning</Term> <span className="text-fg">{parcel.zoningDistrict ?? 'unknown'}</span> · {parcel.vacant ? 'vacant' : parcel.vacant === false ? 'built' : 'vacancy unknown'} · {parcel.ownerType ?? 'owner unknown'}-owned · {parcel.lotAreaSqft ? `${Math.round(parcel.lotAreaSqft).toLocaleString()} sq ft` : 'lot area unknown'}
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted">{parcel.pin}</p>
            </div>
            <div className="no-print flex gap-2">
              <Link className="btn" href={`/compare?ids=${parcel.pin}`}>Compare</Link>
              <Link className="btn" href={`/parcel/${parcel.pin}/memo?rs=${rs}`} target="_blank">Site memo (PDF)</Link>
            </div>
          </div>

          <ValuationStrip v={valuation} sourceUrl={assessSource} />

          {/* reform toggle */}
          <div className="no-print mt-4 flex w-full rounded-full border border-line bg-surface2 p-1 text-xs sm:inline-flex sm:w-auto sm:text-sm" role="tablist" aria-label="Rule set">
            {(['current', 'reform-2025-1545'] as RuleSetId[]).map((id) => (
              <button key={id} role="tab" aria-selected={rs === id} onClick={() => setRs(id)}
                className={`flex-1 rounded-full px-3 py-2 transition sm:flex-none sm:px-4 sm:py-1.5 ${rs === id ? 'bg-accent font-semibold text-black' : 'text-muted hover:text-fg'}`}>
                {id === 'current' ? 'Current code' : <><span className="sm:hidden">Proposed reform</span><span className="hidden sm:inline">Proposed (Bill 2025-1545)</span></>}
              </button>
            ))}
          </div>
          {rs === 'reform-2025-1545' && <p className="mt-2 rounded-lg border border-[var(--amber)]/40 bg-[var(--amber)]/10 px-3 py-2 text-xs text-[var(--amber)]">{res.ruleSet.statusNote}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-4 sm:gap-6">
            <ScoreDial score={res.score} cap={capGate?.cap ?? null} />
            <div className="min-w-[220px] flex-1">
              <div className="text-xs uppercase tracking-wider text-muted">Development Ease Score</div>
              <div className="mt-1 text-sm text-muted">
                {res.ruleSet.label}
                {delta !== null && rs === 'reform-2025-1545' && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs" style={{ color: delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--muted)' }}>{delta > 0 ? '+' : ''}{delta} vs current ({cmp.current.score})</span>}
              </div>
              {res.score !== null && capGate?.cap != null && res.uncappedScore !== null && res.uncappedScore > capGate.cap && <p className="mt-1 text-xs text-[var(--amber)]">Capped from {res.uncappedScore} by a zoning gate.</p>}
              {!isDefaultWeights && <p className="mt-1 text-xs text-[var(--amber)]">Custom weights in use.</p>}
              <p className="mt-2 text-xs leading-relaxed text-muted">Rule-based and reproducible: the same inputs always give the same score. Every number below cites its source.</p>
            </div>
          </div>

          {/* gates */}
          <div className="mt-4 space-y-2">
            {res.gates.filter((g) => g.triggered).map((g) => (
              <div key={g.id} className={`rounded-xl border px-3 py-2 text-sm ${g.effect === 'no_score' ? 'border-[var(--red)]/50 bg-[var(--red)]/10' : 'border-[var(--amber)]/50 bg-[var(--amber)]/10'}`}>
                <b>{g.id} · {g.name}.</b> {g.message}{g.reviewBy && <span className="text-muted"> Confirm with: {g.reviewBy}.</span>}
              </div>
            ))}
          </div>
        </section>

        <BottomLine s={summary} proposed={rs === 'reform-2025-1545'} />

        {/* sub-scores */}
        {res.subScores && (
          <section className="card p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">What drives the score</h2>
            <div className="space-y-3.5">
              {Object.entries(res.subScores).map(([k, s]) => <Bar key={k} label={SUB_LABEL[k].label} tip={SUB_LABEL[k].tip} score={s.score} weight={s.weight} contribution={s.contribution} notes={s.notes} />)}
            </div>
            <p className="mt-3 text-xs text-muted">Water and sewer capacity is never scored: it is always an open question until PWSA issues an availability letter.</p>
          </section>
        )}

        <AssemblageCard self={{ lot: parcel.lotAreaSqft, zone: parcel.zoningDistrict, vacant: parcel.vacant }} neighbors={neighbors} hot={hotNbr} onHot={setHotNbr} />

        <FeasibilityCalculator v={valuation} allowed={allowed} zoningCode={parcel.zoningDistrict} rentRef={rentRef} permitRef={permitRef} amiRef={amiRef} />

        {/* flags */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Flags to review ({flags.length})</h2>
          <div className="space-y-3">
            {flags.map((f) => {
              const m = metaFor(f.id); const tone = TONE_CLASS[m.tone]; const n = numberOf.get(f.id);
              const fact: Fact | undefined = f.factIds.map((id) => factById.get(id)).find((x) => x && x.sourceUrl);
              const text = aiFlags[f.id];
              return (
                <article key={f.id} onMouseEnter={() => setHot(f.id)} onMouseLeave={() => setHot(null)} onClick={() => setHot(hot === f.id ? null : f.id)}
                  className={`card p-3.5 transition sm:p-4 ${hot === f.id ? `ring-1 ${tone.ring}` : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${n ? 'text-black' : 'bg-white/10 text-muted'} ${n ? tone.dot : ''}`}>{n ?? '·'}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{m.term ? <Term k={m.term}>{m.title}</Term> : m.title}{f.proposed && <span className="ml-2 rounded-full border border-[var(--amber)]/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--amber)]">Proposed</span>}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{f.text}</p>
                      {text && <p className="mt-2 rounded-lg border border-line bg-surface2 p-2.5 text-sm leading-relaxed">{text}<span className="mt-1 block text-[10px] uppercase tracking-wide text-muted">AI explanation · every claim cites an engine fact</span></p>}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {fact && <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">Source: {fact.source}</a>}
                        {f.reviewBy && <span className="text-muted">Confirm with: <b className="font-medium text-fg">{f.reviewBy}</b></span>}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {ai[rs]?.nextSteps?.length ? (
            <div className="card mt-3 p-4">
              <h3 className="text-sm font-semibold">Next steps</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">{ai[rs]!.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </div>
          ) : null}
        </section>

        {/* weights */}
        <details className="no-print card p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wider text-muted">Adjust weights</summary>
          <p className="mt-2 text-xs text-muted">Weights are a judgment call; pick a view or set your own. Scores update instantly and nothing is saved. Note: Funding fit is currently a neighborhood-value proxy, not a full pro forma.</p>
          <div className="mt-3 flex flex-wrap gap-2">{PRESETS.map((pr) => <button key={pr.id} title={pr.blurb} className={`btn ${Object.entries(pr.weights).every(([k, v]) => (weights as any)[k] === v) ? 'border-accent text-accent' : ''}`} onClick={() => setWeights({ ...pr.weights })}>{pr.label}</button>)}</div>
          <div className="mt-3 space-y-3">
            {(Object.keys(CONFIG.weights) as (keyof typeof CONFIG.weights)[]).map((k) => (
              <label key={k} className="grid grid-cols-[92px_1fr_30px] items-center gap-2 text-sm sm:grid-cols-[110px_1fr_36px] sm:gap-3">
                <span>{SUB_LABEL[k].label}</span>
                <input type="range" min={0} max={60} value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} />
                <span className="text-right tabular-nums">{weights[k]}</span>
              </label>
            ))}
          </div>
          <button className="btn mt-3" onClick={() => setWeights({ ...CONFIG.weights })}>Reset to defaults</button>
        </details>

        {/* evidence */}
        <details className="card p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wider text-muted">Evidence: every fact and its source ({res.facts.length})</summary>
          <div className="mt-3 divide-y divide-line">
            {res.facts.map((f) => (
              <div key={f.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 py-2 text-sm break-words">
                <div><span className="text-muted">{f.label}:</span> <b className="font-medium">{f.value === null ? 'unknown' : String(f.value)}</b>
                  {(f.confidence === 'unknown' || f.confidence === 'low') && <span className="ml-2 rounded-full border border-[var(--amber)]/60 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--amber)]">Unverified</span>}</div>
                <div className="text-right text-xs text-muted">{f.confidence}</div>
                <div className="col-span-2 text-xs text-muted"><a className="text-accent hover:underline" href={f.sourceUrl} target="_blank" rel="noreferrer">{f.source}</a> · retrieved {f.retrievedAt}{f.reviewBy ? ` · confirm with ${f.reviewBy}` : ''} · <span className="font-mono">{f.id}</span></div>
              </div>
            ))}
          </div>
        </details>
        <p className="text-xs leading-relaxed text-muted">Data snapshot {meta.generatedAt}. Public data as provided; it may be stale or wrong. No setback, height, building-code, historic-review-outcome or water/sewer capacity checks are included.</p>
      </div>
    </div>
  );
}

function Check({ label, on, set, color }: { label: string; on: boolean; set: (v: boolean) => void; color: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-muted hover:text-fg">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="accent-[var(--accent)]" />
      <i className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />{label}
    </label>
  );
}

function Bar({ label, tip, score, weight, contribution, notes }: { label: string; tip: string; score: number; weight: number; contribution: number; notes: string[] }) {
  const v = useTween(score, 500);
  return (
    <div title={notes.join('\n')}>
      <div className="flex items-baseline justify-between text-sm">
        <span>{label} <span className="text-xs text-muted">· weight {weight}</span></span>
        <span className="tabular-nums">{Math.round(score)} <span className="text-xs text-muted">(+{contribution})</span></span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface2"><div className="h-full rounded-full" style={{ width: `${v}%`, background: bandColor(score) }} /></div>
      <p className="mt-1 text-xs text-muted">{tip}</p>
    </div>
  );
}
