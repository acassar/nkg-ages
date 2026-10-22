import { describe, expect, it } from 'vitest'
import { isWater } from '@/engine/content/biomes'
import { RANK_RULES, RANKS } from '@/engine/content/rarity'
import { RESOURCE_RULES } from '@/engine/content/resources'
import { createRng } from '@/engine/core/random'
import { depositYield, ensureNearStart, heldBy, placeDeposits } from '@/engine/resources/deposits'
import { rollRank } from '@/engine/rarity/rarity'
import { generateWorld } from '@/engine/world/generate'

const world = generateWorld({ seed: 'gisements', width: 256, height: 128 })

describe('rareté', () => {
  it('tire les rangs selon leurs poids : E courant, S rare', () => {
    const rng = createRng('rangs')
    const counts = Object.fromEntries(RANKS.map((r) => [r, 0])) as Record<string, number>
    const n = 20000
    for (let i = 0; i < n; i++) counts[rollRank(rng)]!++
    const total = RANKS.reduce((s, r) => s + RANK_RULES[r].weight, 0)
    for (const r of RANKS) {
      expect(counts[r]! / n).toBeCloseTo(RANK_RULES[r].weight / total, 1)
    }
    expect(counts.E!).toBeGreaterThan(counts.S! * 10)
  })

  it('donne plus de puissance aux rangs rares', () => {
    for (let i = 1; i < RANKS.length; i++)
      expect(RANK_RULES[RANKS[i]!].power).toBeGreaterThan(RANK_RULES[RANKS[i - 1]!].power)
  })
})

describe('gisements', () => {
  const deposits = placeDeposits(world, createRng('gisements'))

  it('sont reproductibles pour une graine', () => {
    expect(placeDeposits(world, createRng('gisements'))).toEqual(deposits)
    expect(placeDeposits(world, createRng('autre'))).not.toEqual(deposits)
  })

  it('apparaissent seulement dans leurs biomes, le poisson près des côtes ou sur un fleuve', () => {
    expect(deposits.length).toBeGreaterThan(50)
    let riverFish = 0
    for (const d of deposits) {
      const i = d.y * world.width + d.x
      const biome = world.biome[i]!
      if (d.kind === 'poisson' && world.river[i]! > 0) {
        riverFish++
        continue
      }
      expect(RESOURCE_RULES[d.kind].biomes).toContain(biome)
      if (d.kind === 'poisson') {
        const near = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => !isWater(world.biome[(d.y + dy!) * world.width + d.x + dx!] ?? 0))
        expect(near).toBe(true)
      }
    }
    expect(riverFish).toBeGreaterThan(0)
    // Une cellule porte au plus un gisement, et chacun a son identifiant.
    expect(new Set(deposits.map((d) => d.y * world.width + d.x)).size).toBe(deposits.length)
    expect(new Set(deposits.map((d) => d.id)).size).toBe(deposits.length)
  })

  it('produisent selon leur nature et leur rang', () => {
    const base = { id: 1, kind: 'baies' as const, x: 0, y: 0 }
    expect(depositYield({ ...base, rank: 'E' })).toBe(RESOURCE_RULES.baies.yield)
    expect(depositYield({ ...base, rank: 'S' })).toBe(
      RESOURCE_RULES.baies.yield * RANK_RULES.S.power,
    )
  })

  it('sont tenus par qui tient leur cellule ou une cellule voisine', () => {
    const owner = new Uint8Array(9)
    const d = { id: 1, kind: 'poisson' as const, x: 1, y: 1, rank: 'E' as const }
    expect(heldBy(owner, 3, 3, d, 1)).toBe(false)
    owner[2 * 3 + 1] = 1
    expect(heldBy(owner, 3, 3, d, 1)).toBe(true)
    expect(heldBy(owner, 3, 3, { ...d, x: 0, y: 0 }, 1)).toBe(false)
    owner.fill(0)
    owner[4] = 2
    expect(heldBy(owner, 3, 3, d, 2)).toBe(true)
  })

  it('garantissent un silex tenu au départ, sans en ajouter s’il y en a déjà un', () => {
    const land = world.biome.findIndex((b) => !isWater(b))
    const start = { x: land % world.width, y: Math.floor(land / world.width) }
    const radius = RESOURCE_RULES.silex.nearStart!
    const owner = new Uint8Array(world.width * world.height)
    const own = (x: number, y: number) => (owner[y * world.width + x] = 1)
    own(start.x, start.y)
    const deposits: ReturnType<typeof placeDeposits> = []
    // Territoire réduit au camp : le silex y est posé.
    ensureNearStart(deposits, world, owner, 1, start, createRng('départ'))
    expect(deposits).toMatchObject([{ kind: 'silex', ...start }])
    // Sinon, sur une terre tenue autre que le camp, à portée.
    deposits.length = 0
    own(start.x + 1, start.y)
    own(start.x + 2, start.y)
    owner[start.y * world.width + start.x + 1] = 0
    ensureNearStart(deposits, world, owner, 1, start, createRng('départ'))
    expect(deposits).toHaveLength(1)
    const d = deposits[0]!
    expect(owner[d.y * world.width + d.x]).toBe(1)
    expect(d.x === start.x && d.y === start.y).toBe(false)
    expect(Math.hypot(d.x - start.x, d.y - start.y)).toBeLessThanOrEqual(radius)
    ensureNearStart(deposits, world, owner, 1, start, createRng('départ'))
    expect(deposits).toHaveLength(1)
  })
})
