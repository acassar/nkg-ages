import { describe, expect, it } from 'vitest'
import { createGame, step } from '@/engine/game'
import { buildGameView, buildWorldSnapshot, formatDate, patchOf } from '@/views/selectors'

const game = () => createGame({ seed: 'vues', randomStart: false, width: 128, height: 64 })

describe('dates', () => {
  it('écrit les dates avant notre ère', () => {
    expect(formatDate(-12000, 2)).toBe('mars 12 000 av. J.-C.')
  })
  it('écrit les dates de notre ère', () => {
    expect(formatDate(1789, 6)).toBe('juillet 1 789')
  })
})

describe('morceaux de grille', () => {
  it('copie exactement le rectangle demandé', () => {
    const cells = Uint8Array.from({ length: 16 }, (_, i) => i)
    const p = patchOf(cells, 4, { x: 1, y: 1, w: 2, h: 2 })
    expect(p).toEqual({ x: 1, y: 1, w: 2, h: 2, data: Uint8Array.from([5, 6, 9, 10]) })
  })
  it('ne renvoie rien sans zone modifiée', () => {
    expect(patchOf(new Uint8Array(4), 2, null)).toBeNull()
  })
})

describe('vues de partie', () => {
  it('envoie les grilles entières au départ', () => {
    const g = game()
    const view = buildGameView(g, true)
    expect(view.fog).toMatchObject({ x: 0, y: 0, w: 128, h: 64 })
    expect(view.territory?.data.length).toBe(128 * 64)
    expect(view.units[0]?.name).toBe('Éclaireur')
    expect(view.camps[0]?.mine).toBe(true)
  })

  it("n'envoie ensuite que les zones modifiées", () => {
    const g = game()
    g.fog.dirty = null
    g.territory.dirty = null
    expect(buildGameView(g).fog).toBeNull()
    // Rien ne bouge : rien à renvoyer.
    step(g)
    expect(buildGameView(g).fog).toBeNull()
    const u = g.units[0]!
    u.target = { x: u.x + 3, y: u.y }
    step(g)
    const view = buildGameView(g)
    expect(view.fog).not.toBeNull()
    expect(view.fog!.w * view.fog!.h).toBeLessThan(128 * 64)
  })

  it("ne partage pas d'objets mutables avec le moteur", () => {
    const g = game()
    g.units[0]!.target = { x: 3, y: 3 }
    const view = buildGameView(g)
    view.units[0]!.target!.x = 99
    expect(g.units[0]!.target!.x).toBe(3)
  })

  it('code l’altitude sur un octet, eau sous 128 et terre au-dessus', () => {
    const g = game()
    const snap = buildWorldSnapshot(g)
    for (let i = 0; i < snap.elevation.length; i++) {
      expect(snap.elevation[i]! >= 128).toBe(g.world.elevation[i]! >= 0)
    }
    expect(snap.biome).not.toBe(g.world.biome)
  })
})
