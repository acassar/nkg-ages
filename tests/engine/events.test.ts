import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { EVENT_KINDS, EVENT_RULES, EVENT_RULES_GLOBAL } from '@/engine/content/events'
import { RANKS } from '@/engine/content/rarity'
import { createRng } from '@/engine/core/random'
import { eventPossible, monthlyChance, pickEvent } from '@/engine/events/events'
import { applyCommand, createGame, foodCapacity, step, type GameState } from '@/engine/game'
import { PLAYER } from '@/engine/territory/territory'
import { loadGame, saveGame } from '@/engine/save/save'

const options = { seed: 'sort', randomStart: false, width: 192, height: 96 }
const context = { month: 6, years: 10, researching: true }

/** Partie où l'on force l'événement du mois en remplaçant son aléa. */
function forced(g: GameState, kind: (typeof EVENT_KINDS)[number]) {
  // Le tirage qui tombe juste au début de la tranche de l'événement voulu.
  let before = 0
  for (const k of EVENT_KINDS) {
    if (k === kind) break
    before += monthlyChance(k)
  }
  const real = g.eventRng
  let first = true
  g.eventRng = {
    ...real,
    next: () => (first ? ((first = false), before + 1e-9) : real.next()),
  }
}

describe('événements rares : tirage', () => {
  it('au plus un événement par mois, et la somme des chances reste sous 1', () => {
    let sum = 0
    for (const k of EVENT_KINDS) sum += monthlyChance(k)
    expect(sum).toBeLessThan(0.5)
  })

  it('les plus rares sont les mieux classés', () => {
    const rankOf = (k: (typeof EVENT_KINDS)[number]) => RANKS.indexOf(EVENT_RULES[k].rank)
    for (const a of EVENT_KINDS)
      for (const b of EVENT_KINDS)
        if (rankOf(a) < rankOf(b))
          expect(EVENT_RULES[a].chancePerYear).toBeGreaterThan(EVENT_RULES[b].chancePerYear)
  })

  it('sur de nombreuses années, chaque événement retrouve sa fréquence', () => {
    const rng = createRng('fréquences')
    const counts = new Map<string, number>()
    const years = 20000
    for (let t = 0; t < years * 12; t++) {
      const kind = pickEvent({ ...context, month: t % 12 }, rng)
      if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1)
    }
    for (const k of EVENT_KINDS) {
      const expected = EVENT_RULES[k].chancePerYear * years
      expect(counts.get(k) ?? 0).toBeGreaterThan(expected * 0.8)
      expect(counts.get(k) ?? 0).toBeLessThan(expected * 1.2)
    }
  })

  it('un coup du sort épargne les premières années, une étoile filante demande une recherche', () => {
    for (const k of EVENT_KINDS) {
      const young = { ...context, month: EVENT_RULES[k].months?.[0] ?? 0, years: 0 }
      expect(eventPossible(k, young)).toBe(
        !EVENT_RULES[k].harmful && k !== 'etoile' ? true : k === 'etoile',
      )
    }
    expect(eventPossible('etoile', { ...context, researching: false })).toBe(false)
    expect(eventPossible('tempete', { ...context, years: EVENT_RULES_GLOBAL.graceYears })).toBe(
      false,
    )
    expect(eventPossible('tempete', { ...context, month: 10, years: 5 })).toBe(true)
  })

  it('un seul tirage d’aléa par mois, quoi qu’il arrive', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 11 }),
        fc.boolean(),
        fc.nat(9),
        (month, researching, years) => {
          const a = createRng('un-tirage')
          const b = createRng('un-tirage')
          pickEvent({ month, years, researching }, a)
          b.next()
          expect(a.state).toBe(b.state)
        },
      ),
    )
  })
})

describe('événements rares : effets', () => {
  it('abondance : la réserve gagne, sans déborder', () => {
    const g = createGame(options)
    g.clock.tick = 4 * 12 + 5
    forced(g, 'abondance')
    const before = g.tribe.food
    step(g)
    const event = g.events.find((e) => e.type === 'rare')
    expect(event).toMatchObject({ event: 'abondance' })
    expect(g.tribe.food).toBeLessThanOrEqual(foodCapacity(g))
    expect(g.tribe.food).toBeGreaterThan(before - g.tribe.population)
  })

  it('une tempête sur une réserve vide passe inaperçue', () => {
    const g = createGame(options)
    g.clock.tick = 5 * 12 + 9
    // Rien à récolter ni à chasser : la réserve reste vide après le repas du mois.
    g.tribe.food = 0
    g.abundance.fill(0)
    g.deposits = []
    g.herds = []
    forced(g, 'tempete')
    step(g)
    expect(g.events.some((e) => e.type === 'rare')).toBe(false)
  })

  it('maladie : la tribu perd des siens, jamais tous', () => {
    const g = createGame(options)
    g.clock.tick = 5 * 12
    g.tribe.population = 1
    forced(g, 'maladie')
    step(g)
    expect(g.tribe.population).toBeGreaterThanOrEqual(1)
    const big = createGame(options)
    big.clock.tick = 5 * 12
    big.tribe.population = 100
    forced(big, 'maladie')
    step(big)
    expect(big.events.find((e) => e.type === 'rare')).toMatchObject({
      event: 'maladie',
      amount: -8,
    })
  })

  it('migration : un grand troupeau paraît sur la terre ferme, près du camp', () => {
    const g = createGame(options)
    g.clock.tick = 5 * 12 + 2
    const herds = g.herds.length
    forced(g, 'migration')
    step(g)
    expect(g.herds).toHaveLength(herds + 1)
    const herd = g.herds.at(-1)!
    const camp = g.camps[0]!
    expect(Math.hypot(herd.x - camp.x, herd.y - camp.y)).toBeLessThanOrEqual(
      EVENT_RULES_GLOBAL.herdDistance.max + 2,
    )
    expect(new Set(g.herds.map((h) => h.id)).size).toBe(g.herds.length)
  })

  it('filon : un gisement de rang B au moins affleure sur le territoire', () => {
    const g = createGame(options)
    g.clock.tick = 5 * 12
    forced(g, 'filon')
    step(g)
    const d = g.deposits.at(-1)!
    expect(d.kind).toBe('silex')
    expect(RANKS.indexOf(d.rank)).toBeGreaterThanOrEqual(RANKS.indexOf('B'))
    expect(g.territory.owner[d.y * g.world.width + d.x]).toBe(PLAYER)
    expect(new Set(g.deposits.map((x) => x.id)).size).toBe(g.deposits.length)
  })

  it('étoile filante : la recherche en cours avance de moitié', () => {
    const g = createGame(options)
    g.clock.tick = 5 * 12
    expect(applyCommand(g, { type: 'invent', invention: 'panier' }).ok).toBe(true)
    forced(g, 'etoile')
    step(g)
    const current = g.inventions.current
    // Elle a avancé de moitié, ou s'est achevée ce mois-ci.
    if (current) expect(current.progress).toBeGreaterThanOrEqual(current.work / 2)
    else expect(g.inventions.ranks.panier).toBeDefined()
  })

  it('sans événements rares (option), aucun ne survient', () => {
    const g = createGame({ ...options, rareEvents: false })
    for (let i = 0; i < 600; i++) {
      step(g)
      expect(g.events.some((e) => e.type === 'rare')).toBe(false)
      g.events = []
    }
  })

  it('la sauvegarde garde l’aléa des événements, et refuse un monde qui a changé', () => {
    const g = createGame(options)
    for (let i = 0; i < 300; i++) step(g)
    const data = saveGame(g)
    const copy = loadGame(data)
    for (let i = 0; i < 300; i++) {
      step(g)
      step(copy)
    }
    expect(saveGame(copy)).toEqual(saveGame(g))
    expect(() => loadGame({ ...data, world: (data.world! + 1) >>> 0 })).toThrow(/monde/)
    const old = { ...data }
    delete old.eventRng
    delete old.world
    expect(() => loadGame(old)).not.toThrow()
  })
})
