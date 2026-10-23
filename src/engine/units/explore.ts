import { EXPLORE_RULES } from '../content/units'
import { Visibility } from '../fog/fog'
import { moveCostAt, type World } from '../world/world'
import type { Knowledge, Point } from './path'

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/**
 * Lisière du connu la plus proche à pied : une cellule connue et franchissable qui touche
 * l'inconnu, atteinte par la terre déjà connue. Null si tout ce qu'on peut atteindre est connu.
 */
export function frontierTarget(world: World, knowledge: Knowledge, from: Point): Point | null {
  const { width, height } = world
  const passable = (i: number) =>
    knowledge.cells[i] !== Visibility.Unknown && Number.isFinite(moveCostAt(world, i))
  const touchesUnknown = (x: number, y: number) =>
    DIRS.some(([dx, dy]) => {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false
      return knowledge.cells[ny * width + nx] === Visibility.Unknown
    })
  const sx = Math.floor(from.x)
  const sy = Math.floor(from.y)
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null
  const start = sy * width + sx
  const seen = new Uint8Array(width * height)
  const queue = new Int32Array(Math.min(width * height, EXPLORE_RULES.maxSearch))
  let head = 0
  let tail = 0
  queue[tail++] = start
  seen[start] = 1
  while (head < tail) {
    const i = queue[head++]!
    const x = i % width
    const y = (i - x) / width
    // La case de départ ne compte pas : on y voit déjà tout ce qu'on peut voir.
    if (i !== start && touchesUnknown(x, y)) return { x: x + 0.5, y: y + 0.5 }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const j = ny * width + nx
      if (seen[j] || !passable(j)) continue
      if (tail >= queue.length) return null
      seen[j] = 1
      queue[tail++] = j
    }
  }
  return null
}
