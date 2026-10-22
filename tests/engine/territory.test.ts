import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { isWater } from '@/engine/content/biomes'
import { createRng } from '@/engine/core/random'
import {
  claim,
  claimAround,
  createTerritory,
  growTerritory,
  NO_OWNER,
  PLAYER,
} from '@/engine/territory/territory'
import { generateWorld } from '@/engine/world/generate'
import { findStarts } from '@/engine/world/starts'

function grown(seed: string, attempts = 4000) {
  const world = generateWorld({ seed, width: 256, height: 128 })
  const [site] = findStarts(world, createRng(seed), 1)
  const territory = createTerritory(world.width, world.height)
  claim(territory, site!.x, site!.y, PLAYER)
  const seat = { owner: PLAYER, x: site!.x + 0.5, y: site!.y + 0.5, reach: 12 }
  growTerritory(territory, world, [seat], createRng(seed), attempts)
  return { world, territory, seat }
}

describe('territoire', () => {
  it("s'étend autour du siège", () => {
    const { territory } = grown('croissance')
    expect(territory.ownedCount).toBeGreaterThan(50)
  })

  it("ne dépasse jamais la portée du siège et ne prend jamais l'eau", () => {
    const { world, territory, seat } = grown('portée', 20000)
    for (let i = 0; i < territory.owner.length; i++) {
      if (territory.owner[i] === NO_OWNER) continue
      const x = (i % world.width) + 0.5
      const y = Math.floor(i / world.width) + 0.5
      expect(Math.hypot(x - seat.x, y - seat.y)).toBeLessThanOrEqual(seat.reach + 1)
      expect(isWater(world.biome[i]!)).toBe(false)
    }
  })

  it("reste d'un seul tenant", () => {
    const { world, territory } = grown('tenant', 6000)
    const start = territory.owner.findIndex((o) => o === PLAYER)
    const seen = new Set([start])
    const queue = [start]
    while (queue.length) {
      const i = queue.pop()!
      const x = i % world.width
      for (const j of [i - 1, i + 1, i - world.width, i + world.width]) {
        if (Math.abs((j % world.width) - x) > 1) continue
        if (territory.owner[j] === PLAYER && !seen.has(j)) {
          seen.add(j)
          queue.push(j)
        }
      }
    }
    expect(seen.size).toBe(territory.ownedCount)
  })

  it('est déterministe', () => {
    expect(grown('même').territory.owner).toEqual(grown('même').territory.owner)
  })

  it('ne recompte pas une cellule déjà tenue', () => {
    const t = createTerritory(4, 4)
    expect(claim(t, 1, 1, PLAYER)).toBe(true)
    expect(claim(t, 1, 1, PLAYER)).toBe(false)
    expect(t.ownedCount).toBe(1)
    expect(t.frontier).toEqual([5])
  })

  it('ne s’essouffle pas : chaque tick gagne autant de cellules tant qu’il reste de la place', () => {
    const world = generateWorld({ seed: 'souffle', width: 256, height: 128 })
    const [site] = findStarts(world, createRng('souffle'), 1)
    const territory = createTerritory(world.width, world.height)
    claim(territory, site!.x, site!.y, PLAYER)
    const seat = { owner: PLAYER, x: site!.x + 0.5, y: site!.y + 0.5, reach: 20 }
    const rng = createRng('souffle')
    const gains: number[] = []
    for (let tick = 0; tick < 150; tick++) {
      const before = territory.ownedCount
      growTerritory(territory, world, [seat], rng, 2)
      gains.push(territory.ownedCount - before)
    }
    // Au début comme plus tard, la croissance tient son rythme (l'ancien tirage dans tout
    // le territoire ralentissait à mesure que l'intérieur grossissait).
    expect(gains.slice(100).every((g) => g === 2)).toBe(true)
  })

  it('vide sa frontière une fois la portée remplie', () => {
    const { territory } = grown('rempli', 50000)
    expect(territory.frontier.length).toBe(0)
  })

  it('compte une cellule reprise par un autre propriétaire une seule fois', () => {
    const t = createTerritory(4, 4)
    claim(t, 1, 1, PLAYER)
    claim(t, 1, 1, 2)
    expect(t.ownedCount).toBe(1)
    claim(t, 1, 1, NO_OWNER)
    expect(t.ownedCount).toBe(0)
  })

  it('remet dans la frontière les voisines d’une cellule libérée', () => {
    const t = createTerritory(4, 4)
    claim(t, 1, 1, PLAYER)
    claim(t, 2, 1, PLAYER)
    t.frontier.length = 0
    claim(t, 2, 1, NO_OWNER)
    expect(t.frontier).toEqual([5])
  })

  it('prend d’un coup les terres reliées au siège, sans eau ni île voisine', () => {
    const world = generateWorld({ seed: 'fondation', width: 256, height: 128 })
    const [site] = findStarts(world, createRng('fondation'), 1)
    const territory = createTerritory(world.width, world.height)
    const seat = { owner: PLAYER, x: site!.x + 0.5, y: site!.y + 0.5, reach: 26 }
    const taken = claimAround(territory, world, seat, 5)
    expect(taken).toBe(territory.ownedCount)
    expect(taken).toBeGreaterThan(20)
    for (let i = 0; i < territory.owner.length; i++) {
      if (territory.owner[i] !== PLAYER) continue
      const x = (i % world.width) + 0.5
      const y = Math.floor(i / world.width) + 0.5
      expect(isWater(world.biome[i]!)).toBe(false)
      expect(Math.hypot(x - seat.x, y - seat.y)).toBeLessThanOrEqual(5)
    }
    // Siège sur l'eau : rien à prendre.
    const sea = { ...seat, x: 0.5, y: 0.5 }
    expect(claimAround(createTerritory(world.width, world.height), world, sea, 5)).toBe(0)
  })

  it('tient le compte de la richesse des cellules du joueur', () => {
    const weights = Float32Array.from({ length: 16 }, (_, i) => i / 10)
    const t = createTerritory(4, 4, weights)
    claim(t, 1, 1, PLAYER)
    claim(t, 2, 1, PLAYER)
    expect(t.playerWeight).toBeCloseTo(0.5 + 0.6)
    claim(t, 2, 1, 2)
    expect(t.playerWeight).toBeCloseTo(0.5)
    claim(t, 1, 1, NO_OWNER)
    expect(t.playerWeight).toBeCloseTo(0)
  })

  it('avec plusieurs sièges, chaque cellule reste à portée de l’un d’eux', () => {
    const world = generateWorld({ seed: 'deux-camps', width: 256, height: 128 })
    const sites = findStarts(world, createRng('deux-camps'), 12)
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: sites.length - 1 }),
        fc.integer({ min: 0, max: sites.length - 1 }),
        fc.integer({ min: 4, max: 14 }),
        (a, b, reach) => {
          const territory = createTerritory(world.width, world.height)
          const seats = [sites[a]!, sites[b]!].map((s) => ({
            owner: PLAYER,
            x: s.x + 0.5,
            y: s.y + 0.5,
            reach,
          }))
          for (const seat of seats) claimAround(territory, world, seat, 2)
          growTerritory(territory, world, seats, createRng(`${a}-${b}`), 3000)
          for (let i = 0; i < territory.owner.length; i++) {
            if (territory.owner[i] === NO_OWNER) continue
            const x = (i % world.width) + 0.5
            const y = Math.floor(i / world.width) + 0.5
            const near = seats.some((s) => Math.hypot(x - s.x, y - s.y) <= s.reach + 1)
            expect(near).toBe(true)
          }
        },
      ),
      { numRuns: 25 },
    )
  })
})
