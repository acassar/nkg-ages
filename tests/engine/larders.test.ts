import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  campCapacity,
  createGame,
  foodCapacity,
  foodOf,
  huntersIn,
  larderOf,
  poolLarders,
  step,
  type Camp,
  type GameState,
} from '@/engine/game'
import { BAND_RULES } from '@/engine/content/bands'
import { HUNT_RULES } from '@/engine/content/fauna'
import { RELATION_RULES } from '@/engine/content/relations'
import { PLAYER } from '@/engine/territory/territory'

const options = { seed: 'reserves', randomStart: false, width: 192, height: 96, peoples: 0 }

const mine = (g: GameState) => g.camps.filter((c) => c.owner === PLAYER)

/** Une partie à deux bandes de dix : la seconde vient de se détacher de la première. */
function twoBands(extra: Partial<typeof options> & { rareEvents?: boolean } = {}): {
  g: GameState
  a: Camp
  b: Camp
} {
  const g = createGame({ ...options, ...extra })
  const a = g.camps[0]!
  a.members = 20
  g.tribe.population = 20
  expect(applyCommand(g, { type: 'splitBand', campId: a.id }).ok).toBe(true)
  const b = mine(g)[1]!
  stopAt(b, b.x, b.y)
  return { g, a, b }
}

/** Arrête une bande là où elle est (elle ne part pas d'elle-même). */
function stopAt(band: Camp, x: number, y: number): void {
  Object.assign(band, { x, y, target: null, path: [], roaming: false })
}

/** Plus de terres à cueillir ni de gisements : seules la réserve et la chasse nourrissent. */
function barren(g: GameState): void {
  g.abundance.fill(0)
  g.territory.weights = new Float32Array(g.territory.owner.length)
  g.deposits = []
  g.herds = []
}

describe('réserve par bande', () => {
  it('la bande de départ porte toute la réserve : la tribu n’a plus de compteur de vivres', () => {
    const g = createGame(options)
    expect(Object.keys(g.tribe).sort()).toEqual(['materials', 'population'])
    expect(foodOf(g)).toBeGreaterThan(0)
    expect(larderOf(g.camps[0]!).food).toBe(foodOf(g))
    expect(foodCapacity(g)).toBe(campCapacity(g, g.camps[0]!))
  })

  it('une bande qui se scinde donne aux partants leur part des vivres', () => {
    const g = createGame(options)
    const a = g.camps[0]!
    a.members = 20
    g.tribe.population = 20
    larderOf(a).food = 100
    applyCommand(g, { type: 'setHunting', campId: a.id, share: 0.3 })
    applyCommand(g, { type: 'splitBand', campId: a.id })
    const b = mine(g)[1]!
    expect(larderOf(a).food).toBe(50)
    expect(larderOf(b).food).toBe(50)
    // La jeune bande garde la façon de faire de sa mère.
    expect(b.hunting).toBe(0.3)
  })

  it('deux bandes éloignées vivent chacune de leur réserve : l’une peut avoir faim seule', () => {
    const { g, a, b } = twoBands({ rareEvents: false })
    barren(g)
    stopAt(a, a.x, a.y)
    stopAt(b, a.x + BAND_RULES.shareDistance + 10, a.y)
    larderOf(a).food = 200
    larderOf(b).food = 0
    step(g)
    const famines = g.events.filter((e) => e.type === 'famine')
    expect(famines).toEqual([{ type: 'famine', campId: b.id }])
    expect(larderOf(a).starvingMonths).toBe(0)
    expect(larderOf(b).starvingMonths).toBe(1)
    expect(b.members).toBeLessThan(10)
    expect(a.members).toBe(10)
  })

  it('deux bandes proches mettent leurs vivres en commun, selon la place de chacune', () => {
    const { g, a, b } = twoBands()
    stopAt(b, a.x + BAND_RULES.shareDistance - 1, a.y)
    larderOf(a).food = 90
    larderOf(b).food = 0
    a.members = 12
    b.members = 6
    poolLarders(g)
    expect(larderOf(a).food + larderOf(b).food).toBeCloseTo(90)
    expect(larderOf(a).food).toBeCloseTo(60)
    expect(larderOf(b).food).toBeCloseTo(30)
    // Plus loin, chacune garde ce qu'elle a.
    stopAt(b, a.x + BAND_RULES.shareDistance + 1, a.y)
    larderOf(b).food = 0
    poolLarders(g)
    expect(larderOf(b).food).toBe(0)
  })

  it('une bande proche d’une autre affamée la nourrit : personne ne meurt', () => {
    const { g, a, b } = twoBands({ rareEvents: false })
    barren(g)
    stopAt(a, a.x, a.y)
    stopAt(b, a.x + 3, a.y)
    larderOf(a).food = 200
    larderOf(b).food = 0
    step(g)
    expect(g.events.some((e) => e.type === 'famine')).toBe(false)
    expect(a.members! + b.members!).toBe(20)
  })

  it('un village se bâtit avec les vivres de sa bande, pas avec ceux des autres', () => {
    const { g, a, b } = twoBands()
    g.inventions.ranks.agriculture = 'E'
    g.tribe.population = 200
    a.members = 190
    stopAt(b, a.x + BAND_RULES.shareDistance + 10, a.y)
    larderOf(a).food = 0
    larderOf(b).food = 1000
    expect(applyCommand(g, { type: 'buildVillage', campId: a.id })).toEqual({
      ok: false,
      reason: expect.stringMatching(/réserve de la bande/),
    })
    larderOf(a).food = 500
    expect(applyCommand(g, { type: 'buildVillage', campId: a.id }).ok).toBe(true)
    expect(larderOf(b).food).toBe(1000)
  })

  it('les présents partent de la réserve la mieux pourvue', () => {
    const g = createGame({ ...options, peoples: 1, seed: 'reserves-voisins' })
    const people = g.peoples[0]!
    people.met = true
    const a = g.camps[0]!
    a.members = 20
    g.tribe.population = 20
    applyCommand(g, { type: 'splitBand', campId: a.id })
    const b = mine(g)[1]!
    larderOf(a).food = 5
    larderOf(b).food = 100
    expect(applyCommand(g, { type: 'gift', people: people.owner }).ok).toBe(true)
    expect(larderOf(a).food).toBe(5)
    expect(larderOf(b).food).toBe(100 - RELATION_RULES.giftFood)
  })
})

describe('cueillette ou chasse', () => {
  it('chaque campement règle sa part de chasseurs, bornée', () => {
    const g = createGame(options)
    const band = g.camps[0]!
    band.members = 20
    expect(huntersIn(band)).toBe(Math.floor(20 * HUNT_RULES.share))
    expect(applyCommand(g, { type: 'setHunting', campId: band.id, share: 0.5 }).ok).toBe(true)
    expect(huntersIn(band)).toBe(10)
    applyCommand(g, { type: 'setHunting', campId: band.id, share: 2 })
    expect(band.hunting).toBe(HUNT_RULES.maxShare)
    applyCommand(g, { type: 'setHunting', campId: band.id, share: -1 })
    expect(huntersIn(band)).toBe(0)
    expect(applyCommand(g, { type: 'setHunting', campId: band.id, share: NaN }).ok).toBe(false)
    expect(applyCommand(g, { type: 'setHunting', campId: 999, share: 0.2 }).ok).toBe(false)
  })

  it('sans chasseurs, pas de viande ; avec, la viande remplit la réserve de la bande', () => {
    const meat = (share: number) => {
      const g = createGame({ ...options, rareEvents: false })
      const band = g.camps[0]!
      barren(g)
      applyCommand(g, { type: 'setHunting', campId: band.id, share })
      const spot = { x: band.x + 3, y: band.y }
      let total = 0
      for (let i = 0; i < 12; i++) {
        g.herds = [{ id: 1, kind: 'cerf', ...spot, size: 20, goal: { ...spot } }]
        larderOf(band).food = 0
        step(g)
        total += larderOf(band).lastMeat
      }
      return total
    }
    expect(meat(0)).toBe(0)
    expect(meat(HUNT_RULES.maxShare)).toBeGreaterThan(meat(HUNT_RULES.share))
  })

  it('sur des terres riches, plus de chasseurs fait moins de cueilleurs : la cueillette baisse et use moins la terre', () => {
    const gather = (share: number) => {
      const g = createGame({ ...options, rareEvents: false })
      const band = g.camps[0]!
      band.members = 30
      g.tribe.population = 30
      applyCommand(g, { type: 'setHunting', campId: band.id, share })
      g.herds = []
      // Des terres très riches : ce sont les bras qui manquent, pas les baies.
      g.territory.weights!.fill(10)
      step(g)
      let worn = 0
      for (const a of g.abundance) worn += 1 - a
      return { gathered: larderOf(band).lastProduction, worn }
    }
    const gatherers = gather(0)
    const hunters = gather(HUNT_RULES.maxShare)
    expect(hunters.gathered).toBeLessThan(gatherers.gathered)
    expect(hunters.worn).toBeLessThan(gatherers.worn)
  })
})

describe('invariants des réserves (fast-check)', () => {
  it('vivres jamais négatifs ni au-delà de la place, gens comptés une fois', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({
              kind: fc.constant('hunt' as const),
              share: fc.double({ min: -1, max: 1 }),
            }),
            fc.record({ kind: fc.constant('split' as const) }),
            fc.record({ kind: fc.constant('wait' as const) }),
          ),
          { maxLength: 30 },
        ),
        (plays) => {
          const g = createGame({ ...options, rareEvents: false, seed: 'reserves-invariants' })
          for (const p of plays) {
            const band = mine(g).at(-1)!
            if (p.kind === 'hunt')
              applyCommand(g, { type: 'setHunting', campId: band.id, share: p.share })
            else if (p.kind === 'split') {
              applyCommand(g, { type: 'setRoaming', campId: band.id, roaming: true })
              applyCommand(g, { type: 'splitBand', campId: band.id })
            }
            step(g)
            const camps = mine(g)
            expect(camps.reduce((sum, c) => sum + c.members!, 0)).toBe(g.tribe.population)
            for (const c of camps) {
              const larder = larderOf(c)
              expect(larder.food).toBeGreaterThanOrEqual(0)
              expect(larder.food).toBeLessThanOrEqual(campCapacity(g, c) + 1e-9)
              expect(c.hunting ?? HUNT_RULES.share).toBeLessThanOrEqual(HUNT_RULES.maxShare)
            }
          }
        },
      ),
      { numRuns: 12 },
    )
  }, 60_000)
})
