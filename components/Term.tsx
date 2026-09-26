import { GLOSSARY } from '@/lib/web/glossary';

/** Wraps a zoning/GIS term with a hover/focus tooltip (native title + styled popover). */
export function Term({ k, children }: { k: string; children?: React.ReactNode }) {
  const def = GLOSSARY[k] ?? GLOSSARY[k.toLowerCase()];
  if (!def) return <>{children ?? k}</>;
  return (
    <span className="group relative inline-block">
      <span className="term" tabIndex={0} aria-describedby={`t-${k}`}>{children ?? k}</span>
      <span id={`t-${k}`} role="tooltip" className="pointer-events-none invisible absolute bottom-full left-0 z-40 mb-2 w-64 rounded-lg border border-line bg-surface2 p-2.5 text-xs font-normal leading-snug text-fg opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {def}
      </span>
    </span>
  );
}
