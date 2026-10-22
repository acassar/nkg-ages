import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createRng, hashString } from '@/engine/core/random'

describe('générateur à graine', () => {
  it('redonne la même suite pour la même graine', () => {
    const a = createRng('lascaux')
    const b = createRng('lascaux')
    expect(Array.from({ length: 50 }, () => a.next())).toEqual(
      Array.from({ length: 50 }, () => b.next()),
    )
  })

  it('donne des suites différentes pour des graines différentes', () => {
    expect(createRng('a').next()).not.toBe(createRng('b').next())
  })

  it('reste dans ses bornes, quelle que soit la graine', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: -50, max: 50 }),
        fc.nat(100),
        (seed, min, span) => {
          const rng = createRng(seed)
          for (let i = 0; i < 20; i++) {
            const n = rng.next()
            expect(n).toBeGreaterThanOrEqual(0)
            expect(n).toBeLessThan(1)
            const k = rng.int(min, min + span)
            expect(Number.isInteger(k)).toBe(true)
            expect(k).toBeGreaterThanOrEqual(min)
            expect(k).toBeLessThanOrEqual(min + span)
          }
        },
      ),
    )
  })

  it('reprend exactement depuis un état sauvegardé', () => {
    const rng = createRng('reprise')
    rng.next()
    const saved = rng.state
    const expected = [rng.next(), rng.next()]
    const resumed = createRng(saved)
    expect([resumed.next(), resumed.next()]).toEqual(expected)
  })

  it('dérive des générateurs indépendants par libellé', () => {
    const rng = createRng('racine')
    expect(rng.fork('relief').next()).not.toBe(rng.fork('climat').next())
  })

  it('refuse de piocher dans une liste vide', () => {
    expect(() => createRng(1).pick([])).toThrow()
  })

  it('a une empreinte stable', () => {
    expect(hashString('nkg')).toBe(hashString('nkg'))
    expect(hashString('nkg')).not.toBe(hashString('nkh'))
  })
})
