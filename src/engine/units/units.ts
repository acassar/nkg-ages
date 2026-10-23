import { BIOMES } from '../content/biomes'
import { biomeAt, inBounds, moveCostAt, type World } from '../world/world'

/** Ce qui marche sur la carte le long d'un chemin : une bande (plus tard, une expédition). */
export interface Mover {
  x: number
  y: number
  /** Destination demandée par le joueur. */
  target: { x: number; y: number } | null
  /** Points de passage restants vers la cible (le dernier est la cible). */
  path: { x: number; y: number }[]
  /** Version du brouillard sur laquelle le chemin a été vérifié. */
  plannedFog: number
  /** Coût de trajet qu'elle accepte encore de dépenser avant de renoncer. */
  patience: number
}

/**
 * Avance sur son chemin de `speed` cellules au plus (en plaine), moins en terrain difficile.
 * Rend false si le prochain pas tombe sur une cellule infranchissable.
 */
export function moveAlong(unit: Mover, world: World, speed: number): boolean {
  if (!unit.target) return true
  if (unit.path.length === 0) unit.path = [{ ...unit.target }]
  const cx = Math.floor(unit.x)
  const cy = Math.floor(unit.y)
  const cost = inBounds(world, cx, cy) ? moveCostAt(world, cy * world.width + cx) : 1
  let budget = speed / (Number.isFinite(cost) ? cost : 1)
  while (budget > 0 && unit.path.length > 0) {
    const next = unit.path[0]!
    const dx = next.x - unit.x
    const dy = next.y - unit.y
    const dist = Math.hypot(dx, dy)
    const reach = dist <= budget
    const nx = reach ? next.x : unit.x + (dx / dist) * budget
    const ny = reach ? next.y : unit.y + (dy / dist) * budget
    if (!isPassable(world, nx, ny)) return false
    unit.patience -= Math.hypot(nx - unit.x, ny - unit.y) * (Number.isFinite(cost) ? cost : 1)
    unit.x = nx
    unit.y = ny
    if (!reach) return true
    budget -= dist
    unit.path.shift()
  }
  if (unit.path.length === 0) unit.target = null
  return true
}

/** Arrête ce qui marche : plus de cible ni de chemin. */
export function stopMover(mover: Mover): void {
  mover.target = null
  mover.path = []
}

export function isPassable(world: World, x: number, y: number): boolean {
  const b = biomeAt(world, x, y)
  return b !== undefined && Number.isFinite(BIOMES[b as keyof typeof BIOMES].moveCost)
}
