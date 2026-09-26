/** Editable knobs. Nothing here is legal/zoning advice; every number is a modeling choice. */
export const CONFIG = {
  /** Sub-score weights (sum should be 100). Edit here. */
  weights: { zoning: 40, environmental: 20, funding: 15, access: 15, site: 10 },
  /** Unknown data never passes, but earns this share of a rule's points (0 = harshest). Always flagged "unverified". */
  unknownCredit: 0.4,
  /** Overlaps smaller than this share of the parcel are treated as boundary slivers, not overlap. */
  minOverlapFraction: 0.01,
  /** Score caps from gate G3. */
  caps: { housingNotPermitted: 40, housingExceptionOnly: 70 },
  environmental: {
    // penalty points off 100, by share of parcel overlapped
    slope: { small: 10, medium: 25, large: 40 },
    landslide: { small: 10, medium: 25, large: 40 },
    undermined: 15,
    flood: 25,
    floodway: 40,
    unavailablePenalty: 20,
    tiers: { medium: 0.05, large: 0.5 },
  },
  funding: { vacantLow: 100, vacantNotLow: 70, occupiedLow: 60, occupiedNotLow: 50, unknown: 30 },
  access: { inBuffer: 100, partialBuffer: 75, outside: 50, bufferShareFull: 0.5 },
  site: { vacant: 50, publicHACPCityURA: 50, county: 25 },
  /** Base rules sum to 85; the other 15 points are reserved for the proposed-reform bonus rules (so the reform can raise even a clean parcel). */
  zoningPoints: { lotMin: 40, use: 25, historic: 12, inclusionary: 8 },
  reformBonusPoints: { adu: 6, parking: 4, affordableBonus: 5 },
  /** Points share for partial outcomes */
  partial: { exceptionOnlyUse: 0.4, failedLotMin: 0.2, historic: 0.4, inclusionary: 0.5 },
} as const;

export type Config = typeof CONFIG;
