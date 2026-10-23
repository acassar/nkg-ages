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
  /** Fleuves : 0 sans fleuve, sinon 1..255 selon le débit. */
  river: Uint8Array
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
  /** Sous l'ordre « Explorer ». */
  exploring: boolean
}

export interface CampView {
  id: number
  x: number
  y: number
  mine: boolean
  /** Village (champs, greniers) plutôt que simple campement. */
  village: boolean
  /** Cité (un village grandi) : dessinée plus grande encore. */
  city: boolean
  /** Nom du peuple voisin qui le tient, ou null pour le joueur. */
  people: string | null
  /** Ce qu'il peut devenir (village, puis cité), son coût et ce qui l'en empêche ; null sinon. */
  upgrade: { to: 'village' | 'city'; cost: string; blocked: string | null } | null
}

export interface GameView {
  tick: number
  speed: Speed
  paused: boolean
  dateLabel: string
  eraName: string
  season: SeasonView
  units: UnitView[]
  camps: CampView[]
  /** Brouillard : 0 inconnu, 1 déjà vu, 2 visible. Seulement la zone modifiée. */
  fog: GridPatch | null
  /**
   * Propriétaire par cellule (0 personne, 1 le joueur, 2 et plus un peuple voisin, montré
   * seulement hors du brouillard inconnu). Seulement la zone modifiée.
   */
  territory: GridPatch | null
  /** Messages pour le joueur, nés depuis la vue précédente (déjà rédigés). */
  notices: string[]
  tribe: TribeView
  /** Gisements découverts par le joueur (hors brouillard inconnu). */
  deposits: DepositView[]
  wonders: WonderView[]
  inventions: InventionView[]
  /** Troupeaux en vue en ce moment (ils bougent : le déjà-vu ne suffit pas). */
  herds: HerdView[]
  score: number
  /** Objectif de l'ère, élément par élément. */
  goal: GoalView[]
  /** Succès de la partie, gagnés ou non. */
  achievements: AchievementView[]
  /** Conseil du moment pour débuter, ou null. */
  hint: string | null
  /** Ce qui demande l'attention du joueur maintenant, du plus grave au plus anodin. */
  alerts: AlertView[]
  /** Peuples voisins rencontrés et encore en vie. */
  peoples: PeopleView[]
  /** Fin de partie, ou null tant qu'elle dure. */
  outcome: OutcomeView | null
}

export interface SeasonView {
  kind: 'hiver' | 'printemps' | 'ete' | 'automne'
  name: string
  /** Cueillette du mois, en % de la moyenne de l'année (climat des campements compris). */
  gather: number
}

export interface PeopleView {
  /** Numéro du peuple, à renvoyer dans les commandes. */
  id: number
  name: string
  /** Population arrondie (on ne la connaît qu'à peu près). */
  population: number
  /** Relation de -100 à 100, et l'humeur qui va avec (« Amical »). */
  relation: number
  mood: string
  giftCost: string
  giftBlocked: string | null
  /** Ce qu'on donne et ce qu'on reçoit (« 10 silex → 25 rations »). */
  trade: string
  tradeBlocked: string | null
  /** Ce qui aigrit la relation en ce moment, ou null (« Campements trop proches des leurs »). */
  tension: string | null
}

export interface AlertView {
  /** Identifiant stable d'une vue à l'autre (« famine », « raids-2 »). */
  id: string
  level: 'danger' | 'warning' | 'info'
  text: string
  /** Lieu à montrer quand on clique sur l'alerte, ou null. */
  target: { x: number; y: number } | null
}

export interface AchievementView {
  id: string
  name: string
  description: string
  done: boolean
}

export interface GoalView {
  label: string
  have: number
  need: number
  done: boolean
}

export interface OutcomeView {
  type: 'victory' | 'defeat'
  score: number
  /** Date de la fin, déjà rédigée. */
  dateLabel: string
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

/** Merveille déjà découverte par le joueur. */
export interface WonderView {
  kind: string
  name: string
  description: string
  /** Centre de la cellule de la merveille. */
  x: number
  y: number
  /** Sur les terres du joueur : son effet joue. */
  held: boolean
}

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
  /** Récolte moins consommation et pertes au dernier mois. */
  foodBalance: number
  /** Rations gâtées dans la réserve au dernier mois. */
  spoiled: number
  starving: boolean
  /** Matériaux en réserve, arrondis. */
  materials: { kind: string; name: string; amount: number }[]
  /** Chasseurs en vie et nombre que la tribu peut entretenir. */
  hunters: number
  maxHunters: number
  /** Coût en rations d'un nouveau chasseur, et ce qui empêche d'en former un (ou null). */
  recruitCost: number
  recruitBlocked: string | null
  /** Éclaireurs en vie, combien la tribu peut en entretenir, leur coût et ce qui bloque. */
  scouts: number
  maxScouts: number
  scoutCost: number
  scoutBlocked: string | null
  /** Réserve pleine : les chasseurs ne chassent pas. */
  huntersResting: boolean
  /** Campements tenus, et combien la population permet d'en tenir. */
  camps: number
  maxCamps: number
  /** Villages tenus, combien la population en permet, leur coût et ce qui bloque (ou null). */
  villages: number
  maxVillages: number
  villageCost: number
  villageBlocked: string | null
  /** Cités tenues, combien la population en permet, leur coût (« 150 rations et 6 cuivre »). */
  cities: number
  maxCities: number
  cityCost: string
  cityBlocked: string | null
  /** Moisson du dernier mois (0 hors saison ou sans village). */
  crops: number
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
