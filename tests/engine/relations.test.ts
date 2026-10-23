import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { RELATION_RULES } from '@/engine/content/relations'
import {
  applyCommand,
  cannotTrade,
  closeCamps,
  type GameEvent,
  createGame,
  foodCapacity,
  moodOf,
  step,
  type GameState,
} from '@/engine/game'
import { loadGame, saveGame } from '@/engine/save/save'
import { buildGameView } from '@/views/selectors'

function run(g: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(g)
}

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

describe('tensions et raids', () => {
  /** Le premier peuple, rencontré et posé tout près du camp du joueur. */
  function close(): GameState {
    const g = neighbours()
    const p = g.peoples[0]!
    const home = g.camps.find((c) => c.owner === p.owner)!
    const mine = g.camps[0]!
    Object.assign(home, { x: mine.x + 10, y: mine.y })
    return g
  }

  it('des campements trop proches aigrissent la relation, mois après mois', () => {
    const g = close()
    const p = g.peoples[0]!
    expect(closeCamps(g, p.owner)).toBe(1)
    run(g, 24)
    expect(p.relation).toBeLessThan(-5)
    expect(buildGameView(g).peoples[0]!.tension).toMatch(/trop proches/)
  })

  it('un peuple hostile pille la réserve ; les chasseurs en sauvent une part', () => {
    const g = close()
    const p = g.peoples[0]!
    p.tribe.population = 100
    p.relation = -100
    const raids: Extract<GameEvent, { type: 'raid' }>[] = []
    for (let i = 0; i < 120 && raids.length === 0; i++) {
      g.tribe.food = 100
      p.relation = -100
      step(g)
      for (const e of g.events) if (e.type === 'raid') raids.push(e)
      g.events = []
    }
    expect(raids.length).toBe(1)
    const r = raids[0]!
    expect(r.name).toBe(p.name)
    expect(r.stolen).toBeGreaterThan(0)
    // Deux chasseurs au départ : 20 % du butin sauvé.
    expect(r.saved).toBeGreaterThan(0)
    expect(r.killed).toBe(0)
  })

  it('une réserve vide coûte une vie, jamais la dernière', () => {
    const g = close()
    const p = g.peoples[0]!
    let killed = 0
    for (let i = 0; i < 300; i++) {
      g.tribe.food = 0
      // La disette passe avant le raid dans le mois : de quoi garder plus d'une vie.
      g.tribe.population = 10
      p.relation = -100
      p.tribe.population = 50
      step(g)
      for (const e of g.events) if (e.type === 'raid') killed += e.killed
      g.events = []
      expect(g.tribe.population).toBeGreaterThanOrEqual(1)
    }
    expect(killed).toBeGreaterThan(0)
  }, 30_000)

  it('un peuple jamais rencontré ou content ne pille pas', () => {
    for (const setup of [
      (p: GameState['peoples'][number]) => ((p.met = false), (p.relation = -100)),
      (p: GameState['peoples'][number]) => (p.relation = 0),
    ]) {
      const g = close()
      const p = g.peoples[0]!
      for (let i = 0; i < 200; i++) {
        setup(p)
        step(g)
        expect(g.events.some((e) => e.type === 'raid')).toBe(false)
        g.events = []
      }
    }
  }, 30_000)
})
