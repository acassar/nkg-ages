import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { Biome, isWater } from '@/engine/content/biomes'
import { Visibility } from '@/engine/fog/fog'
import { findPath, knownLineClear, pathBlocked, type Point } from '@/engine/units/path'
import type { World } from '@/engine/world/world'

/** Petit monde dessiné à la main : P plaine, M montagne, ~ eau. */
function worldOf(rows: string[]): World {
  const height = rows.length
  const width = rows[0]!.length
  const biome = new Uint8Array(width * height)
  const code: Record<string, number> = { P: Biome.Plain, M: Biome.Mountain, '~': Biome.Ocean }
  rows.forEach((row, y) => [...row].forEach((c, x) => (biome[y * width + x] = code[c]!)))
  const zeros = new Float32Array(width * height)
  return {
    seed: 'test',
    width,
    height,
    elevation: zeros,
    moisture: zeros,
    temperature: zeros,
    biome,
    river: new Uint8Array(width * height),
  }
}

/** Points de passage seuls, ou null. */
const pathOf = (...args: Parameters<typeof findPath>) => findPath(...args)?.points ?? null

const known = (w: World) => ({ cells: new Uint8Array(w.width * w.height).fill(Visibility.Seen) })
const unknown = (w: World) => ({ cells: new Uint8Array(w.width * w.height) })

/** Aucun segment du chemin ne traverse l'eau réelle. */
function dry(w: World, from: Point, path: Point[]): boolean {
  return !pathBlocked(w, known(w), from, path)
}

const LAKE = ['PPPPPPPPPP', 'PPPP~~PPPP', 'PPPP~~PPPP', 'PPPP~~PPPP', 'PPPPPPPPPP']

describe('chemins sur la carte connue', () => {
  it('va tout droit en terrain dégagé', () => {
    const w = worldOf(['PPPPPPPPPP'])
    expect(pathOf(w, known(w), { x: 0.5, y: 0.5 }, { x: 9.5, y: 0.5 })).toEqual([
      { x: 9.5, y: 0.5 },
    ])
  })

  it('contourne un lac connu', () => {
    const w = worldOf(LAKE)
    const from = { x: 1.5, y: 2.5 }
    const path = pathOf(w, known(w), from, { x: 8.5, y: 2.5 })!
    expect(path.length).toBeGreaterThan(1)
    expect(path.at(-1)).toEqual({ x: 8.5, y: 2.5 })
    expect(dry(w, from, path)).toBe(true)
  })

  it('traverse l’inconnu, supposé praticable, sans rien révéler', () => {
    const w = worldOf(LAKE)
    const path = pathOf(w, unknown(w), { x: 1.5, y: 2.5 }, { x: 8.5, y: 2.5 })
    expect(path).toEqual([{ x: 8.5, y: 2.5 }])
    // Même une destination en eau, tant qu'elle est inconnue.
    expect(pathOf(w, unknown(w), { x: 1.5, y: 2.5 }, { x: 4.5, y: 2.5 })).not.toBeNull()
  })

  it('refuse une destination en eau connue ou hors du monde', () => {
    const w = worldOf(LAKE)
    expect(pathOf(w, known(w), { x: 1.5, y: 2.5 }, { x: 4.5, y: 2.5 })).toBeNull()
    expect(pathOf(w, known(w), { x: 1.5, y: 2.5 }, { x: 40, y: 2.5 })).toBeNull()
  })

  it('n’a aucun chemin vers une île connue', () => {
    const w = worldOf(['PP~~~PP', 'PP~~~PP'])
    expect(pathOf(w, known(w), { x: 0.5, y: 0.5 }, { x: 6.5, y: 1.5 })).toBeNull()
  })

  it('ne coupe pas un coin entre deux cellules d’eau', () => {
    const w = worldOf(['P~P', '~PP', 'PPP'])
    expect(pathOf(w, known(w), { x: 0.5, y: 0.5 }, { x: 1.5, y: 1.5 })).toBeNull()
  })

  it('préfère un détour en plaine à la traversée d’une montagne', () => {
    const w = worldOf(['PPPPPPP', 'PPPPPPP', 'PPPMPPP', 'PPPPPPP', 'PPPPPPP'])
    const from = { x: 1.5, y: 2.5 }
    const path = pathOf(w, known(w), from, { x: 5.5, y: 2.5 })!
    // Le chemin évite la cellule de montagne (3, 2) : une montagne vue comme de l'eau.
    w.biome[2 * 7 + 3] = Biome.Ocean
    expect(dry(w, from, path)).toBe(true)
  })

  it('donne le coût du trajet et renonce au-delà d’un plafond', () => {
    const w = worldOf(LAKE)
    const from = { x: 1.5, y: 2.5 }
    const to = { x: 8.5, y: 2.5 }
    const route = findPath(w, known(w), from, to)!
    expect(route.cost).toBeGreaterThan(7)
    expect(findPath(w, known(w), from, to, route.cost)).not.toBeNull()
    expect(findPath(w, known(w), from, to, route.cost - 0.5)).toBeNull()
  })

  it('rend la destination quand on y est déjà', () => {
    const w = worldOf(['PPP'])
    expect(pathOf(w, known(w), { x: 1.2, y: 0.5 }, { x: 1.8, y: 0.5 })).toEqual([
      { x: 1.8, y: 0.5 },
    ])
  })

  it('voit qu’un chemin est coupé une fois l’eau découverte', () => {
    const w = worldOf(LAKE)
    const from = { x: 1.5, y: 2.5 }
    const path = pathOf(w, unknown(w), from, { x: 8.5, y: 2.5 })!
    expect(pathBlocked(w, unknown(w), from, path)).toBe(false)
    expect(pathBlocked(w, known(w), from, path)).toBe(true)
  })

  it('ne traverse jamais l’eau connue, quel que soit le monde (fast-check)', () => {
    const cell = fc.constantFrom('P', 'P', 'P', 'M', '~')
    fc.assert(
      fc.property(
        fc.array(fc.array(cell, { minLength: 8, maxLength: 8 }), { minLength: 6, maxLength: 6 }),
        fc.integer({ min: 0, max: 47 }),
        fc.integer({ min: 0, max: 47 }),
        (rows, a, b) => {
          const w = worldOf(rows.map((r) => r.join('')))
          const from = { x: (a % 8) + 0.5, y: Math.floor(a / 8) + 0.5 }
          const to = { x: (b % 8) + 0.5, y: Math.floor(b / 8) + 0.5 }
          if (isWater(w.biome[a]!)) return
          const path = pathOf(w, known(w), from, to)
          if (!path) return
          expect(path.at(-1)).toEqual(to)
          expect(dry(w, from, path)).toBe(true)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('trouve un chemin dès qu’il existe une suite de cellules voisines (fast-check)', () => {
    const cell = fc.constantFrom('P', 'P', '~')
    fc.assert(
      fc.property(
        fc.array(fc.array(cell, { minLength: 7, maxLength: 7 }), { minLength: 5, maxLength: 5 }),
        (rows) => {
          const w = worldOf(rows.map((r) => r.join('')))
          const land = [...w.biome.keys()].filter((i) => !isWater(w.biome[i]!))
          if (land.length < 2) return
          const [a, b] = [land[0]!, land.at(-1)!]
          const reachable = connected4(w, a, b)
          const path = pathOf(
            w,
            known(w),
            { x: (a % 7) + 0.5, y: Math.floor(a / 7) + 0.5 },
            { x: (b % 7) + 0.5, y: Math.floor(b / 7) + 0.5 },
          )
          // Relié par des voisins directs : toujours un chemin. L'inverse peut manquer
          // (pas de coin coupé), mais un chemin trouvé est toujours praticable.
          if (reachable) expect(path).not.toBeNull()
        },
      ),
      { numRuns: 300 },
    )
  })

  it('vérifie aussi les segments sur les bords du monde', () => {
    const w = worldOf(['PP'])
    expect(knownLineClear(w, known(w), { x: 0.5, y: 0.5 }, { x: 3, y: 0.5 })).toBe(false)
  })
})

/** Accessibilité par voisins directs (4 directions), pour comparer avec A*. */
function connected4(w: World, a: number, b: number): boolean {
  const seen = new Set([a])
  const queue = [a]
  while (queue.length > 0) {
    const c = queue.shift()!
    if (c === b) return true
    const x = c % w.width
    const y = Math.floor(c / w.width)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w.width || ny >= w.height) continue
      const n = ny * w.width + nx
      if (seen.has(n) || isWater(w.biome[n]!)) continue
      seen.add(n)
      queue.push(n)
    }
  }
  return false
}
