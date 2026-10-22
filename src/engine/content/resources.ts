import { Biome, type BiomeId } from './biomes'

/**
 * Ressources de la carte : données pures. Chaque gisement a un rang (E à S) qui
 * multiplie son rendement.
 */
export type ResourceKind = 'baies' | 'poisson' | 'silex'

export interface ResourceRules {
  name: string
  /** Nourriture (s'ajoute à la récolte) ou matériau (s'entasse dans les réserves). */
  category: 'food' | 'material'
  /** Biomes où le gisement peut apparaître. `coast` : eau qui touche la terre. */
  biomes: readonly BiomeId[]
  coast?: boolean
  /** Chance qu'une cellule éligible porte un gisement. */
  density: number
  /** Production par mois d'un gisement de rang E tenu par la tribu. */
  yield: number
}

export const RESOURCE_RULES: Readonly<Record<ResourceKind, ResourceRules>> = {
  baies: {
    name: 'Baies',
    category: 'food',
    biomes: [Biome.Forest, Biome.Jungle, Biome.Plain],
    density: 1 / 200,
    yield: 3,
  },
  poisson: {
    name: 'Poisson',
    category: 'food',
    biomes: [Biome.Ocean],
    coast: true,
    density: 1 / 60,
    yield: 3,
  },
  silex: {
    name: 'Silex',
    category: 'material',
    biomes: [Biome.Hills, Biome.Mountain, Biome.Desert],
    density: 1 / 150,
    yield: 0.5,
  },
}

export const RESOURCE_KINDS = Object.keys(RESOURCE_RULES) as ResourceKind[]
