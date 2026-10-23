import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  climateAmplitude,
  seasonalYield,
  seasonOf,
  seasonStarting,
  spoilage,
} from '@/engine/climate/seasons'
import { CLIMATE_RULES, SEASON_KINDS, SEASON_RULES } from '@/engine/content/seasons'
import { climateOf, createGame, step } from '@/engine/game'
import { TRIBE_RULES } from '@/engine/content/tribe'
import { home } from '../home'

describe('saisons', () => {
  it('chaque mois a une saison, chaque saison trois mois', () => {
    const months = SEASON_KINDS.flatMap((k) => SEASON_RULES[k].months)
    expect([...months].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(seasonOf(0)).toBe('hiver')
    expect(seasonOf(11)).toBe('hiver')
    expect(seasonOf(6)).toBe('ete')
    expect(seasonStarting(11)).toBe('hiver')
    expect(seasonStarting(0)).toBeNull()
    expect(seasonStarting(2)).toBe('printemps')
  })

  it('sur l’année, la cueillette garde sa moyenne quel que soit le climat', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (temperature) => {
        const amplitude = climateAmplitude(temperature)
        let sum = 0
        for (let m = 0; m < 12; m++) sum += seasonalYield(m, amplitude)
        expect(sum / 12).toBeCloseTo(1, 6)
        expect(seasonalYield(0, amplitude)).toBeLessThan(seasonalYield(6, amplitude))
      }),
    )
  })

  it('le froid creuse les hivers, dans les bornes du climat', () => {
    expect(climateAmplitude(0.2)).toBeGreaterThan(climateAmplitude(0.8))
    fc.assert(
      fc.property(fc.double({ min: -1, max: 2, noNaN: true }), (t) => {
        const a = climateAmplitude(t)
        expect(a).toBeGreaterThanOrEqual(CLIMATE_RULES.minAmplitude)
        expect(a).toBeLessThanOrEqual(CLIMATE_RULES.maxAmplitude)
      }),
    )
  })

  it('la réserve se gâte surtout l’été, et la conservation en sauve une part', () => {
    expect(spoilage(0, 8)).toBe(0)
    expect(spoilage(6, 8)).toBeGreaterThan(spoilage(3, 8))
    expect(spoilage(6, 8, 8)).toBeCloseTo(spoilage(6, 8) / 2)
  })
})

describe('saisons en partie', () => {
  const options = { seed: 'saisons', randomStart: false, width: 192, height: 96 }

  it('le climat suit le campement', () => {
    const g = createGame(options)
    const c = g.camps[0]!
    const t = g.world.temperature[Math.floor(c.y) * g.world.width + Math.floor(c.x)]!
    expect(climateOf(g)).toBeCloseTo(climateAmplitude(t))
  })

  it('l’hiver est annoncé une fois par an, en décembre', () => {
    const g = createGame(options)
    const winters: number[] = []
    for (let i = 0; i < 36; i++) {
      step(g)
      if (g.events.some((e) => e.type === 'winter')) winters.push(g.clock.tick % 12)
      g.events = []
    }
    expect(winters).toEqual([11, 11, 11])
  })

  it('la récolte d’hiver est plus maigre que celle d’été', () => {
    const g = createGame(options)
    const produced: number[] = []
    for (let i = 0; i < 24; i++) {
      step(g)
      produced[g.clock.tick % 12] = home(g).lastProduction
    }
    expect(produced[1]!).toBeLessThan(produced[7]!)
    // Personne ne meurt de faim au premier hiver avec la réserve de départ.
    expect(g.tribe.population).toBeGreaterThanOrEqual(TRIBE_RULES.startPopulation)
  })
})
