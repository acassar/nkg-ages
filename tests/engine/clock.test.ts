import { describe, expect, it } from 'vitest'
import {
  createClock,
  dateOfTick,
  isSpeed,
  MAX_STEPS_PER_FRAME,
  MONTHS_PER_SECOND,
  SPEEDS,
  STEPS_PER_MONTH,
  stepsDue,
  stepsPerSecond,
} from '@/engine/core/clock'

describe('horloge', () => {
  it('démarre en pause, à la vitesse 1', () => {
    expect(createClock()).toEqual({ tick: 0, step: 0, speed: 1, paused: true })
  })

  const running = (speed: 1 | 2 | 3 | 4 | 5) => ({ tick: 0, step: 0, speed, paused: false })

  it('ne joue aucun pas en pause', () => {
    expect(stepsDue({ ...running(5), paused: true }, 1000, 0.5)).toEqual({ steps: 0, carry: 0 })
  })

  it.each(SPEEDS)('joue le bon nombre de pas par seconde à la vitesse %i', (speed) => {
    let carry = 0
    let total = 0
    // Quatre secondes découpées en images de 16 ms (et un reste).
    for (let t = 0; t < 4000; t += 16) {
      const due = stepsDue(running(speed), Math.min(16, 4000 - t), carry)
      carry = due.carry
      total += due.steps
    }
    expect(total).toBeGreaterThanOrEqual(4 * stepsPerSecond(speed) - 1)
    expect(total).toBeLessThanOrEqual(4 * stepsPerSecond(speed))
  })

  it('laisse le temps de voir passer une saison à la vitesse 1', () => {
    // Une saison (trois mois) dure au moins dix secondes réelles.
    expect(3 / MONTHS_PER_SECOND[1]).toBeGreaterThanOrEqual(10)
    // Un pas entier par seconde au moins : les unités ne restent jamais figées.
    expect(stepsPerSecond(1)).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(STEPS_PER_MONTH)).toBe(true)
  })

  it('les vitesses sont strictement croissantes', () => {
    const rates = SPEEDS.map((s) => MONTHS_PER_SECOND[s])
    expect([...rates].sort((a, b) => a - b)).toEqual(rates)
    expect(new Set(rates).size).toBe(rates.length)
  })

  it('abandonne un gros retard au lieu de geler', () => {
    const due = stepsDue(running(5), 60_000, 0)
    expect(due.steps).toBe(MAX_STEPS_PER_FRAME)
    expect(due.carry).toBe(0)
  })

  it('reconnaît les vitesses valides', () => {
    expect(isSpeed(3)).toBe(true)
    expect(isSpeed(0)).toBe(false)
    expect(isSpeed(6)).toBe(false)
    expect(isSpeed('3')).toBe(false)
  })

  it("compte les mois et saute l'an 0", () => {
    expect(dateOfTick(0, -12000)).toEqual({ year: -12000, month: 0 })
    expect(dateOfTick(13, -12000)).toEqual({ year: -11999, month: 1 })
    expect(dateOfTick(11, -1)).toEqual({ year: -1, month: 11 })
    expect(dateOfTick(12, -1)).toEqual({ year: 1, month: 0 })
  })
})
