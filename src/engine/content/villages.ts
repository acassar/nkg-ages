import { Biome, type BiomeId } from './biomes'

/**
 * Villages et champs : données pures. Une fois l'agriculture inventée, un campement
 * peut devenir village : il porte plus loin, stocke plus, et ses champs donnent
 * une récolte à la fin de l'été.
 */
export const VILLAGE_RULES = {
  /** Rations dépensées pour bâtir un village (greniers, maisons). */
  foodCost: 80,
  /** Un village pour tant d'habitants. */
  peoplePerVillage: 40,
  /** Portée du territoire en plus autour d'un village, en cellules. */
  reachBonus: 8,
  /** Mois de réserve en plus par village (greniers). */
  storageMonths: 3,
  /** Les champs d'un village couvrent les terres tenues dans ce rayon. */
  fieldRadius: 6,
  /** Rations par cellule de fertilité 1, à chaque mois de récolte. */
  cropPerCell: 1.5,
  /** Mois de récolte (0 = janvier) : août, septembre, octobre. */
  harvestMonths: [7, 8, 9] as readonly number[],
  /** Fertilité en plus d'une cellule au bord d'un fleuve. */
  riverFertility: 0.5,
} as const

/** Fertilité des terres selon le biome : les plaines d'abord, rien en montagne. */
export const FERTILITY: Readonly<Record<BiomeId, number>> = {
  [Biome.DeepOcean]: 0,
  [Biome.Ocean]: 0,
  [Biome.Plain]: 1,
  [Biome.Forest]: 0.4,
  [Biome.Jungle]: 0.3,
  [Biome.Hills]: 0.6,
  [Biome.Mountain]: 0,
  [Biome.Desert]: 0,
  [Biome.Tundra]: 0.1,
  [Biome.Ice]: 0,
}
