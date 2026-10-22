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
      const b = world.biome[cellIndex(world, cx, cy)]!
      cells++
      if (isWater(b)) water++
      food += BIOMES[b as keyof typeof BIOMES].food
    }
  }
  const meanFood = food / cells
  if (water === 0 || meanFood < MIN_FOOD) return null
  // L'eau compte, mais un site presque entièrement marin n'est pas un bon départ.
  const land = 1 - water / cells
  if (land < 0.45) return null
  return meanFood + Math.min(water / cells, 0.2)
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
    if (chosen.every((s) => Math.hypot(s.x - c.x, s.y - c.y) >= MIN_SPACING)) chosen.push(c)
    if (chosen.length === count) break
  }
  return chosen
}
