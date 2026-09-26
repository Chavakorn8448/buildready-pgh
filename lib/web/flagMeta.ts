/** Presentation metadata for engine flags: plain-language title, tone, and where the map pin goes. */
export type Tone = 'red' | 'amber' | 'green' | 'gray';
export type PinKind = 'centroid' | 'slope25' | 'landslide' | 'undermined' | 'fema2014' | 'historic' | 'iz_overlay' | 'transit_buffer' | null;

export const FLAG_META: Record<string, { title: string; tone: Tone; pin: PinKind; term?: string }> = {
  'use-variance': { title: 'Housing not allowed here', tone: 'red', pin: 'centroid', term: 'use variance' },
  'gate-G1': { title: 'Outside the City of Pittsburgh', tone: 'red', pin: 'centroid' },
  'gate-G2': { title: 'No residential potential', tone: 'red', pin: 'centroid' },
  'housing-exception-only': { title: 'Housing only by exception', tone: 'amber', pin: 'centroid', term: 'special exception' },
  'zoning-unverified': { title: 'Zoning not verified', tone: 'amber', pin: 'centroid' },
  'zoning-sources-disagree': { title: 'Zoning sources disagree', tone: 'amber', pin: 'centroid', term: 'zoning district' },
  'zoning-split': { title: 'Lot spans two zoning districts', tone: 'amber', pin: 'centroid', term: 'zoning district' },
  'lot-below-minimum': { title: 'Lot is smaller than the district minimum', tone: 'amber', pin: 'centroid', term: 'variance' },
  'lot-min-unverified': { title: 'Lot-size rule not verified', tone: 'gray', pin: 'centroid', term: 'lot minimum' },
  'historic-district': { title: 'Historic district review', tone: 'amber', pin: 'historic', term: 'historic district' },
  'iz-overlay': { title: 'Affordable-housing set-aside applies', tone: 'amber', pin: 'iz_overlay', term: 'inclusionary zoning' },
  'hazard-slope25': { title: 'Steep slope (25%+)', tone: 'amber', pin: 'slope25', term: 'geotechnical review' },
  'hazard-landslide': { title: 'Landslide-prone ground', tone: 'amber', pin: 'landslide', term: 'geotechnical review' },
  'hazard-undermined': { title: 'Undermined by old mines', tone: 'amber', pin: 'undermined', term: 'undermined' },
  'hazard-flood': { title: 'In a FEMA flood zone', tone: 'amber', pin: 'fema2014', term: 'flood zone' },
  'water-sewer': { title: 'Water and sewer: unknown', tone: 'gray', pin: null, term: 'PWSA' },
  'parking-minimum': { title: 'Parking requirement', tone: 'gray', pin: null },
  adu: { title: 'Accessory dwelling units (ADUs)', tone: 'gray', pin: null, term: 'ADU' },
  'affordable-housing-bonus': { title: 'Optional affordable-housing bonus', tone: 'green', pin: 'centroid' },
  'gap-financing': { title: 'Gap financing likely', tone: 'gray', pin: null, term: 'gap financing' },
  'phfa-infill': { title: 'Infill / blight scoring (PHFA)', tone: 'green', pin: 'centroid', term: 'PHFA' },
  'public-owner': { title: 'Public owner: easier acquisition', tone: 'green', pin: 'centroid' },
  'existing-nonresidential': { title: 'Existing non-residential building', tone: 'gray', pin: null },
  'funding-unverified': { title: 'Funding fit not verified', tone: 'gray', pin: null },
  'access-unverified': { title: 'Transit access not verified', tone: 'gray', pin: null },
  'vacancy-unverified': { title: 'Vacancy not verified', tone: 'gray', pin: null },
  'owner-unverified': { title: 'Owner type not verified', tone: 'gray', pin: null },
};

export const TONE_CLASS: Record<Tone, { dot: string; text: string; ring: string; bg: string }> = {
  red: { dot: 'bg-[var(--red)]', text: 'text-[var(--red)]', ring: 'ring-[var(--red)]', bg: 'bg-[var(--red)]/10' },
  amber: { dot: 'bg-[var(--amber)]', text: 'text-[var(--amber)]', ring: 'ring-[var(--amber)]', bg: 'bg-[var(--amber)]/10' },
  green: { dot: 'bg-[var(--green)]', text: 'text-[var(--green)]', ring: 'ring-[var(--green)]', bg: 'bg-[var(--green)]/10' },
  gray: { dot: 'bg-[var(--muted)]', text: 'text-[var(--muted)]', ring: 'ring-[var(--muted)]', bg: 'bg-white/5' },
};

export function metaFor(id: string) {
  return FLAG_META[id] ?? FLAG_META[id.replace(/-unverified$/, '')] ?? { title: id.replace(/[-_]/g, ' '), tone: 'gray' as Tone, pin: null as PinKind };
}
