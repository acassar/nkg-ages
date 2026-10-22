import type { Command, CommandResult } from './commands'
import { FIRST_ERA } from './content/eras'
import { createClock, isSpeed, type ClockState } from './core/clock'
import { createRng, type Rng } from './core/random'
import { createFog, updateFog, Visibility, type FogState } from './fog/fog'
import { BIOMES, type BiomeId } from './content/biomes'
import { TRIBE_RULES } from './content/tribe'
import {
  claimAround,
  createTerritory,
  growTerritory,
  PLAYER,
  type Seat,
  type TerritoryState,
} from './territory/territory'
import { findPath, knownPassable, pathBlocked } from './units/path'
import { CAMP_RULES } from './content/camps'
import { RIVER_RULES } from './content/rivers'
import { ANIMAL_RULES, HUNT_RULES, type AnimalKind } from './content/fauna'
import { INVENTION_KINDS, INVENTION_WORK, type InventionKind } from './content/inventions'
import type { Rank } from './content/rarity'
import { RESOURCE_RULES } from './content/resources'
import {
  cannotStart,
  createInventions,
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
import { findStarts, type StartSite } from './world/starts'
import { inBounds, type World } from './world/world'

export interface NewGameOptions {
  seed: string
  /** Vrai : départ tiré au hasard parmi les sites viables. Faux : `startIndex` parmi les meilleurs. */
  randomStart: boolean
  startIndex?: number
  width?: number
  height?: number
}

export interface Camp {
  id: number
  owner: number
  x: number
  y: number
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
  /** La réserve était pleine : une part de la viande rapportée est perdue. */
  | { type: 'meatLost'; amount: number }

export interface GameState {
  options: NewGameOptions
  world: World
  starts: StartSite[]
  clock: ClockState
  rng: Rng
  /** Aléa propre à l'errance de la faune, pour qu'elle ne dérange pas les autres tirages. */
  faunaRng: Rng
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
    units: [],
    camps: [],
    fog: createFog(world.width, world.height),
    territory: createTerritory(world.width, world.height, foodWeights(world)),
    tribe: createTribe(),
    deposits: placeDeposits(world, createRng(`ressources:${world.seed}`)),
    herds: placeHerds(world, createRng(`faune:${world.seed}`)),
    inventions: createInventions(),
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
  updateFog(state.fog, viewersOf(state))
  return state
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
  if (state.camps.some((c) => Math.hypot(c.x - x, c.y - y) < CAMP_RULES.minDistance))
    return 'Trop près d’un autre campement'
  if (!isPassable(state.world, x, y)) return 'Impossible de camper ici'
  if (state.tribe.food < CAMP_RULES.foodCost) return `Il faut ${CAMP_RULES.foodCost} rations`
  return null
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
  state.clock.tick++
  for (const unit of state.units) if (!moveUnit(unit, state.world)) replan(state, unit)
  hunt(state)
  growTerritory(
    state.territory,
    state.world,
    seatsOf(state),
    state.rng,
    CAMP_RULES.growthPerTick * state.camps.length,
  )
  harvest(state)
  const invented = tickInventions(state.inventions, state.tribe.population, state.rng)
  if (invented)
    state.events.push({ type: 'invented', invention: invented.kind, rank: invented.rank })
  updateFog(state.fog, viewersOf(state))
  // Le terrain découvert peut couper le chemin prévu : on le recalcule.
  for (const unit of state.units) {
    if (!unit.target || unit.plannedFog === state.fog.version) continue
    unit.plannedFog = state.fog.version
    if (pathBlocked(state.world, state.fog, unit, unit.path)) replan(state, unit)
  }
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

function viewersOf(state: GameState) {
  return [
    ...state.units.map((u) => ({ x: u.x, y: u.y, sight: UNIT_RULES[u.kind].sight })),
    ...state.camps.map((c) => ({ x: c.x, y: c.y, sight: CAMP_RULES.sight })),
  ]
}

function seatsOf(state: GameState): Seat[] {
  return state.camps.map(seatOf)
}

function seatOf(camp: Camp): Seat {
  return { owner: camp.owner, x: camp.x, y: camp.y, reach: CAMP_RULES.reach }
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
    const amount = depositYield(d)
    if (RESOURCE_RULES[d.kind].category === 'food') depositFood += amount
    else if (tribe.population > 0) tribe.materials[d.kind] = (tribe.materials[d.kind] ?? 0) + amount
  }
  const available = territoryFood(state.territory.playerWeight, depositFood)
  const basket = inventionStat(state.inventions, 'panier')
  const bonus = {
    gather: basket ? Math.max(0, rollStat(basket, state.rng)) / 100 : 0,
    storageMonths: inventionStat(state.inventions, 'fumage')?.mean ?? 0,
  }
  const hunters = state.units.filter((u) => u.kind === 'chasseur').length
  if (tickTribe(tribe, available, bonus, hunters) === 'famineStarts')
    state.events.push({ type: 'famine' })
}

/** Réserve maximale de la tribu, conservation comprise. */
export function foodCapacity(state: GameState): number {
  const extra = inventionStat(state.inventions, 'fumage')?.mean ?? 0
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
      if (rng.next() < rules.danger) {
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
