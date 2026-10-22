import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { TRIBE_RULES } from '@/engine/content/tribe'
import {
  createTribe,
  production,
  storageCapacity,
  growthFactor,
  territoryFood,
  tickTribe,
  type TribeState,
} from '@/engine/tribe/tribe'

const R = TRIBE_RULES
/** Richesse qui nourrit largement n'importe quelle tribu de ces tests. */
const PLENTY = 1e6

const tribe = (patch: Partial<TribeState> = {}): TribeState => ({ ...createTribe(), ...patch })

describe('tribu', () => {
  it('commence avec sa population et quelques mois de réserve', () => {
    const t = createTribe()
    expect(t.population).toBe(R.startPopulation)
    expect(t.food).toBe(R.startPopulation * R.rationPerPerson * R.startReserveMonths)
  })

  it('récolte au plus ce que permettent ses bras, et au plus ce qu’offre le territoire', () => {
    expect(production(10, PLENTY)).toBe(10 * R.gatherPerPerson)
    expect(production(10, 5)).toBe(5)
    expect(production(0, PLENTY)).toBe(0)
  })

  it('compte la richesse du territoire et les gisements de nourriture', () => {
    expect(territoryFood(100)).toBeCloseTo(100 * R.yieldPerCell)
    expect(territoryFood(100, 6)).toBeCloseTo(100 * R.yieldPerCell + 6)
  })

  it('mange chaque mois et garde le bilan pour l’affichage', () => {
    const t = tribe({ population: 10, food: 50 })
    tickTribe(t, 0)
    expect(t.food).toBe(40)
    expect(t.lastProduction).toBe(0)
    expect(t.lastConsumption).toBe(10)
  })

  it('les habitants occupés ailleurs mangent mais ne cueillent pas', () => {
    const t = tribe({ population: 10, food: 0 })
    tickTribe(t, PLENTY, undefined, 4)
    expect(t.lastProduction).toBe(6 * R.gatherPerPerson)
    expect(t.lastConsumption).toBe(10 * R.rationPerPerson)
    const all = tribe({ population: 10, food: 0 })
    tickTribe(all, PLENTY, undefined, 99)
    expect(all.lastProduction).toBe(0)
  })

  it('le feu fait naître plus vite, les peaux limitent les pertes de famine', () => {
    const grow = (growth: number) => {
      const t = tribe({ population: 100, food: storageCapacity(100) })
      for (let m = 0; m < 24; m++) tickTribe(t, PLENTY, { gather: 0, storageMonths: 0, growth })
      return t.population
    }
    expect(grow(0.5)).toBeGreaterThan(grow(0))
    const starve = (famineShield: number) => {
      const t = tribe({ population: 100, food: 0 })
      tickTribe(t, 0, { gather: 0, storageMonths: 0, famineShield })
      return 100 - t.population
    }
    expect(starve(0.5)).toBeLessThan(starve(0))
    expect(starve(1)).toBe(1) // au moins une perte : la famine reste une famine
  })

  it('ne stocke pas au-delà de sa capacité', () => {
    const t = tribe({ population: 10, food: storageCapacity(10) })
    tickTribe(t, PLENTY)
    expect(t.food).toBe(storageCapacity(10))
  })

  it('grandit selon son surplus : ≈ 5 % par an pour un surplus d’un quart, le double au mieux', () => {
    const grow = (available: number) => {
      const t = tribe({ population: 100, food: storageCapacity(100) })
      for (let m = 0; m < 12; m++) tickTribe(t, available)
      return t.population
    }
    expect(grow(100 * R.rationPerPerson * (1 + R.surplusForGrowth))).toBeGreaterThanOrEqual(104)
    expect(grow(100 * R.rationPerPerson * (1 + R.surplusForGrowth))).toBeLessThanOrEqual(106)
    expect(grow(PLENTY)).toBeGreaterThanOrEqual(109)
    expect(grow(PLENTY)).toBeLessThanOrEqual(111)
    // Réserve pleine mais sans surplus : croissance minimale, d'un quart.
    expect(grow(100 * R.rationPerPerson)).toBe(101)
  })

  it('calcule le facteur de croissance selon le surplus', () => {
    expect(growthFactor(125, 100)).toBeCloseTo(1)
    expect(growthFactor(1000, 100)).toBe(R.maxGrowthFactor)
    expect(growthFactor(90, 100)).toBe(0.25)
    expect(growthFactor(5, 0)).toBe(0)
  })

  it('ne grandit pas sans réserve confortable', () => {
    const t = tribe({ population: 20, food: 0 })
    // Récolte = consommation : rien de côté, pas de naissance.
    for (let m = 0; m < 24; m++) tickTribe(t, 20 * R.rationPerPerson)
    expect(t.population).toBe(20)
  })

  it('perd des siens en famine, et ne le signale qu’au premier mois', () => {
    const t = tribe({ population: 50, food: 0 })
    expect(tickTribe(t, 0)).toBe('famineStarts')
    expect(t.population).toBe(50 - Math.round(50 * R.famineLoss))
    expect(t.food).toBe(0)
    expect(tickTribe(t, 0)).toBe('famine')
    expect(t.starvingMonths).toBe(2)
    tickTribe(t, PLENTY)
    expect(t.starvingMonths).toBe(0)
  })

  it('perd au moins une personne par mois de famine, jusqu’à disparaître', () => {
    const t = tribe({ population: 3, food: 0 })
    for (let m = 0; m < 10; m++) tickTribe(t, 0)
    expect(t.population).toBe(0)
    expect(tickTribe(t, PLENTY)).toBe('stable')
    expect(t.population).toBe(0)
  })

  it('garde une population entière et une réserve bornée, quoi qu’il arrive (fast-check)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.array(fc.float({ min: 0, max: 5000, noNaN: true }), { maxLength: 60 }),
        (population, richness) => {
          const t = tribe({ population, food: 0 })
          for (const r of richness) {
            tickTribe(t, r)
            expect(Number.isInteger(t.population)).toBe(true)
            expect(t.population).toBeGreaterThanOrEqual(0)
            expect(t.food).toBeGreaterThanOrEqual(0)
            expect(t.food).toBeLessThanOrEqual(storageCapacity(t.population) + 1e-9)
          }
        },
      ),
    )
  })
})
