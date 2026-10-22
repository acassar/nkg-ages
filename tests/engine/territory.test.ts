import { describe, expect, it } from 'vitest'
import { isWater } from '@/engine/content/biomes'
import { createRng } from '@/engine/core/random'
import {
  claim,
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
    expect(territory.owned.length).toBeGreaterThan(50)
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
    const start = territory.owned[0]!
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
    expect(seen.size).toBe(territory.owned.length)
  })

  it('est déterministe', () => {
    expect(grown('même').territory.owner).toEqual(grown('même').territory.owner)
  })

  it('ne recompte pas une cellule déjà tenue', () => {
    const t = createTerritory(4, 4)
    expect(claim(t, 1, 1, PLAYER)).toBe(true)
    expect(claim(t, 1, 1, PLAYER)).toBe(false)
    expect(t.owned).toEqual([5])
  })
})
