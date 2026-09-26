/**
 * Development Ease Score engine. Pure and deterministic: no I/O, no LLM.
 * scoreParcel(parcel, data, ruleSet) -> ScoreResult
 * Order: gates (G1..G3) -> sub-scores (zoning fit, environmental, funding, access, site & title) -> weighted total -> gate caps.
 * Unknown data never passes: it earns partial credit at most (config.unknownCredit), lowers the fact's confidence to "unknown" and raises a flag.
 */
import { CONFIG, type Config } from './config';
import { makeFact, type Flag, type SourceRef } from './facts';
import { computeOverlaps, type LayerData, type Overlap, type ParcelOverlaps } from './hazards';
import { landUseOf } from './landuse';
import { REFORM_STATUS } from './rules/reform-2025-1545';
import type { RuleResult, RuleSet } from './rules/types';
import type { Fact, LayerMeta, ProcessedParcel } from './types';
import { parseZoning, stricter, type PermittedUses, type ZoningInfo } from './zoning';

export type EngineData = {
  layers: LayerData;
  layerMeta: Record<string, LayerMeta>;
  permittedUses: PermittedUses;
  hoodValues: { lowValueThreshold: number; medianOfMedians: number; byHood: Record<string, number> };
};

export type Gate = {
  id: 'G1' | 'G2' | 'G3';
  name: string;
  triggered: boolean;
  effect: 'no_score' | 'cap' | 'none';
  cap?: number;
  message: string;
  reviewBy: string | null;
};

export type SubScore = { score: number; weight: number; contribution: number; notes: string[]; rules?: RuleResult[] };

export type ScoreResult = {
  parcelId: string;
  address: string;
  neighborhood: string | null;
  ruleSet: { id: string; label: string; status: 'in_effect' | 'proposed'; statusNote: string };
  score: number | null; // null when a no-score gate fires
  uncappedScore: number | null;
  gates: Gate[];
  subScores: { zoning: SubScore; environmental: SubScore; funding: SubScore; access: SubScore; site: SubScore } | null;
  flags: Flag[];
  facts: Fact[];
  /** Hazard + overlay overlaps incl. map pins (centroid-in-overlap) for the future map. */
  overlaps: ParcelOverlaps | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;

const SOURCE_LABELS: Record<string, string> = {
  parcels_public: 'City of Pittsburgh ParcelsPublic (ArcGIS)', parcels_pgh: 'City of Pittsburgh ParcelsPGH (ArcGIS)', city_limits: 'City of Pittsburgh City Limits (ArcGIS)',
  assessments: 'WPRDC/Allegheny County property assessments', slope25: 'City of Pittsburgh PGHWebSlope25 (ArcGIS)', landslide: 'City of Pittsburgh PGHWebLandslideProne (ArcGIS)',
  undermined: 'City of Pittsburgh PGHWebUndermined (ArcGIS)', fema2014: 'City of Pittsburgh PGHWebFEMA2014 (ArcGIS)', historic: 'City of Pittsburgh CHD Historic Districts (ArcGIS)',
  iz_overlay: 'City of Pittsburgh Inclusionary Housing Overlay District (ArcGIS)', parking_reduction: 'City of Pittsburgh Parking Reduction Overlay (ArcGIS)',
  transit_buffer: 'City of Pittsburgh Major Transit Buffer (ArcGIS)',
};

function src(data: EngineData, key: string, fallbackUrl = ''): SourceRef {
  const m = data.layerMeta[key];
  const label = key === 'zoning' && m?.sourceUsed ? `${m.sourceUsed}` : SOURCE_LABELS[key] ?? key;
  return { source: label, sourceUrl: m?.url ?? fallbackUrl, retrievedAt: m?.retrievedAt ?? 'unknown' };
}

export function zoningFor(parcel: ProcessedParcel, data: EngineData): { zoning: ZoningInfo; alt: ZoningInfo | null } {
  const zoning = parseZoning(parcel.zoningDistrict, data.permittedUses);
  const alt = parcel.zoningParcelsPublic && parcel.zoningParcelsPublic !== parcel.zoningDistrict ? parseZoning(parcel.zoningParcelsPublic, data.permittedUses) : null;
  return { zoning, alt };
}

export function buildFacts(parcel: ProcessedParcel, data: EngineData, overlaps: ParcelOverlaps, zoning: ZoningInfo, alt: ZoningInfo | null): Fact[] {
  const F: Fact[] = [];
  const pp = src(data, 'parcels_public');
  const asm = src(data, 'assessments');
  const zs = src(data, 'zoning');
  const zoningConf = !parcel.zoningDistrict ? 'unknown' : alt ? 'low' : (parcel.zoningShare ?? 1) < 0.95 ? 'medium' : 'high';
  F.push(makeFact('parcel.id', 'Parcel ID (PIN)', parcel.pin, pp, 'high'));
  F.push(makeFact('parcel.address', 'Address', parcel.address || null, pp, parcel.address ? 'high' : 'unknown'));
  F.push(makeFact('city.limits', 'Inside City of Pittsburgh limits', parcel.inCityLimits, src(data, 'city_limits'), 'high'));
  F.push(makeFact('lot.area', 'Lot area (sq ft, map polygon)', parcel.lotAreaSqft, pp, parcel.lotAreaSqft === null ? 'unknown' : 'high', 'Licensed survey'));
  F.push(makeFact('lot.area_assessor', 'Lot area (sq ft, county assessor)', parcel.lotAreaAssessorSqft, asm, parcel.lotAreaAssessorSqft === null ? 'unknown' : 'medium', 'Licensed survey'));
  F.push(makeFact('zoning.district', 'Base zoning district (map polygon join)', parcel.zoningDistrict, zs, zoningConf, 'Zoning Administrator'));
  F.push(makeFact('zoning.district_parcels_layer', 'Zoning per city parcel layer (zon_new)', parcel.zoningParcelsPublic, pp, parcel.zoningParcelsPublic ? 'medium' : 'unknown'));
  if (parcel.zoningOther.length) F.push(makeFact('zoning.split', 'Parcel also overlaps district(s)', parcel.zoningOther.join(', '), zs, 'medium', 'Zoning Administrator'));
  const puSrc: SourceRef = { source: data.permittedUses._meta.source.primary, sourceUrl: data.permittedUses._meta.source.primaryUrl, retrievedAt: data.permittedUses._meta.source.retrievedAt };
  F.push(makeFact('zoning.use_table', 'Housing under base zoning (§911.02)', zoning.housing, puSrc, zoning.housing === 'unknown' ? 'unknown' : 'medium', 'Zoning Administrator'));
  F.push(makeFact('landuse.use', 'Assessor use description', parcel.useDesc, asm, parcel.useDesc ? 'medium' : 'unknown'));
  F.push(makeFact('landuse.class', 'Assessor class', parcel.classDesc, asm, parcel.classDesc ? 'medium' : 'unknown'));
  F.push(makeFact('landuse.vacant', 'Vacant per city parcel layer', parcel.vacant, pp, parcel.vacant === null ? 'unknown' : 'medium'));
  F.push(makeFact('owner.type', 'Owner type (no owner names stored)', parcel.ownerType, pp, parcel.ownerType ? 'medium' : 'unknown'));
  const a = parcel.assessment;
  F.push(makeFact('value.land', 'Assessed land value ($)', a?.landValue ?? null, asm, a?.landValue == null ? 'unknown' : 'medium'));
  F.push(makeFact('value.total', 'Assessed total value ($)', a?.totalValue ?? null, asm, a?.totalValue == null ? 'unknown' : 'medium'));
  if (a?.saleDate) F.push(makeFact('sale.last', `Last sale ${a.saleDate} (${a.saleDesc ?? 'n/a'})`, a.salePrice, asm, 'medium'));
  const med = parcel.neighborhood ? data.hoodValues.byHood[parcel.neighborhood] : undefined;
  F.push(makeFact('hood.median_land_psf', `Neighborhood median assessed land $/sq ft (${parcel.neighborhood ?? 'n/a'}; low-value cutoff ${data.hoodValues.lowValueThreshold})`, med ?? null,
    { source: 'derived from WPRDC property-assessments (data/processed/neighborhood-values.json)', sourceUrl: asm.sourceUrl, retrievedAt: asm.retrievedAt }, med === undefined ? 'unknown' : 'medium'));
  const ovFact = (id: string, label: string, key: keyof ParcelOverlaps, reviewBy: string | null) => {
    const o = overlaps[key];
    const m = src(data, key);
    F.push(makeFact(id, label, o.status === 'unavailable' ? null : o.intersects ? `${pct(o.overlapFraction)} of parcel` : 'no overlap', m, o.status === 'unavailable' ? 'unknown' : o.geometryErrors ? 'medium' : 'high', o.intersects || o.status === 'unavailable' ? reviewBy : null));
  };
  ovFact('hazard.slope25', 'Slope 25%+ overlap', 'slope25', 'geotechnical review (Code Ch. 915)');
  ovFact('hazard.landslide', 'Landslide-prone overlap', 'landslide', 'geotechnical review (Code Ch. 915)');
  ovFact('hazard.undermined', 'Undermined area overlap', 'undermined', 'mine subsidence / geotechnical review');
  ovFact('hazard.flood', 'FEMA 2014 Special Flood Hazard Area overlap', 'fema2014', 'Floodplain administrator / FEMA flood determination');
  ovFact('overlay.historic', 'City Historic District overlap', 'historic', 'Historic Review Commission');
  ovFact('overlay.iz', 'Inclusionary Housing Overlay', 'iz_overlay', 'Department of City Planning');
  ovFact('overlay.transit', 'Within 1,500 ft major transit buffer', 'transit_buffer', null);
  ovFact('overlay.parking_reduction', 'Parking Reduction Overlay', 'parking_reduction', null);
  F.push(makeFact('utilities.water_sewer', 'Water/sewer availability', 'unknown', { source: 'not available in public data', sourceUrl: 'https://www.pgh2o.com/', retrievedAt: 'n/a' }, 'unknown', 'PWSA'));
  F.push(makeFact('reform.status', `Bill ${REFORM_STATUS.file} status: ${REFORM_STATUS.status}; hearing ${REFORM_STATUS.publicHearing}`, 'proposed', { source: 'Pittsburgh Legistar API', sourceUrl: REFORM_STATUS.url, retrievedAt: REFORM_STATUS.checkedOn }, 'high'));
  return F;
}

function environmental(o: ParcelOverlaps, cfg: Config): { sub: Omit<SubScore, 'weight' | 'contribution'>; flags: Flag[] } {
  const e = cfg.environmental;
  let penalty = 0;
  const notes: string[] = [];
  const flags: Flag[] = [];
  const tier = (f: number, t: { small: number; medium: number; large: number }) => (f >= e.tiers.large ? t.large : f >= e.tiers.medium ? t.medium : t.small);
  const one = (key: keyof ParcelOverlaps, id: string, label: string, pen: (o: Overlap) => number, reviewBy: string, factId: string) => {
    const ov = o[key];
    if (ov.status === 'unavailable') {
      penalty += e.unavailablePenalty; notes.push(`${label}: layer unavailable (unverified)`);
      flags.push({ id: `${id}-unverified`, severity: 'warn', reviewBy, factIds: [factId], text: `Unverified: ${label} layer unavailable.` });
      return;
    }
    if (!ov.intersects) { notes.push(`${label}: none`); return; }
    const p = pen(ov); penalty += p; notes.push(`${label}: ${pct(ov.overlapFraction)} of parcel (-${p})`);
    flags.push({ id, severity: 'warn', reviewBy, factIds: [factId],
      text: `${label} covers ${pct(ov.overlapFraction)} of the parcel${ov.pin ? ` (pin ${ov.pin[1]}, ${ov.pin[0]})` : ''}.` });
  };
  one('slope25', 'hazard-slope25', 'Slope 25%+', (ov) => tier(ov.overlapFraction, e.slope), 'geotechnical review (Code Ch. 915)', 'hazard.slope25');
  one('landslide', 'hazard-landslide', 'Landslide-prone area', (ov) => tier(ov.overlapFraction, e.landslide), 'geotechnical review (Code Ch. 915)', 'hazard.landslide');
  one('undermined', 'hazard-undermined', 'Undermined area', () => e.undermined, 'mine subsidence / geotechnical review', 'hazard.undermined');
  one('fema2014', 'hazard-flood', 'FEMA special flood hazard area', (ov) => (ov.matched.some((m) => String(m.floodway ?? '').trim()) ? e.floodway : e.flood), 'Floodplain administrator / FEMA flood determination', 'hazard.flood');
  return { sub: { score: Math.max(0, 100 - penalty), notes }, flags };
}

function funding(parcel: ProcessedParcel, data: EngineData, cfg: Config): { sub: Omit<SubScore, 'weight' | 'contribution'>; flags: Flag[] } {
  const f = cfg.funding, flags: Flag[] = [], notes: string[] = [];
  const med = parcel.neighborhood ? data.hoodValues.byHood[parcel.neighborhood] : undefined;
  if (med === undefined || parcel.vacant === null) {
    notes.push('neighborhood value or vacancy unknown (unverified)');
    flags.push({ id: 'funding-unverified', severity: 'info', reviewBy: 'PHFA / funder scoring criteria', factIds: ['hood.median_land_psf', 'landuse.vacant'], text: 'Unverified: neighborhood value level or vacancy unknown; funding fit not assessed.' });
    return { sub: { score: f.unknown, notes }, flags };
  }
  const low = med < data.hoodValues.lowValueThreshold;
  notes.push(`neighborhood median assessed land value $${med}/sq ft vs low-value cutoff $${data.hoodValues.lowValueThreshold}/sq ft -> ${low ? 'low-value area' : 'not low-value'}`);
  if (low) flags.push({ id: 'gap-financing', severity: 'info', reviewBy: 'PHFA / lender underwriting', factIds: ['hood.median_land_psf'], text: 'Low-value area: gap financing likely needed (note only, not a penalty).' });
  if (parcel.vacant && low) flags.push({ id: 'phfa-infill', severity: 'info', reviewBy: 'PHFA application scoring criteria', factIds: ['landuse.vacant', 'hood.median_land_psf'], text: 'Vacant infill lot in a low-value area: eligible for infill/blight scoring (PHFA) — confirm against current PHFA criteria.' });
  const score = parcel.vacant ? (low ? f.vacantLow : f.vacantNotLow) : low ? f.occupiedLow : f.occupiedNotLow;
  return { sub: { score, notes }, flags };
}

function access(o: ParcelOverlaps, cfg: Config): { sub: Omit<SubScore, 'weight' | 'contribution'>; flags: Flag[] } {
  const t = o.transit_buffer, a = cfg.access;
  if (t.status === 'unavailable') return { sub: { score: 0, notes: ['transit buffer layer unavailable (unverified)'] }, flags: [{ id: 'access-unverified', severity: 'info', reviewBy: null, factIds: ['overlay.transit'], text: 'Unverified: major-transit buffer layer unavailable.' }] };
  if (t.overlapFraction >= a.bufferShareFull) return { sub: { score: a.inBuffer, notes: [`inside major transit buffer (${pct(t.overlapFraction)} of parcel)`] }, flags: [] };
  if (t.intersects) return { sub: { score: a.partialBuffer, notes: [`partly inside major transit buffer (${pct(t.overlapFraction)})`] }, flags: [] };
  return { sub: { score: a.outside, notes: ['outside 1,500 ft major transit buffer (partial points)'] }, flags: [] };
}

function site(parcel: ProcessedParcel, cfg: Config): { sub: Omit<SubScore, 'weight' | 'contribution'>; flags: Flag[] } {
  const s = cfg.site, notes: string[] = [], flags: Flag[] = [];
  let score = 0;
  if (parcel.vacant === null) flags.push({ id: 'vacancy-unverified', severity: 'info', reviewBy: null, factIds: ['landuse.vacant'], text: 'Unverified: vacancy unknown.' });
  else if (parcel.vacant) { score += s.vacant; notes.push('vacant (+' + s.vacant + ')'); } else notes.push('occupied / improved (+0)');
  if (parcel.ownerType === 'City' || parcel.ownerType === 'URA' || parcel.ownerType === 'HACP') {
    score += s.publicHACPCityURA; notes.push(`${parcel.ownerType}-owned: easier acquisition (+${s.publicHACPCityURA})`);
    flags.push({ id: 'public-owner', severity: 'info', reviewBy: `${parcel.ownerType} property-disposition process`, factIds: ['owner.type'], text: `${parcel.ownerType}-owned parcel: acquisition through a public disposition process may be easier (not guaranteed).` });
  } else if (parcel.ownerType === 'County') { score += s.county; notes.push(`County-owned (+${s.county})`); }
  else if (parcel.ownerType === null) flags.push({ id: 'owner-unverified', severity: 'info', reviewBy: null, factIds: ['owner.type'], text: 'Unverified: owner type unknown.' });
  return { sub: { score: Math.min(100, score), notes }, flags };
}

export function scoreParcel(
  parcel: ProcessedParcel, data: EngineData, ruleSet: RuleSet, config: Config = CONFIG, precomputed?: ParcelOverlaps,
): ScoreResult {
  const { zoning, alt } = zoningFor(parcel, data);
  const overlaps = precomputed ?? computeOverlaps(parcel.geometry, data.layers, config.minOverlapFraction);
  const facts = buildFacts(parcel, data, overlaps, zoning, alt);
  const landUse = landUseOf(parcel);
  const housing = alt ? stricter(zoning.housing, alt.housing) : zoning.housing;
  const rs = { id: ruleSet.id, label: ruleSet.label, status: ruleSet.status, statusNote: ruleSet.statusNote };
  const flags: Flag[] = [];
  const base = { parcelId: parcel.pin, address: parcel.address, neighborhood: parcel.neighborhood, ruleSet: rs, facts };

  // ---- gates ----
  const g1 = !parcel.inCityLimits || parcel.zoningDistrict === 'MTOBOR';
  const nonResidentialNoPotential =
    !landUse.known ? null
    : !(landUse.residentialUse || (landUse.vacant === true && housing !== 'not_permitted') || (parcel.classDesc === 'COMMERCIAL' && housing === 'by_right'));
  const g2 = nonResidentialNoPotential === true || nonResidentialNoPotential === null;
  const g3Not = housing === 'not_permitted' || (housing === 'unknown');
  const g3Exc = housing === 'exception_only';
  const gates: Gate[] = [
    { id: 'G1', name: 'Inside City of Pittsburgh', triggered: g1, effect: g1 ? 'no_score' : 'none', reviewBy: g1 ? 'municipal zoning office for the parcel\'s municipality' : null,
      message: g1 ? 'Parcel is outside City of Pittsburgh limits: no score — check municipal code.' : 'Parcel is inside City limits.' },
    { id: 'G2', name: 'Residential potential', triggered: g2, effect: g2 ? 'no_score' : 'none', reviewBy: g2 ? 'Zoning Administrator' : null,
      message: nonResidentialNoPotential === null ? 'Land use/vacancy unknown: cannot establish residential potential — no score (unverified).'
        : g2 ? `Non-residential land use (${parcel.useDesc ?? parcel.classDesc}) with no residential potential under its zoning: no score.` : 'Residential use or potential present.' },
    { id: 'G3', name: 'Housing permitted in base zoning', triggered: g3Not || g3Exc, effect: g3Not || g3Exc ? 'cap' : 'none',
      cap: g3Not ? config.caps.housingNotPermitted : g3Exc ? config.caps.housingExceptionOnly : undefined,
      reviewBy: g3Not || g3Exc ? 'Zoning Board of Adjustment' : null,
      message: g3Not ? (housing === 'unknown' ? `Unverified: housing permission for zoning ${parcel.zoningDistrict ?? '(none found)'} could not be established: score capped at ${config.caps.housingNotPermitted}.` : `Housing not permitted in ${parcel.zoningDistrict}: use variance or rezoning needed; score capped at ${config.caps.housingNotPermitted}.`)
        : g3Exc ? `Housing only by exception in ${parcel.zoningDistrict}: score capped at ${config.caps.housingExceptionOnly}.` : 'Housing is permitted by right in the base zoning district.' },
  ];
  if (g3Not) flags.push({ id: 'use-variance', severity: 'block', reviewBy: 'Zoning Board of Adjustment', factIds: ['zoning.district', 'zoning.use_table'],
    text: housing === 'unknown' ? 'Use variance or rezoning may be needed: housing permission for this district is unverified.' : 'Use variance or rezoning needed: housing is not permitted in the base zoning district.' });
  if (alt) flags.push({ id: 'zoning-sources-disagree', severity: 'warn', reviewBy: 'Zoning Administrator / official zoning map', factIds: ['zoning.district', 'zoning.district_parcels_layer'],
    text: `Zoning sources disagree: map polygons say ${parcel.zoningDistrict ?? 'none'}, city parcel layer says ${parcel.zoningParcelsPublic}. Verify against the official zoning map.` });
  if (parcel.zoningOther.length) flags.push({ id: 'zoning-split', severity: 'warn', reviewBy: 'Zoning Administrator', factIds: ['zoning.district', 'zoning.split'],
    text: `Parcel straddles zoning districts (${parcel.zoningDistrict} + ${parcel.zoningOther.join(', ')}); scored on the majority district.` });
  if (!landUse.residentialUse && landUse.vacant === false && !g2) flags.push({ id: 'existing-nonresidential', severity: 'info', reviewBy: null, factIds: ['landuse.use'], text: `Existing non-residential use (${parcel.useDesc}): redevelopment or conversion would be needed.` });
  flags.push({ id: 'water-sewer', severity: 'info', reviewBy: 'PWSA', factIds: ['utilities.water_sewer'], text: 'Unknown: request PWSA availability letter. Water/sewer capacity is never scored.' });
  for (const gate of gates) if (gate.triggered && gate.effect === 'no_score' && gate.id !== 'G3') flags.push({ id: `gate-${gate.id}`, severity: 'block', reviewBy: gate.reviewBy, factIds: [], text: gate.message });

  if (g1 || g2) return { ...base, score: null, uncappedScore: null, gates, subScores: null, flags, overlaps };

  // ---- sub-scores ----
  const ctx = { parcel, zoning, altZoning: alt, overlaps, landUse, config };
  const rr = ruleSet.rules.map((r) => ({ rule: r, res: r.evaluate(ctx) }));
  const baseSum = rr.filter((x) => !x.rule.bonus).reduce((s, x) => s + x.res.points, 0);
  const bonusSum = rr.filter((x) => x.rule.bonus).reduce((s, x) => s + x.res.points, 0);
  const zScore = Math.min(100, r1(baseSum + bonusSum));
  for (const x of rr) if (x.res.flag) flags.push(x.res.flag);
  const env = environmental(overlaps, config), fund = funding(parcel, data, config), acc = access(overlaps, config), st = site(parcel, config);
  for (const s of [env, fund, acc, st]) flags.push(...s.flags);
  const w = config.weights;
  const wsum = w.zoning + w.environmental + w.funding + w.access + w.site;
  const mk = (score: number, weight: number, notes: string[], rules?: RuleResult[]): SubScore => ({ score: r1(score), weight, contribution: r1((score * weight) / wsum), notes, rules });
  const subScores = {
    zoning: mk(zScore, w.zoning, [`base rules ${r1(baseSum)}/85${bonusSum ? ` + proposed-reform bonus ${r1(bonusSum)}` : ''}`], rr.map((x) => x.res)),
    environmental: mk(env.sub.score, w.environmental, env.sub.notes),
    funding: mk(fund.sub.score, w.funding, fund.sub.notes),
    access: mk(acc.sub.score, w.access, acc.sub.notes),
    site: mk(st.sub.score, w.site, st.sub.notes),
  };
  const uncapped = r1(Object.values(subScores).reduce((s, x) => s + x.contribution, 0));
  const cap = gates.find((g) => g.id === 'G3' && g.triggered)?.cap;
  const score = cap !== undefined ? Math.min(uncapped, cap) : uncapped;
  return { ...base, score: Math.round(score), uncappedScore: uncapped, gates, subScores, flags, overlaps };
}

export type Comparison = {
  current: ScoreResult; reform: ScoreResult; delta: number | null;
  flagsAdded: Flag[]; flagsRemoved: Flag[]; flagsChanged: { id: string; current: string; reform: string }[];
};

export function compareRuleSets(parcel: ProcessedParcel, data: EngineData, current: RuleSet, reform: RuleSet, config: Config = CONFIG, precomputed?: ParcelOverlaps): Comparison {
  const overlaps = precomputed ?? computeOverlaps(parcel.geometry, data.layers, config.minOverlapFraction);
  const a = scoreParcel(parcel, data, current, config, overlaps);
  const b = scoreParcel(parcel, data, reform, config, overlaps);
  const A = new Map(a.flags.map((f) => [f.id, f])), B = new Map(b.flags.map((f) => [f.id, f]));
  return {
    current: a, reform: b, delta: a.score === null || b.score === null ? null : b.score - a.score,
    flagsAdded: b.flags.filter((f) => !A.has(f.id)),
    flagsRemoved: a.flags.filter((f) => !B.has(f.id)),
    flagsChanged: b.flags.filter((f) => A.has(f.id) && A.get(f.id)!.text !== f.text).map((f) => ({ id: f.id, current: A.get(f.id)!.text, reform: f.text })),
  };
}
