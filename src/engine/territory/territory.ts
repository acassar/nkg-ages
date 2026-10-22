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
  /** Cellules possédées, pour tirer vite un point de départ d'expansion. */
  owned: number[]
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
    owned: [],
  }
}

export function claim(territory: TerritoryState, x: number, y: number, owner: number): boolean {
  const i = y * territory.width + x
  if (territory.owner[i] === owner) return false
  territory.owner[i] = owner
  territory.owned.push(i)
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

/**
 * Croissance organique : on tire des cellules déjà tenues et l'on gagne un voisin libre,
 * de terre, dans la portée du siège. Le hasard donne des contours irréguliers.
 */
export function growTerritory(
  territory: TerritoryState,
  world: World,
  seats: readonly Seat[],
  rng: Rng,
  attempts: number,
): void {
  if (territory.owned.length === 0) return
  for (let a = 0; a < attempts; a++) {
    const from = territory.owned[rng.int(0, territory.owned.length - 1)]!
    const owner = territory.owner[from]!
    const seat = seats.find((s) => s.owner === owner)
    if (!seat) continue
    const [dx, dy] = rng.pick(NEIGHBORS)
    const x = (from % territory.width) + dx
    const y = Math.floor(from / territory.width) + dy
    if (x < 0 || y < 0 || x >= territory.width || y >= territory.height) continue
    const i = y * territory.width + x
    if (territory.owner[i] !== NO_OWNER || isWater(world.biome[i]!)) continue
    if (Math.hypot(x + 0.5 - seat.x, y + 0.5 - seat.y) > seat.reach) continue
    claim(territory, x, y, owner)
  }
}
