import { describe, expect, it } from 'vitest'
import { STEPS_PER_MONTH } from '@/engine/core/clock'
import { advance, applyCommand, createGame, step } from '@/engine/game'
import { loadGame, saveGame } from '@/engine/save/save'

const options = { seed: 'semaines', randomStart: false, width: 128, height: 64 }

/** Envoie l'éclaireur au loin, pour que le mouvement compte dans la partie. */
function started() {
  const state = createGame(options)
  const scout = state.units.find((u) => u.kind === 'eclaireur')!
  applyCommand(state, { type: 'moveUnits', unitIds: [scout.id], x: scout.x + 20, y: scout.y })
  return state
}

describe('pas de la semaine', () => {
  it('un mois vaut exactement STEPS_PER_MONTH pas', () => {
    const state = started()
    for (let i = 0; i < STEPS_PER_MONTH - 1; i++) {
      advance(state)
      expect(state.clock.tick).toBe(0)
    }
    advance(state)
    expect(state.clock.tick).toBe(1)
    expect(state.clock.step).toBe(0)
  })

  it('step joue le reste du mois, que le mois soit entamé ou non', () => {
    const byWeeks = started()
    const byMonths = started()
    for (let i = 0; i < 6 * STEPS_PER_MONTH; i++) advance(byWeeks)
    advance(byMonths)
    for (let i = 0; i < 6; i++) step(byMonths)
    expect(byMonths.clock.tick).toBe(6)
    expect(saveGame(byMonths)).toEqual(saveGame(byWeeks))
  })

  it('les unités avancent entre deux mois, l’économie attend la fin du mois', () => {
    const state = started()
    const scout = state.units.find((u) => u.kind === 'eclaireur')!
    const x = scout.x
    const food = state.tribe.food
    advance(state)
    expect(scout.x).toBeGreaterThan(x)
    expect(state.tribe.food).toBe(food)
  })

  it('une partie sauvée en milieu de mois reprend au même pas', () => {
    const state = started()
    for (let i = 0; i < 2 * STEPS_PER_MONTH + 2; i++) advance(state)
    const copy = loadGame(JSON.parse(JSON.stringify(saveGame(state))))
    expect(copy.clock.step).toBe(2)
    for (let i = 0; i < 9; i++) {
      advance(state)
      advance(copy)
    }
    expect(saveGame(copy)).toEqual(saveGame(state))
  })

  it('une sauvegarde d’avant les pas reprend en début de mois', () => {
    const data = saveGame(started())
    const clock: Partial<typeof data.clock> = { ...data.clock }
    delete clock.step
    const copy = loadGame({ ...data, clock: clock as typeof data.clock })
    expect(copy.clock.step).toBe(0)
  })
})
