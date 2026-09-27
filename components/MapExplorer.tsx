'use client';
import 'maplibre-gl/dist/maplibre-gl.css';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { bandColor } from './ScoreDial';
import { AskPanel } from './AskPanel';
import { locateAt, popupHtml } from '@/lib/web/locate-client';

type Props = { pin: string; address: string; hood: string; owner: string; lot: number; zone: string | null; score: number | null; reform: number | null; gates: string; aduReady: boolean; combine: boolean; starter: boolean; adj?: number; assemble?: boolean; env: number | null; flags: string[] };
type Feat = { type: 'Feature'; geometry: any; properties: Props; c: [number, number] };

const BASE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const FALLBACK: any = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b0d11' } }] };
const OWNERS = ['City', 'URA', 'HACP', 'County'];

function center(g: any): [number, number] {
  const xs: number[] = [], ys: number[] = [];
  for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) for (const [x, y] of poly[0]) { xs.push(x); ys.push(y); }
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
const colorExpr: any = ['case', ['==', ['get', 'score'], null], '#8a919e', ['>=', ['get', 'score'], 70], '#4ade80', ['>=', ['get', 'score'], 40], '#f5b342', '#f4646f'];

export default function MapExplorer() {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mlRef = useRef<any>(null);
  const [feats, setFeats] = useState<Feat[]>([]);
  const [ready, setReady] = useState(0);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [owners, setOwners] = useState<string[]>(OWNERS);
  const [hood, setHood] = useState('');
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(100);
  const [starter, setStarter] = useState(false);
  const [adu, setAdu] = useState(false);
  const [assemble, setAssemble] = useState(false);
  const [showAsk, setShowAsk] = useState(true);
  const [tab, setTab] = useState<'map' | 'filters' | 'ask'>('map'); // phones: one panel at a time
  const [highlight, setHighlight] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/opportunity').then((r) => r.json()).then((j) => setFeats(j.features.map((f: any) => ({ ...f, c: center(f.geometry) })))).catch((e) => setLoadErr(String(e)));
  }, []);
  const hoods = useMemo(() => [...new Set(feats.map((f) => f.properties.hood))].filter(Boolean).sort() as string[], [feats]);
  const filtered = useMemo(() => feats.filter((f) => {
    const p = f.properties;
    if (!owners.includes(p.owner)) return false;
    if (hood && p.hood !== hood) return false;
    const s = p.score ?? -1;
    if (s < min && !(min === 0 && p.score === null)) return false;
    if (s > max) return false;
    if (starter && !p.starter) return false;
    if (adu && !p.aduReady) return false;
    if (assemble && !p.assemble) return false;
    return true;
  }), [feats, owners, hood, min, max, starter, adu, assemble]);

  // map init
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ml = ((await import('maplibre-gl')) as any);
      if (cancelled || !el.current) return;
      try { ml.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs'); } catch { /* default worker */ }
      mlRef.current = ml;
      const map = new ml.Map({ container: el.current, style: BASE, center: [-79.98, 40.44], zoom: 11.2, attributionControl: { compact: true } });
      mapRef.current = map;
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      let fell = false;
      map.on('error', (e: any) => { if (!fell && !map.isStyleLoaded() && /style\.json|Failed to fetch|NetworkError/i.test(String(e?.error?.message ?? '') + String(e?.error?.url ?? ''))) { fell = true; try { map.setStyle(FALLBACK); } catch { /* noop */ } } });
      map.on('style.load', () => setReady((v: number) => v + 1));
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // data layers
  useEffect(() => {
    const map = mapRef.current, ml = mlRef.current; if (!map || !ml || !ready) return;
    const polys = { type: 'FeatureCollection', features: filtered.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: f.properties })) };
    const pts = { type: 'FeatureCollection', features: filtered.map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: f.c }, properties: f.properties })) };
    const hl = { type: 'FeatureCollection', features: filtered.filter((f) => highlight.includes(f.properties.pin)).map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: f.c }, properties: {} })) };
    const set = (id: string, d: any) => { const s = map.getSource(id); if (s) s.setData(d); else map.addSource(id, { type: 'geojson', data: d }); };
    set('opp-polys', polys); set('opp-pts', pts); set('opp-hl', hl);
    if (!map.getLayer('opp-fill')) {
      map.addLayer({ id: 'opp-fill', type: 'fill', source: 'opp-polys', minzoom: 14.5, paint: { 'fill-color': colorExpr, 'fill-opacity': 0.75 } });
      map.addLayer({ id: 'opp-line', type: 'line', source: 'opp-polys', minzoom: 14.5, paint: { 'line-color': '#0b0d11', 'line-width': 0.8 } });
      map.addLayer({ id: 'opp-circle', type: 'circle', source: 'opp-pts', maxzoom: 14.5, paint: { 'circle-color': colorExpr, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.2, 14, 5], 'circle-opacity': 0.85, 'circle-stroke-width': 0.5, 'circle-stroke-color': '#0b0d11' } });
      map.addLayer({ id: 'opp-hl', type: 'circle', source: 'opp-hl', paint: { 'circle-radius': 14, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
      const click = (e: any) => {
        const f = e.features?.[0]; if (!f) return;
        const p = f.properties; const flags = typeof p.flags === 'string' ? JSON.parse(p.flags) : p.flags;
        new ml.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(
          `<div style="font:13px system-ui;color:#111"><b>${p.address || '(no address)'}</b><br/>${p.hood} · ${p.owner}-owned · ${Number(p.lot).toLocaleString()} sq ft · ${p.zone ?? '?'}<br/>` +
          `Score <b>${p.score === 'null' || p.score === null ? 'none' : p.score}</b> · if Bill 2025-1545 passes <b>${p.reform === 'null' || p.reform === null ? 'none' : p.reform}</b>` +
          `${p.combine === true || p.combine === 'true' ? '<br/><i>Smaller than its district minimum' + (p.assemble === true || p.assemble === 'true' ? ': a vacant or public neighbor would get it over the minimum.' : ': combine with adjacent lot?') + '</i>' : ''}` +
          `<br/><a href="/parcel/${p.pin}" style="color:#2563eb;font-weight:600">Open lot report →</a></div>`).addTo(map);
        void flags;
      };
      // click ANY parcel (not only opportunity lots): ask the server which real parcel contains the click
      map.addSource('sel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'sel-fill', type: 'fill', source: 'sel', paint: { 'fill-color': '#8ab4ff', 'fill-opacity': 0.25 } });
      map.addLayer({ id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': '#ffffff', 'line-width': 2.5 } });
      map.on('click', async (e: any) => {
        if (map.queryRenderedFeatures(e.point, { layers: ['opp-fill', 'opp-circle'].filter((l) => map.getLayer(l)) }).length) return; // opportunity popup handles it
        if (map.getZoom() < 15) { new ml.Popup({ maxWidth: '240px' }).setLngLat(e.lngLat).setHTML('<div style="font:13px system-ui;color:#111">Zoom in to lot level to select a parcel.</div>').addTo(map); return; }
        const r = await locateAt(e.lngLat.lng, e.lngLat.lat);
        const sel = map.getSource('sel');
        if (!r.found) { sel?.setData({ type: 'FeatureCollection', features: [] }); new ml.Popup({ maxWidth: '240px' }).setLngLat(e.lngLat).setHTML(`<div style="font:13px system-ui;color:#111">No parcel here: ${r.reason.replace(/</g, '')}.</div>`).addTo(map); return; }
        sel?.setData({ type: 'Feature', properties: {}, geometry: r.geometry });
        new ml.Popup({ maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(popupHtml(r.parcel)).addTo(map);
      });
      map.on('mousemove', (e: any) => { if (map.getZoom() >= 15 && !map.queryRenderedFeatures(e.point, { layers: ['opp-fill', 'opp-circle'].filter((l) => map.getLayer(l)) }).length) map.getCanvas().style.cursor = 'crosshair'; });
      for (const id of ['opp-fill', 'opp-circle']) { map.on('click', id, click); map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer')); map.on('mouseleave', id, () => (map.getCanvas().style.cursor = '')); }
    }
  }, [filtered, ready, highlight]);

  const top = useMemo(() => [...filtered].sort((a, b) => (b.properties.score ?? -1) - (a.properties.score ?? -1)).slice(0, 40), [filtered]);
  const fly = (f: Feat) => { setTab('map'); setTimeout(() => { mapRef.current?.resize(); mapRef.current?.flyTo({ center: f.c, zoom: 17, duration: 900 }); }, 60); };
  useEffect(() => { if (tab === 'map') setTimeout(() => mapRef.current?.resize(), 60); }, [tab]);
  const showPins = (pins: string[]) => { setHighlight(pins); const fs = feats.filter((f) => pins.includes(f.properties.pin)); if (fs.length && mapRef.current && mlRef.current) { const b = new mlRef.current.LngLatBounds(); fs.forEach((f) => b.extend(f.c)); mapRef.current.fitBounds(b, { padding: 120, maxZoom: 16, duration: 900 }); } };

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col lg:grid lg:grid-cols-[320px_1fr_auto]">
      <aside className={`${tab === 'filters' ? 'block' : 'hidden'} min-h-0 flex-1 overflow-y-auto border-r border-line bg-bg p-4 lg:block lg:flex-none`}>
        <h1 className="text-lg font-semibold tracking-tight">Opportunity map</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted">Vacant publicly owned lots, colored by Development Ease Score. {feats.length ? `${filtered.length.toLocaleString()} of ${feats.length.toLocaleString()} lots shown.` : loadErr ?? 'Loading…'}</p>
        <div className="mt-4 space-y-4 text-sm">
          <div><div className="mb-1.5 text-xs uppercase tracking-wider text-muted">Owner</div><div className="flex flex-wrap gap-1.5">{OWNERS.map((o) => <button key={o} onClick={() => setOwners(owners.includes(o) ? owners.filter((x) => x !== o) : [...owners, o])} className={`btn ${owners.includes(o) ? 'border-accent text-accent' : 'text-muted'}`}>{o}</button>)}</div></div>
          <label className="block"><div className="mb-1.5 text-xs uppercase tracking-wider text-muted">Neighborhood</div>
            <select value={hood} onChange={(e) => setHood(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-2 py-2"><option value="">All neighborhoods</option>{hoods.map((h) => <option key={h}>{h}</option>)}</select></label>
          <div><div className="mb-1.5 flex justify-between text-xs uppercase tracking-wider text-muted"><span>Score range</span><span className="normal-case">{min}–{max}</span></div>
            <input type="range" min={0} max={100} value={min} onChange={(e) => setMin(Math.min(Number(e.target.value), max))} className="w-full" aria-label="Minimum score" />
            <input type="range" min={0} max={100} value={max} onChange={(e) => setMax(Math.max(Number(e.target.value), min))} className="w-full" aria-label="Maximum score" /></div>
          <label className="flex items-start gap-2"><input type="checkbox" checked={starter} onChange={(e) => setStarter(e.target.checked)} className="mt-1" /><span>Starter-home ready<br /><span className="text-xs text-muted">no gates and score 70+</span></span></label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={adu} onChange={(e) => setAdu(e.target.checked)} className="mt-1" /><span>ADU ready under reform<br /><span className="text-xs text-muted">by-right ADUs if Bill 2025-1545 passes (proposed)</span></span></label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={assemble} onChange={(e) => setAssemble(e.target.checked)} className="mt-1" /><span>Can be assembled to size<br /><span className="text-xs text-muted">below its district minimum, but combining with an adjacent vacant or public lot reaches it</span></span></label>
        </div>
        <div className="mt-5 flex items-center gap-3 text-[11px] text-muted"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--green)]" />70+</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--amber)]" />40–69</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--red)]" />&lt;40</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--muted)]" />no score</span></div>
        <h2 className="mb-2 mt-6 text-xs uppercase tracking-wider text-muted">Top lots in view</h2>
        <ul className="space-y-1">
          {top.map((f) => (
            <li key={f.properties.pin}>
              <button onClick={() => fly(f)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface2">
                <span className="min-w-0"><span className="block truncate">{f.properties.address || f.properties.pin}</span><span className="block truncate text-xs text-muted">{f.properties.hood} · {f.properties.owner}{f.properties.combine ? ' · combine?' : ''}</span></span>
                <span className="font-semibold tabular-nums" style={{ color: bandColor(f.properties.score) }}>{f.properties.score ?? '—'}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] leading-relaxed text-muted"><b className="font-medium text-fg">Click any parcel</b> (zoom in to lot level) to open its report, not just the dots. Streets and water say &ldquo;no parcel here&rdquo;. Click a lot on the map to open its report. Lots smaller than their district minimum are flagged &quot;combine with adjacent lot?&quot;.</p>
      </aside>
      <div className={`${tab === 'map' ? 'block' : 'hidden'} relative min-h-0 flex-1 lg:block`}><div ref={el} className="h-full w-full" />
        <button onClick={() => setShowAsk(!showAsk)} className="btn absolute bottom-6 right-3 hidden lg:block">{showAsk ? 'Hide' : 'Ask'} panel</button>
      </div>
      <div className={`${tab === 'ask' ? 'block' : 'hidden'} min-h-0 flex-1 lg:w-[380px] lg:flex-none lg:border-l lg:border-line ${showAsk ? 'lg:block' : 'lg:hidden'}`}><AskPanel onPins={showPins} onViewMap={() => { setTab('map'); }} /></div>
      <nav className="flex shrink-0 border-t border-line bg-bg lg:hidden" aria-label="Map sections">
        {([['map', 'Map'], ['filters', `Filters · ${filtered.length.toLocaleString()}`], ['ask', 'Ask']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} aria-current={tab === k} className={`flex-1 py-3 text-sm ${tab === k ? 'font-semibold text-accent' : 'text-muted'}`}>{label}</button>
        ))}
      </nav>
    </div>
  );
}
