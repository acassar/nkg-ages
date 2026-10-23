import type { Command, CommandResult } from './commands'
import { FIRST_ERA } from './content/eras'
import { goalReached, scoreOf, type Tally } from './score/score'
import { createClock, isSpeed, type ClockState } from './core/clock'
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
import { CAMP_RULES } from './content/camps'
import { PEOPLE_NAMES, PEOPLE_RULES } from './content/peoples'
import { MOODS, RELATION_RULES } from './content/relations'
import { FERTILITY, VILLAGE_RULES } from './content/villages'
import { RIVER_RULES } from './content/rivers'
import { ANIMAL_RULES, HUNT_RULES, type AnimalKind } from './content/fauna'
import {
  INVENTION_KINDS,
  INVENTION_RULES,
  INVENTION_WORK,
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
import { isPassable, moveUnit, stopUnit, UNIT_RULES, type Unit } from './units/units'
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
}

export interface Camp {
  id: number
  owner: number
  x: number
  y: number
  /** Devenu village : il porte plus loin, stocke plus et cultive ses champs. */
  village?: boolean
}

/** Ce qui est arrivé pendant les ticks, pour prévenir le joueur ; vidé à chaque envoi. */
export type GameEvent =
  | { type: 'unitGaveUp'; unitId: number }
  /** La réserve est vide : la tribu commence à perdre des siens. */
  | { type: 'famine' }
  /** Un chasseur est mort à la chasse. */
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
  /** Un peuple déjà rencontré a disparu. */
  | { type: 'peopleGone'; name: string }
  /** La réserve était pleine : une part de la viande rapportée est perdue. */
  | { type: 'meatLost'; amount: number }

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
  units: Unit[]
  camps: Camp[]
  fog: FogState
  territory: TerritoryState
  tribe: TribeState
  /** Gisements de ressources, tous connus du moteur ; la vue ne montre que les découverts. */
  deposits: Deposit[]
  /** Troupeaux de la faune, qui errent et que l'on chasse. */
  herds: Herd[]
  inventions: InventionsState
  /** Fin de partie : victoire (on peut continuer) ou défaite (tout s'arrête). */
  outcome: Outcome | null
  nextId: number
  events: GameEvent[]
}

/** Nombre de départs proposés quand le placement n'est pas aléatoire. */
export const START_CHOICES = 3
/** Chasseurs au départ (ils font partie de la population). */
const START_HUNTERS = 2
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
    units: [],
    camps: [],
    fog: createFog(world.width, world.height),
    territory: createTerritory(world.width, world.height, foodWeights(world)),
    tribe: createTribe(),
    deposits: placeDeposits(world, createRng(`ressources:${world.seed}`)),
    herds: placeHerds(world, createRng(`faune:${world.seed}`)),
    inventions: createInventions(),
    outcome: null,
    nextId: 1,
    events: [],
  }
  const cx = site.x + 0.5
  const cy = site.y + 0.5
  state.camps.push({ id: state.nextId++, owner: PLAYER, x: cx, y: cy })
  claimAround(state.territory, world, seatsOf(state)[0]!, TRIBE_RULES.startTerritoryRadius)
  const owner = state.territory.owner
  ensureNearStart(state.deposits, world, owner, PLAYER, site, createRng(`depart:${world.seed}`))
  state.units.push(newUnit(state, 'eclaireur', cx, cy))
  for (let i = 0; i < START_HUNTERS; i++) state.units.push(newHunter(state, i))
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

function newUnit(state: GameState, kind: Unit['kind'], x: number, y: number): Unit {
  return {
    id: state.nextId++,
    kind,
    x,
    y,
    target: null,
    path: [],
    plannedFog: 0,
    patience: 0,
    auto: false,
  }
}

/** Un chasseur se tient à côté du camp, sur la terre ferme, pour rester distinct des autres. */
function newHunter(state: GameState, index: number): Unit {
  const camp = state.camps.find((c) => c.owner === PLAYER)!
  const side = index % 2 === 0 ? 1 : -1
  const dx = isPassable(state.world, camp.x + side, camp.y) ? side : 0
  return newUnit(state, 'chasseur', camp.x + dx, camp.y)
}

/** Chasseurs que la tribu peut entretenir : un pour `peoplePerHunter` habitants. */
export function maxHunters(state: GameState): number {
  return Math.floor(state.tribe.population / HUNT_RULES.peoplePerHunter)
}

/** Réserve pleine : les chasseurs ne risquent pas leur vie et se reposent. */
export function huntersResting(state: GameState): boolean {
  return state.tribe.food >= foodCapacity(state)
}

/** Pourquoi on ne peut pas former de chasseur maintenant, ou null si on le peut. */
export function cannotRecruit(state: GameState): string | null {
  const hunters = state.units.filter((u) => u.kind === 'chasseur').length
  if (hunters >= maxHunters(state))
    return `Un chasseur pour ${HUNT_RULES.peoplePerHunter} habitants au plus`
  if (state.tribe.food < HUNT_RULES.recruitFood) return `Il faut ${HUNT_RULES.recruitFood} rations`
  return null
}

/** Campements que la tribu peut tenir : un de plus pour `peoplePerCamp` habitants. */
export function maxCamps(state: GameState): number {
  return 1 + Math.floor(state.tribe.population / CAMP_RULES.peoplePerCamp)
}

/** Pourquoi cette unité ne peut pas fonder de campement là où elle est, ou null. */
export function cannotFoundCamp(state: GameState, unit: Unit): string | null {
  if (unit.kind !== 'eclaireur') return 'Seul un éclaireur fonde un campement'
  const mine = state.camps.filter((c) => c.owner === PLAYER)
  if (mine.length >= maxCamps(state))
    return `Un campement de plus pour ${CAMP_RULES.peoplePerCamp} habitants`
  const x = Math.floor(unit.x) + 0.5
  const y = Math.floor(unit.y) + 0.5
  // Un camp voisin caché sous le brouillard ne se trahit pas par un refus.
  const near = state.camps.some(
    (c) =>
      (c.owner === PLAYER || knownCell(state, c.x, c.y)) &&
      Math.hypot(c.x - x, c.y - y) < CAMP_RULES.minDistance,
  )
  if (near) return 'Trop près d’un autre campement'
  if (!isPassable(state.world, x, y)) return 'Impossible de camper ici'
  const held = state.territory.owner[Math.floor(y) * state.world.width + Math.floor(x)]!
  if (held !== NO_OWNER && held !== PLAYER) return 'Ces terres appartiennent à un autre peuple'
  if (state.tribe.food < CAMP_RULES.foodCost) return `Il faut ${CAMP_RULES.foodCost} rations`
  return null
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
    case 'moveUnits': {
      const { x, y } = command
      if (!Number.isFinite(x) || !Number.isFinite(y) || !inBounds(state.world, x, y)) {
        return { ok: false, reason: 'Destination hors du monde' }
      }
      // Seule l'eau déjà découverte est refusée : un clic dans le brouillard ne révèle rien.
      if (!knownPassable(state.world, state.fog, x, y))
        return { ok: false, reason: 'Destination infranchissable' }
      const units = state.units.filter((u) => command.unitIds.includes(u.id))
      if (units.length === 0) return { ok: false, reason: 'Aucune unité choisie' }
      let routed = 0
      // Dans un ordre de groupe, celle qui ne peut pas y aller s'arrête plutôt que de
      // poursuivre son ancien ordre.
      for (const u of units) if (orderUnit(state, u, x, y, false)) routed++
      if (routed === 0) return { ok: false, reason: 'Aucun chemin connu vers cette destination' }
      return { ok: true }
    }
    case 'invent': {
      if (!INVENTION_KINDS.includes(command.invention))
        return { ok: false, reason: 'Invention inconnue' }
      const reason = cannotStart(state.inventions, command.invention, state.tribe.materials)
      if (reason) return { ok: false, reason }
      startInvention(state.inventions, command.invention, state.tribe.materials)
      return { ok: true }
    }
    case 'foundCamp': {
      const unit = state.units.find((u) => u.id === command.unitId)
      if (!unit) return { ok: false, reason: 'Aucune unité choisie' }
      const reason = cannotFoundCamp(state, unit)
      if (reason) return { ok: false, reason }
      state.tribe.food -= CAMP_RULES.foodCost
      const camp: Camp = {
        id: state.nextId++,
        owner: PLAYER,
        x: Math.floor(unit.x) + 0.5,
        y: Math.floor(unit.y) + 0.5,
      }
      state.camps.push(camp)
      claimAround(state.territory, state.world, seatOf(camp), CAMP_RULES.claimRadius)
      updateFog(state.fog, viewersOf(state))
      return { ok: true }
    }
    case 'gift': {
      const people = state.peoples.find((p) => p.owner === command.people)
      const reason = cannotGift(state, people)
      if (reason || !people) return { ok: false, reason: reason ?? 'Peuple inconnu' }
      state.tribe.food -= RELATION_RULES.giftFood
      people.tribe.food += RELATION_RULES.giftFood
      shiftRelation(people, RELATION_RULES.giftRelation)
      return { ok: true }
    }
    case 'trade': {
      const people = state.peoples.find((p) => p.owner === command.people)
      const reason = cannotTrade(state, people)
      if (reason || !people) return { ok: false, reason: reason ?? 'Peuple inconnu' }
      state.tribe.materials.silex = (state.tribe.materials.silex ?? 0) - RELATION_RULES.tradeSilex
      people.tribe.food -= RELATION_RULES.tradeFood
      state.tribe.food = Math.min(foodCapacity(state), state.tribe.food + RELATION_RULES.tradeFood)
      shiftRelation(people, RELATION_RULES.tradeRelation)
      return { ok: true }
    }
    case 'buildVillage': {
      const reason = cannotBuildVillage(state, command.campId)
      if (reason) return { ok: false, reason }
      state.tribe.food -= VILLAGE_RULES.foodCost
      villageSite(state, command.campId)!.village = true
      return { ok: true }
    }
    case 'recruitHunter': {
      const reason = cannotRecruit(state)
      if (reason) return { ok: false, reason }
      state.tribe.food -= HUNT_RULES.recruitFood
      const hunters = state.units.filter((u) => u.kind === 'chasseur').length
      state.units.push(newHunter(state, hunters))
      return { ok: true }
    }
    default: {
      const unknown: never = command
      return { ok: false, reason: `Commande inconnue : ${JSON.stringify(unknown)}` }
    }
  }
}

/** Envoie une unité vers un point par un chemin connu ; l'arrête et rend false sinon. */
function orderUnit(state: GameState, u: Unit, x: number, y: number, auto: boolean): boolean {
  const route = findPath(state.world, state.fog, u, { x, y })
  if (!route) {
    stopUnit(u)
    return false
  }
  const rules = UNIT_RULES[u.kind]
  u.target = { x, y }
  u.path = route.points
  u.plannedFog = state.fog.version
  u.patience = route.cost * rules.detour + rules.detourSlack
  u.auto = auto
  return true
}

/** Joue un tick (un mois de jeu). */
export function step(state: GameState): void {
  if (state.outcome?.type === 'defeat') return
  state.clock.tick++
  const pace = 1 + inventionMean(state.inventions, 'portage') / 100
  for (const unit of state.units) if (!moveUnit(unit, state.world, pace)) replan(state, unit)
  hunt(state)
  // Le joueur et les peuples poussent chacun avec leur aléa : tant qu'ils ne se touchent pas,
  // la présence des voisins ne change rien au territoire du joueur.
  const seats = seatsOf(state)
  const mine = seats.filter((s) => s.owner === PLAYER)
  const theirs = seats.filter((s) => s.owner !== PLAYER)
  growTerritory(state.territory, state.world, mine, state.rng, CAMP_RULES.growthPerTick)
  growTerritory(state.territory, state.world, theirs, state.peopleRng, CAMP_RULES.growthPerTick)
  harvest(state)
  for (const people of state.peoples) livePeople(state, people)
  fortune(state)
  const invented = tickInventions(state.inventions, state.tribe.population, state.rng)
  if (invented)
    state.events.push({ type: 'invented', invention: invented.kind, rank: invented.rank })
  updateFog(state.fog, viewersOf(state))
  meetPeoples(state)
  // Le terrain découvert peut couper le chemin prévu : on le recalcule.
  for (const unit of state.units) {
    if (!unit.target || unit.plannedFog === state.fog.version) continue
    unit.plannedFog = state.fog.version
    if (pathBlocked(state.world, state.fog, unit, unit.path)) replan(state, unit)
  }
  judge(state)
}

/**
 * Recalcule le chemin d'une unité sur la carte connue. Elle s'arrête si plus aucun chemin
 * connu n'y mène, ou si le détour dépasse sa patience (elle n'erre pas tout un continent).
 */
function replan(state: GameState, unit: Unit): void {
  const route =
    unit.target && findPath(state.world, state.fog, unit, unit.target, Math.max(0, unit.patience))
  if (!route) {
    // Une poursuite abandonnée ne mérite pas d'avertir le joueur.
    if (!unit.auto) state.events.push({ type: 'unitGaveUp', unitId: unit.id })
    stopUnit(unit)
    return
  }
  unit.path = route.points
  unit.plannedFog = state.fog.version
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

/** Vue d'une unité : le pistage allonge celle des chasseurs. */
export function sightOf(state: GameState, unit: Unit): number {
  const tracking = unit.kind === 'chasseur' ? inventionMean(state.inventions, 'pistage') : 0
  return UNIT_RULES[unit.kind].sight + tracking
}

function viewersOf(state: GameState) {
  return [
    ...state.units.map((u) => ({ x: u.x, y: u.y, sight: sightOf(state, u) })),
    ...state.camps
      .filter((c) => c.owner === PLAYER)
      .map((c) => ({ x: c.x, y: c.y, sight: CAMP_RULES.sight })),
  ]
}

function seatsOf(state: GameState): Seat[] {
  return state.camps.map(seatOf)
}

function seatOf(camp: Camp): Seat {
  const reach = CAMP_RULES.reach + (camp.village ? VILLAGE_RULES.reachBonus : 0)
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
    if (!heldBy(owner, width, height, d, PLAYER)) continue
    const amount = depositYield(d) * (1 + depositBonus(state, d.kind))
    if (RESOURCE_RULES[d.kind].category === 'food') depositFood += amount
    else if (tribe.population > 0) tribe.materials[d.kind] = (tribe.materials[d.kind] ?? 0) + amount
  }
  const month = state.clock.tick % 12
  const amplitude = climateOf(state)
  const season = seasonalYield(month, amplitude)
  if (seasonStarting(month) === 'hiver')
    state.events.push({ type: 'winter', yieldFactor: seasonalYield(month, amplitude) })
  const available = territoryFood(state.territory.playerWeight, depositFood) * season
  const basket = inventionStat(state.inventions, 'panier')
  const inv = state.inventions
  const bonus = {
    gather: basket ? Math.max(0, rollStat(basket, state.rng)) / 100 : 0,
    storageMonths: storageBonus(state),
    growth: inventionMean(inv, 'feu') / 100,
    famineShield: -inventionMean(inv, 'peaux') / 100,
  }
  const hunters = state.units.filter((u) => u.kind === 'chasseur').length
  // Les moissons rentrent avant le repas du mois ; la réserve les borne comme le reste.
  const crops = tribe.population > 0 ? cropsOf(state, month) : 0
  tribe.food += crops
  tribe.lastCrops = crops
  if (tickTribe(tribe, available, bonus, hunters) === 'famineStarts')
    state.events.push({ type: 'famine' })
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
  if (state.tribe.food < RELATION_RULES.giftFood)
    return `Il faut ${RELATION_RULES.giftFood} rations`
  return null
}

/** Pourquoi le joueur ne peut pas échanger avec ce peuple, ou null. */
export function cannotTrade(state: GameState, people: People | undefined): string | null {
  if (!people || !people.met || people.tribe.population <= 0) return 'Peuple inconnu'
  if (people.relation < RELATION_RULES.tradeMinRelation)
    return 'Ils ne vous font pas assez confiance'
  if ((state.tribe.materials.silex ?? 0) < RELATION_RULES.tradeSilex)
    return `Il faut ${RELATION_RULES.tradeSilex} silex`
  const keep =
    people.tribe.population * TRIBE_RULES.rationPerPerson * RELATION_RULES.tradeReserveMonths
  if (people.tribe.food - RELATION_RULES.tradeFood < keep) return 'Leurs réserves sont trop maigres'
  return null
}

function shiftRelation(people: People, delta: number): void {
  people.relation = Math.max(
    RELATION_RULES.min,
    Math.min(RELATION_RULES.max, people.relation + delta),
  )
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
  return 0
}

/** Mois de réserve en plus : conservation (fumage) et greniers des villages. */
function storageBonus(state: GameState): number {
  return (
    inventionMean(state.inventions, 'fumage') + villageCount(state) * VILLAGE_RULES.storageMonths
  )
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
  return fertility * VILLAGE_RULES.cropPerCell * (1 + skill)
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
 * La faune erre ; les chasseurs abattent les bêtes à portée, et poursuivent seuls un
 * troupeau en vue (sauf les plus dangereux) quand le joueur ne leur a rien demandé.
 * Réserve pleine, ils ne risquent pas leur vie pour rien.
 */
function hunt(state: GameState): void {
  const { world, rng, faunaRng, tribe } = state
  for (const herd of state.herds) wander(herd, world, faunaRng)
  for (const unit of [...state.units]) {
    if (unit.kind !== 'chasseur') continue
    if (huntersResting(state)) continue
    const capacity = foodCapacity(state)
    const prey = nearestHerd(state, unit, HUNT_RULES.reach, false, 1)
    if (prey) {
      const rules = ANIMAL_RULES[prey.kind]
      // Le propulseur éloigne le chasseur de la bête : le danger baisse.
      const thrower = inventionStat(state.inventions, 'propulseur')
      const safety = thrower ? Math.min(1, Math.max(0, -rollStat(thrower, rng) / 100)) : 0
      if (rng.next() < rules.danger * (1 - safety)) {
        state.units.splice(state.units.indexOf(unit), 1)
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
        flee(prey, world, faunaRng, unit, HUNT_RULES.fleeDistance)
      }
      continue
    }
    if (unit.target && !unit.auto) continue
    if ((state.clock.tick + unit.id) % HUNT_RULES.chaseEvery !== 0) continue
    const seen = nearestHerd(state, unit, HUNT_RULES.chaseRange, true, HUNT_RULES.autoMaxDanger)
    if (seen) orderUnit(state, unit, seen.x, seen.y, true)
  }
  state.herds = state.herds.filter((h) => h.size > 0)
  for (const herd of state.herds) regrow(herd, faunaRng)
}

/**
 * Troupeau le plus proche à moins de `range`, d'un danger au plus `maxDanger` ;
 * `visible` : seulement s'il est en vue.
 */
function nearestHerd(
  state: GameState,
  from: Unit,
  range: number,
  visible: boolean,
  maxDanger: number,
): Herd | null {
  let best: Herd | null = null
  let bestDistance = range
  for (const herd of state.herds) {
    const d = Math.hypot(herd.x - from.x, herd.y - from.y)
    if (d > bestDistance) continue
    if (ANIMAL_RULES[herd.kind].danger > maxDanger) continue
    if (visible && !herdVisible(state, herd)) continue
    best = herd
    bestDistance = d
  }
  return best
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
  return scoreOf(tallyOf(state), won)
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
    state.outcome = { type: 'victory', tick, score: scoreOf(tallyOf(state), tick / 12) }
    state.clock.paused = true
    state.events.push({ type: 'victory' })
  }
}
