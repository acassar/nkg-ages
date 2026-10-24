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
  /**
   * Croissance par mois (≈ 5 % par an), multipliée selon les vivres en réserve : rien sous
   * `comfortMonths` mois de repas, `minGrowthFactor` à ce seuil, puis de plus en plus jusqu'à
   * `maxGrowthFactor` avec `fullMonths` mois. La bande grandit, sa réserve baisse, et la
   * croissance ralentit d'elle-même. Un mois où la réserve fond, personne ne naît : sans ce
   * frein, la bande dépassait ce que ses terres nourrissent (45 mois de famine par partie
   * dans la sonde, contre 5).
   */
  growthPerMonth: 0.004,
  minGrowthFactor: 0.25,
  maxGrowthFactor: 1.75,
  comfortMonths: 2,
  fullMonths: 8,
  /** Part de la population perdue chaque mois de famine (au moins une personne). */
  famineLoss: 0.06,
  /** Rayon des terres d'un peuple voisin dès sa fondation, en cellules. */
  startTerritoryRadius: 5,
} as const

export type TribeRules = typeof TRIBE_RULES
