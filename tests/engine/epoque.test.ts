import { describe, expect, it } from 'vitest'
import { INVENTION_RULES, revealerOf } from '@/engine/content/inventions'
import { RESOURCE_KINDS } from '@/engine/content/resources'
import { createGame, resourceKnown, step } from '@/engine/game'
import { PLAYER } from '@/engine/territory/territory'
import { buildGameView } from '@/views/selectors'

const options = {
  seed: 'epoque',
  randomStart: false,
  width: 192,
  height: 96,
  rareEvents: false,
  peoples: 0,
}

/** Une partie où la tribu tient un gisement de cuivre, sous ses yeux. */
function withCopper() {
  const g = createGame(options)
  const home = g.camps[0]!
  const copper = {
    id: 9999,
    kind: 'cuivre' as const,
    x: Math.floor(home.x) + 1,
    y: Math.floor(home.y),
    rank: 'C' as const,
  }
  g.deposits.push(copper)
  g.territory.owner[copper.y * g.world.width + copper.x] = PLAYER
  return { g, copper }
}

describe('ressources de leur époque', () => {
  it('au départ, on connaît le silex, les baies et le poisson, pas les métaux', () => {
    const g = createGame(options)
    expect(resourceKnown(g, 'silex')).toBe(true)
    expect(resourceKnown(g, 'baies')).toBe(true)
    expect(resourceKnown(g, 'cuivre')).toBe(false)
    expect(resourceKnown(g, 'etain')).toBe(false)
  })

  it('le cuivre tenu reste invisible et ne rend rien avant la métallurgie', () => {
    const { g, copper } = withCopper()
    expect(buildGameView(g).deposits.some((d) => d.id === copper.id)).toBe(false)
    step(g)
    expect(g.tribe.materials.cuivre ?? 0).toBe(0)
    g.inventions.ranks.metallurgie = 'E'
    expect(buildGameView(g).deposits.some((d) => d.id === copper.id)).toBe(true)
    step(g)
    expect(g.tribe.materials.cuivre).toBeGreaterThan(0)
  })

  it('une métallurgie de haut rang fait rendre davantage le métal', () => {
    const yieldWith = (rank: 'E' | 'S') => {
      const { g } = withCopper()
      g.inventions.ranks.metallurgie = rank
      step(g)
      return g.tribe.materials.cuivre ?? 0
    }
    expect(yieldWith('S')).toBeGreaterThan(yieldWith('E'))
  })

  it('chaque ressource cachée a une invention qui la révèle, une seule', () => {
    for (const kind of RESOURCE_KINDS) {
      const revealers = Object.values(INVENTION_RULES).filter((r) => r.reveals?.includes(kind))
      expect(revealers.length, kind).toBeLessThanOrEqual(1)
      if (revealers.length === 1) expect(revealerOf(kind)).toBeDefined()
    }
  })

  it('le bronze, qui coûte du métal, vient après l’invention qui révèle ce métal', () => {
    for (const rules of Object.values(INVENTION_RULES))
      for (const kind of Object.keys(rules.cost) as (keyof typeof rules.cost)[]) {
        const revealer = revealerOf(kind)
        if (!revealer) continue
        expect(rules.requires ?? [], rules.name).toContain(revealer)
      }
  })
})
