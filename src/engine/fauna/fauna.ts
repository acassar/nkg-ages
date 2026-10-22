import { ANIMAL_KINDS, ANIMAL_RULES, type AnimalKind } from '../content/fauna'
import { isWater, type BiomeId } from '../content/biomes'
import type { Rng } from '../core/random'
import type { World } from '../world/world'

export interface Herd {
  id: number
  kind: AnimalKind
  x: number
  y: number
  size: number
  /** Point vers lequel le troupeau erre ou fuit. */
  goal: { x: number; y: number }
}

/** Sème les troupeaux, de façon reproductible (un au plus par cellule). */
export function placeHerds(world: World, rng: Rng, firstId = 1): Herd[] {
  const herds: Herd[] = []
  let id = firstId
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const biome = world.biome[y * world.width + x] as BiomeId
      for (const kind of ANIMAL_KINDS) {
        const rules = ANIMAL_RULES[kind]
        if (!rules.biomes.includes(biome) || rng.next() >= rules.density) continue
        const at = { x: x + 0.5, y: y + 0.5 }
        herds.push({ id: id++, kind, ...at, size: rules.herdSize, goal: at })
        break
      }
    }
  }
  return herds
}

/** Le troupeau peut-il se tenir là ? Sur la terre ferme, dans le monde. */
export function herdCanStand(world: World, x: number, y: number): boolean {
  const cx = Math.floor(x)
  const cy = Math.floor(y)
  if (cx < 0 || cy < 0 || cx >= world.width || cy >= world.height) return false
  return !isWater(world.biome[cy * world.width + cx]!)
}

/** Un tick d'errance : le troupeau marche vers son but, puis s'en choisit un autre. */
export function wander(herd: Herd, world: World, rng: Rng): void {
  const { speed } = ANIMAL_RULES[herd.kind]
  const dx = herd.goal.x - herd.x
  const dy = herd.goal.y - herd.y
  const dist = Math.hypot(dx, dy)
  if (dist <= speed) {
    herd.x = herd.goal.x
    herd.y = herd.goal.y
    herd.goal = pickGoal(herd, world, rng, herd.x, herd.y, 6)
    return
  }
  const nx = herd.x + (dx / dist) * speed
  const ny = herd.y + (dy / dist) * speed
  if (!herdCanStand(world, nx, ny)) {
    herd.goal = pickGoal(herd, world, rng, herd.x, herd.y, 6)
    return
  }
  herd.x = nx
  herd.y = ny
}

/** Le troupeau chassé fuit à l'opposé du chasseur, s'il trouve où aller. */
export function flee(
  herd: Herd,
  world: World,
  rng: Rng,
  from: { x: number; y: number },
  distance: number,
): void {
  const dx = herd.x - from.x
  const dy = herd.y - from.y
  const d = Math.hypot(dx, dy) || 1
  const gx = herd.x + (dx / d) * distance
  const gy = herd.y + (dy / d) * distance
  herd.goal = herdCanStand(world, gx, gy)
    ? { x: gx, y: gy }
    : pickGoal(herd, world, rng, herd.x, herd.y, distance)
}

function pickGoal(
  herd: Herd,
  world: World,
  rng: Rng,
  x: number,
  y: number,
  radius: number,
): { x: number; y: number } {
  for (let attempt = 0; attempt < 6; attempt++) {
    const gx = x + rng.range(-radius, radius)
    const gy = y + rng.range(-radius, radius)
    if (herdCanStand(world, gx, gy)) return { x: gx, y: gy }
  }
  return { x: herd.x, y: herd.y }
}

/** Un mois : un troupeau entamé peut regagner une bête. */
export function regrow(herd: Herd, rng: Rng): void {
  const rules = ANIMAL_RULES[herd.kind]
  if (herd.size < rules.herdSize && rng.next() < rules.regrowth) herd.size++
}
