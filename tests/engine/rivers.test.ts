import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { Biome, BIOMES, isWater } from '@/engine/content/biomes'
import { RIVER_RULES } from '@/engine/content/rivers'
import { generateWorld } from '@/engine/world/generate'
import { traceRivers } from '@/engine/world/rivers'
import { moveCostAt } from '@/engine/world/world'

/** Plan incliné : la mer à gauche (x = 0), la terre monte vers la droite. */
function slope(width: number, height: number, pit?: { x: number; y: number }) {
  const elevation = new Float32Array(width * height)
  const biome = new Uint8Array(width * height).fill(Biome.Plain)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      elevation[i] = x / width
      if (x === 0) biome[i] = Biome.Ocean
    }
  // Une cuvette fermée : sans remplissage, l'eau y resterait prise.
  if (pit) elevation[pit.y * width + pit.x] = -0.5 + 0.0001
  return { elevation, biome, moisture: new Float32Array(width * height).fill(1) }
}

describe('fleuves', () => {
  it('coulent vers la mer : forts près de la côte, absents près de la crête', () => {
    const { elevation, biome, moisture } = slope(200, 3)
    const river = traceRivers(200, 3, elevation, moisture, biome)
    const row = (y: number) => [...river.subarray(y * 200, y * 200 + 200)]
    const middle = row(1)
    expect(middle[0]).toBe(0) // la mer n'est pas un fleuve
    expect(middle[1]).toBeGreaterThan(0)
    expect(middle[199]).toBe(0)
    // Le débit ne fait que croître vers l'aval.
    for (let x = 2; x < 200; x++) expect(middle[x - 1]!).toBeGreaterThanOrEqual(middle[x]!)
    // Seuil : un fleuve naît là où l'amont reçoit assez de pluie.
    const source = middle.length - 1 - [...middle].reverse().findIndex((v) => v > 0)
    expect((200 - source) * RIVER_RULES.rainWet).toBeGreaterThanOrEqual(RIVER_RULES.threshold)
  })

  it('traversent une cuvette au lieu de s’y perdre', () => {
    const pit = { x: 100, y: 1 }
    const { elevation, biome, moisture } = slope(200, 3, pit)
    const river = traceRivers(200, 3, elevation, moisture, biome)
    expect(river[1 * 200 + 1]).toBeGreaterThan(0)
    expect(river[1 * 200 + pit.x - 1]).toBeGreaterThan(0)
  })

  it('jamais en mer, et chaque fleuve rejoint un fleuve plus fort ou la mer', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 8 }), (seed) => {
        const w = generateWorld({ seed, width: 256, height: 128 })
        let rivers = 0
        for (let y = 0; y < w.height; y++)
          for (let x = 0; x < w.width; x++) {
            const i = y * w.width + x
            const r = w.river[i]!
            if (r === 0) continue
            rivers++
            expect(isWater(w.biome[i]!)).toBe(false)
            const edge = x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1
            const outlet = [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].some(([dx, dy]) => {
              const n = (y + dy!) * w.width + x + dx!
              return isWater(w.biome[n]!) || w.river[n]! >= r
            })
            expect(edge || outlet).toBe(true)
          }
        expect(rivers).toBeGreaterThan(0)
      }),
      { numRuns: 5 },
    )
  }, 30_000)

  it('ralentissent qui les traverse', () => {
    const w = generateWorld({ seed: 'gué', width: 256, height: 128 })
    const i = w.river.findIndex((r) => r > 0)
    expect(moveCostAt(w, i)).toBe(BIOMES[w.biome[i] as 2].moveCost + RIVER_RULES.crossCost)
    const dry = w.biome.findIndex((b, j) => !isWater(b) && w.river[j] === 0)
    expect(moveCostAt(w, dry)).toBe(BIOMES[w.biome[dry] as 2].moveCost)
  })
})
