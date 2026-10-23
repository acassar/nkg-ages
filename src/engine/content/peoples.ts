/**
 * Peuples voisins : données pures. Ils vivent sous le brouillard, cueillent sur leurs
 * terres et fondent des campements quand ils grandissent. Le joueur les découvre en explorant.
 */
export const PEOPLE_RULES = {
  /** Peuples voisins au plus, selon la place qu'offre le monde. */
  count: 3,
  /** Distance minimale entre deux départs de peuples (joueur compris), en cellules. */
  spacing: 40,
  /** Population au départ. */
  startPopulation: 12,
  /** Un campement de plus pour tant d'habitants (le premier est offert). */
  peoplePerCamp: 25,
  /** Rations dépensées pour fonder un campement. */
  campCost: 40,
  /** Un nouveau campement s'installe à cette distance d'un des leurs. */
  campDistance: { min: 16, max: 24 },
  /** Essais pour trouver un emplacement de campement, chaque mois. */
  campAttempts: 8,
} as const

/** Noms des peuples, dans l'ordre où ils sont placés. */
export const PEOPLE_NAMES: readonly string[] = [
  'Peuple du Héron',
  'Peuple de l’Ours',
  'Peuple des Falaises',
  'Peuple du Saumon',
  'Peuple des Cendres',
]
