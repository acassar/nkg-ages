/** Ères du jeu. Seule la première est jouable pour l'instant. */
export interface EraGoal {
  /** Habitants, campements et inventions à réunir pour passer à l'ère suivante. */
  population: number
  camps: number
  inventions: number
}

export interface EraRules {
  id: string
  name: string
  /** Année de départ (historique, négative avant notre ère). */
  startYear: number
  /** Ce qui achève l'ère : pour l'instant, la victoire. */
  goal: EraGoal
}

export const ERAS: readonly EraRules[] = [
  {
    id: 'paleolithique',
    name: 'Paléolithique',
    startYear: -12000,
    goal: { population: 250, camps: 3, inventions: 6 },
  },
]

export const FIRST_ERA: EraRules = ERAS[0]!

/** Points du score : ce que vaut chaque élément de la partie. */
export const SCORE_RULES = {
  perPerson: 2,
  /** Pour dix cellules de territoire. */
  perTenCells: 1,
  perCamp: 50,
  /** Pour une invention, multiplié par la puissance de son rang (E = 1 … S = 4,5). */
  perInvention: 20,
  perYear: 1,
  /** Bonus de victoire, qui s'amenuise avec les années (on gagne plus en gagnant vite). */
  victory: 1000,
  victoryHalfLifeYears: 100,
} as const
