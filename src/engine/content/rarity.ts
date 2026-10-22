/**
 * Rangs de rareté, du plus commun (E) au plus rare (S). Données pures.
 * Ils servent aux gisements, et serviront aux inventions et à d'autres systèmes.
 */
export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const
export type Rank = (typeof RANKS)[number]

export interface RankRules {
  /** Poids de tirage : la probabilité d'un rang est son poids sur la somme des poids. */
  weight: number
  /** Multiplicateur de rendement (gisements) ou de puissance (inventions). */
  power: number
}

export const RANK_RULES: Readonly<Record<Rank, RankRules>> = {
  E: { weight: 40, power: 1 },
  D: { weight: 26, power: 1.3 },
  C: { weight: 17, power: 1.7 },
  B: { weight: 10, power: 2.2 },
  A: { weight: 5.5, power: 3 },
  S: { weight: 1.5, power: 4.5 },
}
