import { BIOMES } from '../content/biomes'
import { biomeAt, type World } from '../world/world'

export type UnitKind = 'eclaireur' | 'chasseur'

export interface Unit {
  id: number
  kind: UnitKind
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
  /** Ordre donné par l'unité elle-même (poursuite d'un troupeau), pas par le joueur. */
  auto: boolean
}

export interface UnitRules {
  name: string
  /** Cellules parcourues par tick en plaine. */
  speed: number
  /** Rayon de vision en cellules. */
  sight: number
  /**
   * Détour accepté quand le terrain découvert coupe le chemin prévu : l'unité renonce si
   * le trajet total dépasse `detour` fois le trajet prévu au départ, plus `detourSlack`.
   */
  detour: number
  detourSlack: number
}

export const UNIT_RULES: Readonly<Record<UnitKind, UnitRules>> = {
  eclaireur: { name: 'Éclaireur', speed: 0.5, sight: 9, detour: 2, detourSlack: 30 },
  chasseur: { name: 'Chasseur', speed: 0.42, sight: 6, detour: 2, detourSlack: 20 },
}

/**
 * Avance une unité le long de son chemin, plus lentement en terrain difficile.
 * Rend false si le prochain pas tombe sur une cellule infranchissable : il faut recalculer.
 */
export function moveUnit(unit: Unit, world: World): boolean {
  if (!unit.target) return true
  if (unit.path.length === 0) unit.path = [{ ...unit.target }]
  const here = biomeAt(world, unit.x, unit.y)
  const cost = here === undefined ? 1 : BIOMES[here as keyof typeof BIOMES].moveCost
  let budget = UNIT_RULES[unit.kind].speed / (Number.isFinite(cost) ? cost : 1)
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

/** Arrête l'unité : plus de cible ni de chemin. */
export function stopUnit(unit: Unit): void {
  unit.target = null
  unit.path = []
  unit.auto = false
}

export function isPassable(world: World, x: number, y: number): boolean {
  const b = biomeAt(world, x, y)
  return b !== undefined && Number.isFinite(BIOMES[b as keyof typeof BIOMES].moveCost)
}
