import { BIOMES, isWater } from '../content/biomes'
import type { Rng } from '../core/random'
import { cellIndex, type World } from './world'

export interface StartSite {
  x: number
  y: number
  /** Note du site : plus elle est haute, plus le départ est confortable. */
  score: number
}

/** Rayon (en cellules) dans lequel un départ doit trouver eau et nourriture. */
export const START_RADIUS = 8
const MIN_FOOD = 0.4
const MIN_SPACING = 40
/**
 * Une bande nomade doit pouvoir migrer : un départ doit avoir au moins `MIN_ROOM` cellules
 * de terre reliées dans un rayon de `ROOM_RADIUS` (quatre zones de bande). Un îlot ne suffit pas.
 */
const ROOM_RADIUS = 28
export const MIN_ROOM = 600

/** Terres reliées au départ, à portée de migration. */
export function roomAround(world: World, x: number, y: number): number {
  return reachableLand(world, x, y, ROOM_RADIUS)
}

/**
 * Évalue un site de départ : il faut de l'eau à portée et assez de nourriture.
 * Renvoie null si le site n'est pas viable.
 */
export function rateStart(world: World, x: number, y: number): number | null {
  const own = world.biome[cellIndex(world, x, y)]!
  if (isWater(own) || BIOMES[own as keyof typeof BIOMES].food < 0.5) return null
  let water = 0
  let food = 0
  let cells = 0
  const r = START_RADIUS
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue
      const cx = x + dx
      const cy = y + dy
      if (cx < 0 || cy < 0 || cx >= world.width || cy >= world.height) return null
      const i = cellIndex(world, cx, cy)
      const b = world.biome[i]!
      cells++
      // Un fleuve apporte l'eau douce aussi bien que la côte.
      if (isWater(b) || world.river[i]) water++
      food += BIOMES[b as keyof typeof BIOMES].food
    }
  }
  const meanFood = food / cells
  if (water === 0 || meanFood < MIN_FOOD) return null
  // L'eau compte, mais un site presque entièrement marin n'est pas un bon départ. On ne
  // compte que les terres reliées au camp : un îlot face à une côte n'en est pas un.
  const land = reachableLand(world, x, y, r) / cells
  if (land < 0.45) return null
  return meanFood + Math.min(water / cells, 0.2)
}

/** Cellules de terre reliées à (x, y) sans quitter le disque de rayon r. */
function reachableLand(world: World, x: number, y: number, r: number): number {
  const seen = new Set<number>([cellIndex(world, x, y)])
  const queue = [[x, y] as const]
  while (queue.length > 0) {
    const [cx, cy] = queue.pop()!
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx
      const ny = cy + dy
      if ((nx - x) ** 2 + (ny - y) ** 2 > r * r) continue
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue
      const i = cellIndex(world, nx, ny)
      if (seen.has(i) || isWater(world.biome[i]!)) continue
      seen.add(i)
      queue.push([nx, ny])
    }
  }
  return seen.size
}

/** Tire jusqu'à `count` départs viables, éloignés les uns des autres. */
export function findStarts(world: World, rng: Rng, count: number): StartSite[] {
  const candidates: StartSite[] = []
  const tries = 4000
  for (let t = 0; t < tries; t++) {
    const x = rng.int(START_RADIUS, world.width - 1 - START_RADIUS)
    const y = rng.int(START_RADIUS, world.height - 1 - START_RADIUS)
    const score = rateStart(world, x, y)
    if (score !== null) candidates.push({ x, y, score })
  }
  candidates.sort((a, b) => b.score - a.score)
  const chosen: StartSite[] = []
  for (const c of candidates) {
    // Le plus coûteux en dernier : seuls les sites retenus sont mesurés.
    if (
      chosen.every((s) => Math.hypot(s.x - c.x, s.y - c.y) >= MIN_SPACING) &&
      roomAround(world, c.x, c.y) >= MIN_ROOM
    )
      chosen.push(c)
    if (chosen.length === count) break
  }
  return chosen
}
