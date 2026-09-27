'use client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { Geom } from '@/lib/types';
import type { Tone } from '@/lib/web/flagMeta';

export type MapPin = { n: number; tone: Tone; lon: number; lat: number; flagId: string; label: string };
type Pieces = Record<string, Geom[]>;

const TONE_COLOR: Record<Tone, string> = { red: '#f4646f', amber: '#f5b342', green: '#4ade80', gray: '#8a919e' };
const BASE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const FALLBACK: any = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b0d11' } }] };

export const LAYER_DEFS = [
  { key: 'zoning', label: 'Zoning districts', color: '#8ab4ff', file: '/layers/zoning.json', kind: 'line' },
  { key: 'transit_buffer', label: 'Major transit buffer', color: '#4ade80', file: '/layers/transit_buffer.json', kind: 'fill' },
  { key: 'fema2014', label: 'FEMA flood zone', color: '#4aa8ff', file: '/layers/fema2014.json', kind: 'fill' },
  { key: 'landslide', label: 'Landslide-prone', color: '#f5b342', file: '/layers/landslide.json', kind: 'fill' },
  { key: 'undermined', label: 'Undermined', color: '#c084fc', file: '/layers/undermined.json', kind: 'fill' },
  { key: 'historic', label: 'Historic districts', color: '#f472b6', file: '/layers/historic.json', kind: 'fill' },
  { key: 'iz_overlay', label: 'Inclusionary overlay', color: '#22d3ee', file: '/layers/iz_overlay.json', kind: 'fill' },
] as const;
const PIECE_COLOR: Record<string, string> = { slope25: '#ff8a4c', landslide: '#f5b342', undermined: '#c084fc', fema2014: '#4aa8ff', historic: '#f472b6', iz_overlay: '#22d3ee', transit_buffer: '#4ade80' };

export default function ParcelMap({ geometry, centroid, pins, pieces, hot, onHover, visible, neighbors = [], hotNeighbor = null }: {
  geometry: Geom; centroid: [number, number]; pins: MapPin[]; pieces: Pieces; hot: string | null; onHover: (flagId: string | null) => void; visible: Record<string, boolean>;
  neighbors?: { pin: string; geometry: Geom }[]; hotNeighbor?: string | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mlRef = useRef<any>(null);
  const markers = useRef<Map<string, { m: any; el: HTMLDivElement }>>(new Map());
  const [ready, setReady] = useState(0);
  const [basemapOk, setBasemapOk] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ml = ((await import('maplibre-gl')) as any);
      if (cancelled || !el.current) return;
      try { ml.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs'); } catch { /* default worker */ }
      mlRef.current = ml;
      const map = new ml.Map({ container: el.current, style: BASE, center: centroid, zoom: 17, attributionControl: { compact: true } });
      mapRef.current = map;
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      let fell = false;
      map.on('error', (e: any) => {
        if (!fell && !map.isStyleLoaded() && /style\.json|Failed to fetch|NetworkError/i.test(String(e?.error?.message ?? '') + String(e?.error?.url ?? ''))) { fell = true; setBasemapOk(false); try { map.setStyle(FALLBACK); } catch { /* noop */ } }
      });
      map.on('style.load', () => setReady((v: number) => v + 1));
    })();
    return () => { cancelled = true; markers.current.forEach(({ m }) => m.remove()); markers.current.clear(); mapRef.current?.remove(); mapRef.current = null; setReady(0); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sources/layers (re-added when the style (re)loads)
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const fc = (geoms: Geom[]) => ({ type: 'FeatureCollection', features: geoms.map((g) => ({ type: 'Feature', properties: {}, geometry: g })) });
    const add = (id: string, data: any) => { if (map.getSource(id)) map.getSource(id).setData(data); else map.addSource(id, { type: 'geojson', data }); };
    for (const d of LAYER_DEFS) {
      if (!map.getSource(`ctx-${d.key}`)) {
        map.addSource(`ctx-${d.key}`, { type: 'geojson', data: d.file });
        if (d.kind === 'fill') {
          map.addLayer({ id: `ctx-${d.key}-fill`, type: 'fill', source: `ctx-${d.key}`, paint: { 'fill-color': d.color, 'fill-opacity': 0.14 }, layout: { visibility: 'none' } });
          map.addLayer({ id: `ctx-${d.key}-line`, type: 'line', source: `ctx-${d.key}`, paint: { 'line-color': d.color, 'line-width': 1, 'line-opacity': 0.7 }, layout: { visibility: 'none' } });
        } else {
          map.addLayer({ id: `ctx-${d.key}-line`, type: 'line', source: `ctx-${d.key}`, paint: { 'line-color': d.color, 'line-width': 1, 'line-opacity': 0.45 }, layout: { visibility: 'none' } });
        }
      }
    }
    for (const [k, geoms] of Object.entries(pieces)) {
      add(`piece-${k}`, fc(geoms));
      if (!map.getLayer(`piece-${k}-fill`)) {
        map.addLayer({ id: `piece-${k}-fill`, type: 'fill', source: `piece-${k}`, paint: { 'fill-color': PIECE_COLOR[k] ?? '#fff', 'fill-opacity': 0.42 } });
        map.addLayer({ id: `piece-${k}-line`, type: 'line', source: `piece-${k}`, paint: { 'line-color': PIECE_COLOR[k] ?? '#fff', 'line-width': 1.5 } });
      }
    }
    add('nbrs', { type: 'FeatureCollection', features: neighbors.map((n) => ({ type: 'Feature', properties: { pin: n.pin }, geometry: n.geometry })) });
    if (!map.getLayer('nbrs-fill')) {
      map.addLayer({ id: 'nbrs-fill', type: 'fill', source: 'nbrs', paint: { 'fill-color': ['case', ['==', ['get', 'pin'], hotNeighbor ?? ''], '#8ab4ff', '#8ab4ff'], 'fill-opacity': ['case', ['==', ['get', 'pin'], hotNeighbor ?? ''], 0.45, 0.12] } });
      map.addLayer({ id: 'nbrs-line', type: 'line', source: 'nbrs', paint: { 'line-color': '#8ab4ff', 'line-width': 1.2, 'line-dasharray': [2, 2] } });
    }
    add('parcel', fc([geometry]));
    if (!map.getLayer('parcel-fill')) {
      map.addLayer({ id: 'parcel-fill', type: 'fill', source: 'parcel', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.06 } });
      map.addLayer({ id: 'parcel-line', type: 'line', source: 'parcel', paint: { 'line-color': '#ffffff', 'line-width': 2.5 } });
    }
    // fit to lot
    const xs: number[] = [], ys: number[] = [];
    for (const poly of geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) for (const [x, y] of poly[0]) { xs.push(x); ys.push(y); }
    map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 90, maxZoom: 19, duration: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, geometry, pieces, neighbors]);

  // layer toggles
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    for (const suf of ['fill', 'line']) if (map.getLayer(`nbrs-${suf}`)) map.setLayoutProperty(`nbrs-${suf}`, 'visibility', visible.adjacent === false ? 'none' : 'visible');
    if (map.getLayer('nbrs-fill')) map.setPaintProperty('nbrs-fill', 'fill-opacity', ['case', ['==', ['get', 'pin'], hotNeighbor ?? ''], 0.5, 0.12]);
    for (const d of LAYER_DEFS) for (const suf of ['fill', 'line']) if (map.getLayer(`ctx-${d.key}-${suf}`)) map.setLayoutProperty(`ctx-${d.key}-${suf}`, 'visibility', visible[d.key] ? 'visible' : 'none');
    for (const k of Object.keys(pieces)) for (const suf of ['fill', 'line']) if (map.getLayer(`piece-${k}-${suf}`)) map.setLayoutProperty(`piece-${k}-${suf}`, 'visibility', visible.pieces === false ? 'none' : 'visible');
  }, [visible, ready, pieces, hotNeighbor]);

  // numbered pins
  useEffect(() => {
    const map = mapRef.current, ml = mlRef.current; if (!map || !ml || !ready) return;
    markers.current.forEach(({ m }) => m.remove()); markers.current.clear();
    pins.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'pin'; d.textContent = String(p.n); d.style.background = TONE_COLOR[p.tone]; d.title = p.label;
      d.addEventListener('mouseenter', () => onHover(p.flagId)); d.addEventListener('mouseleave', () => onHover(null));
      // nudge coincident pins so they stay clickable
      const dup = pins.slice(0, i).filter((q) => Math.abs(q.lon - p.lon) < 1e-7 && Math.abs(q.lat - p.lat) < 1e-7).length;
      const m = new ml.Marker({ element: d, offset: [dup * 20, 0] }).setLngLat([p.lon, p.lat]).addTo(map);
      markers.current.set(p.flagId, { m, el: d });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, ready]);

  useEffect(() => { markers.current.forEach(({ el: e }, id) => e.classList.toggle('hot', id === hot)); }, [hot, pins]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-line">
      <div ref={el} className="h-full w-full" />
      {!basemapOk && <div className="pointer-events-none absolute bottom-8 left-3 rounded bg-black/60 px-2 py-1 text-[11px] text-muted">Basemap unavailable offline; showing lot and layers only</div>}
    </div>
  );
}
