import { describe, expect, it } from 'vitest'
import { RESOURCE_RULES } from '@/engine/content/resources'
import { VILLAGE_RULES } from '@/engine/content/villages'
import { createRng } from '@/engine/core/random'
import { applyCommand, createGame, cropsOf, step, type GameState } from '@/engine/game'
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

  it('il faut l’agriculture, puis du cuivre et de l’étain', () => {
    const g = createGame(options)
    expect(cannotStart(g.inventions, 'bronze', g.tribe.materials)).toMatch(/Agriculture/)
    g.inventions.ranks.agriculture = 'E'
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
      g.tribe.food = 0
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
