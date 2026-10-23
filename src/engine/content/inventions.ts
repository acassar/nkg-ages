import type { StatRange } from '../rarity/rarity'
import type { ResourceKind } from './resources'

/**
 * Inventions : données pures. À chaque invention, un rang (E à S) est tiré ; il fixe la
 * statistique de l'objet, une moyenne et un écart tirés à chaque usage. On peut réinventer
 * pour tenter un meilleur rang (on garde le meilleur), à un coût qui grandit.
 */
export type InventionKind =
  | 'lance'
  | 'panier'
  | 'fumage'
  | 'feu'
  | 'peaux'
  | 'pistage'
  | 'propulseur'
  | 'taille'
  | 'harpon'
  | 'portage'
  | 'agriculture'
  | 'bronze'

export interface InventionRules {
  name: string
  description: string
  /** Nom de la statistique et son unité d'affichage. */
  stat: string
  unit: '' | '%' | 'mois' | 'cases'
  /** Statistique au rang E et au rang S (valeurs intermédiaires interpolées). */
  range: StatRange
  /** Travail nécessaire, en points (la tribu en produit chaque mois selon sa taille). */
  work: number
  /** Matériaux consommés au lancement. */
  cost: Partial<Record<ResourceKind, number>>
  /** Inventions à faire d'abord. */
  requires?: readonly InventionKind[]
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
    // Sans écart : la réserve ne varie pas d'un mois à l'autre, seul le rang compte.
    range: { e: { mean: 2, spread: 0 }, s: { mean: 8, spread: 0 } },
    work: 160,
    cost: {},
  },
  // Les effets durables n'ont pas d'écart (seul le rang compte) ; ceux qui jouent à chaque
  // geste (lance, propulseur) varient d'un coup à l'autre.
  feu: {
    name: 'Feu maîtrisé',
    description: 'Foyers et nourriture cuite : la tribu grandit plus vite.',
    stat: 'Natalité',
    unit: '%',
    range: { e: { mean: 10, spread: 0 }, s: { mean: 50, spread: 0 } },
    work: 140,
    cost: {},
  },
  peaux: {
    name: 'Vêtements de peau',
    description: 'Mieux protégée, la tribu perd moins des siens en temps de famine.',
    stat: 'Pertes de famine',
    unit: '%',
    range: { e: { mean: -15, spread: 0 }, s: { mean: -60, spread: 0 } },
    work: 130,
    cost: {},
    requires: ['feu'],
  },
  pistage: {
    name: 'Pistage',
    description: 'Les chasseurs lisent les traces et voient plus loin.',
    stat: 'Vue des chasseurs',
    unit: 'cases',
    range: { e: { mean: 1, spread: 0 }, s: { mean: 5, spread: 0 } },
    work: 100,
    cost: {},
  },
  propulseur: {
    name: 'Propulseur',
    description: 'On frappe de plus loin : la chasse devient moins dangereuse.',
    stat: 'Danger',
    unit: '%',
    range: { e: { mean: -20, spread: 5 }, s: { mean: -70, spread: 15 } },
    work: 150,
    cost: { silex: 10 },
    requires: ['lance'],
  },
  taille: {
    name: 'Taille du silex',
    description: 'Des éclats mieux détachés : chaque gisement de silex rend davantage.',
    stat: 'Silex',
    unit: '%',
    range: { e: { mean: 20, spread: 0 }, s: { mean: 100, spread: 0 } },
    work: 110,
    cost: { silex: 5 },
  },
  harpon: {
    name: 'Harpon',
    description: 'Une pointe barbelée : les pêcheries nourrissent davantage.',
    stat: 'Pêche',
    unit: '%',
    range: { e: { mean: 20, spread: 0 }, s: { mean: 90, spread: 0 } },
    work: 130,
    cost: { silex: 8 },
    requires: ['lance'],
  },
  portage: {
    name: 'Portage',
    description: 'Sacs et sangles : éclaireurs et chasseurs marchent plus vite.',
    stat: 'Vitesse',
    unit: '%',
    range: { e: { mean: 8, spread: 0 }, s: { mean: 35, spread: 0 } },
    work: 120,
    cost: {},
    requires: ['panier'],
  },
  agriculture: {
    name: 'Agriculture',
    description:
      'Les campements peuvent devenir des villages, dont les champs donnent une récolte à la fin de l’été.',
    stat: 'Récolte',
    unit: '%',
    range: { e: { mean: 0, spread: 0 }, s: { mean: 60, spread: 0 } },
    work: 300,
    cost: { silex: 10 },
    requires: ['panier', 'taille'],
  },
  bronze: {
    name: 'Bronze',
    description:
      'Cuivre et étain fondus ensemble : haches et faucilles, la cueillette et les champs rendent davantage.',
    stat: 'Rendement',
    unit: '%',
    range: { e: { mean: 15, spread: 0 }, s: { mean: 50, spread: 0 } },
    work: 360,
    cost: { cuivre: 12, etain: 6 },
    requires: ['agriculture'],
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
