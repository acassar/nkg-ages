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
  /** Poids de chaque cellule (ex. nourriture) et somme sur les cellules du joueur. */
  weights: Float32Array | null
  playerWeight: number
  /** Par propriétaire (indice = numéro) : cellules tenues et somme de leurs poids. */
  ownerCells: number[]
  ownerWeight: number[]
}

export interface Seat {
  owner: number
  x: number
  y: number
  /** Rayon d'influence en cellules : le territoire ne s'étend pas au-delà. */
  reach: number
}

export function createTerritory(
  width: number,
  height: number,
  weights: Float32Array | null = null,
): TerritoryState {
  return {
    width,
    height,
    owner: new Uint8Array(width * height),
    version: 0,
    dirty: null,
    ownedCount: 0,
    frontier: [],
    weights,
    playerWeight: 0,
    ownerCells: [],
    ownerWeight: [],
  }
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

export function claim(territory: TerritoryState, x: number, y: number, owner: number): boolean {
  const i = y * territory.width + x
  const previous = territory.owner[i]
  if (previous === owner) return false
  territory.owner[i] = owner
  if (previous === NO_OWNER) territory.ownedCount++
  const weight = territory.weights?.[i] ?? 0
  if (previous === PLAYER) territory.playerWeight -= weight
  if (owner === PLAYER) territory.playerWeight += weight
  if (previous !== NO_OWNER) {
    bump(territory.ownerCells, previous!, -1)
    bump(territory.ownerWeight, previous!, -weight)
  }
  if (owner !== NO_OWNER) {
    bump(territory.ownerCells, owner, 1)
    bump(territory.ownerWeight, owner, weight)
  }
  if (owner === NO_OWNER) {
    territory.ownedCount--
    // Les voisines possédées d'une cellule libérée redeviennent des bords d'expansion.
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= territory.width || ny >= territory.height) continue
      const n = ny * territory.width + nx
      if (territory.owner[n] !== NO_OWNER) territory.frontier.push(n)
    }
  } else territory.frontier.push(i)
  territory.version++
  territory.dirty = unionRect(territory.dirty, { x, y, w: 1, h: 1 })
  return true
}

/** Ajoute à la case d'un tableau par propriétaire, sans y laisser de trou (sauvegarde JSON). */
function bump(values: number[], owner: number, delta: number): void {
  while (values.length <= owner) values.push(0)
  values[owner]! += delta
}

/** Voisins libres, de terre et dans la portée d'un des sièges, d'une cellule tenue. */
function freeNeighbors(
  territory: TerritoryState,
  world: World,
  seats: readonly Seat[],
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
    if (!seats.some((s) => Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) <= s.reach)) continue
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
    // Un propriétaire peut avoir plusieurs campements : chacun porte sa portée.
    const own = seats.filter((s) => s.owner === owner)
    const options = own.length > 0 ? freeNeighbors(territory, world, own, from) : []
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

/**
 * Prend d'un coup les terres libres reliées au siège dans un rayon donné (fondation d'un
 * camp). Parcours depuis le siège : le territoire reste d'un seul tenant.
 */
export function claimAround(
  territory: TerritoryState,
  world: World,
  seat: Seat,
  radius: number,
): number {
  const seatSmall = { ...seat, reach: Math.min(seat.reach, radius) }
  const sx = Math.floor(seat.x)
  const sy = Math.floor(seat.y)
  if (isWater(world.biome[sy * territory.width + sx]!)) return 0
  let taken = claim(territory, sx, sy, seat.owner) ? 1 : 0
  const queue = [sy * territory.width + sx]
  while (queue.length > 0) {
    const from = queue.pop()!
    for (const [x, y] of freeNeighbors(territory, world, [seatSmall], from)) {
      claim(territory, x, y, seat.owner)
      taken++
      queue.push(y * territory.width + x)
    }
  }
  return taken
}
