import { describe, expect, it } from 'vitest'
import { Biome } from '@/engine/content/biomes'
import { moveAlong, type Mover } from '@/engine/units/units'
import type { World } from '@/engine/world/world'

/** Petit monde dessiné à la main : P plaine, F forêt, ~ eau. */
function worldOf(rows: string[]): World {
  const height = rows.length
  const width = rows[0]!.length
  const biome = new Uint8Array(width * height)
  const code: Record<string, number> = { P: Biome.Plain, F: Biome.Forest, '~': Biome.Ocean }
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

/** Vitesse de marche des essais, en cellules par pas en plaine. */
const SPEED = 0.5

const walker = (x: number, y: number, target: Mover['target']): Mover => ({
  x,
  y,
  target,
  path: [],
  plannedFog: 0,
  patience: 100,
})

describe('marche le long d’un chemin', () => {
  it('avance vers la cible à sa vitesse', () => {
    const world = worldOf(['PPPPPPPPPP'])
    const u = walker(0.5, 0.5, { x: 9.5, y: 0.5 })
    moveAlong(u, world, SPEED)
    expect(u.x).toBeCloseTo(0.5 + SPEED)
  })

  it('atteint la cible puis s’arrête', () => {
    const world = worldOf(['PPPPPPPPPP'])
    const u = walker(0.5, 0.5, { x: 3.5, y: 0.5 })
    for (let i = 0; i < 20; i++) moveAlong(u, world, SPEED)
    expect(u.x).toBe(3.5)
    expect(u.target).toBeNull()
  })

  it('est plus lente en forêt', () => {
    const plain = walker(0.5, 0.5, { x: 9.5, y: 0.5 })
    const forest = walker(0.5, 0.5, { x: 9.5, y: 0.5 })
    moveAlong(plain, worldOf(['PPPPPPPPPP']), SPEED)
    moveAlong(forest, worldOf(['FFFFFFFFFF']), SPEED)
    expect(forest.x - 0.5).toBeLessThan(plain.x - 0.5)
  })

  it("ne met jamais le pied dans l'eau et signale qu'il faut recalculer", () => {
    const world = worldOf(['PPP~~~PPPP'])
    const u = walker(0.5, 0.5, { x: 8.5, y: 0.5 })
    let blocked = false
    for (let i = 0; i < 40; i++) blocked = !moveAlong(u, world, SPEED) || blocked
    expect(u.x).toBeLessThan(3)
    expect(blocked).toBe(true)
  })

  it('suit ses points de passage dans l’ordre, même plusieurs dans un tick', () => {
    const world = worldOf(['PPPPPP', 'PPPPPP', 'PPPPPP'])
    const u = walker(0.5, 0.5, { x: 0.5, y: 2.5 })
    u.path = [
      { x: 0.7, y: 0.5 },
      { x: 0.7, y: 0.7 },
      { x: 0.5, y: 2.5 },
    ]
    moveAlong(u, world, SPEED)
    expect(u.path).toHaveLength(1)
    expect(u.y).toBeGreaterThan(0.7)
    for (let i = 0; i < 10; i++) moveAlong(u, world, SPEED)
    expect(u).toMatchObject({ x: 0.5, y: 2.5, target: null, path: [] })
  })

  it('ne bouge pas sans cible', () => {
    const u = walker(2, 0.5, null)
    moveAlong(u, worldOf(['PPPP']), SPEED)
    expect(u.x).toBe(2)
  })
})
