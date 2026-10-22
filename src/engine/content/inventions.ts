import type { StatRange } from '../rarity/rarity'
import type { ResourceKind } from './resources'

/**
 * Inventions : données pures. À chaque invention, un rang (E à S) est tiré ; il fixe la
 * statistique de l'objet, une moyenne et un écart tirés à chaque usage. On peut réinventer
 * pour tenter un meilleur rang (on garde le meilleur), à un coût qui grandit.
 */
export type InventionKind = 'lance' | 'panier' | 'fumage'

export interface InventionRules {
  name: string
  description: string
  /** Nom de la statistique et son unité d'affichage. */
  stat: string
  unit: '' | '%' | 'mois'
  /** Statistique au rang E et au rang S (valeurs intermédiaires interpolées). */
  range: StatRange
  /** Travail nécessaire, en points (la tribu en produit chaque mois selon sa taille). */
  work: number
  /** Matériaux consommés au lancement. */
  cost: Partial<Record<ResourceKind, number>>
}

export const INVENTION_RULES: Readonly<Record<InventionKind, InventionRules>> = {
  lance: {
    name: 'Lance',
    description: 'Les chasseurs abattent plus souvent leurs proies, selon les dégâts.',
    stat: 'Dégâts',
    unit: '',
    range: { e: { mean: 4, spread: 0.3 }, s: { mean: 7, spread: 3 } },
    work: 120,
    cost: { silex: 15 },
  },
  panier: {
    name: 'Panier',
    description: 'La cueillette rapporte davantage.',
    stat: 'Cueillette',
    unit: '%',
    range: { e: { mean: 10, spread: 2 }, s: { mean: 45, spread: 15 } },
    work: 90,
    cost: {},
  },
  fumage: {
    name: 'Fumage',
    description: 'La viande et les baies se conservent plus longtemps.',
    stat: 'Conservation',
    unit: 'mois',
    range: { e: { mean: 2, spread: 0.5 }, s: { mean: 8, spread: 2 } },
    work: 160,
    cost: {},
  },
}

export const INVENTION_KINDS = Object.keys(INVENTION_RULES) as InventionKind[]

export const INVENTION_WORK = {
  /** Points de travail par mois : une base, plus un par tant de personnes. */
  base: 1,
  peoplePerPoint: 10,
  /** Chaque réinvention coûte ce facteur de plus (travail et matériaux). */
  retryFactor: 1.5,
  /** Dégâts sans lance (bâtons, pierres) : la référence de la chasse. */
  bareDamage: { mean: 3, spread: 0.5 },
} as const
