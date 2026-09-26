import { BASE_RULES } from './base';
import type { Rule, RuleSet } from './types';

/** Informational, zero-point rules: what today's code says about parking and ADUs (not scored). */
const parkingCurrent: Rule = {
  id: 'PARKING-MINIMUM', bonus: true,
  evaluate: () => ({
    ruleId: 'PARKING-MINIMUM', citation: 'Pittsburgh Zoning Code Ch. 914 Parking, Loading and Access', result: 'unknown', points: 0, maxPoints: 0,
    flag: { id: 'parking-minimum', severity: 'info', reviewBy: 'Zoning Administrator', factIds: ['zoning.district'],
      text: 'Off-street parking minimums may apply under Ch. 914; requirement by use/district is not modeled (unverified).' },
  }),
};
const aduCurrent: Rule = {
  id: 'ADU-CURRENT', bonus: true,
  evaluate: () => ({
    ruleId: 'ADU-CURRENT', citation: 'Pittsburgh Zoning Code §912.08 (existing text, shown struck in Bill 2025-1545): ADUs only in an ADU Overlay District; 1 per lot; owner must reside on site', result: 'unknown', points: 0, maxPoints: 0,
    flag: { id: 'adu', severity: 'info', reviewBy: 'Zoning Administrator', factIds: ['zoning.district'],
      text: 'ADUs: current code limits them to an ADU overlay district, 1 per lot, with owner-occupancy; overlay coverage is not modeled (unverified).' },
  }),
};

export const currentRules: RuleSet = {
  id: 'current',
  label: 'Current code (in effect)',
  status: 'in_effect',
  statusNote: 'Zoning Code as amended by Bill 2025-1579 (lot minimums), in effect. Use table per Council File 2024-0701 print (7/18/2024); not re-verified against live code.',
  rules: [...BASE_RULES, parkingCurrent, aduCurrent],
};
