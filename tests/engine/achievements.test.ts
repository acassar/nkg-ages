import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { ACHIEVEMENTS } from '@/engine/content/achievements'
import { unlockAchievements, type AchievementFacts } from '@/engine/achievements/achievements'
import { createGame, step, type GameState } from '@/engine/game'
import { loadGame, saveGame } from '@/engine/save/save'
import { buildGameView, hintOf } from '@/views/selectors'

const options = {
  seed: 'succès',
  randomStart: false,
  width: 192,
  height: 96,
  rareEvents: false,
  peoples: 0,
}

const zero: AchievementFacts = {
  camps: 0,
  villages: 0,
  cities: 0,
  population: 0,
  peoplesMet: 0,
  allies: 0,
  rankS: 0,
  wonders: 0,
  inventions: 0,
}

describe('succès', () => {
  it('des identifiants uniques et des seuils positifs', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
    for (const a of ACHIEVEMENTS) expect(a.atLeast).toBeGreaterThan(0)
  })

  it('chacun se gagne une seule fois, au premier tick où son seuil est atteint', () => {
    const facts = fc.record(
      Object.fromEntries(Object.keys(zero).map((k) => [k, fc.integer({ min: 0, max: 200 })])),
    ) as fc.Arbitrary<AchievementFacts>
    fc.assert(
      fc.property(fc.array(facts, { maxLength: 8 }), (months) => {
        const unlocked: Record<string, number> = {}
        const seen: string[] = []
        months.forEach((f, tick) => {
          for (const id of unlockAchievements(unlocked, f, tick)) {
            expect(seen).not.toContain(id)
            seen.push(id)
            const a = ACHIEVEMENTS.find((x) => x.id === id)!
            expect(f[a.fact]).toBeGreaterThanOrEqual(a.atLeast)
            expect(unlocked[id]).toBe(tick)
          }
        })
        expect(Object.keys(unlocked).sort()).toEqual([...seen].sort())
      }),
    )
  })

  it('en partie : annoncé une fois, gardé par la sauvegarde', () => {
    const g = createGame(options)
    g.camps.push({ ...g.camps[0]!, id: 999, x: g.camps[0]!.x + 3 })
    step(g)
    expect(g.events.filter((e) => e.type === 'achievement')).toEqual([
      { type: 'achievement', id: 'essaimer', name: 'Essaimer' },
    ])
    g.events = []
    step(g)
    expect(g.events.some((e) => e.type === 'achievement')).toBe(false)
    const view = buildGameView(g)
    expect(view.achievements.find((a) => a.id === 'essaimer')!.done).toBe(true)
    const loaded = loadGame(saveGame(g))
    expect(loaded.achievements).toEqual(g.achievements)
    const old = saveGame(g) as { achievements?: unknown }
    delete old.achievements
    expect(loadGame(old as ReturnType<typeof saveGame>).achievements).toEqual({})
  })
})

describe('conseils', () => {
  it('suivent les premières étapes, puis se taisent', () => {
    const g: GameState = createGame(options)
    expect(hintOf(g)).toMatch(/éclaireur/)
    const scout = g.units.find((u) => u.kind === 'eclaireur')!
    scout.target = { x: scout.x + 5, y: scout.y }
    expect(hintOf(g)).toMatch(/invention/)
    g.inventions.ranks.panier = 'E'
    expect(hintOf(g)).toMatch(/Fonder un campement/)
    g.camps.push({ ...g.camps[0]!, id: 999 })
    expect(hintOf(g)).toMatch(/agriculture/)
    g.camps[0]!.village = true
    expect(hintOf(g)).toBeNull()
  })
})
