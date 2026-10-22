import type { Command, CommandResult } from './commands'
import { FIRST_ERA } from './content/eras'
import { createClock, isSpeed, type ClockState } from './core/clock'
import { createRng, type Rng } from './core/random'
import { createFog, updateFog, type FogState } from './fog/fog'
import {
  claim,
  createTerritory,
  growTerritory,
  PLAYER,
  type Seat,
  type TerritoryState,
} from './territory/territory'
import { findPath, knownPassable, pathBlocked } from './units/path'
import { moveUnit, stopUnit, UNIT_RULES, type Unit } from './units/units'
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
export type GameEvent = { type: 'unitGaveUp'; unitId: number }

export interface GameState {
  options: NewGameOptions
  world: World
  starts: StartSite[]
  clock: ClockState
  rng: Rng
  units: Unit[]
  camps: Camp[]
  fog: FogState
  territory: TerritoryState
  nextId: number
  events: GameEvent[]
}

/** Nombre de départs proposés quand le placement n'est pas aléatoire. */
export const START_CHOICES = 3
const CAMP_SIGHT = 7
const CAMP_REACH = 26
/** Cellules gagnées par le territoire à chaque tick. */
const GROWTH_PER_TICK = 2
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
    units: [],
    camps: [],
    fog: createFog(world.width, world.height),
    territory: createTerritory(world.width, world.height),
    nextId: 1,
    events: [],
  }
  const cx = site.x + 0.5
  const cy = site.y + 0.5
  state.camps.push({ id: state.nextId++, owner: PLAYER, x: cx, y: cy })
  claim(state.territory, site.x, site.y, PLAYER)
  state.units.push({
    id: state.nextId++,
    kind: 'eclaireur',
    x: cx,
    y: cy,
    target: null,
    path: [],
    plannedFog: 0,
    patience: 0,
  })
  updateFog(state.fog, viewersOf(state))
  return state
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
      for (const u of units) {
        const route = findPath(state.world, state.fog, u, { x, y })
        // Dans un ordre de groupe, celle qui ne peut pas y aller s'arrête plutôt que de
        // poursuivre son ancien ordre.
        if (!route) {
          stopUnit(u)
          continue
        }
        const rules = UNIT_RULES[u.kind]
        u.target = { x, y }
        u.path = route.points
        u.plannedFog = state.fog.version
        u.patience = route.cost * rules.detour + rules.detourSlack
        routed++
      }
      if (routed === 0) return { ok: false, reason: 'Aucun chemin connu vers cette destination' }
      return { ok: true }
    }
    default: {
      const unknown: never = command
      return { ok: false, reason: `Commande inconnue : ${JSON.stringify(unknown)}` }
    }
  }
}

/** Joue un tick (un mois de jeu). */
export function step(state: GameState): void {
  state.clock.tick++
  for (const unit of state.units) if (!moveUnit(unit, state.world)) replan(state, unit)
  growTerritory(state.territory, state.world, seatsOf(state), state.rng, GROWTH_PER_TICK)
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
    stopUnit(unit)
    state.events.push({ type: 'unitGaveUp', unitId: unit.id })
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
    ...state.camps.map((c) => ({ x: c.x, y: c.y, sight: CAMP_SIGHT })),
  ]
}

function seatsOf(state: GameState): Seat[] {
  return state.camps.map((c) => ({ owner: c.owner, x: c.x, y: c.y, reach: CAMP_REACH }))
}
