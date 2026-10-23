import type { ClockState } from '../core/clock'
import type { Rect } from '../core/geometry'
import { createRng } from '../core/random'
import type { Herd } from '../fauna/fauna'
import {
  createGame,
  type Camp,
  type GameState,
  type NewGameOptions,
  type Outcome,
  type People,
} from '../game'
import type { InventionsState } from '../inventions/inventions'
import type { Deposit } from '../resources/deposits'
import type { TribeState } from '../tribe/tribe'
import type { Unit } from '../units/units'

/** Version du format : une sauvegarde d'un autre format est refusée plutôt que mal relue. */
export const SAVE_VERSION = 1

/**
 * Sauvegarde d'une partie : données simples, transformables en JSON.
 * Le monde n'y est pas : il se régénère à l'identique depuis les options (graine).
 */
export interface SaveData {
  version: number
  options: NewGameOptions
  clock: ClockState
  rng: number
  faunaRng: number
  /** Absent des sauvegardes d'avant les événements rares : on repart alors de la graine. */
  eventRng?: number
  /** Peuples voisins et leur aléa : absents d'avant les peuples (la tribu y était seule). */
  peoples?: People[]
  peopleRng?: number
  /** Empreinte du monde : si la génération a changé depuis, la sauvegarde n'a plus de sens. */
  world?: number
  units: Unit[]
  camps: Camp[]
  tribe: TribeState
  deposits: Deposit[]
  herds: Herd[]
  inventions: InventionsState
  outcome: Outcome | null
  nextId: number
  fog: { cells: number[]; version: number; pass: number; lastViewed: Rect[] }
  territory: {
    owner: number[]
    version: number
    ownedCount: number
    /** Frontières par propriétaire ; `frontier` : celle du joueur, d'avant les peuples. */
    frontiers?: number[][]
    frontier?: number[]
    playerWeight: number
    ownerCells?: number[]
    ownerWeight?: number[]
  }
}

/** Copie profonde d'un objet de données (sans fonctions ni tableaux typés). */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Grille en plages : [valeur, longueur, valeur, longueur…]. Brouillard et territoire s'y prêtent. */
export function encodeRuns(cells: Uint8Array): number[] {
  const runs: number[] = []
  let i = 0
  while (i < cells.length) {
    const value = cells[i]!
    let end = i + 1
    while (end < cells.length && cells[end] === value) end++
    runs.push(value, end - i)
    i = end
  }
  return runs
}

export function decodeRuns(runs: readonly number[], length: number): Uint8Array {
  const cells = new Uint8Array(length)
  let at = 0
  for (let k = 0; k + 1 < runs.length; k += 2) {
    const count = runs[k + 1]!
    if (at + count > length) throw new Error('Sauvegarde abîmée : grille trop longue')
    cells.fill(runs[k]!, at, at + count)
    at += count
  }
  if (at !== length) throw new Error('Sauvegarde abîmée : grille incomplète')
  return cells
}

/** Empreinte FNV-1a des biomes et des fleuves : change dès que la génération change. */
export function worldPrint(state: Pick<GameState, 'world'>): number {
  let hash = 0x811c9dc5
  for (const grid of [state.world.biome, state.world.river]) {
    for (let i = 0; i < grid.length; i++) {
      hash ^= grid[i]!
      hash = Math.imul(hash, 0x01000193)
    }
  }
  return hash >>> 0
}

export function saveGame(state: GameState): SaveData {
  return {
    version: SAVE_VERSION,
    options: copy(state.options),
    clock: copy(state.clock),
    rng: state.rng.state,
    faunaRng: state.faunaRng.state,
    eventRng: state.eventRng.state,
    peoples: copy(state.peoples),
    peopleRng: state.peopleRng.state,
    world: worldPrint(state),
    units: copy(state.units),
    camps: copy(state.camps),
    tribe: copy(state.tribe),
    deposits: copy(state.deposits),
    herds: copy(state.herds),
    inventions: copy(state.inventions),
    outcome: copy(state.outcome),
    nextId: state.nextId,
    fog: {
      cells: encodeRuns(state.fog.cells),
      version: state.fog.version,
      pass: state.fog.pass,
      lastViewed: copy(state.fog.lastViewed),
    },
    territory: {
      owner: encodeRuns(state.territory.owner),
      version: state.territory.version,
      ownedCount: state.territory.ownedCount,
      frontiers: state.territory.frontiers.map((f) => [...f]),
      playerWeight: state.territory.playerWeight,
      ownerCells: [...state.territory.ownerCells],
      ownerWeight: [...state.territory.ownerWeight],
    },
  }
}

/**
 * Reprend une partie : le monde est régénéré depuis la graine, puis tout ce qui a bougé
 * est remis en place. La suite de la partie est identique à celle de l'original.
 */
export function loadGame(data: SaveData): GameState {
  if (data?.version !== SAVE_VERSION) throw new Error('Sauvegarde d’une autre version du jeu')
  const state = createGame(data.options)
  const size = state.world.width * state.world.height
  if (data.world !== undefined && data.world !== worldPrint(state))
    throw new Error('Sauvegarde d’un monde que cette version du jeu ne génère plus')
  state.clock = copy(data.clock)
  // L'état d'un générateur est sa graine : le recréer depuis cet état reprend la même suite.
  state.rng = createRng(data.rng)
  state.faunaRng = createRng(data.faunaRng)
  if (data.eventRng !== undefined) state.eventRng = createRng(data.eventRng)
  state.peoples = copy(data.peoples ?? [])
  if (data.peopleRng !== undefined) state.peopleRng = createRng(data.peopleRng)
  state.units = copy(data.units)
  state.camps = copy(data.camps)
  // Un champ ajouté depuis la sauvegarde garde sa valeur de départ au lieu de manquer.
  state.tribe = { ...state.tribe, ...copy(data.tribe) }
  state.deposits = copy(data.deposits)
  state.herds = copy(data.herds)
  state.inventions = copy(data.inventions)
  state.outcome = copy(data.outcome)
  state.nextId = data.nextId

  const fog = state.fog
  fog.cells = decodeRuns(data.fog.cells, size)
  fog.version = data.fog.version
  fog.pass = data.fog.pass
  fog.lastViewed = copy(data.fog.lastViewed)
  // Les anciennes marques de passage ne servent plus : seule compte celle du calcul suivant.
  fog.seenAt.fill(0)
  fog.dirty = { x: 0, y: 0, w: state.world.width, h: state.world.height }

  const territory = state.territory
  territory.owner = decodeRuns(data.territory.owner, size)
  territory.version = data.territory.version
  territory.ownedCount = data.territory.ownedCount
  territory.frontiers = data.territory.frontiers
    ? data.territory.frontiers.map((f) => [...f])
    : [[], [...(data.territory.frontier ?? [])]]
  territory.playerWeight = data.territory.playerWeight
  if (data.territory.ownerCells && data.territory.ownerWeight) {
    territory.ownerCells = [...data.territory.ownerCells]
    territory.ownerWeight = [...data.territory.ownerWeight]
  } else {
    // Sauvegarde d'avant les peuples : le joueur seul, recompté depuis la grille.
    territory.ownerCells = [0, data.territory.ownedCount]
    territory.ownerWeight = [0, data.territory.playerWeight]
  }
  territory.dirty = { x: 0, y: 0, w: state.world.width, h: state.world.height }

  state.events = []
  return state
}
