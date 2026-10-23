/**
 * Campements fixes (villages du joueur, camps des peuples voisins) : données pures.
 * Les bandes nomades du joueur ont leurs propres règles (content/bands).
 */
export const CAMP_RULES = {
  /** Le territoire d'un campement ne s'étend pas au-delà de ce rayon. */
  reach: 26,
  /** Terres prises d'un coup quand un peuple fonde un campement (son premier : `startTerritoryRadius`). */
  claimRadius: 3,
  /** Cellules gagnées par le territoire à chaque tick, pour chaque campement. */
  growthPerTick: 2,
  /** Distance minimale entre deux campements. */
  minDistance: 16,
} as const
