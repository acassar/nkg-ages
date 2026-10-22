/** Campements : données pures. */
export const CAMP_RULES = {
  /** Cellules visibles autour d'un campement. */
  sight: 7,
  /** Le territoire d'un campement ne s'étend pas au-delà de ce rayon. */
  reach: 26,
  /** Terres prises d'un coup à la fondation (le premier campement prend `startTerritoryRadius`). */
  claimRadius: 3,
  /** Cellules gagnées par le territoire à chaque tick, pour chaque campement. */
  growthPerTick: 2,
  /** Distance minimale entre deux campements. */
  minDistance: 16,
  /** Rations emportées pour fonder un campement. */
  foodCost: 40,
  /** Un campement de plus pour tant d'habitants (le premier est offert). */
  peoplePerCamp: 20,
} as const
