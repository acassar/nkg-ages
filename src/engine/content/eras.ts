/** Ères du jeu. Seule la première est jouable pour l'instant. */
export interface EraRules {
  id: string
  name: string
  /** Année de départ (historique, négative avant notre ère). */
  startYear: number
}

export const ERAS = [{ id: 'paleolithique', name: 'Paléolithique', startYear: -12000 }] as const

export const FIRST_ERA: EraRules = ERAS[0]
