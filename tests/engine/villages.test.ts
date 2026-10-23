import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { VILLAGE_RULES } from '@/engine/content/villages'
import {
  applyCommand,
  cannotBuildVillage,
  createGame,
  cropsOf,
  foodCapacity,
  maxVillages,
  step,
  type GameState,
} from '@/engine/game'
import { PLAYER } from '@/engine/territory/territory'

const options = { seed: 'village', randomStart: false, width: 192, height: 96, rareEvents: false }

/** Partie où la tribu sait cultiver, assez nombreuse et nourrie pour un village. */
function farmers(): GameState {
  const g = createGame(options)
  g.inventions.ranks.agriculture = 'E'
  g.tribe.population = VILLAGE_RULES.peoplePerVillage
  g.tribe.food = 200
  return g
}

describe('villages', () => {
  it('il faut l’agriculture, assez d’habitants et de vivres', () => {
    const g = createGame(options)
    expect(cannotBuildVillage(g)).toBe("Il faut d'abord : Agriculture")
    g.inventions.ranks.agriculture = 'E'
    expect(cannotBuildVillage(g)).toMatch(/habitants/)
    g.tribe.population = VILLAGE_RULES.peoplePerVillage
    g.tribe.food = VILLAGE_RULES.foodCost - 1
    expect(cannotBuildVillage(g)).toMatch(/rations/)
    g.tribe.food = VILLAGE_RULES.foodCost
    expect(cannotBuildVillage(g)).toBeNull()
  })

  it('bâtir un village coûte des vivres, puis on n’en bâtit pas plus que la population ne permet', () => {
    const g = farmers()
    expect(applyCommand(g, { type: 'buildVillage' })).toEqual({ ok: true })
    expect(g.camps[0]!.village).toBe(true)
    expect(g.tribe.food).toBe(200 - VILLAGE_RULES.foodCost)
    expect(applyCommand(g, { type: 'buildVillage' })).toMatchObject({ ok: false })
    expect(maxVillages(g)).toBe(1)
  })

  it('un village agrandit la réserve', () => {
    const g = farmers()
    const before = foodCapacity(g)
    applyCommand(g, { type: 'buildVillage' })
    expect(foodCapacity(g)).toBeGreaterThan(before)
  })

  it('les champs ne donnent qu’aux mois de moisson, et seulement autour d’un village', () => {
    const g = farmers()
    for (let m = 0; m < 12; m++) expect(cropsOf(g, m)).toBe(0)
    applyCommand(g, { type: 'buildVillage' })
    for (let m = 0; m < 12; m++) {
      if (VILLAGE_RULES.harvestMonths.includes(m)) expect(cropsOf(g, m)).toBeGreaterThan(0)
      else expect(cropsOf(g, m)).toBe(0)
    }
  })

  it('les champs ne comptent que les terres tenues, chacune une fois', () => {
    const g = farmers()
    applyCommand(g, { type: 'buildVillage' })
    const month = VILLAGE_RULES.harvestMonths[0]!
    const one = cropsOf(g, month)
    // Un second village au même endroit ne double pas les champs.
    g.camps.push({ ...g.camps[0]!, id: 999 })
    expect(cropsOf(g, month)).toBeCloseTo(one)
    // Sans terres tenues, pas de récolte.
    g.territory.owner.fill(0)
    expect(cropsOf(g, month)).toBe(0)
  })

  it('un meilleur rang d’agriculture récolte plus', () => {
    const g = farmers()
    applyCommand(g, { type: 'buildVillage' })
    const month = VILLAGE_RULES.harvestMonths[0]!
    const e = cropsOf(g, month)
    g.inventions.ranks.agriculture = 'S'
    expect(cropsOf(g, month)).toBeGreaterThan(e * 1.4)
  })

  it('la moisson rentre en réserve, bornée par sa capacité', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 }), (food) => {
        const g = farmers()
        applyCommand(g, { type: 'buildVillage' })
        g.clock.tick = VILLAGE_RULES.harvestMonths[0]! - 1
        g.tribe.food = food
        step(g)
        expect(g.tribe.lastCrops).toBeGreaterThan(0)
        expect(g.tribe.food).toBeLessThanOrEqual(foodCapacity(g) + 1e-9)
        expect(g.tribe.food).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 8 },
    )
  })

  it('un village porte le territoire plus loin', () => {
    const run = (village: boolean) => {
      const g = farmers()
      if (village) applyCommand(g, { type: 'buildVillage' })
      for (let i = 0; i < 1500; i++) step(g)
      const c = g.camps[0]!
      let far = 0
      for (let i = 0; i < g.territory.owner.length; i++) {
        if (g.territory.owner[i] !== PLAYER) continue
        const x = (i % g.world.width) + 0.5
        const y = Math.floor(i / g.world.width) + 0.5
        far = Math.max(far, Math.hypot(x - c.x, y - c.y))
      }
      return far
    }
    expect(run(true)).toBeGreaterThan(run(false))
  }, 30_000)
})
