import type { Flag } from '../facts';
import type { Config } from '../config';
import type { ProcessedParcel } from '../types';
import type { ParcelOverlaps } from '../hazards';
import type { LandUse } from '../landuse';
import type { ZoningInfo } from '../zoning';

export type RuleResult = {
  ruleId: string;
  citation: string;
  result: 'passed' | 'failed' | 'unknown';
  points: number;
  maxPoints: number;
  flag?: Flag;
};

export type RuleContext = {
  parcel: ProcessedParcel;
  zoning: ZoningInfo; // primary (polygon) district
  altZoning: ZoningInfo | null; // ParcelsPublic zon_new when it disagrees
  overlaps: ParcelOverlaps;
  landUse: LandUse;
  config: Config;
};

export interface Rule {
  id: string;
  /** true = extra points on top of the 100-point base (reform bonuses); base rules sum to 85 */
  bonus: boolean;
  evaluate(ctx: RuleContext): RuleResult;
}

export interface RuleSet {
  id: 'current' | 'reform-2025-1545';
  label: string;
  status: 'in_effect' | 'proposed';
  statusNote: string;
  rules: Rule[];
}
