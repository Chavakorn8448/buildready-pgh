import type { Packet } from '../packets';

export function hazardsOf(p: Packet) {
  const names: Record<string, string> = { slope25: 'Slope 25%+', landslide: 'Landslide-prone', undermined: 'Undermined', fema2014: 'FEMA flood zone (SFHA)', historic: 'Historic district', iz_overlay: 'Inclusionary overlay', transit_buffer: 'Major transit buffer' };
  return Object.entries(names).map(([k, label]) => {
    const o: any = p.o[k];
    return o === 'u' ? { layer: label, status: 'unavailable (unverified)' } : !o ? { layer: label, overlap: 'none' } : { layer: label, overlapFractionOfParcel: o.f, pinLonLat: o.pin, reviewBy: k === 'slope25' || k === 'landslide' ? 'geotechnical review (Code Ch. 915)' : undefined };
  });
}
