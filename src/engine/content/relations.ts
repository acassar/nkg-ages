/**
 * Relations avec les peuples voisins : données pures. Une relation va de -100 (hostile)
 * à 100 (allié) ; elle revient doucement vers 0 si on la néglige.
 */
export const RELATION_RULES = {
  min: -100,
  max: 100,
  /** Retour vers 0, chaque mois. */
  driftPerMonth: 0.5,
  /** Présent : rations données et relation gagnée. */
  giftFood: 30,
  giftRelation: 15,
  /** Échange : silex donnés contre rations reçues, relation minimale et gagnée. */
  tradeSilex: 10,
  tradeFood: 25,
  tradeMinRelation: 10,
  tradeRelation: 3,
  /** Un peuple n'échange que s'il garde au moins tant de mois de vivres après l'échange. */
  tradeReserveMonths: 1,
} as const

/** Humeurs, de la pire à la meilleure : la première dont le seuil est atteint s'applique. */
export const MOODS: readonly { from: number; name: string }[] = [
  { from: 60, name: 'Allié' },
  { from: 20, name: 'Amical' },
  { from: 0, name: 'Neutre' },
  { from: -40, name: 'Méfiant' },
  { from: -Infinity, name: 'Hostile' },
]
