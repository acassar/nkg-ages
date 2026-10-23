import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { PEOPLE_RULES } from '@/engine/content/peoples'
import { Visibility } from '@/engine/fog/fog'
import { bandsOf, createGame, step, type GameState } from '@/engine/game'
import { isWater } from '@/engine/content/biomes'
import { NO_OWNER, PLAYER } from '@/engine/territory/territory'
import { buildGameView } from '@/views/selectors'

const options = { seed: 'voisins', randomStart: false, width: 320, height: 160, rareEvents: false }

function run(g: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(g)
}

/** Comptes par propriétaire, relus sur la grille. */
function recount(g: GameState): Map<number, number> {
  const counts = new Map<number, number>()
  for (const o of g.territory.owner) if (o !== NO_OWNER) counts.set(o, (counts.get(o) ?? 0) + 1)
  return counts
}

describe('peuples voisins', () => {
  it('s’installent loin du joueur et les uns des autres, chacun sur ses terres', () => {
    const g = createGame(options)
    expect(g.peoples.length).toBeGreaterThan(0)
    expect(g.peoples.length).toBeLessThanOrEqual(PEOPLE_RULES.count)
    const homes = g.camps
    for (const a of homes)
      for (const b of homes)
        if (a !== b)
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(PEOPLE_RULES.spacing)
    for (const p of g.peoples) {
      const camp = g.camps.find((c) => c.owner === p.owner)!
      expect(g.territory.owner[Math.floor(camp.y) * g.world.width + Math.floor(camp.x)]).toBe(
        p.owner,
      )
      expect(p.met).toBe(false)
    }
  })

  it('option peoples: 0, la tribu est seule', () => {
    const g = createGame({ ...options, peoples: 0 })
    expect(g.peoples).toEqual([])
    expect(g.camps).toHaveLength(1)
  })

  it('leurs campements n’éclairent pas la carte du joueur', () => {
    const g = createGame(options)
    for (const c of g.camps.filter((c) => c.owner !== PLAYER)) {
      const i = Math.floor(c.y) * g.world.width + Math.floor(c.x)
      expect(g.fog.cells[i]).toBe(Visibility.Unknown)
    }
  })

  it('ils grandissent, s’étendent et fondent des campements', () => {
    const g = createGame(options)
    const start = recount(g)
    run(g, 12 * 40)
    const later = recount(g)
    const grew = g.peoples.filter((p) => (later.get(p.owner) ?? 0) > (start.get(p.owner) ?? 0))
    expect(grew.length).toBe(g.peoples.length)
    expect(g.peoples.some((p) => g.camps.filter((c) => c.owner === p.owner).length > 1)).toBe(true)
    expect(g.peoples.every((p) => p.tribe.population > PEOPLE_RULES.startPopulation)).toBe(true)
  }, 60_000)

  it('invariant : les comptes par propriétaire suivent la grille, nul ne prend la terre d’un autre', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 6 }),
        fc.integer({ min: 1, max: 300 }),
        fc.array(fc.tuple(fc.nat(191), fc.nat(95)), { maxLength: 6 }),
        (seed, ticks, spots) => {
          const g = createGame({ ...options, seed, width: 192, height: 96 })
          g.tribe.population = 200
          const before = new Uint8Array(g.territory.owner)
          // La bande se pose n'importe où, terres voisines comprises, et y cueille.
          const band = bandsOf(g)[0]!
          for (const [x, y] of spots) {
            if (isWater(g.world.biome[y * g.world.width + x]!)) continue
            Object.assign(band, { x: x + 0.5, y: y + 0.5, target: null, path: [] })
            run(g, 1)
          }
          run(g, ticks)
          const counts = recount(g)
          for (let o = 1; o < g.territory.ownerCells.length; o++)
            expect(g.territory.ownerCells[o] ?? 0).toBe(counts.get(o) ?? 0)
          // Une terre d'un peuple ne change jamais de maître (pas encore de conquête) ;
          // le joueur, lui, rend les terres que sa bande quitte.
          for (let i = 0; i < before.length; i++)
            if (before[i] !== NO_OWNER && before[i] !== PLAYER)
              expect(g.territory.owner[i]).toBe(before[i])
        },
      ),
      { numRuns: 6 },
    )
  }, 60_000)

  it('les voisins ne changent rien à la croissance du joueur tant qu’ils ne le touchent pas', () => {
    const alone = createGame({ ...options, peoples: 0 })
    const crowded = createGame(options)
    run(alone, 200)
    run(crowded, 200)
    const mine = (g: GameState) => g.territory.owner.map((o) => (o === PLAYER ? 1 : 0))
    expect(mine(crowded)).toEqual(mine(alone))
  })

  it('sur 40 ans, ils ne font jamais grandir le joueur plus vite que seul', () => {
    for (const seed of ['a', 'b']) {
      const alone = createGame({ ...options, seed, peoples: 0 })
      const crowded = createGame({ ...options, seed })
      run(alone, 480)
      run(crowded, 480)
      expect(crowded.territory.ownerCells[PLAYER]).toBeLessThanOrEqual(
        alone.territory.ownerCells[PLAYER]!,
      )
    }
  }, 60_000)

  it('une bande posée contre leur camp ne prend rien de leurs terres', () => {
    const g = createGame(options)
    const people = g.peoples[0]!
    const camp = g.camps.find((c) => c.owner === people.owner)!
    const theirs = g.territory.ownerCells[people.owner]!
    const band = bandsOf(g)[0]!
    Object.assign(band, { x: camp.x + 1, y: camp.y, target: null, path: [] })
    run(g, 2)
    const w = g.world.width
    expect(g.territory.owner[Math.floor(camp.y) * w + Math.floor(camp.x) + 1]).toBe(people.owner)
    expect(g.territory.ownerCells[people.owner]!).toBeGreaterThanOrEqual(theirs)
  })

  it('le joueur les rencontre en voyant leurs terres, une seule fois', () => {
    const g = createGame(options)
    const people = g.peoples[0]!
    const camp = g.camps.find((c) => c.owner === people.owner)!
    // La bande arrive en vue de leur camp.
    Object.assign(g.camps[0]!, { x: camp.x + 3, y: camp.y })
    step(g)
    expect(people.met).toBe(true)
    expect(g.events.filter((e) => e.type === 'peopleMet')).toEqual([
      { type: 'peopleMet', name: people.name },
    ])
    g.events = []
    step(g)
    expect(g.events.some((e) => e.type === 'peopleMet')).toBe(false)
  })

  it('la vue ne trahit pas leurs terres ni leurs camps sous le brouillard', () => {
    const g = createGame(options)
    const full = buildGameView(g, true)
    expect(full.camps.filter((c) => !c.mine)).toEqual([])
    const rival = full.territory!.data.some((o) => o > PLAYER)
    expect(rival).toBe(false)
    // Une fois la bande passée près de chez eux, leurs terres et leur camp paraissent.
    const people = g.peoples[0]!
    const camp = g.camps.find((c) => c.owner === people.owner)!
    Object.assign(g.camps[0]!, { x: camp.x + 3, y: camp.y })
    step(g)
    const view = buildGameView(g)
    expect(view.camps.find((c) => !c.mine)).toMatchObject({ people: people.name, mine: false })
    expect(view.territory!.data.some((o) => o === people.owner)).toBe(true)
  })

  it('un peuple affamé disparaît, et ses camps avec lui', () => {
    const g = createGame(options)
    const people = g.peoples[0]!
    people.met = true
    people.tribe.population = 1
    people.tribe.food = 0
    g.territory.ownerWeight[people.owner] = 0
    step(g)
    expect(people.tribe.population).toBe(0)
    expect(g.camps.some((c) => c.owner === people.owner)).toBe(false)
    expect(g.events).toContainEqual({ type: 'peopleGone', name: people.name })
    // Ses terres redeviennent libres.
    expect(g.territory.owner.some((o) => o === people.owner)).toBe(false)
    expect(g.territory.ownerCells[people.owner]).toBe(0)
  })
})
