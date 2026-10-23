/**
 * Règles de l'exploration : données pures.
 */
export const EXPLORE_RULES = {
  /** Cellules examinées au plus pour trouver la lisière du connu : borne le coût. */
  maxSearch: 60_000,
} as const
