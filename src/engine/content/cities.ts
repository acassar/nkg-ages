/**
 * Cités : données pures. Une fois l'écriture inventée, un village peut devenir cité : elle
 * porte encore plus loin, stocke davantage et ses scribes font avancer les inventions.
 */
export const CITY_RULES = {
  /** Rations et cuivre dépensés pour bâtir une cité (murs, entrepôts, archives). */
  foodCost: 150,
  copperCost: 6,
  /** Une cité pour tant d'habitants. */
  peoplePerCity: 120,
  /** Portée du territoire en plus autour d'une cité, en plus de celle du village. */
  reachBonus: 6,
  /** Mois de réserve en plus par cité, en plus des greniers du village. */
  storageMonths: 2,
  /** Travail d'invention en plus par cité (0,15 = +15 %). */
  workBonus: 0.15,
} as const
