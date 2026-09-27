'use client';
import { useState } from 'react';
import type { Summary } from '@/lib/summary';

const TONE = { strong: 'var(--green)', workable: 'var(--amber)', hard: 'var(--red)', 'no-score': 'var(--muted)' } as const;
const LABEL = { strong: 'Strong candidate', workable: 'Workable with review', hard: 'Difficult as things stand', 'no-score': 'No score' } as const;

/** Plain-language summary: biggest barriers, what is in your favor, and who to talk to next. Built from the engine's own flags. */
export function BottomLine({ s, proposed }: { s: Summary; proposed: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="bl-h">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="bl-h" className="text-sm font-semibold uppercase tracking-wider text-muted">Bottom line</h2>
        <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium" style={{ color: TONE[s.verdict], borderColor: TONE[s.verdict] }}>{LABEL[s.verdict]}</span>
        {proposed && <span className="rounded-full border border-[var(--amber)]/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--amber)]">Under proposed rules</span>}
      </div>
      <p className="mt-2 text-[15px] leading-relaxed">{s.headline}</p>
      {s.barriers.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Biggest barriers</h3>
          <ol className="mt-1.5 space-y-1.5 text-sm leading-relaxed">
            {s.barriers.map((b) => <li key={b.id} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--amber)]" /><span>{b.text}{b.reviewBy && <span className="text-muted"> Confirm with: {b.reviewBy}.</span>}</span></li>)}
          </ol>
        </div>
      )}
      {s.inFavor.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">In your favor</h3>
          <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed">
            {s.inFavor.map((b) => <li key={b.id} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--green)]" /><span>{b.text}</span></li>)}
          </ul>
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="btn mt-4 no-print">{open ? 'Hide' : 'Show'} what to do next ({s.nextSteps.length} steps)</button>
      {(open) && (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          {s.nextSteps.map((n, i) => <li key={i}>{n.step} <span className="text-muted">Who: <b className="font-medium text-fg">{n.who}</b>.</span></li>)}
        </ol>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">Written from the checks below; it is not a zoning determination or advice.</p>
    </section>
  );
}
