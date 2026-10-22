import { RANK_RULES, type Rank } from '../content/rarity'
import { RESOURCE_KINDS, RESOURCE_RULES, type ResourceKind } from '../content/resources'
import { isWater, type BiomeId } from '../content/biomes'
import type { Rng } from '../core/random'
import { rollRank } from '../rarity/rarity'
import type { World } from '../world/world'

export interface Deposit {
  id: number
  kind: ResourceKind
  /** Cellule du gisement. */
  x: number
  y: number
  rank: Rank
}

/** Sème les gisements sur le monde, de façon reproductible (une cellule au plus chacun). */
export function placeDeposits(world: World, rng: Rng, firstId = 1): Deposit[] {
  const deposits: Deposit[] = []
  let id = firstId
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const i = y * world.width + x
      const biome = world.biome[i] as BiomeId
      for (const kind of RESOURCE_KINDS) {
        const rules = RESOURCE_RULES[kind]
        if (!rules.biomes.includes(biome)) continue
        if (rules.coast && !touchesLand(world, x, y)) continue
        if (rng.next() >= rules.density) continue
        deposits.push({ id: id++, kind, x, y, rank: rollRank(rng) })
        break
      }
    }
  }
  return deposits
}

/**
 * Garantit au départ les gisements que les règles promettent (`nearStart`) : si la tribu
 * n'en tient aucun, on en pose un sur une de ses terres à portée du camp, hors du camp
 * lui-même quand c'est possible. Appelée une fois le territoire de départ pris.
 */
export function ensureNearStart(
  deposits: Deposit[],
  world: World,
  owner: Uint8Array,
  who: number,
  start: { x: number; y: number },
  rng: Rng,
): void {
  const { width, height } = world
  const taken = new Set(deposits.map((d) => d.y * width + d.x))
  let id = deposits.reduce((m, d) => Math.max(m, d.id), 0) + 1
  for (const kind of RESOURCE_KINDS) {
    const radius = RESOURCE_RULES[kind].nearStart
    if (radius === undefined) continue
    if (deposits.some((d) => d.kind === kind && heldBy(owner, width, height, d, who))) continue
    const spots: { x: number; y: number }[] = []
    for (let y = Math.max(0, start.y - radius); y <= Math.min(height - 1, start.y + radius); y++) {
      for (let x = Math.max(0, start.x - radius); x <= Math.min(width - 1, start.x + radius); x++) {
        const i = y * width + x
        if ((x === start.x && y === start.y) || taken.has(i) || owner[i] !== who) continue
        if (Math.hypot(x - start.x, y - start.y) <= radius) spots.push({ x, y })
      }
    }
    // Territoire réduit au seul camp (îlot) : le gisement est au camp même.
    if (spots.length === 0 && !taken.has(start.y * width + start.x)) spots.push(start)
    if (spots.length === 0) continue
    const spot = rng.pick(spots)
    taken.add(spot.y * width + spot.x)
    deposits.push({ id: id++, kind, x: spot.x, y: spot.y, rank: rollRank(rng) })
  }
}

function touchesLand(world: World, x: number, y: number): boolean {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue
    if (!isWater(world.biome[ny * world.width + nx]!)) return true
  }
  return false
}

/** Production mensuelle d'un gisement tenu. */
export function depositYield(deposit: Deposit): number {
  return RESOURCE_RULES[deposit.kind].yield * RANK_RULES[deposit.rank].power
}

/**
 * Le gisement est-il exploité par ce propriétaire ? Sur terre : sa cellule est tenue.
 * En mer (poisson) : une terre voisine est tenue.
 */
export function heldBy(
  owner: Uint8Array,
  width: number,
  height: number,
  deposit: Deposit,
  who: number,
): boolean {
  const { x, y } = deposit
  if (owner[y * width + x] === who) return true
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
    if (owner[ny * width + nx] === who) return true
  }
  return false
}
