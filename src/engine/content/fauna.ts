import { Biome, type BiomeId } from './biomes'

/** Faune chassable : données pures. */
export type AnimalKind = 'cerf' | 'sanglier' | 'mammouth'

export interface AnimalRules {
  name: string
  /** Biomes où les troupeaux naissent et errent. */
  biomes: readonly BiomeId[]
  /** Chance qu'une cellule éligible accueille un troupeau. */
  density: number
  /** Taille d'un troupeau : au départ et au maximum. */
  herdSize: number
  /** Cellules par tick en errance. */
  speed: number
  /** Rations rapportées par une bête abattue. */
  meat: number
  /** Chance par tentative d'abattre une bête. */
  catchChance: number
  /** Chance par tentative que le chasseur y laisse la vie. */
  danger: number
  /** Chance par mois qu'un troupeau entamé regagne une bête. */
  regrowth: number
}

export const ANIMAL_RULES: Readonly<Record<AnimalKind, AnimalRules>> = {
  cerf: {
    name: 'Cerfs',
    biomes: [Biome.Plain, Biome.Forest, Biome.Tundra, Biome.Hills],
    density: 1 / 900,
    herdSize: 8,
    speed: 0.18,
    meat: 12,
    catchChance: 0.18,
    danger: 0.002,
    regrowth: 0.08,
  },
  sanglier: {
    name: 'Sangliers',
    biomes: [Biome.Forest, Biome.Jungle],
    density: 1 / 1100,
    herdSize: 5,
    speed: 0.12,
    meat: 10,
    catchChance: 0.22,
    danger: 0.01,
    regrowth: 0.1,
  },
  mammouth: {
    name: 'Mammouths',
    biomes: [Biome.Tundra, Biome.Plain, Biome.Ice],
    density: 1 / 2600,
    herdSize: 4,
    speed: 0.1,
    meat: 70,
    catchChance: 0.08,
    danger: 0.04,
    regrowth: 0.03,
  },
}

export const ANIMAL_KINDS = Object.keys(ANIMAL_RULES) as AnimalKind[]

/** Règles de la chasse elle-même : chaque campement chasse seul autour de lui. */
export const HUNT_RULES = {
  /** Un troupeau chassé fuit d'autant de cellules à l'opposé du campement. */
  fleeDistance: 5,
  /** Les campements laissent les troupeaux plus dangereux que ceci (les mammouths). */
  maxDanger: 0.02,
  /**
   * Part des gens d'une bande qui chasse dès qu'elle voit du gibier ; quand ses terres ne
   * suffisent pas, elle envoie chasser les bras que la cueillette n'occupe pas, jusqu'à
   * `maxShare`. Les gens en âge de chasser (`share`) défendent aussi le camp.
   */
  share: 1 / 6,
  maxShare: 0.5,
} as const
