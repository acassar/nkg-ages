import { Visibility, type FogState } from '../fog/fog'
import { inBounds, moveCostAt, type World } from '../world/world'

export interface Point {
  x: number
  y: number
}

/** Chemin trouvé : points de passage lissés (le dernier est la destination) et coût prévu. */
export interface Route {
  points: Point[]
  cost: number
}

/** Ce que le joueur sait du terrain : seulement les cellules et le brouillard. */
export type Knowledge = Pick<FogState, 'cells'>

/** Coût supposé d'une cellule inconnue : la plus optimiste (plaine), pour tenter le passage. */
const UNKNOWN_COST = 1
/** Points regardés en avant pour lisser un chemin : borne le coût du lissage. */
const SMOOTH_LOOKAHEAD = 24

/**
 * Poids de l'heuristique : au-dessus de 1, la recherche file vers la cible et explore
 * bien moins de cellules, pour un chemin à peine plus long (au plus ce facteur).
 */
const HEURISTIC_WEIGHT = 1.3
const DIAGONAL = Math.SQRT2
const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, DIAGONAL],
  [1, -1, DIAGONAL],
  [-1, 1, DIAGONAL],
  [-1, -1, DIAGONAL],
] as const

/**
 * Coût de traversée d'une cellule selon ce que le joueur en sait.
 * L'inconnu est supposé praticable ; l'eau connue est infranchissable (Infinity).
 */
export function knownCost(world: World, knowledge: Knowledge, i: number): number {
  if (knowledge.cells[i] === Visibility.Unknown) return UNKNOWN_COST
  return moveCostAt(world, i)
}

/** Le point est-il franchissable d'après ce que sait le joueur ? */
export function knownPassable(world: World, knowledge: Knowledge, x: number, y: number): boolean {
  return Number.isFinite(pointCost(world, knowledge, x, y))
}

/** Le segment ne traverse-t-il que des cellules franchissables d'après le joueur ? */
export function knownLineClear(world: World, knowledge: Knowledge, a: Point, b: Point): boolean {
  return Number.isFinite(knownLineCost(world, knowledge, a, b))
}

/**
 * Coût le plus élevé des cellules que touche le segment (Infinity s'il est coupé).
 * Parcours exact de la grille : aucune cellule n'est sautée, et au passage par un coin
 * les deux cellules qui le bordent comptent (on ne se faufile pas entre deux cases d'eau).
 */
function knownLineCost(world: World, knowledge: Knowledge, a: Point, b: Point): number {
  let x = Math.floor(a.x)
  let y = Math.floor(a.y)
  const endX = Math.floor(b.x)
  const endY = Math.floor(b.y)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const stepX = Math.sign(dx)
  const stepY = Math.sign(dy)
  const deltaX = stepX === 0 ? Infinity : Math.abs(1 / dx)
  const deltaY = stepY === 0 ? Infinity : Math.abs(1 / dy)
  let nextX = stepX > 0 ? (x + 1 - a.x) * deltaX : stepX < 0 ? (a.x - x) * deltaX : Infinity
  let nextY = stepY > 0 ? (y + 1 - a.y) * deltaY : stepY < 0 ? (a.y - y) * deltaY : Infinity
  let worst = cellCost(world, knowledge, x, y)
  for (
    let guard = Math.abs(endX - x) + Math.abs(endY - y);
    guard > 0 && (x !== endX || y !== endY) && Number.isFinite(worst);
    guard--
  ) {
    if (Math.abs(nextX - nextY) < 1e-9) {
      worst = Math.max(
        worst,
        cellCost(world, knowledge, x + stepX, y),
        cellCost(world, knowledge, x, y + stepY),
      )
      x += stepX
      y += stepY
      nextX += deltaX
      nextY += deltaY
      guard--
    } else if (nextX < nextY) {
      x += stepX
      nextX += deltaX
    } else {
      y += stepY
      nextY += deltaY
    }
    worst = Math.max(worst, cellCost(world, knowledge, x, y))
  }
  return worst
}

function cellCost(world: World, knowledge: Knowledge, x: number, y: number): number {
  if (!inBounds(world, x, y)) return Infinity
  return knownCost(world, knowledge, y * world.width + x)
}

function pointCost(world: World, knowledge: Knowledge, x: number, y: number): number {
  return cellCost(world, knowledge, Math.floor(x), Math.floor(y))
}

/**
 * Chemin de `from` à `to` (A* sur la grille fine, 8 directions, sans couper les coins),
 * calculé sur la carte connue du joueur, ou null si aucun chemin connu d'au plus `maxCost`
 * n'y mène. Le plafond borne aussi le travail : la recherche s'arrête dès qu'il est dépassé.
 */
export function findPath(
  world: World,
  knowledge: Knowledge,
  from: Point,
  to: Point,
  maxCost = Infinity,
): Route | null {
  const { width, height } = world
  const sx = Math.floor(from.x)
  const sy = Math.floor(from.y)
  const tx = Math.floor(to.x)
  const ty = Math.floor(to.y)
  if (!inBounds(world, sx, sy) || !inBounds(world, tx, ty)) return null
  const start = sy * width + sx
  const goal = ty * width + tx
  if (!Number.isFinite(knownCost(world, knowledge, goal))) return null
  if (start === goal) return { points: [{ x: to.x, y: to.y }], cost: 0 }

  const { g, came, stamp, mark } = searchBuffers(width * height)
  // Une cellule n'a de valeurs valides que si son tampon vaut `mark` ; fermée : `mark + 1`.
  const touched = (i: number) => stamp[i]! >= mark
  const open = new MinHeap()
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - tx)
    const dy = Math.abs(y - ty)
    return Math.max(dx, dy) + (DIAGONAL - 1) * Math.min(dx, dy)
  }
  g[start] = 0
  came[start] = -1
  stamp[start] = mark
  open.push(start, h(sx, sy))

  let found = false
  while (open.size > 0) {
    const current = open.pop()
    if (current === goal) {
      found = true
      break
    }
    if (stamp[current] === mark + 1) continue
    stamp[current] = mark + 1
    const cx = current % width
    const cy = (current - cx) / width
    const here = knownCost(world, knowledge, current)
    // L'unité peut se trouver sur une cellule devenue infranchissable : on l'en laisse sortir.
    const hereCost = Number.isFinite(here) ? here : UNKNOWN_COST
    for (const [dx, dy, d] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const n = ny * width + nx
      if (stamp[n] === mark + 1) continue
      const cost = knownCost(world, knowledge, n)
      if (!Number.isFinite(cost)) continue
      if (
        dx !== 0 &&
        dy !== 0 &&
        (!Number.isFinite(knownCost(world, knowledge, cy * width + nx)) ||
          !Number.isFinite(knownCost(world, knowledge, ny * width + cx)))
      )
        continue
      const tentative = g[current]! + (d * (hereCost + cost)) / 2
      if (!touched(n) || tentative < g[n]!) {
        stamp[n] = mark
        g[n] = tentative
        came[n] = current
        const rest = h(nx, ny)
        // Au-delà du plafond même en ligne droite : inutile d'explorer.
        if (tentative + rest > maxCost) continue
        open.push(n, tentative + HEURISTIC_WEIGHT * rest)
      }
    }
  }
  if (!found) return null

  const cells: Point[] = []
  for (let c = came[goal]!; c !== start; c = came[c]!) {
    cells.push({ x: (c % width) + 0.5, y: Math.floor(c / width) + 0.5 })
  }
  cells.reverse()
  cells.push({ x: to.x, y: to.y })
  return { points: smooth(world, knowledge, from, cells), cost: g[goal]! }
}

/**
 * Retire les points de passage qu'une ligne droite permet de sauter, sans traverser
 * de terrain plus difficile que celui du tronçon qu'elle remplace (le détour reste un détour).
 */
function smooth(world: World, knowledge: Knowledge, from: Point, points: Point[]): Point[] {
  const out: Point[] = []
  let anchor = from
  let i = 0
  while (i < points.length) {
    const limit = Math.min(points.length - 1, i + SMOOTH_LOOKAHEAD)
    // Coût le plus élevé du tronçon prévu, de l'ancre jusqu'à chaque point candidat.
    const worst: number[] = []
    let running = pointCost(world, knowledge, anchor.x, anchor.y)
    for (let j = i; j <= limit; j++) {
      running = Math.max(running, pointCost(world, knowledge, points[j]!.x, points[j]!.y))
      worst.push(running)
    }
    let farthest = i
    for (let j = limit; j > i; j--) {
      if (knownLineCost(world, knowledge, anchor, points[j]!) <= worst[j - i]!) {
        farthest = j
        break
      }
    }
    anchor = points[farthest]!
    out.push(anchor)
    i = farthest + 1
  }
  return out
}

/** Le chemin restant traverse-t-il une cellule que l'on sait maintenant infranchissable ? */
export function pathBlocked(
  world: World,
  knowledge: Knowledge,
  from: Point,
  path: readonly Point[],
): boolean {
  let a = from
  for (const b of path) {
    if (!knownLineClear(world, knowledge, a, b)) return true
    a = b
  }
  return false
}

interface SearchBuffers {
  g: Float64Array
  came: Int32Array
  stamp: Uint32Array
  mark: number
}

let buffers: Omit<SearchBuffers, 'mark'> & { next: number } = {
  g: new Float64Array(0),
  came: new Int32Array(0),
  stamp: new Uint32Array(0),
  next: 0,
}

/**
 * Tableaux de recherche réutilisés d'un appel à l'autre : pas d'allocation par chemin.
 * Le tampon évite de les remettre à zéro (2 valeurs par recherche).
 */
function searchBuffers(size: number): SearchBuffers {
  if (buffers.g.length !== size || buffers.next > 0xfffffff0) {
    buffers = {
      g: new Float64Array(size),
      came: new Int32Array(size),
      stamp: new Uint32Array(size),
      next: 1,
    }
  }
  const mark = buffers.next
  buffers.next += 2
  return { ...buffers, mark }
}

/**
 * Tas binaire minimal sur des priorités numériques. Ses tableaux typés sont gardés
 * d'une recherche à l'autre et ne font que grandir : pas de ramasse-miettes en plein pas.
 */
class MinHeap {
  private static items = new Int32Array(1024)
  private static priorities = new Float64Array(1024)
  size = 0

  push(item: number, priority: number): void {
    if (this.size === MinHeap.items.length) MinHeap.grow()
    const { items, priorities } = MinHeap
    let i = this.size++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (priorities[parent]! <= priority) break
      items[i] = items[parent]!
      priorities[i] = priorities[parent]!
      i = parent
    }
    items[i] = item
    priorities[i] = priority
  }

  pop(): number {
    const { items, priorities } = MinHeap
    const top = items[0]!
    const n = --this.size
    if (n > 0) {
      const lastItem = items[n]!
      const lastPriority = priorities[n]!
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        if (left >= n) break
        const right = left + 1
        const child = right < n && priorities[right]! < priorities[left]! ? right : left
        if (priorities[child]! >= lastPriority) break
        items[i] = items[child]!
        priorities[i] = priorities[child]!
        i = child
      }
      items[i] = lastItem
      priorities[i] = lastPriority
    }
    return top
  }

  private static grow(): void {
    const items = new Int32Array(MinHeap.items.length * 2)
    const priorities = new Float64Array(MinHeap.priorities.length * 2)
    items.set(MinHeap.items)
    priorities.set(MinHeap.priorities)
    MinHeap.items = items
    MinHeap.priorities = priorities
  }
}
