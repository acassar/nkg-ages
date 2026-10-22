import { describe, expect, it } from 'vitest'
import { Biome } from '@/engine/content/biomes'
import { moveUnit, UNIT_RULES, type Unit } from '@/engine/units/units'
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
  }
}

const scout = (x: number, y: number, target: Unit['target']): Unit => ({
  id: 1,
  kind: 'eclaireur',
  x,
  y,
  target,
  path: [],
  plannedFog: 0,
  patience: 100,
})

describe('déplacement des unités', () => {
  it('avance vers la cible à sa vitesse', () => {
    const world = worldOf(['PPPPPPPPPP'])
    const u = scout(0.5, 0.5, { x: 9.5, y: 0.5 })
    moveUnit(u, world)
    expect(u.x).toBeCloseTo(0.5 + UNIT_RULES.eclaireur.speed)
  })

  it('atteint la cible puis s’arrête', () => {
    const world = worldOf(['PPPPPPPPPP'])
    const u = scout(0.5, 0.5, { x: 3.5, y: 0.5 })
    for (let i = 0; i < 20; i++) moveUnit(u, world)
    expect(u.x).toBe(3.5)
    expect(u.target).toBeNull()
  })

  it('est plus lente en forêt', () => {
    const plain = scout(0.5, 0.5, { x: 9.5, y: 0.5 })
    const forest = scout(0.5, 0.5, { x: 9.5, y: 0.5 })
    moveUnit(plain, worldOf(['PPPPPPPPPP']))
    moveUnit(forest, worldOf(['FFFFFFFFFF']))
    expect(forest.x - 0.5).toBeLessThan(plain.x - 0.5)
  })

  it("ne met jamais le pied dans l'eau et signale qu'il faut recalculer", () => {
    const world = worldOf(['PPP~~~PPPP'])
    const u = scout(0.5, 0.5, { x: 8.5, y: 0.5 })
    let blocked = false
    for (let i = 0; i < 40; i++) blocked = !moveUnit(u, world) || blocked
    expect(u.x).toBeLessThan(3)
    expect(blocked).toBe(true)
  })

  it('suit ses points de passage dans l’ordre, même plusieurs dans un tick', () => {
    const world = worldOf(['PPPPPP', 'PPPPPP', 'PPPPPP'])
    const u = scout(0.5, 0.5, { x: 0.5, y: 2.5 })
    u.path = [
      { x: 0.7, y: 0.5 },
      { x: 0.7, y: 0.7 },
      { x: 0.5, y: 2.5 },
    ]
    moveUnit(u, world)
    expect(u.path).toHaveLength(1)
    expect(u.y).toBeGreaterThan(0.7)
    for (let i = 0; i < 10; i++) moveUnit(u, world)
    expect(u).toMatchObject({ x: 0.5, y: 2.5, target: null, path: [] })
  })

  it('ne bouge pas sans cible', () => {
    const u = scout(2, 0.5, null)
    moveUnit(u, worldOf(['PPPP']))
    expect(u.x).toBe(2)
  })
})
