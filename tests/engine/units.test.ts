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

  it("s'arrête au bord de l'eau", () => {
    const world = worldOf(['PPP~~~PPPP'])
    const u = scout(0.5, 0.5, { x: 8.5, y: 0.5 })
    for (let i = 0; i < 40; i++) moveUnit(u, world)
    expect(u.x).toBeLessThan(3)
    expect(u.target).toBeNull()
  })

  it('ne bouge pas sans cible', () => {
    const u = scout(2, 0.5, null)
    moveUnit(u, worldOf(['PPPP']))
    expect(u.x).toBe(2)
  })
})
