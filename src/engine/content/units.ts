/**
 * Règles des unités qu'on forme et de leurs ordres : données pures.
 */
export const SCOUT_RULES = {
  /** Un éclaireur de plus pour tant d'habitants (le premier est offert). */
  peoplePerScout: 25,
  /** Rations dépensées pour former un éclaireur. */
  recruitFood: 20,
} as const

export const EXPLORE_RULES = {
  /** Cellules examinées au plus pour trouver la lisière du connu : borne le coût. */
  maxSearch: 60_000,
} as const
