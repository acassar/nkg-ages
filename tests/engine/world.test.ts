import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { Biome, BIOME_COUNT, isWater } from '@/engine/content/biomes'
import { createRng } from '@/engine/core/random'
import { classify, generateWorld } from '@/engine/world/generate'
import { findStarts, rateStart, START_RADIUS } from '@/engine/world/starts'

const small = (seed: string) => generateWorld({ seed, width: 160, height: 80 })

describe('génération du monde', () => {
  it('est déterministe pour une graine', () => {
    const a = small('altamira')
    const b = small('altamira')
    expect(a.elevation).toEqual(b.elevation)
    expect(a.biome).toEqual(b.biome)
  })

  it('change avec la graine', () => {
    expect(small('a').biome).not.toEqual(small('b').biome)
  })

  it('respecte la taille demandée et la taille par défaut', () => {
    const w = small('taille')
    expect(w.biome.length).toBe(160 * 80)
    const big = generateWorld({ seed: 'défaut' })
    expect([big.width, big.height]).toEqual([512, 256])
  })

  it('garde la part de terres voulue, à quelques points près', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), (seed) => {
        const w = small(seed)
        let land = 0
        for (const b of w.biome) if (!isWater(b)) land++
        const ratio = land / w.biome.length
        expect(ratio).toBeGreaterThan(0.3)
        expect(ratio).toBeLessThan(0.46)
      }),
      { numRuns: 25 },
    )
  })

  it('borde le monde d’océan', () => {
    const w = small('bords')
    for (let x = 0; x < w.width; x++) {
      expect(isWater(w.biome[x]!)).toBe(true)
      expect(isWater(w.biome[(w.height - 1) * w.width + x]!)).toBe(true)
    }
  })

  it('garde des champs dans leurs bornes et des biomes connus', () => {
    const w = small('bornes')
    for (let i = 0; i < w.biome.length; i++) {
      expect(w.elevation[i]).toBeGreaterThanOrEqual(-1)
      expect(w.elevation[i]).toBeLessThanOrEqual(1)
      expect(w.moisture[i]).toBeGreaterThanOrEqual(0)
      expect(w.temperature[i]).toBeLessThanOrEqual(1)
      expect(w.biome[i]).toBeLessThan(BIOME_COUNT)
    }
  })

  it('produit une variété de biomes', () => {
    const w = generateWorld({ seed: 'variété' })
    expect(new Set(w.biome).size).toBeGreaterThanOrEqual(7)
  })

  it.each([
    [-0.5, 0.5, 0.5, Biome.DeepOcean],
    [-0.05, 0.5, 0.5, Biome.Ocean],
    [0.2, 0.5, 0.05, Biome.Ice],
    [0.7, 0.5, 0.5, Biome.Mountain],
    [0.2, 0.5, 0.2, Biome.Tundra],
    [0.4, 0.5, 0.5, Biome.Hills],
    [0.1, 0.2, 0.8, Biome.Desert],
    [0.1, 0.8, 0.9, Biome.Jungle],
    [0.1, 0.6, 0.5, Biome.Forest],
    [0.1, 0.4, 0.5, Biome.Plain],
  ])('classe altitude %f, humidité %f, chaleur %f', (e, m, t, expected) => {
    expect(classify(e, m, t)).toBe(expected)
  })
})

describe('sites de départ', () => {
  it('trouve toujours des départs viables : eau et nourriture à portée', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), (seed) => {
        const w = generateWorld({ seed, width: 256, height: 128 })
        const starts = findStarts(w, createRng(seed), 3)
        expect(starts.length).toBeGreaterThan(0)
        for (const s of starts) {
          expect(rateStart(w, s.x, s.y)).not.toBeNull()
          let water = false
          for (let dy = -START_RADIUS; dy <= START_RADIUS; dy++)
            for (let dx = -START_RADIUS; dx <= START_RADIUS; dx++)
              if (dx * dx + dy * dy <= START_RADIUS ** 2)
                water ||= isWater(w.biome[(s.y + dy) * w.width + s.x + dx]!)
          expect(water).toBe(true)
        }
      }),
      { numRuns: 20 },
    )
  })

  it('espace les départs proposés', () => {
    const w = generateWorld({ seed: 'espacés' })
    const starts = findStarts(w, createRng('espacés'), 3)
    for (const a of starts)
      for (const b of starts)
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(40)
  })

  it('refuse un site en pleine mer', () => {
    const w = small('mer')
    expect(rateStart(w, 0, 0)).toBeNull()
  })
})
