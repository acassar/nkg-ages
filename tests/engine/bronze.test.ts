import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { RESOURCE_RULES } from '@/engine/content/resources'
import { VILLAGE_RULES } from '@/engine/content/villages'
import { createRng } from '@/engine/core/random'
import {
  applyCommand,
  createGame,
  cropsOf,
  foodCapacity,
  step,
  type GameState,
} from '@/engine/game'
import { cannotStart } from '@/engine/inventions/inventions'
import { placeDeposits } from '@/engine/resources/deposits'
import { generateWorld } from '@/engine/world/generate'

const options = {
  seed: 'bronze',
  randomStart: false,
  width: 192,
  height: 96,
  rareEvents: false,
  peoples: 0,
}

describe('bronze', () => {
  it('cuivre et étain naissent rares, et seulement dans leurs biomes', () => {
    const world = generateWorld({ seed: 'métaux', width: 512, height: 256 })
    const deposits = placeDeposits(world, createRng('métaux'))
    for (const kind of ['cuivre', 'etain'] as const) {
      const found = deposits.filter((d) => d.kind === kind)
      expect(found.length).toBeGreaterThan(0)
      expect(found.length).toBeLessThan(deposits.filter((d) => d.kind === 'silex').length)
      for (const d of found)
        expect(RESOURCE_RULES[kind].biomes).toContain(world.biome[d.y * world.width + d.x])
    }
  })

  it('du cuivre et de l’étain attendent toujours à portée d’exploration', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), (seed) => {
        const g = createGame({ ...options, seed, randomStart: true })
        const camp = g.camps[0]!
        for (const kind of ['cuivre', 'etain'] as const) {
          const [near, far] = RESOURCE_RULES[kind].withinReach!
          const inRing = g.deposits.filter((d) => {
            const r = Math.hypot(d.x + 0.5 - camp.x, d.y + 0.5 - camp.y)
            return d.kind === kind && r >= near - 1 && r <= far + 1
          })
          expect(inRing.length).toBeGreaterThan(0)
        }
        expect(new Set(g.deposits.map((d) => d.id)).size).toBe(g.deposits.length)
      }),
      { numRuns: 12 },
    )
  }, 60_000)

  it('il faut la métallurgie du cuivre, puis du cuivre et de l’étain', () => {
    const g = createGame(options)
    expect(cannotStart(g.inventions, 'bronze', g.tribe.materials)).toMatch(/Métallurgie/)
    expect(cannotStart(g.inventions, 'metallurgie', g.tribe.materials)).toMatch(/Agriculture/)
    g.inventions.ranks.agriculture = 'E'
    g.inventions.ranks.metallurgie = 'E'
    expect(cannotStart(g.inventions, 'bronze', g.tribe.materials)).toMatch(/cuivre/)
    g.tribe.materials.cuivre = 12
    expect(cannotStart(g.inventions, 'bronze', g.tribe.materials)).toMatch(/étain/)
    g.tribe.materials.etain = 6
    expect(cannotStart(g.inventions, 'bronze', g.tribe.materials)).toBeNull()
    expect(applyCommand(g, { type: 'invent', invention: 'bronze' })).toEqual({ ok: true })
    expect(g.tribe.materials).toMatchObject({ cuivre: 0, etain: 0 })
  })

  it('le bronze fait rendre davantage la terre et les champs, d’autant plus que son rang est haut', () => {
    const month = (g: GameState) => {
      const before = g.tribe.food
      step(g)
      return g.tribe.food - before
    }
    const run = (rank?: 'E' | 'S') => {
      const g = createGame(options)
      // Hors hiver, réserve à moitié pleine : ni plancher à 0 ni plafond ne masquent l'écart.
      g.clock.tick = 5
      g.tribe.food = foodCapacity(g) / 2
      if (rank) g.inventions.ranks.bronze = rank
      return month(g)
    }
    const none = run()
    const e = run('E')
    const s = run('S')
    expect(e).toBeGreaterThan(none)
    expect(s).toBeGreaterThan(e)

    const farm = createGame(options)
    farm.inventions.ranks.agriculture = 'E'
    farm.tribe.population = VILLAGE_RULES.peoplePerVillage
    farm.tribe.food = VILLAGE_RULES.foodCost
    applyCommand(farm, { type: 'buildVillage' })
    const harvest = VILLAGE_RULES.harvestMonths[0]!
    const plain = cropsOf(farm, harvest)
    farm.inventions.ranks.bronze = 'S'
    expect(cropsOf(farm, harvest)).toBeCloseTo(plain * 1.5)
  })
})
