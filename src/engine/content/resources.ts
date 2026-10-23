import { Biome, type BiomeId } from './biomes'

/**
 * Ressources de la carte : données pures. Chaque gisement a un rang (E à S) qui
 * multiplie son rendement.
 */
export type ResourceKind = 'baies' | 'poisson' | 'silex' | 'cuivre' | 'etain'

export interface ResourceRules {
  name: string
  /** Nourriture (s'ajoute à la récolte) ou matériau (s'entasse dans les réserves). */
  category: 'food' | 'material'
  /** Biomes où le gisement peut apparaître. `coast` : eau qui touche la terre. */
  biomes: readonly BiomeId[]
  coast?: boolean
  /** Le gisement peut aussi naître sur un fleuve, quel que soit le biome des berges. */
  river?: boolean
  /** Chance qu'une cellule éligible porte un gisement. */
  density: number
  /** Production par mois d'un gisement de rang E tenu par la tribu. */
  yield: number
  /** Si présent : un gisement est garanti sur une terre à cette distance du départ, au plus. */
  nearStart?: number
  /**
   * Si présent : un gisement est garanti dans cet anneau autour du départ (distances min et
   * max), sur une terre libre, à aller chercher en explorant et en fondant des campements.
   */
  withinReach?: readonly [number, number]
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
    river: true,
    density: 1 / 60,
    yield: 3,
  },
  silex: {
    name: 'Silex',
    category: 'material',
    biomes: [Biome.Hills, Biome.Mountain, Biome.Desert],
    density: 1 / 150,
    yield: 0.5,
    // Sans silex à portée, la lance resterait hors d'atteinte sur la plupart des cartes.
    nearStart: 4,
  },
  // Métaux rares, sans garantie au départ : il faut explorer et s'étendre pour les tenir.
  // On ne les reconnaît qu'avec la métallurgie (voir `reveals` dans les inventions).
  cuivre: {
    name: 'Cuivre',
    category: 'material',
    biomes: [Biome.Hills, Biome.Mountain],
    density: 1 / 250,
    yield: 0.3,
    withinReach: [12, 40],
  },
  etain: {
    name: 'Étain',
    category: 'material',
    biomes: [Biome.Hills, Biome.Mountain, Biome.Desert],
    density: 1 / 350,
    yield: 0.2,
    withinReach: [12, 40],
  },
}

export const RESOURCE_KINDS = Object.keys(RESOURCE_RULES) as ResourceKind[]
