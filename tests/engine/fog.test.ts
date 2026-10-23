import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { countKnown, createFog, updateFog, Visibility } from '@/engine/fog/fog'

const at = (fog: ReturnType<typeof createFog>, x: number, y: number) => fog.cells[y * fog.width + x]

describe('brouillard de guerre', () => {
  it('tient le compte des cellules découvertes sans parcourir la carte', () => {
    const viewer = fc.record({
      x: fc.double({ min: -5, max: 45, noNaN: true }),
      y: fc.double({ min: -5, max: 45, noNaN: true }),
      sight: fc.double({ min: 0, max: 12, noNaN: true }),
    })
    fc.assert(
      fc.property(fc.array(fc.array(viewer, { maxLength: 4 }), { maxLength: 10 }), (passes) => {
        const fog = createFog(40, 40)
        for (const viewers of passes) {
          updateFog(fog, viewers)
          expect(fog.known).toBe(countKnown(fog.cells))
        }
      }),
    )
  })

  it('commence entièrement inconnu', () => {
    expect(createFog(10, 10).cells.every((c) => c === Visibility.Unknown)).toBe(true)
  })

  it("rend visible le disque d'un observateur", () => {
    const fog = createFog(40, 40)
    updateFog(fog, [{ x: 20, y: 20, sight: 5 }])
    expect(at(fog, 20, 20)).toBe(Visibility.Visible)
    expect(at(fog, 24, 20)).toBe(Visibility.Visible)
    expect(at(fog, 27, 20)).toBe(Visibility.Unknown)
  })

  it('laisse « déjà vu » ce que l’observateur a quitté', () => {
    const fog = createFog(60, 20)
    updateFog(fog, [{ x: 10, y: 10, sight: 4 }])
    updateFog(fog, [{ x: 40, y: 10, sight: 4 }])
    expect(at(fog, 10, 10)).toBe(Visibility.Seen)
    expect(at(fog, 40, 10)).toBe(Visibility.Visible)
  })

  it('note la zone modifiée et change de version', () => {
    const fog = createFog(60, 20)
    updateFog(fog, [{ x: 10, y: 10, sight: 3 }])
    expect(fog.version).toBe(1)
    expect(fog.dirty).toMatchObject({ x: 7, y: 7 })
  })

  it('un observateur immobile ne change rien : ni version, ni zone sale', () => {
    const fog = createFog(60, 20)
    updateFog(fog, [{ x: 10, y: 10, sight: 4 }])
    fog.dirty = null
    const version = fog.version
    updateFog(fog, [{ x: 10, y: 10, sight: 4 }])
    expect(fog.version).toBe(version)
    expect(fog.dirty).toBeNull()
  })

  it('la zone sale ne couvre que ce qui change, pas les observateurs immobiles', () => {
    const fog = createFog(100, 40)
    const still = { x: 80, y: 20, sight: 5 }
    updateFog(fog, [{ x: 10, y: 20, sight: 5 }, still])
    fog.dirty = null
    updateFog(fog, [{ x: 12, y: 20, sight: 5 }, still])
    expect(fog.dirty).not.toBeNull()
    expect(fog.dirty!.x + fog.dirty!.w).toBeLessThanOrEqual(20)
  })

  it('ignore un observateur hors du monde', () => {
    const fog = createFog(10, 10)
    updateFog(fog, [{ x: -50, y: -50, sight: 3 }])
    expect(fog.cells.every((c) => c === Visibility.Unknown)).toBe(true)
  })

  it('ne referme jamais une zone découverte, quel que soit le trajet', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -5, max: 45 }), fc.integer({ min: -5, max: 45 })), {
          minLength: 1,
          maxLength: 30,
        }),
        (path) => {
          const fog = createFog(40, 40)
          let previous = fog.cells.slice()
          for (const [x, y] of path) {
            updateFog(fog, [{ x, y, sight: 4 }])
            for (let i = 0; i < fog.cells.length; i++) {
              if (previous[i] !== Visibility.Unknown) {
                expect(fog.cells[i]).not.toBe(Visibility.Unknown)
              }
            }
            // Ce qui est visible l'est parce qu'un observateur le voit.
            for (let i = 0; i < fog.cells.length; i++) {
              if (fog.cells[i] === Visibility.Visible) {
                const cx = (i % 40) + 0.5
                const cy = Math.floor(i / 40) + 0.5
                expect(Math.hypot(cx - x, cy - y)).toBeLessThanOrEqual(4)
              }
            }
            previous = fog.cells.slice()
          }
        },
      ),
      { numRuns: 60 },
    )
  })
})
