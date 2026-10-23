import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { RELATION_RULES } from '@/engine/content/relations'
import {
  applyCommand,
  cannotTrade,
  createGame,
  foodCapacity,
  moodOf,
  step,
  type GameState,
} from '@/engine/game'
import { loadGame, saveGame } from '@/engine/save/save'

const options = { seed: 'voisins', randomStart: false, width: 320, height: 160, rareEvents: false }

/** Partie où le joueur a rencontré le premier peuple, avec de quoi donner et échanger. */
function neighbours(): GameState {
  const g = createGame(options)
  g.peoples[0]!.met = true
  g.peoples[0]!.tribe.food = 200
  g.tribe.food = 40
  g.tribe.materials.silex = 50
  return g
}

describe('relations', () => {
  it('un présent coûte des vivres et rapproche', () => {
    const g = neighbours()
    const p = g.peoples[0]!
    expect(applyCommand(g, { type: 'gift', people: p.owner })).toEqual({ ok: true })
    expect(g.tribe.food).toBe(40 - RELATION_RULES.giftFood)
    expect(p.relation).toBe(RELATION_RULES.giftRelation)
  })

  it('on ne traite pas avec un peuple jamais rencontré', () => {
    const g = neighbours()
    const stranger = g.peoples[1]
    if (!stranger) return
    expect(applyCommand(g, { type: 'gift', people: stranger.owner })).toEqual({
      ok: false,
      reason: 'Peuple inconnu',
    })
    expect(applyCommand(g, { type: 'gift', people: 99 })).toMatchObject({ ok: false })
  })

  it('l’échange demande de la confiance, du silex, et des réserves chez eux', () => {
    const g = neighbours()
    const p = g.peoples[0]!
    expect(cannotTrade(g, p)).toMatch(/confiance/)
    p.relation = RELATION_RULES.tradeMinRelation
    expect(cannotTrade(g, p)).toBeNull()
    g.tribe.materials.silex = RELATION_RULES.tradeSilex - 1
    expect(cannotTrade(g, p)).toMatch(/silex/)
    g.tribe.materials.silex = 50
    p.tribe.food = p.tribe.population
    expect(cannotTrade(g, p)).toMatch(/maigres/)
  })

  it('un échange fait passer le silex chez eux et les vivres chez nous, sans déborder', () => {
    const g = neighbours()
    const p = g.peoples[0]!
    p.relation = 50
    const theirs = p.tribe.food
    expect(applyCommand(g, { type: 'trade', people: p.owner })).toEqual({ ok: true })
    expect(g.tribe.materials.silex).toBe(50 - RELATION_RULES.tradeSilex)
    expect(p.tribe.food).toBe(theirs - RELATION_RULES.tradeFood)
    expect(g.tribe.food).toBeLessThanOrEqual(foodCapacity(g))
  })

  it('réserve pleine : l’échange est refusé, sans payer de silex pour rien', () => {
    const g = neighbours()
    const p = g.peoples[0]!
    p.relation = 50
    g.tribe.food = foodCapacity(g) - RELATION_RULES.tradeFood + 1
    const before = { silex: g.tribe.materials.silex, theirs: p.tribe.food, relation: p.relation }
    expect(applyCommand(g, { type: 'trade', people: p.owner })).toEqual({
      ok: false,
      reason: 'Vos réserves sont pleines',
    })
    expect(g.tribe.materials.silex).toBe(before.silex)
    expect(p.tribe.food).toBe(before.theirs)
    expect(p.relation).toBe(before.relation)
  })

  it('un seul présent ou échange par mois et par peuple', () => {
    const g = neighbours()
    const p = g.peoples[0]!
    p.relation = 50
    expect(applyCommand(g, { type: 'gift', people: p.owner })).toEqual({ ok: true })
    const soon = { ok: false, reason: 'Un seul présent ou échange par mois' }
    expect(applyCommand(g, { type: 'gift', people: p.owner })).toEqual(soon)
    expect(applyCommand(g, { type: 'trade', people: p.owner })).toEqual(soon)
    step(g)
    expect(applyCommand(g, { type: 'trade', people: p.owner })).toEqual({ ok: true })
  })

  it('négligée, la relation revient vers la neutralité sans la dépasser', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 100 }), fc.integer({ min: 1, max: 400 }), (r, t) => {
        const g = neighbours()
        const p = g.peoples[0]!
        p.relation = r
        for (let i = 0; i < t; i++) step(g)
        expect(Math.abs(p.relation)).toBeLessThanOrEqual(Math.abs(r))
        expect(Math.sign(p.relation) * Math.sign(r)).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 10 },
    )
  }, 30_000)

  it('la relation reste dans ses bornes, présents répétés compris', () => {
    const g = neighbours()
    g.tribe.food = 100000
    const p = g.peoples[0]!
    for (let i = 0; i < 20; i++) {
      delete p.lastDeal
      applyCommand(g, { type: 'gift', people: p.owner })
    }
    expect(p.relation).toBe(RELATION_RULES.max)
  })

  it('humeurs', () => {
    expect(moodOf(80)).toBe('Allié')
    expect(moodOf(20)).toBe('Amical')
    expect(moodOf(0)).toBe('Neutre')
    expect(moodOf(-10)).toBe('Méfiant')
    expect(moodOf(-100)).toBe('Hostile')
  })

  it('la sauvegarde garde la relation, et une ancienne sauvegarde part de 0', () => {
    const g = neighbours()
    g.peoples[0]!.relation = 42
    const data = saveGame(g)
    expect(loadGame(data).peoples[0]!.relation).toBe(42)
    const old = JSON.parse(JSON.stringify(data))
    delete old.peoples[0].relation
    expect(loadGame(old).peoples[0]!.relation).toBe(0)
  })
})
