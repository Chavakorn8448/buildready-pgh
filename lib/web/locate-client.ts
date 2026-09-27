/** Browser helpers for click-to-select: ask the server which real parcel contains a point, and build the popup. */
export type LocatedParcel = { pin: string; address: string; hood: string; owner: string | null; vacant: boolean | null; lot: number | null; zone: string | null; score: number | null; reform: number | null; gates: string };
export type LocateResult = { found: true; parcel: LocatedParcel; geometry: any } | { found: false; reason: string };

export async function locateAt(lon: number, lat: number): Promise<LocateResult> {
  try {
    const r = await fetch(`/api/locate?lon=${lon.toFixed(6)}&lat=${lat.toFixed(6)}`);
    if (!r.ok) return { found: false, reason: 'lookup failed' };
    return await r.json();
  } catch { return { found: false, reason: 'lookup failed (offline?)' }; }
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function popupHtml(p: LocatedParcel, opts: { current?: boolean } = {}): string {
  const score = p.score === null ? 'no score' : String(p.score);
  const reform = p.reform === null ? 'no score' : String(p.reform);
  const gates = p.gates ? ` · gate ${esc(p.gates)}` : '';
  return `<div style="font:13px/1.4 system-ui;color:#111;max-width:250px"><b>${esc(p.address || '(no street address)')}</b><br/>` +
    `${esc(p.hood)} · ${esc(p.owner ?? 'owner unknown')}-owned · ${p.vacant ? 'vacant' : p.vacant === false ? 'built' : 'vacancy unknown'}<br/>` +
    `${p.lot ? Math.round(p.lot).toLocaleString() + ' sq ft · ' : ''}zoning ${esc(p.zone ?? 'unknown')}<br/>` +
    `Score <b>${esc(score)}</b>${gates} · if Bill 2025-1545 passes <b>${esc(reform)}</b> (proposed)<br/>` +
    (opts.current ? '<i>This is the lot you are viewing.</i>' : `<a href="/parcel/${esc(p.pin)}" style="color:#2563eb;font-weight:600">Open lot report →</a>`) + '</div>';
}
