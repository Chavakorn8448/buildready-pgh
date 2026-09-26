'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Hit = { pin: string; address: string; hood: string; score: number | null; zone: string | null; owner: string | null; vacant: boolean | null };

export function SearchBox({ onPick, placeholder, autoFocus, size = 'lg' }: { onPick?: (h: Hit) => void; placeholder?: string; autoFocus?: boolean; size?: 'lg' | 'sm' }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 3) { setHits([]); setNote(null); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        setHits(j.hits ?? []); setNote(j.note ?? null); setActive(0);
      } catch { setNote('Search is unavailable right now.'); }
    }, 180);
  }, [q]);

  const pick = (h: Hit) => { setOpen(false); setQ(''); if (onPick) onPick(h); else router.push(`/parcel/${h.pin}`); };

  return (
    <div className="relative w-full">
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && hits[active]) pick(hits[active]);
        }}
        placeholder={placeholder ?? 'Parcel ID or address, e.g. 5925 Walnut St'}
        aria-label="Search by parcel ID or address"
        className={`w-full rounded-2xl border border-line bg-surface px-5 outline-none transition focus:border-accent ${size === 'lg' ? 'h-14 text-lg' : 'h-10 text-sm'}`}
      />
      {open && q.trim().length >= 3 && (hits.length > 0 || note) && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-surface2 shadow-2xl">
          {hits.map((h, i) => (
            <button key={h.pin} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)} onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${i === active ? 'bg-white/5' : ''}`}>
              <span><span className="font-medium">{h.address || '(no street address)'}</span> <span className="text-muted">· {h.hood} · {h.zone ?? 'zoning ?'}</span><br /><span className="font-mono text-xs text-muted">{h.pin}</span></span>
              <span className="rounded-full border border-line px-2.5 py-0.5 text-xs">{h.score === null ? 'no score' : h.score}</span>
            </button>
          ))}
          {note && <div className="px-4 py-3 text-sm text-muted">{note}</div>}
        </div>
      )}
    </div>
  );
}
