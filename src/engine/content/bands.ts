/**
 * Bandes nomades : données pures. Une bande est un campement qui se déplace avec ses gens ;
 * elle cueille autour d'elle, épuise ce qu'elle exploite et doit migrer.
 */
export const BAND_RULES = {
  /** Rayon de la zone exploitée autour d'une bande, en cellules (elle la suit en marchant). */
  radius: 7,
  /** Cellules parcourues par pas (une semaine) en plaine. */
  speed: 1.5,
  /** Détour accepté quand le terrain découvert coupe le chemin (comme les unités). */
  detour: 2,
  detourSlack: 30,
  /**
   * Taille où la bande cueille au mieux. Au-delà, chaque personne de plus retire
   * `lossPerPerson` d'efficacité (cueillette partagée, tensions), jusqu'à `minEfficiency`.
   */
  comfortSize: 25,
  lossPerPerson: 0.01,
  minEfficiency: 0.5,
  /** Personnes au moins dans chacune des deux bandes après une scission. */
  minSplit: 8,
  /** Rations par mois qu'offre une cellule exploitée, multipliées par sa richesse et son abondance. */
  yieldPerCell: 0.35,
  /**
   * Épuisement : chaque mois, une cellule exploitée perd cette part de son abondance,
   * multipliée par la part de ce qu'elle offrait qui a été cueillie.
   */
  depletion: 0.08,
  /** Repousse mensuelle : part de ce qui manque à une cellule pour retrouver son abondance. */
  regrowth: 0.06,
  /** Sous cette abondance moyenne, la zone est dite épuisée (alerte, migration seule). */
  exhausted: 0.5,
  /** Migration seule : distance des sites essayés, en rayons de zone, et nombre de directions. */
  migrateDistance: 2,
  migrateDirections: 12,
} as const

export type BandRules = typeof BAND_RULES
