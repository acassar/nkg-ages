import { describe, expect, it } from 'vitest'
import { createGame, PLAYER, step } from '@/engine'
import { saveGame } from '@/engine/save/save'
import { createBot } from '../../scripts/bot'

function playYears(seed: string, years: number) {
  const state = createGame({ seed, randomStart: false, width: 128, height: 64 })
  const bot = createBot(seed)
  for (let month = 0; month < years * 12; month++) {
    bot.play(state)
    step(state)
  }
  return state
}

describe('joueur automatique de la sonde', () => {
  it('invente, fonde des campements et garde la tribu en vie', () => {
    const state = playYears('robot', 15)
    expect(Object.keys(state.inventions.ranks).length).toBeGreaterThanOrEqual(3)
    expect(state.camps.filter((c) => c.owner === PLAYER).length).toBeGreaterThanOrEqual(2)
    expect(state.tribe.population).toBeGreaterThan(12)
  }, 30_000)

  it('joue toujours la même partie pour la même graine', () => {
    expect(saveGame(playYears('robot-bis', 4))).toEqual(saveGame(playYears('robot-bis', 4)))
  }, 30_000)
})
