import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { isWater } from '@/engine/content/biomes'
import { WONDER_KINDS, WONDER_PLACEMENT, WONDER_RULES } from '@/engine/content/wonders'
import { createRng } from '@/engine/core/random'
import {
  createGame,
  currentScore,
  foodCapacity,
  inventionBoost,
  type GameState,
} from '@/engine/game'
import { Visibility } from '@/engine/fog/fog'
import { PLAYER } from '@/engine/territory/territory'
import { placeWonders } from '@/engine/wonders/wonders'
import { generateWorld } from '@/engine/world/generate'
import { buildGameView } from '@/views/selectors'

const options = {
  seed: 'merveilles',
  randomStart: false,
  width: 192,
  height: 96,
  rareEvents: false,
  peoples: 0,
}

/** Pose une merveille sur une cellule tenue par le joueur. */
function heldWonder(g: GameState, kind: (typeof WONDER_KINDS)[number]): void {
  const i = g.territory.owner.findIndex((o) => o === PLAYER)
  g.wonders = [{ kind, x: i % g.world.width, y: Math.floor(i / g.world.width) }]
}

describe('merveilles', () => {
  it('chacune au plus une fois, loin du départ, sur une terre de ses biomes', () => {
    const world = generateWorld({ seed: 'anneau', width: 320, height: 160 })
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: world.width - 1 }),
        fc.integer({ min: 0, max: world.height - 1 }),
        fc.string(),
        (x, y, seed) => {
          const wonders = placeWonders(world, { x, y }, createRng(seed))
          expect(new Set(wonders.map((w) => w.kind)).size).toBe(wonders.length)
          for (const w of wonders) {
            const biome = world.biome[w.y * world.width + w.x]!
            expect(isWater(biome)).toBe(false)
            expect(WONDER_RULES[w.kind].biomes).toContain(biome)
            const d = Math.hypot(w.x - x, w.y - y)
            expect(d).toBeGreaterThanOrEqual(WONDER_PLACEMENT.minDistance)
            expect(d).toBeLessThanOrEqual(WONDER_PLACEMENT.maxDistance)
          }
        },
      ),
      { numRuns: 40 },
    )
  })

  it('rares : chacune manque sur certaines cartes, et la création est reproductible', () => {
    const world = generateWorld({ seed: 'rareté', width: 320, height: 160 })
    const start = { x: 160, y: 80 }
    const counts = Object.fromEntries(WONDER_KINDS.map((k) => [k, 0]))
    const runs = 60
    for (let i = 0; i < runs; i++)
      for (const w of placeWonders(world, start, createRng(`m${i}`))) counts[w.kind]!++
    for (const kind of WONDER_KINDS) {
      expect(counts[kind]).toBeGreaterThan(0)
      expect(counts[kind]).toBeLessThan(runs)
    }
    expect(placeWonders(world, start, createRng('x'))).toEqual(
      placeWonders(world, start, createRng('x')),
    )
  })

  it('tenue, une merveille donne son effet et des points ; hors des terres, rien', () => {
    const base = createGame(options)
    base.wonders = []
    const boost = inventionBoost(base)
    const capacity = foodCapacity(base)
    const score = currentScore(base)

    const circle = createGame(options)
    heldWonder(circle, 'cercle')
    expect(inventionBoost(circle)).toBeCloseTo(boost + WONDER_RULES.cercle.effect.work!)
    expect(currentScore(circle)).toBe(score + WONDER_PLACEMENT.score)

    const cave = createGame(options)
    heldWonder(cave, 'grotte')
    expect(foodCapacity(cave)).toBeGreaterThan(capacity)

    const far = createGame(options)
    const free = far.territory.owner.findIndex(
      (o, i) => o !== PLAYER && !isWater(far.world.biome[i]!),
    )
    far.wonders = [
      { kind: 'cercle', x: free % far.world.width, y: Math.floor(free / far.world.width) },
    ]
    expect(inventionBoost(far)).toBe(boost)
    expect(currentScore(far)).toBe(score)
  })

  it('la vue ne montre que les merveilles découvertes', () => {
    const g = createGame(options)
    const i = g.fog.cells.findIndex((c) => c === Visibility.Unknown)
    g.wonders = [{ kind: 'source', x: i % g.world.width, y: Math.floor(i / g.world.width) }]
    expect(buildGameView(g).wonders).toEqual([])
    g.fog.cells[i] = Visibility.Seen
    expect(buildGameView(g).wonders).toMatchObject([
      { kind: 'source', name: WONDER_RULES.source.name, held: false },
    ])
  })
})
