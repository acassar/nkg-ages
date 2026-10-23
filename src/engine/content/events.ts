import type { AnimalKind } from './fauna'
import type { Rank } from './rarity'
import type { ResourceKind } from './resources'

/**
 * Événements rares : données pures. Chaque mois, au plus un événement se produit ;
 * son rang dit sa rareté (E courant, S exceptionnel) et la force de son effet.
 */
export type EventKind =
  'abondance' | 'tempete' | 'maladie' | 'nouveauxVenus' | 'migration' | 'filon' | 'etoile'

export interface EventRules {
  name: string
  rank: Rank
  /** Chance par an ; tirée mois par mois. */
  chancePerYear: number
  /** Mois où il peut survenir (0 = janvier) ; tous si absent. */
  months?: readonly number[]
  /** Vrai : un coup du sort, épargné à la tribu pendant ses premières années. */
  harmful?: boolean
  /** Part de la réserve maximale gagnée (positive) ou de la réserve perdue (négative). */
  food?: number
  /** Part de la population gagnée ou perdue (au moins une personne). */
  population?: number
  /** Troupeau qui arrive près du camp, et sa taille en multiple d'un troupeau normal. */
  herd?: { kind: AnimalKind; sizeFactor: number }
  /** Gisement qui affleure sur le territoire, au moins de ce rang. */
  deposit?: { kind: ResourceKind; minRank: Rank }
  /** Part du travail de l'invention en cours accomplie d'un coup (il en faut une). */
  invention?: number
}

export const EVENT_KINDS: readonly EventKind[] = [
  'etoile',
  'filon',
  'migration',
  'nouveauxVenus',
  'maladie',
  'tempete',
  'abondance',
]

export const EVENT_RULES: Readonly<Record<EventKind, EventRules>> = {
  abondance: {
    name: 'Abondance',
    rank: 'E',
    chancePerYear: 0.25,
    months: [4, 5, 6, 7, 8],
    food: 0.25,
  },
  tempete: {
    name: 'Tempête',
    rank: 'D',
    chancePerYear: 0.2,
    months: [9, 10, 11, 0, 1],
    harmful: true,
    food: -0.2,
  },
  maladie: { name: 'Maladie', rank: 'C', chancePerYear: 0.1, harmful: true, population: -0.08 },
  nouveauxVenus: {
    name: 'Nouveaux venus',
    rank: 'C',
    chancePerYear: 0.08,
    months: [3, 4, 5, 6, 7, 8],
    population: 0.1,
  },
  migration: {
    name: 'Grande migration',
    rank: 'B',
    chancePerYear: 0.06,
    months: [2, 3, 8, 9],
    herd: { kind: 'cerf', sizeFactor: 2 },
  },
  filon: {
    name: 'Filon',
    rank: 'A',
    chancePerYear: 0.03,
    deposit: { kind: 'silex', minRank: 'B' },
  },
  etoile: { name: 'Étoile filante', rank: 'S', chancePerYear: 0.01, invention: 0.5 },
}

export const EVENT_RULES_GLOBAL = {
  /** Années de grâce : pas de coup du sort avant. */
  graceYears: 2,
  /** Distance au camp (cellules) où arrive un troupeau migrateur. */
  herdDistance: { min: 6, max: 12 },
} as const
