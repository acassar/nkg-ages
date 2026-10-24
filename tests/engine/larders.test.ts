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
    applyCommand(g, { type: 'splitBand', campId: a.id })
    const b = mine(g)[1]!
    expect(larderOf(a).food).toBe(50)
    expect(larderOf(b).food).toBe(50)
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

describe('cueillette et chasse à la fois', () => {
  /** Une bande seule de trente, un troupeau de cerfs en vue, et ses terres à tant de richesse. */
  function month(weight: number, food: number, herds = true) {
    const g = createGame({ ...options, rareEvents: false })
    const band = g.camps[0]!
    band.members = 30
    g.tribe.population = 30
    g.deposits = []
    g.territory.weights!.fill(weight)
    const spot = { x: band.x + 3, y: band.y }
    g.herds = herds ? [{ id: 1, kind: 'cerf', ...spot, size: 40, goal: { ...spot } }] : []
    larderOf(band).food = food
    step(g)
    let worn = 0
    for (const a of g.abundance) worn += 1 - a
    const larder = larderOf(band)
    return { band, gathered: larder.lastProduction, meat: larder.lastMeat, worn }
  }

  it('sur des terres riches, une part chasse et les autres cueillent', () => {
    const rich = month(10, 0)
    expect(huntersIn(rich.band)).toBe(Math.floor(30 * HUNT_RULES.share))
    expect(rich.gathered).toBeGreaterThan(0)
  })

  it('quand les terres manquent, plus de gens partent chasser', () => {
    const poor = month(0, 0)
    expect(huntersIn(poor.band)).toBe(Math.floor(30 * HUNT_RULES.maxShare))
    expect(poor.meat).toBeGreaterThan(0)
  })

  it('sans gibier en vue, tout le monde cueille', () => {
    const none = month(0, 0, false)
    expect(huntersIn(none.band)).toBe(0)
    expect(none.meat).toBe(0)
  })

  it('réserve presque pleine, la bande ne cueille que ce qui manque et use moins ses terres', () => {
    const g = createGame(options)
    g.camps[0]!.members = 30
    const capacity = campCapacity(g, g.camps[0]!)
    const hungry = month(10, 0, false)
    const fed = month(10, capacity - 5, false)
    // Le repas du mois (30) et les 5 rations qui manquaient, pas plus.
    expect(fed.gathered).toBeCloseTo(35)
    expect(fed.gathered).toBeLessThan(hungry.gathered)
    expect(fed.worn).toBeLessThan(hungry.worn)
  })
})

describe('invariants des réserves (fast-check)', () => {
  it('vivres jamais négatifs ni au-delà de la place, gens comptés une fois', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({ kind: fc.constant('full' as const) }),
            fc.record({ kind: fc.constant('split' as const) }),
            fc.record({ kind: fc.constant('wait' as const) }),
          ),
          { maxLength: 30 },
        ),
        (plays) => {
          const g = createGame({ ...options, rareEvents: false, seed: 'reserves-invariants' })
          for (const p of plays) {
            const band = mine(g).at(-1)!
            if (p.kind === 'full') larderOf(band).food = campCapacity(g, band)
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
              expect(huntersIn(c)).toBeLessThanOrEqual(c.members! * HUNT_RULES.maxShare)
            }
          }
        },
      ),
      { numRuns: 12 },
    )
  }, 60_000)
})
