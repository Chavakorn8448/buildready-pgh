'use client';
import { useEffect, useRef, useState } from 'react';

export function useTween(target: number | null, ms = 650) {
  const [v, setV] = useState<number>(target ?? 0);
  const from = useRef<number>(target ?? 0);
  useEffect(() => {
    if (target === null) return;
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3);
      const cur = a + (target - a) * e;
      setV(cur); from.current = cur;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export const bandColor = (s: number | null) => (s === null ? 'var(--muted)' : s >= 70 ? 'var(--green)' : s >= 40 ? 'var(--amber)' : 'var(--red)');

export function ScoreDial({ score, cap, size = 148 }: { score: number | null; cap?: number | null; size?: number }) {
  const v = useTween(score);
  const r = 52, c = 2 * Math.PI * r;
  const shown = score === null ? null : Math.round(v);
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={score === null ? 'No score' : `Score ${score} out of 100`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
        {score !== null && <circle cx="60" cy="60" r={r} fill="none" stroke={bandColor(score)} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, v)) / 100)} />}
        {cap != null && score !== null && (() => { const a = (cap / 100) * 2 * Math.PI; return <line x1={60 + (r - 8) * Math.cos(a)} y1={60 + (r - 8) * Math.sin(a)} x2={60 + (r + 8) * Math.cos(a)} y2={60 + (r + 8) * Math.sin(a)} stroke="var(--text)" strokeWidth="2" />; })()}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-4xl font-semibold tabular-nums tracking-tight">{shown === null ? '—' : shown}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted">{score === null ? 'no score' : 'of 100'}</div>
        </div>
      </div>
    </div>
  );
}
