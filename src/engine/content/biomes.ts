/**
 * Biomes du monde : données pures, sans logique.
 * L'identifiant numérique est stocké dans la grille du monde ; ne pas renuméroter.
 */
export const Biome = {
  DeepOcean: 0,
  Ocean: 1,
  Plain: 2,
  Forest: 3,
  Jungle: 4,
  Hills: 5,
  Mountain: 6,
  Desert: 7,
  Tundra: 8,
  Ice: 9,
} as const

export type BiomeId = (typeof Biome)[keyof typeof Biome]

export interface BiomeRules {
  name: string
  water: boolean
  /** Coût de déplacement relatif (1 = plaine). */
  moveCost: number
  /** Richesse en nourriture, de 0 à 1 (chasse, cueillette, pêche). */
  food: number
}

export const BIOMES: Readonly<Record<BiomeId, BiomeRules>> = {
  [Biome.DeepOcean]: { name: 'Océan profond', water: true, moveCost: Infinity, food: 0.1 },
  [Biome.Ocean]: { name: 'Mer côtière', water: true, moveCost: Infinity, food: 0.5 },
  [Biome.Plain]: { name: 'Plaine', water: false, moveCost: 1, food: 0.8 },
  [Biome.Forest]: { name: 'Forêt', water: false, moveCost: 1.6, food: 0.7 },
  [Biome.Jungle]: { name: 'Jungle', water: false, moveCost: 2.2, food: 0.6 },
  [Biome.Hills]: { name: 'Collines', water: false, moveCost: 1.8, food: 0.5 },
  [Biome.Mountain]: { name: 'Montagne', water: false, moveCost: 3.5, food: 0.15 },
  [Biome.Desert]: { name: 'Désert', water: false, moveCost: 1.5, food: 0.1 },
  [Biome.Tundra]: { name: 'Toundra', water: false, moveCost: 1.4, food: 0.3 },
  [Biome.Ice]: { name: 'Glacier', water: false, moveCost: 3, food: 0 },
}

export const BIOME_COUNT = 10

export function isWater(biome: number): boolean {
  return biome === Biome.DeepOcean || biome === Biome.Ocean
}
