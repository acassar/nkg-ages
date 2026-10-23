import type { Command, CommandResult } from './commands'
import { FIRST_ERA } from './content/eras'
import { goalReached, scoreOf, type Tally } from './score/score'
import { createClock, isSpeed, STEPS_PER_MONTH, type ClockState } from './core/clock'
import { createRng, type Rng } from './core/random'
import { createFog, updateFog, Visibility, type FogState } from './fog/fog'
import { BIOMES, type BiomeId } from './content/biomes'
import { climateAmplitude, seasonalYield, seasonStarting, spoilage } from './climate/seasons'
import { TRIBE_RULES } from './content/tribe'
import {
  claim,
  claimAround,
  createTerritory,
  growTerritory,
  NO_OWNER,
  PLAYER,
  type Seat,
  type TerritoryState,
} from './territory/territory'
import { findPath, knownPassable, pathBlocked } from './units/path'
import { frontierTarget } from './units/explore'
import { CAMP_RULES } from './content/camps'
import { BAND_RULES } from './content/bands'
import {
  bandEfficiency,
  createAbundance,
  exploit,
  forageAround,
  forageOf,
  playerCells,
  refreshZones,
} from './bands/bands'
import { bandSight, herdsSeenBy, safePrey } from './bands/sight'
import { PEOPLE_NAMES, PEOPLE_RULES } from './content/peoples'
import { MOODS, RELATION_RULES } from './content/relations'
import { CITY_RULES } from './content/cities'
import { ACHIEVEMENTS } from './content/achievements'
import { unlockAchievements, type AchievementFacts } from './achievements/achievements'
import { WONDER_PLACEMENT, WONDER_RULES } from './content/wonders'
import { placeWonders, type Wonder } from './wonders/wonders'
import { FERTILITY, VILLAGE_RULES } from './content/villages'
import { RIVER_RULES } from './content/rivers'
import { ANIMAL_RULES, HUNT_RULES, type AnimalKind } from './content/fauna'
import {
  INVENTION_KINDS,
  INVENTION_RULES,
  INVENTION_WORK,
  revealerOf,
  type InventionKind,
} from './content/inventions'
import type { Rank } from './content/rarity'
import { RESOURCE_RULES, type ResourceKind } from './content/resources'
import {
  cannotStart,
  createInventions,
  inventionMean,
  inventionStat,
  startInvention,
  tickInventions,
  type InventionsState,
} from './inventions/inventions'
import { rollStat } from './rarity/rarity'
import { flee, placeHerds, regrow, wander, type Herd } from './fauna/fauna'
import {
  depositYield,
  ensureNearStart,
  ensureWithinReach,
  heldBy,
  placeDeposits,
  type Deposit,
} from './resources/deposits'
import {
  createTribe,
  storageCapacity,
  territoryFood,
  tickTribe,
  type TribeState,
} from './tribe/tribe'
import { isPassable, moveAlong, stopMover, type Mover } from './units/units'
import { generateWorld } from './world/generate'
import { EVENT_RULES, EVENT_RULES_GLOBAL, type EventKind } from './content/events'
import { pickEvent } from './events/events'
import { bestRank, rollRank } from './rarity/rarity'
import { findStarts, type StartSite } from './world/starts'
import { inBounds, type World } from './world/world'

export interface NewGameOptions {
  seed: string
  /** Vrai : départ tiré au hasard parmi les sites viables. Faux : `startIndex` parmi les meilleurs. */
  randomStart: boolean
  startIndex?: number
  width?: number
  height?: number
  /** Faux : pas d'événements rares (scénarios d'essai, partie sans surprise). */
  rareEvents?: boolean
  /** Nombre de peuples voisins au plus (par défaut PEOPLE_RULES.count ; 0 : la tribu est seule). */
  peoples?: number
}

/** Un peuple voisin : il vit sous le brouillard, sur ses terres (propriétaire `owner`). */
export interface People {
  owner: number
  name: string
  tribe: TribeState
  /** Le joueur l'a déjà aperçu. */
  met: boolean
  /** Relation avec le joueur, de -100 (hostile) à 100 (allié). */
  relation: number
  /** Tick du dernier présent ou échange : un par mois, pas de relation achetée en rafale. */
  lastDeal?: number
}

/**
 * Un campement. Celui du joueur est une bande nomade tant qu'il n'est pas devenu village :
 * il marche, cueille et chasse autour de lui. C'est par lui seul que la tribu voit le pays.
 */
export interface Camp extends Partial<Mover> {
  id: number
  owner: number
  x: number
  y: number
  /** Devenu village : il porte plus loin, stocke plus et cultive ses champs. */
  village?: boolean
  /** Devenu cité (c'était un village) : portée, réserves et savoir en plus. */
  city?: boolean
  /** Gens du joueur qui y vivent : la population de la tribu se partage entre ses campements. */
  members?: number
  /**
   * Part exacte (non arrondie) de la population qui y vit : les naissances s'y accumulent
   * mois après mois, même quand `members` n'en montre pas encore une personne entière.
   */
  share?: number
  /** Bande qui migre seule vers des terres plus riches quand les siennes s'épuisent. */
  roaming?: boolean
}

/** Ce qui est arrivé pendant les ticks, pour prévenir le joueur ; vidé à chaque envoi. */
export type GameEvent =
  /** La réserve est vide : la tribu commence à perdre des siens. */
  | { type: 'famine' }
  /** Un chasseur d'un campement est mort à la chasse. */
  | { type: 'hunterKilled'; animal: AnimalKind }
  /** Une invention est achevée, avec le rang tiré (le meilleur rang est gardé). */
  | { type: 'invented'; invention: InventionKind; rank: Rank }
  /** L'objectif de l'ère est atteint. */
  | { type: 'victory' }
  /** La tribu a disparu : la partie est finie. */
  | { type: 'defeat' }
  /**
   * Un événement rare est survenu. `amount` : rations ou personnes gagnées (négatif : perdues),
   * bêtes du troupeau, ou part du travail d'invention accomplie ; `rank` : rang d'un filon.
   */
  | { type: 'rare'; event: EventKind; amount: number; rank?: Rank }
  /** L'hiver commence : la cueillette baisse jusqu'au printemps. */
  | { type: 'winter'; yieldFactor: number }
  /** Le joueur aperçoit pour la première fois un peuple voisin. */
  | { type: 'peopleMet'; name: string }
  /** Un peuple hostile a pillé la réserve (`stolen` rations ; `killed` : personnes perdues). */
  | { type: 'raid'; name: string; stolen: number; saved: number; killed: number }
  /** Un peuple déjà rencontré a disparu. */
  | { type: 'peopleGone'; name: string }
  /** La réserve était pleine : une part de la viande rapportée est perdue. */
  | { type: 'meatLost'; amount: number }
  /** Un succès est gagné (voir content/achievements). */
  | { type: 'achievement'; id: string; name: string }
  /** Une bande ne trouve plus de chemin connu vers sa destination : elle s'arrête. */
  | { type: 'bandGaveUp'; campId: number }

export interface Outcome {
  type: 'victory' | 'defeat'
  tick: number
  /** Score au moment de la fin. */
  score: number
}

export interface GameState {
  options: NewGameOptions
  world: World
  starts: StartSite[]
  clock: ClockState
  rng: Rng
  /** Aléa propre à l'errance de la faune, pour qu'elle ne dérange pas les autres tirages. */
  faunaRng: Rng
  /** Aléa des événements rares, à part lui aussi. */
  eventRng: Rng
  /** Peuples voisins, et l'aléa de leurs décisions. */
  peoples: People[]
  peopleRng: Rng
  camps: Camp[]
  fog: FogState
  territory: TerritoryState
  tribe: TribeState
  /** Gisements de ressources, tous connus du moteur ; la vue ne montre que les découverts. */
  deposits: Deposit[]
  /** Merveilles du monde (souvent aucune ou une ou deux) : fixées à la création. */
  wonders: Wonder[]
  /** Succès gagnés : identifiant → tick où il l'a été. */
  achievements: Record<string, number>
  /** Troupeaux de la faune, qui errent et que l'on chasse. */
  herds: Herd[]
  /** Abondance de chaque cellule (1 : intacte) : les bandes épuisent ce qu'elles cueillent. */
  abundance: Float32Array
  /** Cellules dont l'abondance n'est pas pleine (elles repoussent) : déduit de `abundance`. */
  depleted: number[]
  /** Cellules que tiennent les zones des bandes (rendues quand la bande s'en va). */
  bandCells: number[]
  inventions: InventionsState
  /** Fin de partie : victoire (on peut continuer) ou défaite (tout s'arrête). */
  outcome: Outcome | null
  nextId: number
  events: GameEvent[]
}

/** Nombre de départs proposés quand le placement n'est pas aléatoire. */
export const START_CHOICES = 3
const MAX_WORLD_RETRIES = 8

export function createGame(options: NewGameOptions): GameState {
  const { world, starts } = worldWithStarts(options)
  const rng = createRng(`partie:${world.seed}`)
  const site = options.randomStart
    ? rng.pick(starts)
    : (starts[clampIndex(options.startIndex, starts.length)] as StartSite)

  const state: GameState = {
    options,
    world,
    starts,
    clock: createClock(),
    rng,
    faunaRng: createRng(`errance:${world.seed}`),
    eventRng: createRng(`evenements:${world.seed}`),
    peoples: [],
    peopleRng: createRng(`peuples:${world.seed}`),
    camps: [],
    fog: createFog(world.width, world.height),
    territory: createTerritory(world.width, world.height, foodWeights(world)),
    tribe: createTribe(),
    deposits: placeDeposits(world, createRng(`ressources:${world.seed}`)),
    wonders: placeWonders(world, site, createRng(`merveilles:${world.seed}`)),
    achievements: {},
    herds: placeHerds(world, createRng(`faune:${world.seed}`)),
    abundance: createAbundance(world.width * world.height),
    depleted: [],
    bandCells: [],
    inventions: createInventions(),
    outcome: null,
    nextId: 1,
    events: [],
  }
  const cx = site.x + 0.5
  const cy = site.y + 0.5
  state.camps.push(newBand(state, cx, cy, state.tribe.population))
  refreshBands(state)
  const owner = state.territory.owner
  ensureNearStart(state.deposits, world, owner, PLAYER, site, createRng(`depart:${world.seed}`))
  ensureWithinReach(state.deposits, world, site, createRng(`metaux:${world.seed}`))
  placePeoples(state, site, options.peoples ?? PEOPLE_RULES.count)
  updateFog(state.fog, viewersOf(state))
  return state
}

/** Installe les peuples voisins sur des sites viables, loin du joueur et les uns des autres. */
function placePeoples(state: GameState, player: StartSite, count: number): void {
  if (count <= 0) return
  const sites = findStarts(state.world, createRng(`sites-peuples:${state.world.seed}`), count + 8)
  const taken: { x: number; y: number }[] = [player]
  for (const site of sites) {
    if (state.peoples.length >= count) break
    if (taken.some((t) => Math.hypot(t.x - site.x, t.y - site.y) < PEOPLE_RULES.spacing)) continue
    taken.push(site)
    const owner = PLAYER + 1 + state.peoples.length
    const tribe = createTribe()
    tribe.population = PEOPLE_RULES.startPopulation
    state.peoples.push({
      owner,
      name: PEOPLE_NAMES[state.peoples.length % PEOPLE_NAMES.length]!,
      tribe,
      met: false,
      relation: 0,
    })
    const camp: Camp = { id: state.nextId++, owner, x: site.x + 0.5, y: site.y + 0.5 }
    state.camps.push(camp)
    claimAround(state.territory, state.world, seatOf(camp), TRIBE_RULES.startTerritoryRadius)
  }
}

/** Chasseurs d'un campement : une personne sur `peoplePerHunter`. */
export function huntersIn(camp: Camp): number {
  return Math.floor((camp.members ?? 0) / HUNT_RULES.peoplePerHunter)
}

/** Chasseurs de toute la tribu : ils mangent sans cueillir, et défendent les camps. */
export function huntersOf(state: GameState): number {
  let hunters = 0
  for (const c of state.camps) if (c.owner === PLAYER) hunters += huntersIn(c)
  return hunters
}

/** Une bande du joueur, prête à marcher. */
function newBand(state: GameState, x: number, y: number, members: number): Camp {
  return {
    id: state.nextId++,
    owner: PLAYER,
    x,
    y,
    members,
    target: null,
    path: [],
    plannedFog: 0,
    patience: 0,
  }
}

/** Bandes du joueur : ses campements qui ne sont pas (encore) des villages. */
export function bandsOf(state: GameState): Camp[] {
  return state.camps.filter((c) => c.owner === PLAYER && !c.village)
}

/** La bande du joueur portant cet identifiant, ou undefined. */
function bandOf(state: GameState, campId: number): Camp | undefined {
  return bandsOf(state).find((c) => c.id === campId)
}

/** Efficacité de cueillette d'un campement : les villages ne souffrent pas de leur taille. */
export function campEfficiency(camp: Camp): number {
  return camp.village ? 1 : bandEfficiency(camp.members ?? 0)
}

/** Efficacité moyenne de la tribu, pondérée par les gens de chaque campement. */
export function tribeEfficiency(state: GameState): number {
  let people = 0
  let sum = 0
  for (const c of state.camps) {
    if (c.owner !== PLAYER) continue
    const m = c.members ?? 0
    people += m
    sum += m * campEfficiency(c)
  }
  return people > 0 ? sum / people : 1
}

/**
 * Accorde les gens des campements à la population de la tribu (naissances, morts, chasse,
 * événements la changent sans savoir où) : l'écart se répartit selon la taille de chacun.
 * Un campement vidé disparaît, sauf le dernier.
 */
export function syncMembers(state: GameState): void {
  const camps = state.camps.filter((c) => c.owner === PLAYER)
  if (camps.length === 0) return
  const total = Math.max(0, state.tribe.population)
  // Une part exacte qui ne colle plus aux gens (scission, ancienne partie) repart d'eux.
  const exact = camps.map((c) => {
    const m = c.members ?? 0
    return c.share !== undefined && Math.abs(c.share - m) < 1 ? c.share : m
  })
  const sum = exact.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - total) > 1e-9) {
    // L'écart se répartit selon la part exacte de chacun : un petit campement finit par
    // gagner ses naissances, au lieu de les voir toujours arrondies au profit du plus gros.
    const shares = exact.map((e) => (sum > 0 ? (e * total) / sum : total / camps.length))
    const floors = shares.map(Math.floor)
    let rest = total - floors.reduce((a, b) => a + b, 0)
    // Le reste va aux plus grosses parts tronquées, dans l'ordre des campements à égalité.
    const order = shares
      .map((v, i) => ({ i, frac: v - floors[i]! }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i)
    for (const { i } of order) {
      if (rest <= 0) break
      floors[i]!++
      rest--
    }
    camps.forEach((c, i) => {
      c.members = floors[i]!
      c.share = shares[i]!
    })
  } else camps.forEach((c, i) => (c.share = exact[i]!))
  const empty = camps.filter((c) => (c.members ?? 0) <= 0)
  if (empty.length > 0 && empty.length < camps.length)
    state.camps = state.camps.filter((c) => !empty.includes(c))
}

/** Les zones des bandes suivent leurs bandes. */
function refreshBands(state: GameState): void {
  state.bandCells = refreshZones(state.territory, state.world, bandsOf(state), state.bandCells)
}

/** Pourquoi cette bande ne peut pas se scinder maintenant, ou null. */
export function cannotSplit(state: GameState, camp: Camp | undefined): string | null {
  if (!camp || camp.owner !== PLAYER) return 'Aucune bande choisie'
  if (camp.village) return 'Un village ne se scinde pas'
  if ((camp.members ?? 0) < BAND_RULES.minSplit * 2)
    return `Il faut ${BAND_RULES.minSplit * 2} personnes dans la bande`
  return null
}

/**
 * Meilleur site connu où migrer depuis un point : parmi des points à quelques rayons de là,
 * celui dont les terres offrent le plus, loin des autres bandes. Il doit offrir plus que
 * `floor` (par défaut, ce qu'offrent les terres actuelles). null si aucun ne convient.
 */
function migrationSite(
  state: GameState,
  from: Camp,
  floor?: number,
): { x: number; y: number } | null {
  const weights = state.territory.weights
  if (!weights) return null
  const others = bandsOf(state).filter((c) => c !== from)
  const r = BAND_RULES.radius
  let best: { x: number; y: number } | null = null
  let bestOffer =
    floor ?? forageAround(state.world, weights, state.abundance, from.x, from.y, r).offered
  for (const rings of BAND_RULES.migrateDistances) {
    const distance = r * rings
    for (let k = 0; k < BAND_RULES.migrateDirections; k++) {
      const angle = (k / BAND_RULES.migrateDirections) * Math.PI * 2
      const x = Math.floor(from.x + Math.cos(angle) * distance) + 0.5
      const y = Math.floor(from.y + Math.sin(angle) * distance) + 0.5
      if (!inBounds(state.world, x, y) || !knownCell(state, x, y)) continue
      if (!knownPassable(state.world, state.fog, x, y)) continue
      if (crowdedBy(others, x, y)) continue
      const held = state.territory.owner[cellOf(state, x, y)]
      if (held !== NO_OWNER && held !== PLAYER) continue
      const { offered } = forageAround(state.world, weights, state.abundance, x, y, r)
      if (offered > bestOffer) {
        best = { x, y }
        bestOffer = offered
      }
    }
  }
  return best
}

/** Une autre bande est-elle (ou va-t-elle) trop près de ce point ? Deux bandes sur les mêmes terres s'affament l'une l'autre. */
function crowdedBy(others: readonly Camp[], x: number, y: number): boolean {
  const r = BAND_RULES.radius
  return others.some((o) => Math.hypot((o.target?.x ?? o.x) - x, (o.target?.y ?? o.y) - y) < 2 * r)
}

/**
 * Pourquoi une bande qui migre seule devrait partir, ou null : terres épuisées, terres qui
 * ne la nourrissent pas (même intactes mais pauvres), ou une autre bande collée à elle.
 */
function restless(state: GameState, band: Camp): 'épuisées' | 'pauvres' | 'serrées' | null {
  const weights = state.territory.weights
  if (!weights) return null
  const { mean, offered } = forageAround(
    state.world,
    weights,
    state.abundance,
    band.x,
    band.y,
    BAND_RULES.radius,
  )
  if (mean < BAND_RULES.exhausted) return 'épuisées'
  const others = bandsOf(state).filter((c) => c !== band)
  if (others.some((o) => Math.hypot(o.x - band.x, o.y - band.y) < BAND_RULES.radius))
    return 'serrées'
  const fed = offered * BAND_RULES.yieldPerCell * bandEfficiency(band.members ?? 0)
  if (fed < (band.members ?? 0) * TRIBE_RULES.rationPerPerson) return 'pauvres'
  return null
}

/** Envoie une bande vers un point par un chemin connu ; rend false s'il n'y en a pas. */
function orderBand(state: GameState, band: Camp, x: number, y: number): boolean {
  const route = findPath(state.world, state.fog, band, { x, y })
  if (!route) return false
  band.target = { x, y }
  band.path = route.points
  band.plannedFog = state.fog.version
  band.patience = route.cost * BAND_RULES.detour + BAND_RULES.detourSlack
  return true
}

/** Abondance moyenne des terres autour d'une bande (1 : intactes). */
export function bandAbundance(state: GameState, camp: Camp): number {
  const weights = state.territory.weights
  if (!weights) return 1
  return forageAround(state.world, weights, state.abundance, camp.x, camp.y, BAND_RULES.radius).mean
}

/** Villages que la population permet de tenir. */
export function maxVillages(state: GameState): number {
  return Math.floor(state.tribe.population / VILLAGE_RULES.peoplePerVillage)
}

/** Villages du joueur. */
export function villageCount(state: GameState): number {
  return state.camps.filter((c) => c.owner === PLAYER && c.village).length
}

/** Pourquoi la tribu ne peut pas bâtir de village (sur ce campement), ou null. */
export function cannotBuildVillage(state: GameState, campId?: number): string | null {
  if (!state.inventions.ranks.agriculture)
    return `Il faut d'abord : ${INVENTION_RULES.agriculture.name}`
  const camp = villageSite(state, campId)
  if (!camp)
    return campId === undefined
      ? 'Tous les campements sont déjà des villages'
      : 'Aucun campement choisi'
  if (villageCount(state) >= maxVillages(state))
    return `Un village pour ${VILLAGE_RULES.peoplePerVillage} habitants`
  if (state.tribe.food < VILLAGE_RULES.foodCost) return `Il faut ${VILLAGE_RULES.foodCost} rations`
  return null
}

/** Cités que la population permet de tenir. */
export function maxCities(state: GameState): number {
  return Math.floor(state.tribe.population / CITY_RULES.peoplePerCity)
}

/** Cités du joueur. */
export function cityCount(state: GameState): number {
  return state.camps.filter((c) => c.owner === PLAYER && c.city).length
}

/** Pourquoi la tribu ne peut pas bâtir de cité (sur ce village), ou null. */
export function cannotBuildCity(state: GameState, campId?: number): string | null {
  if (!state.inventions.ranks.ecriture) return `Il faut d'abord : ${INVENTION_RULES.ecriture.name}`
  const camp = citySite(state, campId)
  if (!camp)
    return campId === undefined ? 'Aucun village à changer en cité' : 'Aucun village choisi'
  if (cityCount(state) >= maxCities(state))
    return `Une cité pour ${CITY_RULES.peoplePerCity} habitants`
  if (state.tribe.food < CITY_RULES.foodCost) return `Il faut ${CITY_RULES.foodCost} rations`
  if ((state.tribe.materials.cuivre ?? 0) < CITY_RULES.copperCost)
    return `Il faut ${CITY_RULES.copperCost} cuivre`
  return null
}

/** Le village à changer en cité : celui demandé, ou le plus ancien qui ne l'est pas. */
function citySite(state: GameState, campId?: number): Camp | undefined {
  return state.camps.find(
    (c) => c.owner === PLAYER && c.village && !c.city && (campId === undefined || c.id === campId),
  )
}

/** Le campement à changer en village : celui demandé, ou le plus ancien qui ne l'est pas. */
function villageSite(state: GameState, campId?: number): Camp | undefined {
  return state.camps.find(
    (c) => c.owner === PLAYER && !c.village && (campId === undefined || c.id === campId),
  )
}

/** Cellule déjà découverte par le joueur. */
function knownCell(state: GameState, x: number, y: number): boolean {
  return state.fog.cells[Math.floor(y) * state.world.width + Math.floor(x)] !== Visibility.Unknown
}

/**
 * Génère le monde ; si une graine ne donne aucun départ viable (très rare),
 * on la dérive jusqu'à en trouver un. La graine retenue est celle du monde.
 */
function worldWithStarts(options: NewGameOptions): { world: World; starts: StartSite[] } {
  for (let attempt = 0; attempt < MAX_WORLD_RETRIES; attempt++) {
    const seed = attempt === 0 ? options.seed : `${options.seed}#${attempt}`
    const world = generateWorld({ seed, width: options.width, height: options.height })
    const count = options.randomStart ? 12 : START_CHOICES
    const starts = findStarts(world, createRng(`departs:${seed}`), count)
    if (starts.length > 0) return { world, starts }
  }
  throw new Error(`Aucun départ viable pour la graine « ${options.seed} »`)
}

/** Index de départ ramené dans la liste : négatif, trop grand ou non entier ne plantent pas. */
export function clampIndex(index: number | undefined, length: number): number {
  const n = Number.isFinite(index) ? Math.trunc(index as number) : 0
  return Math.min(Math.max(n, 0), length - 1)
}

export function applyCommand(state: GameState, command: Command): CommandResult {
  if (state.outcome?.type === 'defeat') return { ok: false, reason: 'La tribu a disparu' }
  switch (command.type) {
    case 'setSpeed':
      if (!isSpeed(command.speed)) return { ok: false, reason: 'Vitesse inconnue' }
      state.clock.speed = command.speed
      return { ok: true }
    case 'setPaused':
      state.clock.paused = command.paused
      return { ok: true }
    case 'togglePause':
      state.clock.paused = !state.clock.paused
      return { ok: true }
    case 'invent': {
      if (!INVENTION_KINDS.includes(command.invention))
        return { ok: false, reason: 'Invention inconnue' }
      const reason = cannotStart(state.inventions, command.invention, state.tribe.materials)
      if (reason) return { ok: false, reason }
      startInvention(state.inventions, command.invention, state.tribe.materials)
      return { ok: true }
    }
    case 'moveCamp': {
      const band = bandOf(state, command.campId)
      if (!band) return { ok: false, reason: 'Aucune bande choisie' }
      const { x, y } = command
      if (!Number.isFinite(x) || !Number.isFinite(y) || !inBounds(state.world, x, y))
        return { ok: false, reason: 'Destination hors du monde' }
      if (!knownPassable(state.world, state.fog, x, y))
        return { ok: false, reason: 'Destination infranchissable' }
      if (!orderBand(state, band, x, y)) {
        stopMover(band as Mover)
        return { ok: false, reason: 'Aucun chemin connu vers cette destination' }
      }
      return { ok: true }
    }
    case 'splitBand': {
      const band = bandOf(state, command.campId)
      syncMembers(state)
      const reason = cannotSplit(state, band)
      if (reason || !band) return { ok: false, reason: reason ?? 'Aucune bande choisie' }
      const leaving = Math.floor(band.members! / 2)
      band.members! -= leaving
      const side = isPassable(state.world, band.x + 1, band.y) ? 1 : 0
      const young = newBand(state, band.x + side, band.y, leaving)
      young.roaming = band.roaming
      state.camps.push(young)
      // La nouvelle bande part d'elle-même vers d'autres terres, si elle en connaît : même
      // moins riches, elles valent mieux que celles qu'elle partage avec sa mère.
      const site = migrationSite(state, young, 0)
      if (site) orderBand(state, young, site.x, site.y)
      refreshBands(state)
      return { ok: true }
    }
    case 'setRoaming': {
      const band = bandOf(state, command.campId)
      if (!band) return { ok: false, reason: 'Aucune bande choisie' }
      band.roaming = command.roaming
      return { ok: true }
    }
    case 'gift': {
      const people = state.peoples.find((p) => p.owner === command.people)
      const reason = cannotGift(state, people)
      if (reason || !people) return { ok: false, reason: reason ?? 'Peuple inconnu' }
      state.tribe.food -= RELATION_RULES.giftFood
      people.tribe.food += RELATION_RULES.giftFood
      people.lastDeal = state.clock.tick
      shiftRelation(people, RELATION_RULES.giftRelation)
      return { ok: true }
    }
    case 'trade': {
      const people = state.peoples.find((p) => p.owner === command.people)
      const reason = cannotTrade(state, people)
      if (reason || !people) return { ok: false, reason: reason ?? 'Peuple inconnu' }
      state.tribe.materials.silex = (state.tribe.materials.silex ?? 0) - RELATION_RULES.tradeSilex
      people.tribe.food -= RELATION_RULES.tradeFood
      state.tribe.food += RELATION_RULES.tradeFood
      people.lastDeal = state.clock.tick
      shiftRelation(people, RELATION_RULES.tradeRelation)
      return { ok: true }
    }
    case 'buildVillage': {
      const reason = cannotBuildVillage(state, command.campId)
      if (reason) return { ok: false, reason }
      state.tribe.food -= VILLAGE_RULES.foodCost
      const site = villageSite(state, command.campId)!
      // La bande s'installe : elle ne marche plus, et sa zone devient la terre du village.
      site.village = true
      site.roaming = false
      stopMover(site as Mover)
      const { width } = state.world
      const r = BAND_RULES.radius + 1
      state.bandCells = state.bandCells.filter(
        (i) => Math.hypot((i % width) + 0.5 - site.x, Math.floor(i / width) + 0.5 - site.y) > r,
      )
      refreshBands(state)
      return { ok: true }
    }
    case 'buildCity': {
      const reason = cannotBuildCity(state, command.campId)
      if (reason) return { ok: false, reason }
      state.tribe.food -= CITY_RULES.foodCost
      state.tribe.materials.cuivre = (state.tribe.materials.cuivre ?? 0) - CITY_RULES.copperCost
      citySite(state, command.campId)!.city = true
      return { ok: true }
    }
    default: {
      const unknown: never = command
      return { ok: false, reason: `Commande inconnue : ${JSON.stringify(unknown)}` }
    }
  }
}

/**
 * Joue un pas (une semaine) : les bandes et les bêtes bougent, le brouillard suit.
 * Au dernier pas du mois, l'économie tourne : chasse, territoire, récolte, voisins, inventions.
 */
export function advance(state: GameState): void {
  if (state.outcome?.type === 'defeat') return
  const pace = 1 + inventionMean(state.inventions, 'portage') / 100
  if (marchBands(state, pace)) refreshBands(state)
  for (const herd of state.herds) wander(herd, state.world, state.faunaRng)
  state.clock.step++
  if (state.clock.step >= STEPS_PER_MONTH) {
    state.clock.step = 0
    month(state)
  } else see(state)
}

/** Joue un mois entier (jusqu'au prochain changement de mois). */
export function step(state: GameState): void {
  for (let i = 0; i < STEPS_PER_MONTH; i++) {
    advance(state)
    if (state.clock.step === 0) return
  }
}

/** Les bandes en route avancent ; rend true si l'une a bougé (sa zone doit suivre). */
function marchBands(state: GameState, pace: number): boolean {
  const roads = 1 + inventionMean(state.inventions, 'routes') / 100
  let moved = false
  for (const band of bandsOf(state)) {
    if (!band.target) continue
    const mover = band as Mover
    // Sur ses propres terres, les routes (si on les a) font marcher plus vite.
    const home = state.territory.owner[cellOf(state, band.x, band.y)] === PLAYER
    const speed = BAND_RULES.speed * (home ? pace * roads : pace)
    if (!moveAlong(mover, state.world, speed)) replanBand(state, band)
    moved = true
  }
  return moved
}

/**
 * Recalcule le chemin d'une bande sur la carte connue. Elle s'arrête si plus aucun chemin
 * connu n'y mène, ou si le détour dépasse sa patience (elle n'erre pas tout un continent).
 */
function replanBand(state: GameState, band: Camp): void {
  const route =
    band.target &&
    findPath(state.world, state.fog, band, band.target, Math.max(0, band.patience ?? 0))
  if (!route) {
    state.events.push({ type: 'bandGaveUp', campId: band.id })
    stopMover(band as Mover)
    return
  }
  band.path = route.points
  band.plannedFog = state.fog.version
}

/**
 * Les bandes qui migrent seules partent quand leurs terres s'épuisent ou ne les nourrissent
 * pas, vers de meilleures ; une bande collée à une autre part vers n'importe quelles terres libres.
 * Si elle ne connaît rien de mieux, elle part vers l'inconnu le plus proche, pour le découvrir.
 */
function roam(state: GameState): void {
  for (const band of bandsOf(state)) {
    if (!band.roaming || band.target) continue
    const why = restless(state, band)
    if (!why) continue
    const site =
      migrationSite(state, band, why === 'serrées' ? 0 : undefined) ??
      frontierTarget(state.world, state.fog, band)
    if (site) orderBand(state, band, site.x, site.y)
  }
}

function month(state: GameState): void {
  state.clock.tick++
  hunt(state)
  // Le joueur et les peuples poussent chacun avec leur aléa : tant qu'ils ne se touchent pas,
  // la présence des voisins ne change rien au territoire du joueur. Seuls les villages du
  // joueur étendent ses terres : une bande n'a que sa zone, qui la suit.
  const seats = seatsOf(state)
  const mine = seats.filter((s, i) => s.owner === PLAYER && state.camps[i]!.village)
  const theirs = seats.filter((s) => s.owner !== PLAYER)
  growTerritory(state.territory, state.world, mine, state.rng, CAMP_RULES.growthPerTick)
  growTerritory(state.territory, state.world, theirs, state.peopleRng, CAMP_RULES.growthPerTick)
  harvest(state)
  for (const people of state.peoples) livePeople(state, people)
  fortune(state)
  syncMembers(state)
  roam(state)
  const invented = tickInventions(
    state.inventions,
    state.tribe.population,
    state.rng,
    inventionBoost(state),
  )
  if (invented)
    state.events.push({ type: 'invented', invention: invented.kind, rank: invented.rank })
  see(state)
  meetPeoples(state)
  reward(state)
  judge(state)
}

/** Met le brouillard à jour ; le terrain découvert peut couper un chemin prévu. */
function see(state: GameState): void {
  updateFog(state.fog, viewersOf(state))
  for (const band of bandsOf(state)) {
    if (!band.target || band.plannedFog === state.fog.version) continue
    band.plannedFog = state.fog.version
    if (pathBlocked(state.world, state.fog, band, band.path ?? [])) replanBand(state, band)
  }
}

/** L'hôte appelle ceci après avoir transmis les zones modifiées. */
export function clearDirty(state: GameState): void {
  state.fog.dirty = null
  state.territory.dirty = null
  state.events = []
}

export function startYear(): number {
  return FIRST_ERA.startYear
}

/** Ce qui voit pour la tribu : ses campements seuls, bandes et villages. */
function viewersOf(state: GameState) {
  const sight = bandSight(state.inventions)
  return state.camps.filter((c) => c.owner === PLAYER).map((c) => ({ x: c.x, y: c.y, sight }))
}

function seatsOf(state: GameState): Seat[] {
  return state.camps.map(seatOf)
}

function seatOf(camp: Camp): Seat {
  const reach =
    CAMP_RULES.reach +
    (camp.village ? VILLAGE_RULES.reachBonus : 0) +
    (camp.city ? CITY_RULES.reachBonus : 0)
  return { owner: camp.owner, x: camp.x, y: camp.y, reach }
}

/** Richesse en nourriture de chaque cellule, d'après son biome. */
function foodWeights(world: World): Float32Array {
  const weights = new Float32Array(world.biome.length)
  for (let i = 0; i < weights.length; i++) {
    const food = BIOMES[world.biome[i] as BiomeId].food
    weights[i] = world.river[i] ? food + RIVER_RULES.food : food
  }
  return weights
}

/** Un mois de récolte : le territoire et ses gisements nourrissent la tribu et la fournissent. */
function harvest(state: GameState): void {
  const { owner, width, height } = state.territory
  const { tribe } = state
  let depositFood = 0
  for (const d of state.deposits) {
    if (!heldBy(owner, width, height, d, PLAYER) || !resourceKnown(state, d.kind)) continue
    const amount = depositYield(d) * (1 + depositBonus(state, d.kind))
    if (RESOURCE_RULES[d.kind].category === 'food') depositFood += amount
    else if (tribe.population > 0) tribe.materials[d.kind] = (tribe.materials[d.kind] ?? 0) + amount
  }
  const month = state.clock.tick % 12
  const amplitude = climateOf(state)
  const season = seasonalYield(month, amplitude)
  if (seasonStarting(month) === 'hiver')
    state.events.push({ type: 'winter', yieldFactor: seasonalYield(month, amplitude) })
  // Les terres cueillies sont celles du joueur, épuisées ou non : une bande qui reste
  // sur place voit sa cueillette fondre, et doit migrer.
  const cells = playerCells(state.territory)
  const forage = forageOf(cells, state.territory.weights, state.abundance) * BAND_RULES.yieldPerCell
  const available = (forage + depositFood) * season
  const basket = inventionStat(state.inventions, 'panier')
  const inv = state.inventions
  const bonus = {
    // Panier (tiré chaque mois) et outils de bronze s'ajoutent.
    gather:
      (basket ? Math.max(0, rollStat(basket, state.rng)) / 100 : 0) +
      inventionMean(inv, 'bronze') / 100,
    storageMonths: storageBonus(state),
    growth: inventionMean(inv, 'feu') / 100 + wonderEffect(state, 'growth'),
    famineShield: -inventionMean(inv, 'peaux') / 100,
    efficiency: tribeEfficiency(state),
  }
  const hunters = huntersOf(state)
  // Les moissons rentrent avant le repas du mois ; la réserve les borne comme le reste.
  const crops = tribe.population > 0 ? cropsOf(state, month) : 0
  tribe.food += crops
  tribe.lastCrops = crops
  if (tickTribe(tribe, available, bonus, hunters) === 'famineStarts')
    state.events.push({ type: 'famine' })
  // Part de ce qu'offraient les terres qui a été cueillie : c'est elle qui les épuise.
  const gathered = tribe.lastProduction / (1 + bonus.gather)
  const share = available > 0 ? gathered / available : 0
  exploit(cells, state.abundance, state.depleted, share, season)
  // La réserve se gâte, surtout l'été ; la conservation (fumage) en sauve une part.
  const spoiled = tribe.food * spoilage(month, TRIBE_RULES.storageMonths, bonus.storageMonths)
  tribe.food -= spoiled
  tribe.lastSpoiled = spoiled
}

/**
 * Amplitude des saisons pour la tribu : climat moyen de ses campements.
 * Une tribu des terres froides a des hivers plus durs qu'une tribu des tropiques.
 */
export function climateOf(state: GameState): number {
  const camps = state.camps.filter((c) => c.owner === PLAYER)
  if (camps.length === 0) return climateAmplitude(0.5)
  let sum = 0
  for (const c of camps) {
    const i = Math.floor(c.y) * state.world.width + Math.floor(c.x)
    sum += state.world.temperature[i]!
  }
  return climateAmplitude(sum / camps.length)
}

/** Pourquoi le joueur ne peut pas faire de présent à ce peuple, ou null. */
export function cannotGift(state: GameState, people: People | undefined): string | null {
  if (!people || !people.met || people.tribe.population <= 0) return 'Peuple inconnu'
  if (dealTooSoon(state, people)) return 'Un seul présent ou échange par mois'
  if (state.tribe.food < RELATION_RULES.giftFood)
    return `Il faut ${RELATION_RULES.giftFood} rations`
  return null
}

/** Pourquoi le joueur ne peut pas échanger avec ce peuple, ou null. */
export function cannotTrade(state: GameState, people: People | undefined): string | null {
  if (!people || !people.met || people.tribe.population <= 0) return 'Peuple inconnu'
  if (people.relation < RELATION_RULES.tradeMinRelation)
    return 'Ils ne vous font pas assez confiance'
  if (dealTooSoon(state, people)) return 'Un seul présent ou échange par mois'
  if ((state.tribe.materials.silex ?? 0) < RELATION_RULES.tradeSilex)
    return `Il faut ${RELATION_RULES.tradeSilex} silex`
  const keep =
    people.tribe.population * TRIBE_RULES.rationPerPerson * RELATION_RULES.tradeReserveMonths
  if (people.tribe.food - RELATION_RULES.tradeFood < keep) return 'Leurs réserves sont trop maigres'
  // Sans place pour leurs vivres, l'échange payerait du silex pour rien.
  if (foodCapacity(state) - state.tribe.food < RELATION_RULES.tradeFood)
    return 'Vos réserves sont pleines'
  return null
}

function dealTooSoon(state: GameState, people: People): boolean {
  return (
    people.lastDeal !== undefined && state.clock.tick - people.lastDeal < RELATION_RULES.dealMonths
  )
}

function shiftRelation(people: People, delta: number): void {
  people.relation = Math.max(
    RELATION_RULES.min,
    Math.min(RELATION_RULES.max, people.relation + delta),
  )
}

/** Paires de campements (les leurs, les nôtres) assez proches pour créer des tensions. */
export function closeCamps(state: GameState, owner: number): number {
  const theirs = state.camps.filter((c) => c.owner === owner)
  const mine = state.camps.filter((c) => c.owner === PLAYER)
  let pairs = 0
  for (const a of theirs)
    for (const b of mine)
      if (Math.hypot(a.x - b.x, a.y - b.y) < RELATION_RULES.tensionDistance) pairs++
  return pairs
}

/**
 * Raid d'un peuple hostile : il emporte des vivres, d'autant plus qu'il est nombreux ; les
 * chasseurs des campements en sauvent une part. Une réserve vide coûte une vie à la place.
 */
export function raid(state: GameState, people: People): void {
  if (state.peopleRng.next() >= RELATION_RULES.raidChance) return
  const { tribe } = state
  const hunters = huntersOf(state)
  const defense = Math.min(RELATION_RULES.maxDefense, hunters * RELATION_RULES.defensePerHunter)
  const wanted = Math.min(
    people.tribe.population * RELATION_RULES.raidFoodPerPerson,
    tribe.food * RELATION_RULES.raidMaxShare,
  )
  const stolen = Math.floor(wanted * (1 - defense))
  const saved = Math.floor(wanted) - stolen
  let killed = 0
  if (stolen > 0) {
    tribe.food -= stolen
    people.tribe.food += stolen
  } else if (tribe.food < 1 && tribe.population > 1 && state.peopleRng.next() >= defense) {
    // Réserve vraiment vide : ils prennent une vie, à moins que les chasseurs ne les arrêtent.
    // Une petite réserve que la défense protège entièrement ne coûte rien.
    killed = 1
    tribe.population -= 1
  }
  shiftRelation(people, RELATION_RULES.raidRelief)
  state.events.push({ type: 'raid', name: people.name, stolen, saved, killed })
}

/** Humeur d'un peuple envers le joueur, d'après sa relation. */
export function moodOf(relation: number): string {
  return MOODS.find((m) => relation >= m.from)!.name
}

/**
 * Un mois de vie d'un peuple voisin : il cueille sur ses terres au fil des saisons, puis
 * fonde un campement quand sa population le permet. Disparu, il laisse ses terres vides.
 */
function livePeople(state: GameState, people: People): void {
  const { tribe, owner } = people
  if (tribe.population <= 0) return
  // Négligée, la relation revient vers la neutralité.
  const drift = RELATION_RULES.driftPerMonth
  people.relation =
    people.relation > 0
      ? Math.max(0, people.relation - drift)
      : Math.min(0, people.relation + drift)
  // Avant la rencontre, les campements voisins s'ignorent : pas de rancune accumulée.
  if (people.met) shiftRelation(people, -RELATION_RULES.tensionPerMonth * closeCamps(state, owner))
  if (people.met && people.relation <= RELATION_RULES.raidBelow) raid(state, people)
  const camps = state.camps.filter((c) => c.owner === owner)
  const month = state.clock.tick % 12
  const home = camps[0]
  const t = home
    ? state.world.temperature[Math.floor(home.y) * state.world.width + Math.floor(home.x)]!
    : 0.5
  const season = seasonalYield(month, climateAmplitude(t))
  const available = territoryFood(state.territory.ownerWeight[owner] ?? 0) * season
  tickTribe(tribe, available)
  if (tribe.population <= 0) {
    state.camps = state.camps.filter((c) => c.owner !== owner)
    // Ses terres redeviennent libres : d'autres pourront s'y étendre.
    const { width } = state.world
    state.territory.owner.forEach((o, i) => {
      if (o === owner) claim(state.territory, i % width, Math.floor(i / width), NO_OWNER)
    })
    if (people.met) state.events.push({ type: 'peopleGone', name: people.name })
    return
  }
  const allowed = Math.min(
    PEOPLE_RULES.maxCamps,
    1 + Math.floor(tribe.population / PEOPLE_RULES.peoplePerCamp),
  )
  if (camps.length === 0 || camps.length >= allowed || tribe.food < PEOPLE_RULES.campCost) return
  const rng = state.peopleRng
  const { min, max } = PEOPLE_RULES.campDistance
  for (let attempt = 0; attempt < PEOPLE_RULES.campAttempts; attempt++) {
    const from = rng.pick(camps)
    const angle = rng.range(0, Math.PI * 2)
    const dist = rng.range(min, max)
    const cx = Math.floor(from.x + Math.cos(angle) * dist)
    const cy = Math.floor(from.y + Math.sin(angle) * dist)
    if (!inBounds(state.world, cx, cy) || !isPassable(state.world, cx + 0.5, cy + 0.5)) continue
    const held = state.territory.owner[cy * state.world.width + cx]!
    if (held !== NO_OWNER && held !== owner) continue
    const x = cx + 0.5
    const y = cy + 0.5
    if (state.camps.some((c) => Math.hypot(c.x - x, c.y - y) < CAMP_RULES.minDistance)) continue
    tribe.food -= PEOPLE_RULES.campCost
    const camp: Camp = { id: state.nextId++, owner, x, y }
    state.camps.push(camp)
    claimAround(state.territory, state.world, seatOf(camp), CAMP_RULES.claimRadius)
    return
  }
}

/**
 * Le joueur rencontre un peuple dès qu'une de ses terres est en vue : on ne regarde que
 * dans le champ de vision des observateurs, quelques centaines de cellules.
 */
function meetPeoples(state: GameState): void {
  if (!state.peoples.some((p) => !p.met)) return
  const { width, height } = state.world
  const { owner } = state.territory
  for (const v of viewersOf(state)) {
    const r = Math.ceil(v.sight)
    for (let y = Math.max(0, Math.floor(v.y) - r); y <= Math.min(height - 1, v.y + r); y++) {
      for (let x = Math.max(0, Math.floor(v.x) - r); x <= Math.min(width - 1, v.x + r); x++) {
        const o = owner[y * width + x]!
        if (o <= PLAYER || (x + 0.5 - v.x) ** 2 + (y + 0.5 - v.y) ** 2 > v.sight * v.sight) continue
        const people = state.peoples.find((p) => p.owner === o)
        if (!people || people.met) continue
        people.met = true
        state.events.push({ type: 'peopleMet', name: people.name })
      }
    }
  }
}

/** Le sort du mois : au plus un événement rare, appliqué tout de suite. */
function fortune(state: GameState): void {
  const { tribe } = state
  if (tribe.population <= 0 || state.options.rareEvents === false) return
  const tick = state.clock.tick
  const kind = pickEvent(
    { month: tick % 12, years: tick / 12, researching: state.inventions.current !== null },
    state.eventRng,
  )
  if (!kind) return
  const rules = EVENT_RULES[kind]
  const camp = state.camps.find((c) => c.owner === PLAYER)
  let amount = 0
  let rank: Rank | undefined
  if (rules.food !== undefined) {
    const before = tribe.food
    const gain = rules.food > 0 ? rules.food * foodCapacity(state) : rules.food * tribe.food
    tribe.food = Math.min(foodCapacity(state), Math.max(0, tribe.food + gain))
    amount = Math.round(tribe.food - before)
    // Réserve déjà pleine (abondance) ou vide (tempête) : rien à annoncer.
    if (amount === 0) return
  } else if (rules.population !== undefined) {
    const sign = Math.sign(rules.population)
    amount = sign * Math.max(1, Math.round(Math.abs(rules.population) * tribe.population))
    // Une maladie n'emporte jamais toute la tribu : la famine s'en charge déjà bien assez.
    amount = Math.max(amount, 1 - tribe.population)
    if (amount === 0) return
    tribe.population += amount
  } else if (rules.herd && camp) {
    const herd = arrivingHerd(state, camp, rules.herd.kind, rules.herd.sizeFactor)
    if (!herd) return
    state.herds.push(herd)
    amount = herd.size
  } else if (rules.deposit) {
    const spot = heldSpot(state)
    if (!spot) return
    rank = bestRank(rollRank(state.eventRng), rules.deposit.minRank)
    const id = state.deposits.reduce((m, d) => Math.max(m, d.id), 0) + 1
    state.deposits.push({ id, kind: rules.deposit.kind, ...spot, rank })
  } else if (rules.invention !== undefined && state.inventions.current) {
    const current = state.inventions.current
    current.progress = Math.min(current.work, current.progress + rules.invention * current.work)
    amount = rules.invention
  } else return
  state.events.push({ type: 'rare', event: kind, amount, ...(rank ? { rank } : {}) })
}

/** Un troupeau arrive sur la terre ferme, à quelques jours de marche du camp. */
function arrivingHerd(
  state: GameState,
  camp: Camp,
  kind: AnimalKind,
  sizeFactor: number,
): Herd | null {
  const { min, max } = EVENT_RULES_GLOBAL.herdDistance
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = state.eventRng.range(0, Math.PI * 2)
    const dist = state.eventRng.range(min, max)
    const x = Math.floor(camp.x + Math.cos(angle) * dist) + 0.5
    const y = Math.floor(camp.y + Math.sin(angle) * dist) + 0.5
    if (!inBounds(state.world, Math.floor(x), Math.floor(y))) continue
    if (!isPassable(state.world, Math.floor(x), Math.floor(y))) continue
    const size = Math.round(ANIMAL_RULES[kind].herdSize * sizeFactor)
    // Les troupeaux ont leur propre suite d'identifiants (voir placeHerds).
    const id = state.herds.reduce((m, h) => Math.max(m, h.id), 0) + 1
    return { id, kind, x, y, size, goal: { x, y } }
  }
  return null
}

/** Une cellule du territoire du joueur sans gisement, tirée au sort. */
function heldSpot(state: GameState): { x: number; y: number } | null {
  const { owner, width } = state.territory
  const taken = new Set(state.deposits.map((d) => d.y * width + d.x))
  const spots: number[] = []
  for (let i = 0; i < owner.length; i++) if (owner[i] === PLAYER && !taken.has(i)) spots.push(i)
  if (spots.length === 0) return null
  const i = state.eventRng.pick(spots)
  return { x: i % width, y: Math.floor(i / width) }
}

/** Rendement en plus d'un gisement, selon les inventions (0,2 = +20 %). */
function depositBonus(state: GameState, kind: ResourceKind): number {
  if (kind === 'silex') return inventionMean(state.inventions, 'taille') / 100
  if (kind === 'poisson') return inventionMean(state.inventions, 'harpon') / 100
  const revealer = revealerOf(kind)
  if (revealer) return inventionMean(state.inventions, revealer) / 100
  return 0
}

/**
 * La tribu sait-elle reconnaître cette ressource ? Sinon ses gisements restent invisibles
 * et inexploités (le cuivre avant la métallurgie).
 */
export function resourceKnown(state: GameState, kind: ResourceKind): boolean {
  const by = revealerOf(kind)
  return by === undefined || state.inventions.ranks[by] !== undefined
}

/** Mois de réserve en plus : conservation (fumage), greniers des villages et des cités. */
function storageBonus(state: GameState): number {
  return (
    inventionMean(state.inventions, 'fumage') +
    villageCount(state) * VILLAGE_RULES.storageMonths +
    cityCount(state) * CITY_RULES.storageMonths +
    wonderEffect(state, 'storageMonths')
  )
}

/** La merveille est-elle sur les terres du joueur ? */
export function wonderHeld(state: GameState, wonder: Wonder): boolean {
  return state.territory.owner[wonder.y * state.world.width + wonder.x] === PLAYER
}

/** Somme d'un effet sur les merveilles que tient le joueur. */
function wonderEffect(state: GameState, effect: 'work' | 'growth' | 'storageMonths'): number {
  let sum = 0
  for (const w of state.wonders)
    if (wonderHeld(state, w)) sum += WONDER_RULES[w.kind].effect[effect] ?? 0
  return sum
}

/** Travail d'invention en plus (0,2 = +20 %) : écriture et scribes des cités. */
export function inventionBoost(state: GameState): number {
  return (
    inventionMean(state.inventions, 'ecriture') / 100 +
    cityCount(state) * CITY_RULES.workBonus +
    wonderEffect(state, 'work')
  )
}

/** Indice de la cellule sous un point du monde, borné à la carte. */
function cellOf(state: GameState, x: number, y: number): number {
  const { width, height } = state.world
  const cx = Math.min(width - 1, Math.max(0, Math.floor(x)))
  const cy = Math.min(height - 1, Math.max(0, Math.floor(y)))
  return cy * width + cx
}

/**
 * Récolte des champs du mois : chaque terre tenue près d'un village donne selon sa
 * fertilité, aux seuls mois de moisson. Une terre entre deux villages ne compte qu'une fois.
 */
export function cropsOf(state: GameState, month: number): number {
  if (!VILLAGE_RULES.harvestMonths.includes(month)) return 0
  const villages = state.camps.filter((c) => c.owner === PLAYER && c.village)
  if (villages.length === 0) return 0
  const { world } = state
  const { owner } = state.territory
  const r = VILLAGE_RULES.fieldRadius
  const counted = new Set<number>()
  let fertility = 0
  for (const v of villages) {
    for (let y = Math.max(0, Math.floor(v.y - r)); y <= Math.min(world.height - 1, v.y + r); y++) {
      for (let x = Math.max(0, Math.floor(v.x - r)); x <= Math.min(world.width - 1, v.x + r); x++) {
        const i = y * world.width + x
        if (owner[i] !== PLAYER || counted.has(i)) continue
        if (Math.hypot(x + 0.5 - v.x, y + 0.5 - v.y) > r) continue
        counted.add(i)
        const base = FERTILITY[world.biome[i] as BiomeId]
        if (base > 0) fertility += base + (world.river[i] ? VILLAGE_RULES.riverFertility : 0)
      }
    }
  }
  const skill = inventionMean(state.inventions, 'agriculture') / 100
  const tools = inventionMean(state.inventions, 'bronze') / 100
  return fertility * VILLAGE_RULES.cropPerCell * (1 + skill) * (1 + tools)
}

/** Réserve maximale de la tribu, conservation comprise. */
export function foodCapacity(state: GameState): number {
  const extra = storageBonus(state)
  return storageCapacity(state.tribe.population, extra)
}

/** Le gisement est-il exploité par le joueur ? */
export function depositHeld(state: GameState, deposit: Deposit): boolean {
  const { owner, width, height } = state.territory
  return heldBy(owner, width, height, deposit, PLAYER)
}

/**
 * Chaque campement chasse seul : ses chasseurs tentent chacun leur chance sur le plus proche
 * des troupeaux qu'il voit (pas les plus dangereux). Réserve pleine, ils ne risquent pas leur vie.
 */
function hunt(state: GameState): void {
  const { world, rng, faunaRng, tribe } = state
  for (const camp of state.camps) {
    if (camp.owner !== PLAYER) continue
    for (let i = huntersIn(camp); i > 0 && tribe.population > 0; i--) {
      const capacity = foodCapacity(state)
      if (tribe.food >= capacity) break
      const prey = herdsSeenBy(state, camp).find(safePrey)
      if (!prey) break
      const rules = ANIMAL_RULES[prey.kind]
      // Le propulseur éloigne le chasseur de la bête : le danger baisse.
      const thrower = inventionStat(state.inventions, 'propulseur')
      const safety = thrower ? Math.min(1, Math.max(0, -rollStat(thrower, rng) / 100)) : 0
      if (rng.next() < rules.danger * (1 - safety)) {
        tribe.population = Math.max(0, tribe.population - 1)
        state.events.push({ type: 'hunterKilled', animal: prey.kind })
        continue
      }
      // Dégâts de l'arme du moment, rapportés à ceux des mains nues.
      const weapon = inventionStat(state.inventions, 'lance') ?? INVENTION_WORK.bareDamage
      const power = Math.max(0, rollStat(weapon, rng)) / INVENTION_WORK.bareDamage.mean
      if (rng.next() < rules.catchChance * power) {
        prey.size--
        const lost = Math.floor(tribe.food + rules.meat - capacity)
        tribe.food = Math.min(tribe.food + rules.meat, capacity)
        if (lost >= 1) state.events.push({ type: 'meatLost', amount: lost })
        flee(prey, world, faunaRng, camp, HUNT_RULES.fleeDistance)
      }
    }
  }
  state.herds = state.herds.filter((h) => h.size > 0)
  for (const herd of state.herds) regrow(herd, faunaRng)
}

/** Le joueur voit-il ce troupeau en ce moment ? */
export function herdVisible(state: GameState, herd: Herd): boolean {
  const i = Math.floor(herd.y) * state.world.width + Math.floor(herd.x)
  return state.fog.cells[i] === Visibility.Visible
}

/** Ce que l'on compte de la partie pour l'objectif et le score. */
export function tallyOf(state: GameState): Tally {
  const ranks = Object.values(state.inventions.ranks).filter((r): r is Rank => r !== undefined)
  return {
    population: state.tribe.population,
    territoryCells: territoryOf(state),
    camps: state.camps.filter((c) => c.owner === PLAYER).length,
    inventions: ranks,
    years: state.clock.tick / 12,
  }
}

function territoryOf(state: GameState): number {
  return state.territory.ownerCells[PLAYER] ?? 0
}

/** Score courant ; après une victoire, il garde le bonus gagné ce jour-là. */
export function currentScore(state: GameState): number {
  const won = state.outcome?.type === 'victory' ? state.outcome.tick / 12 : null
  return scoreOf(tallyOf(state), won) + wonderScore(state)
}

/** Points des merveilles tenues. */
function wonderScore(state: GameState): number {
  return state.wonders.filter((w) => wonderHeld(state, w)).length * WONDER_PLACEMENT.score
}

/** Ce que mesurent les succès, relevé sur la partie. */
export function achievementFacts(state: GameState): AchievementFacts {
  const met = state.peoples.filter((p) => p.met)
  return {
    camps: state.camps.filter((c) => c.owner === PLAYER).length,
    villages: villageCount(state),
    cities: cityCount(state),
    population: state.tribe.population,
    peoplesMet: met.length,
    // La meilleure humeur (alliée), d'après les données.
    allies: met.filter((p) => p.relation >= MOODS[0]!.from).length,
    rankS: Object.values(state.inventions.ranks).filter((r) => r === 'S').length,
    wonders: state.wonders.filter((w) => wonderHeld(state, w)).length,
    inventions: Object.keys(state.inventions.ranks).length,
  }
}

/** Annonce les succès gagnés ce mois-ci. */
function reward(state: GameState): void {
  for (const id of unlockAchievements(
    state.achievements,
    achievementFacts(state),
    state.clock.tick,
  ))
    state.events.push({
      type: 'achievement',
      id,
      name: ACHIEVEMENTS.find((a) => a.id === id)!.name,
    })
}

/** Défaite si la tribu a disparu, victoire la première fois que l'objectif de l'ère est atteint. */
function judge(state: GameState): void {
  if (state.outcome?.type === 'defeat') return
  if (state.tribe.population <= 0) {
    state.outcome = { type: 'defeat', tick: state.clock.tick, score: currentScore(state) }
    state.clock.paused = true
    state.events.push({ type: 'defeat' })
    return
  }
  if (state.outcome) return
  if (goalReached(FIRST_ERA.goal, tallyOf(state))) {
    const tick = state.clock.tick
    state.outcome = {
      type: 'victory',
      tick,
      score: scoreOf(tallyOf(state), tick / 12) + wonderScore(state),
    }
    state.clock.paused = true
    state.events.push({ type: 'victory' })
  }
}
