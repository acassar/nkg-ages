import { describe, expect, it } from 'vitest'
import {
  createClock,
  dateOfTick,
  isSpeed,
  MAX_TICKS_PER_FRAME,
  SPEEDS,
  TICKS_PER_SECOND,
  ticksDue,
} from '@/engine/core/clock'

describe('horloge', () => {
  it('démarre en pause, à la vitesse 1', () => {
    expect(createClock()).toEqual({ tick: 0, speed: 1, paused: true })
  })

  it('ne joue aucun tick en pause', () => {
    expect(ticksDue({ tick: 0, speed: 5, paused: true }, 1000, 0.5)).toEqual({ ticks: 0, carry: 0 })
  })

  it.each(SPEEDS)('joue le bon nombre de ticks par seconde à la vitesse %i', (speed) => {
    let carry = 0
    let total = 0
    // Une seconde découpée en images de 16 ms (et un reste).
    for (let t = 0; t < 1000; t += 16) {
      const due = ticksDue({ tick: 0, speed, paused: false }, Math.min(16, 1000 - t), carry)
      carry = due.carry
      total += due.ticks
    }
    expect(total).toBeGreaterThanOrEqual(TICKS_PER_SECOND[speed] - 1)
    expect(total).toBeLessThanOrEqual(TICKS_PER_SECOND[speed])
  })

  it('les vitesses sont strictement croissantes', () => {
    const rates = SPEEDS.map((s) => TICKS_PER_SECOND[s])
    expect([...rates].sort((a, b) => a - b)).toEqual(rates)
    expect(new Set(rates).size).toBe(rates.length)
  })

  it('abandonne un gros retard au lieu de geler', () => {
    const due = ticksDue({ tick: 0, speed: 5, paused: false }, 60_000, 0)
    expect(due.ticks).toBe(MAX_TICKS_PER_FRAME)
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
