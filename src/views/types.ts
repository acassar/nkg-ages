/**
 * Modèles de vue : ce que l'interface et le rendu reçoivent.
 * Données simples et sérialisables, sans référence au moteur.
 */
export type Speed = 1 | 2 | 3 | 4 | 5

/** Morceau rectangulaire d'une grille de cellules (une valeur par cellule). */
export interface GridPatch {
  x: number
  y: number
  w: number
  h: number
  data: Uint8Array
}

/** Données fixes du monde, envoyées une fois au début de la partie. */
export interface WorldSnapshot {
  seed: string
  width: number
  height: number
  /** Altitude codée sur 0..255 : eau de 0 à 127, terre de 128 à 255. */
  elevation: Uint8Array
  biome: Uint8Array
}

export interface UnitView {
  id: number
  kind: string
  name: string
  x: number
  y: number
  target: { x: number; y: number } | null
  /** Points de passage restants, le dernier étant la cible. */
  path: { x: number; y: number }[]
  /**
   * Fondation d'un campement là où se tient l'unité : null si elle n'en fonde jamais
   * (seul l'éclaireur le peut), sinon ce qui l'en empêche maintenant (ou null).
   */
  foundCamp: { blocked: string | null } | null
}

export interface CampView {
  id: number
  x: number
  y: number
  mine: boolean
}

export interface GameView {
  tick: number
  speed: Speed
  paused: boolean
  dateLabel: string
  eraName: string
  units: UnitView[]
  camps: CampView[]
  /** Brouillard : 0 inconnu, 1 déjà vu, 2 visible. Seulement la zone modifiée. */
  fog: GridPatch | null
  /** Propriétaire par cellule (0 personne, 1 le joueur). Seulement la zone modifiée. */
  territory: GridPatch | null
  /** Messages pour le joueur, nés depuis la vue précédente (déjà rédigés). */
  notices: string[]
  tribe: TribeView
  /** Gisements découverts par le joueur (hors brouillard inconnu). */
  deposits: DepositView[]
  inventions: InventionView[]
  /** Troupeaux en vue en ce moment (ils bougent : le déjà-vu ne suffit pas). */
  herds: HerdView[]
}

export interface InventionView {
  kind: string
  name: string
  description: string
  /** Meilleur rang obtenu, ou null si pas encore inventée. */
  rank: RankLetter | null
  /** Statistique au rang obtenu, déjà rédigée (« Dégâts 5,2 ± 1,1 »). */
  stat: string | null
  /** Avancement de la recherche en cours (0 à 1), ou null. */
  progress: number | null
  monthsLeft: number | null
  /** Matériaux du prochain essai (« 15 silex »). */
  cost: string[]
  /** Ce qui empêche de lancer l'invention, ou null si c'est possible (ou en cours). */
  blocked: string | null
}

export interface HerdView {
  id: number
  kind: string
  name: string
  x: number
  y: number
  /** Bêtes restantes. */
  size: number
}

export type RankLetter = 'E' | 'D' | 'C' | 'B' | 'A' | 'S'

export interface DepositView {
  id: number
  kind: string
  name: string
  category: 'food' | 'material'
  /** Centre de la cellule du gisement. */
  x: number
  y: number
  rank: RankLetter
  /** Exploité par la tribu (dans son territoire). */
  held: boolean
  /** Production par mois. */
  yield: number
}

export interface TribeView {
  population: number
  /** Réserve de nourriture, en rations (une ration nourrit une personne un mois). */
  food: number
  foodCapacity: number
  /** Récolte moins consommation au dernier mois. */
  foodBalance: number
  starving: boolean
  /** Matériaux en réserve, arrondis. */
  materials: { kind: string; name: string; amount: number }[]
  /** Chasseurs en vie et nombre que la tribu peut entretenir. */
  hunters: number
  maxHunters: number
  /** Coût en rations d'un nouveau chasseur, et ce qui empêche d'en former un (ou null). */
  recruitCost: number
  recruitBlocked: string | null
  /** Réserve pleine : les chasseurs ne chassent pas. */
  huntersResting: boolean
  /** Campements tenus, et combien la population permet d'en tenir. */
  camps: number
  maxCamps: number
}

/** Biomes, dans l'ordre de leurs identifiants (même table que le moteur). */
export const BIOME_IDS = {
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

export const SPEED_VALUES: readonly Speed[] = [1, 2, 3, 4, 5]
