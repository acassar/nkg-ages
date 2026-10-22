import { isWater } from '../content/biomes'
import { unionRect, type Rect } from '../core/geometry'
import type { Rng } from '../core/random'
import type { World } from '../world/world'

/** Propriétaire 0 = personne. Le joueur est le 1. */
export const NO_OWNER = 0
export const PLAYER = 1

export interface TerritoryState {
  width: number
  height: number
  owner: Uint8Array
  version: number
  dirty: Rect | null
  /** Nombre de cellules tenues, tous propriétaires confondus. */
  ownedCount: number
  /**
   * Cellules tenues qui ont peut-être encore un voisin à prendre.
   * Purgée au fil des tirages : l'intérieur du territoire n'y reste pas.
   */
  frontier: number[]
}

export interface Seat {
  owner: number
  x: number
  y: number
  /** Rayon d'influence en cellules : le territoire ne s'étend pas au-delà. */
  reach: number
}

export function createTerritory(width: number, height: number): TerritoryState {
  return {
    width,
    height,
    owner: new Uint8Array(width * height),
    version: 0,
    dirty: null,
    ownedCount: 0,
    frontier: [],
  }
}

export function claim(territory: TerritoryState, x: number, y: number, owner: number): boolean {
  const i = y * territory.width + x
  const previous = territory.owner[i]
  if (previous === owner) return false
  territory.owner[i] = owner
  if (previous === NO_OWNER) territory.ownedCount++
  if (owner === NO_OWNER) territory.ownedCount--
  else territory.frontier.push(i)
  territory.version++
  territory.dirty = unionRect(territory.dirty, { x, y, w: 1, h: 1 })
  return true
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/** Voisins libres, de terre et dans la portée du siège, d'une cellule tenue. */
function freeNeighbors(
  territory: TerritoryState,
  world: World,
  seat: Seat,
  from: number,
): [number, number][] {
  const fx = from % territory.width
  const fy = Math.floor(from / territory.width)
  const out: [number, number][] = []
  for (const [dx, dy] of NEIGHBORS) {
    const x = fx + dx
    const y = fy + dy
    if (x < 0 || y < 0 || x >= territory.width || y >= territory.height) continue
    const i = y * territory.width + x
    if (territory.owner[i] !== NO_OWNER || isWater(world.biome[i]!)) continue
    if (Math.hypot(x + 0.5 - seat.x, y + 0.5 - seat.y) > seat.reach) continue
    out.push([x, y])
  }
  return out
}

/**
 * Croissance organique : on tire une cellule de la frontière et l'on prend un de ses voisins
 * libres. Une cellule sans voisin libre quitte la frontière, si bien que la croissance
 * ne s'essouffle pas quand le territoire grandit. Le hasard donne des contours irréguliers.
 */
export function growTerritory(
  territory: TerritoryState,
  world: World,
  seats: readonly Seat[],
  rng: Rng,
  claims: number,
): void {
  const { frontier } = territory
  let taken = 0
  // Garde-fou : chaque tirage prend une cellule ou retire une cellule de la frontière.
  for (let guard = 0; taken < claims && frontier.length > 0 && guard < claims * 8; guard++) {
    const k = rng.int(0, frontier.length - 1)
    const from = frontier[k]!
    const owner = territory.owner[from]!
    const seat = seats.find((s) => s.owner === owner)
    const options = seat ? freeNeighbors(territory, world, seat, from) : []
    if (options.length === 0) {
      frontier[k] = frontier[frontier.length - 1]!
      frontier.pop()
      continue
    }
    const [x, y] = rng.pick(options)
    claim(territory, x, y, owner)
    taken++
  }
}
