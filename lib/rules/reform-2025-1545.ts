import { BASE_RULES } from './base';
import { stricter } from '../zoning';
import type { Rule, RuleContext, RuleResult, RuleSet } from './types';

/** Status captured from the Legistar API on 2026-09-26 (https://webapi.legistar.com/v1/pittsburgh/matters/31504). Keep PROPOSED unless Signed. */
export const REFORM_STATUS = {
  file: '2025-1545', status: 'Held In Council', publicHearing: '2026-09-23', enacted: false, checkedOn: '2026-09-26',
  url: 'https://webapi.legistar.com/v1/pittsburgh/matters/31504',
};
const PROPOSED = `PROPOSED, not law (Bill ${REFORM_STATUS.file}: ${REFORM_STATUS.status}; public hearing ${REFORM_STATUS.publicHearing}; status checked ${REFORM_STATUS.checkedOn})`;

const housingByRight = (ctx: RuleContext) => (ctx.altZoning ? stricter(ctx.zoning.housing, ctx.altZoning.housing) : ctx.zoning.housing) === 'by_right';
const hasResidentialPotential = (ctx: RuleContext) => ctx.landUse.residentialUse || ctx.landUse.vacant === true;

const adu: Rule = {
  id: 'ADU-BY-RIGHT', bonus: true,
  evaluate(ctx): RuleResult {
    const max = ctx.config.reformBonusPoints.adu;
    const base = { ruleId: 'ADU-BY-RIGHT', citation: 'Bill 2025-1545 (proposed) §912.08.B.1, C.2, C.3, C.8: up to 2 ADUs per zoning lot, ≤1,000 sq ft, ≤30 ft, on any lot with a residential primary use; no owner-occupancy requirement', maxPoints: max };
    if (housingByRight(ctx) && hasResidentialPotential(ctx)) return { ...base, result: 'passed', points: max, flag: {
      id: 'adu', severity: 'info', proposed: true, reviewBy: 'Zoning Administrator', factIds: ['zoning.district', 'reform.status'],
      text: `${PROPOSED}: up to 2 accessory dwelling units by right (≤1,000 sq ft, ≤30 ft, no owner-occupancy).` } };
    return { ...base, result: ctx.zoning.housing === 'unknown' ? 'unknown' : 'failed', points: 0, flag: {
      id: 'adu', severity: 'info', proposed: true, reviewBy: 'Zoning Administrator', factIds: ['zoning.district', 'reform.status'],
      text: `${PROPOSED}: ADU by-right provisions do not clearly apply to this parcel (needs a residential use and housing allowed by right).` } };
  },
};

const parking: Rule = {
  id: 'PARKING-MINIMUM-REMOVED', bonus: true,
  evaluate(ctx): RuleResult {
    const max = ctx.config.reformBonusPoints.parking;
    const base = { ruleId: 'PARKING-MINIMUM-REMOVED', citation: 'Bill 2025-1545 (proposed) Ch. 914: removes minimum off-street parking requirements', maxPoints: max };
    if (!housingByRight(ctx)) return { ...base, result: ctx.zoning.housing === 'unknown' ? 'unknown' : 'failed', points: 0 };
    return { ...base, result: 'passed', points: max, flag: {
      id: 'parking-minimum', severity: 'info', proposed: true, reviewBy: 'Zoning Administrator', factIds: ['reform.status'],
      text: `${PROPOSED}: no off-street parking minimums.` } };
  },
};

const bonus: Rule = {
  id: 'AFFORDABLE-HOUSING-BONUS', bonus: true,
  evaluate(ctx): RuleResult {
    const max = ctx.config.reformBonusPoints.affordableBonus;
    const base = { ruleId: 'AFFORDABLE-HOUSING-BONUS', citation: 'Bill 2025-1545 (proposed) §902.04 Affordable Housing Bonus Program (optional; outside the IZ-O overlay)', maxPoints: max };
    const iz = ctx.overlaps.iz_overlay;
    if (iz.status === 'unavailable') return { ...base, result: 'unknown', points: 0 };
    if (iz.intersects || !housingByRight(ctx)) return { ...base, result: 'failed', points: 0 };
    return { ...base, result: 'passed', points: max, flag: {
      id: 'affordable-housing-bonus', severity: 'info', proposed: true, reviewBy: 'Department of City Planning', factIds: ['overlay.iz', 'reform.status'],
      text: `${PROPOSED}: optional Affordable Housing Bonus available (outside the Inclusionary overlay).` } };
  },
};

export const reformRules: RuleSet = {
  id: 'reform-2025-1545',
  label: 'PROPOSED reform (Bill 2025-1545)',
  status: 'proposed',
  statusNote: `${PROPOSED}. Modeled as proposed; lot-size rules unchanged from current code.`,
  rules: [...BASE_RULES, adu, parking, bonus],
};
