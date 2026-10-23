import { isWater, type BiomeId } from '../content/biomes'
import { WONDER_KINDS, WONDER_PLACEMENT, WONDER_RULES, type WonderKind } from '../content/wonders'
import type { Rng } from '../core/random'
import type { World } from '../world/world'

export interface Wonder {
  kind: WonderKind
  /** Cellule de la merveille. */
  x: number
  y: number
}

/**
 * Pose les merveilles du monde : chacune existe selon sa chance, sur une terre de ses biomes,
 * dans l'anneau autour du départ. Une merveille sans place possible n'existe pas.
 */
export function placeWonders(world: World, start: { x: number; y: number }, rng: Rng): Wonder[] {
  const { minDistance, maxDistance } = WONDER_PLACEMENT
  const wonders: Wonder[] = []
  for (const kind of WONDER_KINDS) {
    const rules = WONDER_RULES[kind]
    if (rng.next() >= rules.chance) continue
    const spots: { x: number; y: number }[] = []
    const y0 = Math.max(0, start.y - maxDistance)
    const y1 = Math.min(world.height - 1, start.y + maxDistance)
    const x0 = Math.max(0, start.x - maxDistance)
    const x1 = Math.min(world.width - 1, start.x + maxDistance)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const biome = world.biome[y * world.width + x] as BiomeId
        if (isWater(biome) || !rules.biomes.includes(biome)) continue
        const d = Math.hypot(x - start.x, y - start.y)
        if (d < minDistance || d > maxDistance) continue
        if (wonders.some((w) => w.x === x && w.y === y)) continue
        spots.push({ x, y })
      }
    }
    if (spots.length > 0) wonders.push({ kind, ...rng.pick(spots) })
  }
  return wonders
}
