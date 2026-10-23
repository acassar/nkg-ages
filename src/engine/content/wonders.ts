import { Biome, type BiomeId } from './biomes'

/**
 * Merveilles : données pures. Des lieux uniques et très rares, posés (ou non) à la création
 * du monde, loin du départ. Tenir la cellule d'une merveille donne son effet et des points.
 */
export type WonderKind = 'cercle' | 'source' | 'grotte'

export interface WonderRules {
  name: string
  description: string
  /** Chance que la merveille existe sur une carte. */
  chance: number
  /** Biomes où elle peut se trouver. */
  biomes: readonly BiomeId[]
  /** Effet tenu : travail d'invention, natalité (0,3 = +30 %) ou mois de réserve en plus. */
  effect: { work?: number; growth?: number; storageMonths?: number }
}

export const WONDER_RULES: Readonly<Record<WonderKind, WonderRules>> = {
  cercle: {
    name: 'Cercle de pierres',
    description: 'Des pierres levées qui suivent le ciel : les inventions avancent plus vite.',
    chance: 0.6,
    biomes: [Biome.Plain, Biome.Hills, Biome.Tundra],
    effect: { work: 0.25 },
  },
  source: {
    name: 'Source sacrée',
    description: 'Une eau qui ne gèle jamais : la tribu grandit plus vite.',
    chance: 0.5,
    biomes: [Biome.Forest, Biome.Jungle, Biome.Plain],
    effect: { growth: 0.3 },
  },
  grotte: {
    name: 'Grotte ornée',
    description:
      'Des parois peintes, à l’abri du froid : de quoi garder des vivres plus longtemps.',
    chance: 0.4,
    biomes: [Biome.Hills, Biome.Mountain],
    effect: { storageMonths: 2 },
  },
}

export const WONDER_KINDS = Object.keys(WONDER_RULES) as WonderKind[]

export const WONDER_PLACEMENT = {
  /** Anneau autour du départ où les merveilles se posent : il faut aller les chercher. */
  minDistance: 25,
  maxDistance: 90,
  /** Points de score par merveille tenue. */
  score: 150,
} as const
