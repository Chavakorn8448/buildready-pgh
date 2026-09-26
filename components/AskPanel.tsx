'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';

type Trace = { tool: string; args: any; summary: string };
type Msg = { role: 'user' | 'assistant'; text: string; pins?: string[]; trace?: Trace[]; mode?: string; confirmWith?: string[]; error?: boolean };

const EXAMPLES = [
  'Top 3 city-owned vacant lots in Homewood for a duplex if the ADU bill passes, and what is blocking them',
  'Which URA-owned vacant lots score 70 or higher and are smaller than their district minimum?',
  'How many lots would gain by-right ADU potential in Hazelwood if Bill 2025-1545 passes?',
];

export function AskPanel({ onPins }: { onPins?: (pins: string[]) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: 'user', text }]); setQ(''); setBusy(true);
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'request failed');
      setMsgs((m) => [...m, { role: 'assistant', text: j.answer, pins: j.pins, trace: j.trace, mode: j.mode, confirmWith: j.confirmWith }]);
      if (j.pins?.length) onPins?.(j.pins);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'assistant', text: `Sorry, that failed: ${e.message}`, error: true }]);
    } finally { setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50); }
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="border-b border-line p-4"><h2 className="font-semibold">Ask</h2><p className="mt-1 text-xs leading-relaxed text-muted">Questions about vacant public lots and the zoning reforms. Answers come only from the scoring engine&apos;s data; no zoning determinations or legal or financial advice.</p></div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {msgs.length === 0 && (
          <div className="space-y-2">{EXAMPLES.map((e) => <button key={e} onClick={() => ask(e)} className="card block w-full p-3 text-left text-xs leading-relaxed text-muted transition hover:border-[#3a4150] hover:text-fg">{e}</button>)}</div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'ml-6 rounded-2xl bg-surface2 px-3 py-2' : ''}>
            {m.role === 'assistant' && m.mode && <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">{m.mode === 'claude' ? 'Claude + engine tools' : m.mode === 'cached' ? 'Cached showcase answer' : 'Engine-only answer (no LLM key configured)'}</div>}
            <Rendered text={m.text} />
            {m.pins && m.pins.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{m.pins.slice(0, 8).map((p) => <Link key={p} href={`/parcel/${p}`} className="btn font-mono text-[11px]">{p}</Link>)}</div>}
            {m.confirmWith && m.confirmWith.length > 0 && <p className="mt-2 text-xs text-muted">Confirm with: {m.confirmWith.join('; ')}.</p>}
            {m.trace && m.trace.length > 0 && (
              <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Tool trace ({m.trace.length})</summary>
                <ol className="mt-1 list-decimal space-y-1 pl-4">{m.trace.map((t, j) => <li key={j}><code className="font-mono text-fg">{t.tool}</code>({JSON.stringify(t.args)}) → {t.summary}</li>)}</ol></details>
            )}
          </div>
        ))}
        {busy && <div className="animate-pulse text-muted">Thinking…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="border-t border-line p-3">
        <div className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about lots or the reform…" className="h-10 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent" /><button className="btn btn-accent" disabled={busy}>Ask</button></div>
      </form>
    </div>
  );
}

function Rendered({ text }: { text: string }) {
  return <div className="space-y-2 whitespace-pre-wrap leading-relaxed">{text.split(/(\[[a-z0-9_.]+\])/gi).map((p, i) => /^\[[a-z0-9_.]+\]$/i.test(p) ? <code key={i} className="rounded bg-white/5 px-1 font-mono text-[11px] text-accent">{p}</code> : <span key={i}>{p}</span>)}</div>;
}
