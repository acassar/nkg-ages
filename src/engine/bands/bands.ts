import { isWater } from '../content/biomes'
import { BAND_RULES, type BandRules } from '../content/bands'
import { claim, NO_OWNER, PLAYER, type TerritoryState } from '../territory/territory'
import type { Rect } from '../core/geometry'
import type { World } from '../world/world'

/**
 * Efficacité de cueillette d'une bande selon sa taille : 1 jusqu'à `comfortSize`, puis
 * moins à chaque personne de plus, sans descendre sous `minEfficiency`.
 */
export function bandEfficiency(members: number, rules: BandRules = BAND_RULES): number {
  const extra = Math.max(0, members - rules.comfortSize)
  return Math.max(rules.minEfficiency, 1 - extra * rules.lossPerPerson)
}

/** Au-delà, une cellule est tenue pour intacte. */
const FULL = 0.995

/** Abondance de chaque cellule (1 : intacte, 0 : épuisée). */
export function createAbundance(size: number): Float32Array {
  return new Float32Array(size).fill(1)
}

/** Cellules du joueur, dans l'ordre de la grille. */
export function playerCells(territory: TerritoryState): number[] {
  const { owner } = territory
  const out: number[] = []
  for (let i = 0; i < owner.length; i++) if (owner[i] === PLAYER) out.push(i)
  return out
}

/** Ce qu'offrent ces cellules ce mois-ci : somme des richesses, épuisement compris. */
export function forageOf(
  cells: readonly number[],
  weights: Float32Array | null,
  abundance: Float32Array,
): number {
  if (!weights) return 0
  let sum = 0
  for (const i of cells) sum += weights[i]! * abundance[i]!
  return sum
}

/** Cellules pas encore repoussées (abondance sous 1), pour une partie reprise. */
export function depletedCells(abundance: Float32Array): number[] {
  const out: number[] = []
  for (let i = 0; i < abundance.length; i++) if (abundance[i]! < 1) out.push(i)
  return out
}

/** Rectangle englobant ces cellules (indices de grille), ou null s'il n'y en a aucune. */
export function cellsRect(cells: readonly number[], width: number): Rect | null {
  if (cells.length === 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const i of cells) {
    const x = i % width
    const y = (i - x) / width
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/**
 * Un mois sur les terres : les cellules exploitées (`cells`) perdent de leur abondance,
 * d'autant plus que la part cueillie (`share`, de 0 à 1) est grande ; toutes celles qui ne
 * sont pas pleines repoussent, au rythme de la saison (`season`, 1 en temps normal, moins
 * l'hiver). `depleted` tient la liste de ces dernières, mise à jour : on ne parcourt pas
 * toute la carte chaque mois.
 */
export function exploit(
  cells: readonly number[],
  abundance: Float32Array,
  depleted: number[],
  share: number,
  season: number,
  rules: BandRules = BAND_RULES,
): void {
  const loss = rules.depletion * Math.min(1, Math.max(0, share))
  if (loss > 0)
    for (const i of cells) {
      if (abundance[i]! >= 1) depleted.push(i)
      abundance[i] = abundance[i]! * (1 - loss)
    }
  const regrow = rules.regrowth * Math.max(0, season)
  let kept = 0
  for (const i of depleted) {
    const a = abundance[i]!
    if (a >= 1) continue
    // Presque repoussée, elle l'est tout à fait : la sauvegarde reste courte (plages de 1).
    const next = a + regrow * (1 - a)
    abundance[i] = next >= FULL ? 1 : next
    if (next < FULL) depleted[kept++] = i
  }
  depleted.length = kept
}

/**
 * Abondance moyenne autour d'un point (cellules de terre dans le rayon), pondérée par la
 * richesse : 1 pour des terres intactes. Rend aussi la richesse offerte (somme pondérée).
 * Avec `owner`, les terres d'un autre peuple ne comptent pas : la bande ne peut y cueillir.
 */
export function forageAround(
  world: World,
  weights: Float32Array,
  abundance: Float32Array,
  x: number,
  y: number,
  radius: number,
  owner?: Uint8Array,
): { mean: number; offered: number } {
  let total = 0
  let offered = 0
  const r2 = radius * radius
  for (
    let cy = Math.max(0, Math.floor(y - radius));
    cy <= Math.min(world.height - 1, y + radius);
    cy++
  ) {
    for (
      let cx = Math.max(0, Math.floor(x - radius));
      cx <= Math.min(world.width - 1, x + radius);
      cx++
    ) {
      const dx = cx + 0.5 - x
      const dy = cy + 0.5 - y
      if (dx * dx + dy * dy > r2) continue
      const i = cy * world.width + cx
      if (isWater(world.biome[i]!)) continue
      if (owner && owner[i] !== NO_OWNER && owner[i] !== PLAYER) continue
      total += weights[i]!
      offered += weights[i]! * abundance[i]!
    }
  }
  return { mean: total > 0 ? offered / total : 0, offered }
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/** Cellules de terre reliées au point, dans le rayon, libres ou déjà au joueur. */
function zoneOf(world: World, territory: TerritoryState, x: number, y: number, radius: number) {
  const { width, height } = world
  const sx = Math.floor(x)
  const sy = Math.floor(y)
  const out: number[] = []
  const start = sy * width + sx
  if (isWater(world.biome[start]!)) return out
  const seen = new Set([start])
  const queue = [start]
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!
    const o = territory.owner[i]
    if (o !== NO_OWNER && o !== PLAYER) continue
    out.push(i)
    const cx = i % width
    const cy = (i - cx) / width
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const n = ny * width + nx
      if (seen.has(n) || isWater(world.biome[n]!)) continue
      if ((nx + 0.5 - x) ** 2 + (ny + 0.5 - y) ** 2 > radius * radius) continue
      seen.add(n)
      queue.push(n)
    }
  }
  return out
}

/**
 * Les zones des bandes suivent leurs bandes. `held` : cellules que les zones tenaient
 * jusqu'ici (les seules qu'elles rendent : les terres d'un village restent à lui). Rend les
 * cellules qu'elles tiennent maintenant. Une cellule d'un autre peuple n'est jamais prise.
 */
export function refreshZones(
  territory: TerritoryState,
  world: World,
  bands: readonly { x: number; y: number }[],
  held: readonly number[],
  radius: number = BAND_RULES.radius,
): number[] {
  const wanted = new Set<number>()
  for (const band of bands)
    for (const i of zoneOf(world, territory, band.x, band.y, radius)) wanted.add(i)
  const before = new Set(held)
  const next: number[] = []
  const { width } = world
  for (const i of held) {
    if (wanted.has(i)) next.push(i)
    else if (territory.owner[i] === PLAYER)
      claim(territory, i % width, Math.floor(i / width), NO_OWNER)
  }
  for (const i of wanted) {
    if (before.has(i) || territory.owner[i] !== NO_OWNER) continue
    claim(territory, i % width, Math.floor(i / width), PLAYER)
    next.push(i)
  }
  return next
}
