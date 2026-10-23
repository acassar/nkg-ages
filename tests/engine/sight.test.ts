import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { bandSight, herdsSeenBy, safePrey } from '@/engine/bands/sight'
import { BAND_RULES } from '@/engine/content/bands'
import { Visibility } from '@/engine/fog/fog'
import { applyCommand, bandsOf, createGame, step } from '@/engine/game'
import { frontierTarget } from '@/engine/units/explore'
import { PLAYER } from '@/engine/territory/territory'
import type { Herd } from '@/engine/fauna/fauna'

const options = { seed: 'vue-bandes', randomStart: false, width: 128, height: 64, peoples: 0 }

const herd = (id: number, kind: Herd['kind'], x: number, y: number): Herd => ({
  id,
  kind,
  x,
  y,
  size: 4,
  goal: { x, y },
})

describe('vue des bandes', () => {
  it('le pistage allonge la vue des bandes', () => {
    const g = createGame(options)
    expect(bandSight(g.inventions)).toBe(BAND_RULES.sight)
    g.inventions.ranks.pistage = 'E'
    expect(bandSight(g.inventions)).toBe(BAND_RULES.sight + 1)
  })

  it('une bande ne voit que les troupeaux à sa portée, du plus proche au plus loin', () => {
    const g = createGame(options)
    const band = g.camps[0]!
    const far = herd(1, 'cerf', band.x + BAND_RULES.sight - 1, band.y)
    const near = herd(2, 'sanglier', band.x, band.y + 2)
    const away = herd(3, 'cerf', band.x + BAND_RULES.sight + 1, band.y)
    const gone = { ...herd(4, 'cerf', band.x + 1, band.y), size: 0 }
    g.herds = [far, near, away, gone]
    expect(herdsSeenBy(g, band)).toEqual([near, far])
    // Le pistage fait voir plus loin.
    g.inventions.ranks.pistage = 'E'
    expect(herdsSeenBy(g, band)).toEqual([near, far, away])
  })

  it('une bande ne chasse pas seule les plus dangereux (les mammouths)', () => {
    expect(safePrey(herd(1, 'cerf', 0, 0))).toBe(true)
    expect(safePrey(herd(1, 'sanglier', 0, 0))).toBe(true)
    expect(safePrey(herd(1, 'mammouth', 0, 0))).toBe(false)
  })

  it('la tribu ne voit que par ses campements : ce qu’une bande voit est visible', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30 }), (months) => {
        const g = createGame({ ...options, seed: 'vue-tribu' })
        applyCommand(g, { type: 'setRoaming', campId: g.camps[0]!.id, roaming: true })
        for (let i = 0; i < months; i++) step(g)
        const { width } = g.world
        const sight = bandSight(g.inventions)
        for (const camp of g.camps.filter((c) => c.owner === PLAYER)) {
          const at = (dx: number, dy: number) =>
            g.fog.cells[Math.floor(camp.y + dy) * width + Math.floor(camp.x + dx)]
          expect(at(0, 0)).toBe(Visibility.Visible)
          expect(at(sight - 2, 0) ?? Visibility.Visible).toBe(Visibility.Visible)
        }
      }),
      { numRuns: 8 },
    )
  }, 30_000)
})

describe('migration vers l’inconnu', () => {
  it('une bande qui migre seule sans meilleur site connu part découvrir l’inconnu', () => {
    const g = createGame({ ...options, rareEvents: false })
    const band = bandsOf(g)[0]!
    // Tout ce qu'elle connaît est épuisé : aucun site connu ne vaut mieux.
    g.abundance.fill(0.1)
    band.roaming = true
    step(g)
    expect(band.target).not.toBeNull()
    const { width } = g.world
    const t = band.target!
    // Elle vise la lisière du connu : une cellule connue qui touche l'inconnu.
    expect(g.fog.cells[Math.floor(t.y) * width + Math.floor(t.x)]).not.toBe(Visibility.Unknown)
    const known = g.fog.known
    for (let i = 0; i < 6; i++) step(g)
    expect(g.fog.known).toBeGreaterThan(known)
  })

  it('la lisière visée est toujours connue, franchissable et au bord de l’inconnu (fast-check)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (months) => {
        const g = createGame({ ...options, seed: 'lisiere' })
        const band = g.camps[0]!
        applyCommand(g, { type: 'setRoaming', campId: band.id, roaming: true })
        for (let i = 0; i < months; i++) step(g)
        const target = frontierTarget(g.world, g.fog, band)
        if (!target) return
        const { width } = g.world
        const x = Math.floor(target.x)
        const y = Math.floor(target.y)
        expect(g.fog.cells[y * width + x]).not.toBe(Visibility.Unknown)
        const around = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].map(([dx, dy]) => g.fog.cells[(y + dy!) * width + x + dx!])
        expect(around).toContain(Visibility.Unknown)
      }),
      { numRuns: 8 },
    )
  }, 30_000)
})
