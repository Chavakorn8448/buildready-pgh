/** Isomorphic helpers: run the pure engine on a precomputed packet (browser or server). */
import { CONFIG, compareRuleSets, currentRules, reformRules, scoreParcel, type Config, type EngineData, type ScoreResult } from '../index';
import { fromPacket, type Packet } from '../packets';

export type Meta = { generatedAt: string; layerMeta: EngineData['layerMeta']; permittedUses: EngineData['permittedUses']; hoodValues: EngineData['hoodValues']; counts: { parcelsInSnapshot: number; inScope: number; scored: number }; scope: string };
export type RuleSetId = 'current' | 'reform-2025-1545';

export const engineData = (meta: Meta): EngineData => ({ layers: {}, layerMeta: meta.layerMeta, permittedUses: meta.permittedUses, hoodValues: meta.hoodValues });
export const ruleSetFor = (id: RuleSetId) => (id === 'reform-2025-1545' ? reformRules : currentRules);

export function runPacket(packet: Packet, meta: Meta, id: RuleSetId, config: Config = CONFIG): ScoreResult {
  const { parcel, overlaps } = fromPacket(packet);
  return scoreParcel(parcel, engineData(meta), ruleSetFor(id), config, overlaps);
}

export function comparePacket(packet: Packet, meta: Meta, config: Config = CONFIG) {
  const { parcel, overlaps } = fromPacket(packet);
  return compareRuleSets(parcel, engineData(meta), currentRules, reformRules, config, overlaps);
}

export function withWeights(w: Config['weights']): Config {
  return { ...CONFIG, weights: w } as Config;
}
