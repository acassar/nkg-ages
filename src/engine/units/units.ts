import { BIOMES } from '../content/biomes'
import { biomeAt, type World } from '../world/world'

export type UnitKind = 'eclaireur'

export interface Unit {
  id: number
  kind: UnitKind
  x: number
  y: number
  target: { x: number; y: number } | null
}

export interface UnitRules {
  name: string
  /** Cellules parcourues par tick en plaine. */
  speed: number
  /** Rayon de vision en cellules. */
  sight: number
}

export const UNIT_RULES: Readonly<Record<UnitKind, UnitRules>> = {
  eclaireur: { name: 'Éclaireur', speed: 0.5, sight: 9 },
}

/**
 * Avance une unité vers sa cible, plus lentement en terrain difficile.
 * Elle s'arrête au bord de l'eau (pas encore de bateaux).
 */
export function moveUnit(unit: Unit, world: World): void {
  if (!unit.target) return
  const dx = unit.target.x - unit.x
  const dy = unit.target.y - unit.y
  const dist = Math.hypot(dx, dy)
  const here = biomeAt(world, unit.x, unit.y)
  const cost = here === undefined ? 1 : BIOMES[here as keyof typeof BIOMES].moveCost
  const step = UNIT_RULES[unit.kind].speed / (Number.isFinite(cost) ? cost : 1)
  if (dist <= step) {
    if (isPassable(world, unit.target.x, unit.target.y)) {
      unit.x = unit.target.x
      unit.y = unit.target.y
    }
    unit.target = null
    return
  }
  const nx = unit.x + (dx / dist) * step
  const ny = unit.y + (dy / dist) * step
  if (!isPassable(world, nx, ny)) {
    unit.target = null
    return
  }
  unit.x = nx
  unit.y = ny
}

export function isPassable(world: World, x: number, y: number): boolean {
  const b = biomeAt(world, x, y)
  return b !== undefined && Number.isFinite(BIOMES[b as keyof typeof BIOMES].moveCost)
}
