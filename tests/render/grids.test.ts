import { describe, expect, it } from 'vitest'
import { fogToTexels, ownerMask, riverTexels } from '@/render/grids'
import { paletteArray } from '@/render/palette'

const patch = (data: number[]) => ({
  x: 0,
  y: 0,
  w: data.length,
  h: 1,
  data: Uint8Array.from(data),
})

describe('textures de la carte', () => {
  it('code le brouillard en trois niveaux', () => {
    expect([...fogToTexels(patch([0, 1, 2]))]).toEqual([0, 128, 255])
  })
  it('isole le territoire d’un propriétaire', () => {
    expect([...ownerMask(patch([0, 1, 2, 1]), 1)]).toEqual([0, 255, 0, 255])
  })
  it('trace les fleuves d’autant plus larges que le débit est fort', () => {
    expect([...riverTexels(Uint8Array.from([0, 1, 128, 255]))]).toEqual([0, 150, 203, 255])
  })
  it('a une couleur pour chaque biome', () => {
    const p = paletteArray()
    expect(p).toHaveLength(30)
    expect([...p].every((c) => c >= 0 && c <= 1)).toBe(true)
  })
})

describe('couleurs CSS', () => {
  it('convertit une couleur de la palette', async () => {
    const { cssColor, INK } = await import('@/render/palette')
    expect(cssColor(INK)).toBe('rgba(58, 44, 30, 1)')
    expect(cssColor([1, 0, 0], 0.5)).toBe('rgba(255, 0, 0, 0.5)')
  })
})
