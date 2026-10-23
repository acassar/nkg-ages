import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SCOUT_RULES } from '@/engine/content/units'
import { Visibility } from '@/engine/fog/fog'
import { applyCommand, cannotRecruitScout, createGame, maxScouts, step } from '@/engine/game'
import { frontierTarget } from '@/engine/units/explore'
import { PLAYER } from '@/engine/territory/territory'

const game = (seed = 'recrues') => createGame({ seed, randomStart: false, width: 128, height: 64 })

describe('éclaireurs', () => {
  it('un seul au départ, un de plus par tranche d’habitants', () => {
    const state = game()
    expect(maxScouts(state)).toBe(1)
    expect(cannotRecruitScout(state)).toMatch(/habitants/)
    state.tribe.population = SCOUT_RULES.peoplePerScout
    expect(maxScouts(state)).toBe(2)
  })

  it('se forme contre des rations, au campement choisi', () => {
    const state = game()
    state.tribe.population = 60
    state.tribe.food = 100
    const camp = {
      id: state.nextId++,
      owner: PLAYER,
      x: state.camps[0]!.x + 8,
      y: state.camps[0]!.y,
    }
    state.camps.push(camp)
    const result = applyCommand(state, { type: 'recruitScout', campId: camp.id })
    expect(result).toEqual({ ok: true })
    expect(state.tribe.food).toBe(100 - SCOUT_RULES.recruitFood)
    const recruit = state.units.at(-1)!
    expect(recruit.kind).toBe('eclaireur')
    expect(Math.hypot(recruit.x - camp.x, recruit.y - camp.y)).toBeLessThanOrEqual(1)
  })

  it('refuse un campement qui n’est pas à la tribu', () => {
    const state = game()
    state.tribe.population = 60
    state.tribe.food = 100
    expect(applyCommand(state, { type: 'recruitScout', campId: 9999 })).toEqual({
      ok: false,
      reason: 'Aucun campement choisi',
    })
    expect(state.tribe.food).toBe(100)
  })

  it('les chasseurs aussi paraissent au campement choisi', () => {
    const state = game()
    state.tribe.population = 60
    state.tribe.food = 100
    const camp = {
      id: state.nextId++,
      owner: PLAYER,
      x: state.camps[0]!.x + 8,
      y: state.camps[0]!.y,
    }
    state.camps.push(camp)
    expect(applyCommand(state, { type: 'recruitHunter', campId: camp.id })).toEqual({ ok: true })
    const recruit = state.units.at(-1)!
    expect(recruit.kind).toBe('chasseur')
    expect(Math.hypot(recruit.x - camp.x, recruit.y - camp.y)).toBeLessThanOrEqual(1)
  })
})

describe('ordre « Explorer »', () => {
  it('l’unité repart seule vers l’inconnu et découvre la carte', () => {
    const state = game()
    const scout = state.units.find((u) => u.kind === 'eclaireur')!
    const known = state.fog.known
    expect(applyCommand(state, { type: 'explore', unitIds: [scout.id] })).toEqual({ ok: true })
    expect(scout.explore).toBe(true)
    for (let i = 0; i < 120; i++) step(state)
    expect(state.fog.known).toBeGreaterThan(known * 2)
    expect(scout.explore || state.events.some((e) => e.type === 'explored')).toBe(true)
  })

  it('un ordre précis met fin à l’exploration', () => {
    const state = game()
    const scout = state.units.find((u) => u.kind === 'eclaireur')!
    applyCommand(state, { type: 'explore', unitIds: [scout.id] })
    applyCommand(state, { type: 'moveUnits', unitIds: [scout.id], x: scout.x + 1, y: scout.y })
    expect(scout.explore).toBe(false)
  })

  it('s’arrête et prévient quand plus rien n’est inconnu', () => {
    const state = game()
    state.fog.cells.fill(Visibility.Seen)
    const scout = state.units.find((u) => u.kind === 'eclaireur')!
    const result = applyCommand(state, { type: 'explore', unitIds: [scout.id] })
    expect(result.ok).toBe(false)
    expect(scout.explore).toBe(false)
    expect(state.events.at(-1)).toEqual({ type: 'explored', unitId: scout.id })
  })

  it('la lisière visée est toujours connue, franchissable et au bord de l’inconnu', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (months) => {
        const state = game('lisiere')
        const scout = state.units.find((u) => u.kind === 'eclaireur')!
        applyCommand(state, { type: 'explore', unitIds: [scout.id] })
        for (let i = 0; i < months; i++) step(state)
        const target = frontierTarget(state.world, state.fog, scout)
        if (!target) return
        const { width } = state.world
        const x = Math.floor(target.x)
        const y = Math.floor(target.y)
        expect(state.fog.cells[y * width + x]).not.toBe(Visibility.Unknown)
        const around = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].map(([dx, dy]) => state.fog.cells[(y + dy!) * width + x + dx!])
        expect(around).toContain(Visibility.Unknown)
      }),
      { numRuns: 8 },
    )
  }, 30_000)
})
