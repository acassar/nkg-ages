import { describe, expect, it } from 'vitest'
import { FIRST_ERA, SCORE_RULES } from '@/engine/content/eras'
import { goalReached, goalSteps, scoreOf, type Tally } from '@/engine/score/score'

const tally = (over: Partial<Tally> = {}): Tally => ({
  population: 12,
  territoryCells: 80,
  camps: 1,
  inventions: [],
  years: 0,
  ...over,
})

describe('objectif et score', () => {
  it('suit l’objectif de l’ère élément par élément', () => {
    const goal = FIRST_ERA.goal
    expect(goalSteps(goal, tally()).map((s) => s.kind)).toEqual([
      'population',
      'camps',
      'inventions',
    ])
    expect(goalReached(goal, tally())).toBe(false)
    const enough = tally({
      population: goal.population,
      camps: goal.camps,
      inventions: Array.from({ length: goal.inventions }, () => 'E' as const),
    })
    expect(goalReached(goal, enough)).toBe(true)
    expect(goalReached(goal, { ...enough, camps: goal.camps - 1 })).toBe(false)
  })

  it('compte habitants, terres, campements, inventions selon leur rang, et années', () => {
    expect(scoreOf(tally())).toBe(12 * 2 + 8 + 50)
    expect(scoreOf(tally({ inventions: ['S'] }))).toBeGreaterThan(
      scoreOf(tally({ inventions: ['E'] })),
    )
    expect(scoreOf(tally({ years: 10.7 }))).toBe(scoreOf(tally()) + 10)
  })

  it('récompense une victoire d’autant plus qu’elle est rapide', () => {
    const base = scoreOf(tally())
    expect(scoreOf(tally(), 0)).toBe(base + SCORE_RULES.victory)
    expect(scoreOf(tally(), SCORE_RULES.victoryHalfLifeYears)).toBe(base + SCORE_RULES.victory / 2)
  })
})
