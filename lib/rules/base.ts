/** Rules common to both rule sets (lot minimum, use table, historic, inclusionary overlay). All return the same RuleResult shape. */
import { CURRENT_LOT_MIN, stricter } from '../zoning';
import type { Rule, RuleContext, RuleResult } from './types';

const unknownPts = (ctx: RuleContext, max: number) => Math.round(max * ctx.config.unknownCredit * 10) / 10;

export const LOT_MIN_CITATION =
  'Pittsburgh Zoning Code §903.03 (minimum lot size by density subdistrict), as amended by Bill 2025-1579 (Passed Finally 5/6/2025, signed by Mayor 5/7/2025)';

export const lotMinimumRule: Rule = {
  id: 'ZONING-LOT-MIN', bonus: false,
  evaluate(ctx): RuleResult {
    const max = ctx.config.zoningPoints.lotMin;
    const base = { ruleId: 'ZONING-LOT-MIN', citation: LOT_MIN_CITATION, maxPoints: max };
    const z = ctx.zoning;
    if (!z.residentialFamily || !z.density) {
      return { ...base, result: 'unknown', points: unknownPts(ctx, max), flag: {
        id: 'lot-min-unverified', severity: 'info', reviewBy: 'Zoning Administrator', factIds: ['zoning.district', 'lot.area'],
        text: `Unverified: lot-size minimum for district ${z.code ?? 'unknown'} is not modeled (only R1D/R1A/R2/R3/RM density subdistricts are).` } };
    }
    const min = CURRENT_LOT_MIN[z.density];
    if (min === null) return { ...base, result: 'passed', points: max };
    const poly = ctx.parcel.lotAreaSqft, assessor = ctx.parcel.lotAreaAssessorSqft;
    if (poly === null) return { ...base, result: 'unknown', points: unknownPts(ctx, max), flag: { id: 'lot-min-unverified', severity: 'warn', reviewBy: 'Zoning Administrator', factIds: ['lot.area'], text: 'Unverified: lot area unknown.' } };
    const polyPass = poly >= min;
    const assessPass = assessor === null ? null : assessor >= min;
    if (assessPass !== null && assessPass !== polyPass) {
      return { ...base, result: 'unknown', points: unknownPts(ctx, max), flag: {
        id: 'lot-min-unverified', severity: 'warn', reviewBy: 'Licensed survey / Zoning Administrator', factIds: ['lot.area', 'lot.area_assessor'],
        text: `Unverified: lot area sources fall on opposite sides of the ${min.toLocaleString()} sq ft minimum (map polygon ${Math.round(poly).toLocaleString()} vs assessor ${assessor!.toLocaleString()}).` } };
    }
    if (polyPass) return { ...base, result: 'passed', points: max };
    return { ...base, result: 'failed', points: Math.round(max * ctx.config.partial.failedLotMin * 10) / 10, flag: {
      id: 'lot-below-minimum', severity: 'warn', reviewBy: 'Zoning Board of Adjustment', factIds: ['lot.area', 'zoning.district'],
      text: `Lot (${Math.round(poly).toLocaleString()} sq ft) is below the ${min.toLocaleString()} sq ft minimum for ${z.code}: variance likely, or combine with adjacent lot.` } };
  },
};

export const useRule: Rule = {
  id: 'ZONING-USE', bonus: false,
  evaluate(ctx): RuleResult {
    const max = ctx.config.zoningPoints.use;
    const z = ctx.zoning;
    const housing = ctx.altZoning ? stricter(z.housing, ctx.altZoning.housing) : z.housing;
    const base = { ruleId: 'ZONING-USE', citation: 'Pittsburgh Zoning Code §911.02 Use Table (Single-/Two-/Three-/Multi-Unit Residential rows)', maxPoints: max };
    if (housing === 'by_right') return { ...base, result: 'passed', points: max };
    if (housing === 'exception_only') return { ...base, result: 'failed', points: Math.round(max * ctx.config.partial.exceptionOnlyUse * 10) / 10, flag: {
      id: 'housing-exception-only', severity: 'warn', reviewBy: 'Zoning Administrator / Zoning Board of Adjustment', factIds: ['zoning.district', 'zoning.use_table'],
      text: `Housing is allowed in ${z.code} only by administrator/special exception, not by right.` } };
    if (housing === 'not_permitted') return { ...base, result: 'failed', points: 0 }; // flagged by gate G3
    return { ...base, result: 'unknown', points: unknownPts(ctx, max), flag: {
      id: 'zoning-unverified', severity: 'warn', reviewBy: 'Zoning Administrator', factIds: ['zoning.district'],
      text: `Unverified: housing permission for zoning ${z.code ?? '(none found)'} is not in the verified use table${z.note ? ` (${z.note})` : ''}.` } };
  },
};

export const historicRule: Rule = {
  id: 'ZONING-HISTORIC', bonus: false,
  evaluate(ctx): RuleResult {
    const max = ctx.config.zoningPoints.historic;
    const base = { ruleId: 'ZONING-HISTORIC', citation: 'Pittsburgh Zoning Code Ch. 906 Historic Preservation / City Planning CHD Historic Districts layer', maxPoints: max };
    const o = ctx.overlaps.historic;
    if (o.status === 'unavailable') return { ...base, result: 'unknown', points: unknownPts(ctx, max), flag: { id: 'historic-unverified', severity: 'info', reviewBy: 'Historic Review Commission', factIds: ['overlay.historic'], text: 'Unverified: historic-district layer unavailable.' } };
    if (!o.intersects) return { ...base, result: 'passed', points: max };
    return { ...base, result: 'failed', points: Math.round(max * ctx.config.partial.historic * 10) / 10, flag: {
      id: 'historic-district', severity: 'warn', reviewBy: 'Historic Review Commission', factIds: ['overlay.historic'],
      text: `Parcel overlaps a City Historic District (${o.matched.map((m) => m.historic_name).filter(Boolean).join(', ') || 'name n/a'}): design review of exterior changes/new construction likely.` } };
  },
};

export const inclusionaryRule: Rule = {
  id: 'ZONING-IZ-OVERLAY', bonus: false,
  evaluate(ctx): RuleResult {
    const max = ctx.config.zoningPoints.inclusionary;
    const base = { ruleId: 'ZONING-IZ-OVERLAY', citation: 'Pittsburgh Zoning Code §907.04.A IZ-O Inclusionary Housing Overlay District', maxPoints: max };
    const o = ctx.overlaps.iz_overlay;
    if (o.status === 'unavailable') return { ...base, result: 'unknown', points: unknownPts(ctx, max), flag: { id: 'iz-unverified', severity: 'info', reviewBy: 'Department of City Planning', factIds: ['overlay.iz'], text: 'Unverified: Inclusionary Housing Overlay layer unavailable.' } };
    if (!o.intersects) return { ...base, result: 'passed', points: max };
    return { ...base, result: 'failed', points: Math.round(max * ctx.config.partial.inclusionary * 10) / 10, flag: {
      id: 'iz-overlay', severity: 'info', reviewBy: 'Department of City Planning', factIds: ['overlay.iz'],
      text: `Parcel is in the Inclusionary Housing Overlay (${o.matched.map((m) => m.HOOD).filter(Boolean).join(', ') || 'IZ-O'}): affordable-unit set-aside requirements apply.` } };
  },
};

export const BASE_RULES: Rule[] = [lotMinimumRule, useRule, historicRule, inclusionaryRule];
