/**
 * Règles de la tribu : données pures, réglables sans toucher à la logique.
 * Unités : personnes, rations (nourriture d'une personne pour un mois), mois (1 tick).
 */
export const TRIBE_RULES = {
  /** Population au départ. */
  startPopulation: 12,
  /** Réserve au départ, en mois de consommation. */
  startReserveMonths: 3,
  /** Rations mangées par personne et par mois. */
  rationPerPerson: 1,
  /** Rations qu'une personne peut récolter par mois, au mieux. */
  gatherPerPerson: 1.6,
  /** Rations par mois qu'offre une cellule tenue, multipliées par sa richesse (biome). */
  yieldPerCell: 0.2,
  /** Réserve maximale, en mois de consommation (sans conservation, la nourriture se perd). */
  storageMonths: 8,
  /** Croissance par mois quand la réserve dépasse `comfortMonths` (≈ 5 % par an). */
  growthPerMonth: 0.004,
  comfortMonths: 2,
  /** Part de la population perdue chaque mois de famine (au moins une personne). */
  famineLoss: 0.06,
  /** Rayon du territoire tenu dès la fondation, en cellules. */
  startTerritoryRadius: 5,
} as const

export type TribeRules = typeof TRIBE_RULES
