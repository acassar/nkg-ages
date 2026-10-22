import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ANIMAL_RULES } from '@/engine/content/fauna'
import { createRng } from '@/engine/core/random'
import { flee, herdCanStand, placeHerds, regrow, wander, type Herd } from '@/engine/fauna/fauna'
import { generateWorld } from '@/engine/world/generate'

const world = generateWorld({ seed: 'faune', width: 256, height: 128 })
const herds = placeHerds(world, createRng('faune'))

describe('faune', () => {
  it('sème des troupeaux reproductibles, dans leurs biomes, au complet', () => {
    expect(herds.length).toBeGreaterThan(5)
    expect(placeHerds(world, createRng('faune'))).toEqual(herds)
    for (const h of herds) {
      const biome = world.biome[Math.floor(h.y) * world.width + Math.floor(h.x)]!
      expect(ANIMAL_RULES[h.kind].biomes).toContain(biome)
      expect(h.size).toBe(ANIMAL_RULES[h.kind].herdSize)
    }
  })

  it('erre sans jamais entrer dans l’eau ni quitter le monde (fast-check)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: herds.length - 1 }), fc.string(), (k, seed) => {
        const herd: Herd = structuredClone(herds[k]!)
        const rng = createRng(seed)
        for (let t = 0; t < 300; t++) {
          wander(herd, world, rng)
          expect(herdCanStand(world, herd.x, herd.y)).toBe(true)
        }
      }),
      { numRuns: 30 },
    )
  })

  it('fuit à l’opposé du chasseur', () => {
    const herd: Herd = structuredClone(herds[0]!)
    const hunter = { x: herd.x - 1, y: herd.y }
    flee(herd, world, createRng('fuite'), hunter, 5)
    const before = Math.hypot(herd.x - hunter.x, herd.y - hunter.y)
    expect(Math.hypot(herd.goal.x - hunter.x, herd.goal.y - hunter.y)).toBeGreaterThan(before)
    expect(herdCanStand(world, herd.goal.x, herd.goal.y)).toBe(true)
  })

  it('regagne ses bêtes avec le temps, sans dépasser sa taille', () => {
    const herd: Herd = { ...structuredClone(herds[0]!), size: 1 }
    const rng = createRng('repousse')
    for (let m = 0; m < 600; m++) regrow(herd, rng)
    expect(herd.size).toBe(ANIMAL_RULES[herd.kind].herdSize)
  })
})
