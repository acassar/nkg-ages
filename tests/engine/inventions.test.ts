import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  INVENTION_KINDS,
  INVENTION_RULES,
  INVENTION_WORK,
  type InventionKind,
} from '@/engine/content/inventions'
import { RANKS } from '@/engine/content/rarity'
import { createRng } from '@/engine/core/random'
import {
  cannotStart,
  createInventions,
  inventionStat,
  nextCost,
  startInvention,
  tickInventions,
  workPerMonth,
} from '@/engine/inventions/inventions'
import { bestRank, rollStat, statAt } from '@/engine/rarity/rarity'

describe('statistiques à rang', () => {
  it('va de la lance E (4 ± 0,3) à la lance S (7 ± 3)', () => {
    const range = INVENTION_RULES.lance.range
    expect(statAt(range, 'E')).toEqual({ mean: 4, spread: 0.3 })
    expect(statAt(range, 'S')).toEqual({ mean: 7, spread: 3 })
    const c = statAt(range, 'C')
    expect(c.mean).toBeGreaterThan(4)
    expect(c.mean).toBeLessThan(7)
  })

  it('tire toujours dans l’intervalle moyenne ± écart (fast-check)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...RANKS), fc.string(), (rank, seed) => {
        const stat = statAt(INVENTION_RULES.lance.range, rank)
        const rng = createRng(seed)
        for (let i = 0; i < 50; i++) {
          const v = rollStat(stat, rng)
          expect(v).toBeGreaterThanOrEqual(stat.mean - stat.spread)
          expect(v).toBeLessThanOrEqual(stat.mean + stat.spread)
        }
      }),
    )
  })

  it('garde le meilleur de deux rangs', () => {
    expect(bestRank('E', 'B')).toBe('B')
    expect(bestRank('S', 'A')).toBe('S')
  })
})

describe('inventions', () => {
  it('coûtent du travail et des matériaux, de plus en plus à chaque essai', () => {
    const inv = createInventions()
    expect(nextCost(inv, 'lance')).toEqual({ work: 120, materials: { silex: 15 } })
    inv.attempts.lance = 2
    expect(nextCost(inv, 'lance')).toEqual({
      work: Math.ceil(120 * INVENTION_WORK.retryFactor ** 2),
      materials: { silex: Math.ceil(15 * INVENTION_WORK.retryFactor ** 2) },
    })
  })

  it('refusent faute de matériaux, pendant une autre recherche, ou au rang S', () => {
    const inv = createInventions()
    expect(cannotStart(inv, 'lance', {})).toBe('Il faut 15 silex')
    expect(cannotStart(inv, 'lance', { silex: 15 })).toBeNull()
    startInvention(inv, 'panier', {})
    expect(cannotStart(inv, 'lance', { silex: 99 })).toBe('Une invention est déjà en cours')
    const done = createInventions()
    done.ranks.fumage = 'S'
    expect(cannotStart(done, 'fumage', {})).toBe('Déjà au meilleur rang')
  })

  it('prélèvent les matériaux, avancent chaque mois puis tirent un rang', () => {
    const inv = createInventions()
    const stock = { silex: 20 }
    startInvention(inv, 'lance', stock)
    expect(stock.silex).toBe(5)
    const rng = createRng('invention')
    let result = null
    let months = 0
    while (!result && months < 1000) {
      result = tickInventions(inv, 20, rng)
      months++
    }
    expect(months).toBe(Math.ceil(120 / workPerMonth(20)))
    expect(result?.kind).toBe('lance')
    expect(inv.ranks.lance).toBe(result?.rank)
    expect(inv.current).toBeNull()
    expect(inventionStat(inv, 'lance')).toEqual(statAt(INVENTION_RULES.lance.range, result!.rank))
  })

  it('n’avancent pas sans personne, ni sans recherche en cours', () => {
    const inv = createInventions()
    expect(tickInventions(inv, 50, createRng('rien'))).toBeNull()
    startInvention(inv, 'panier', {})
    tickInventions(inv, 0, createRng('rien'))
    expect(inv.current?.progress).toBe(0)
    expect(inventionStat(inv, 'panier')).toBeNull()
  })

  it('gardent le meilleur rang quand on réinvente', () => {
    const inv = createInventions()
    inv.ranks.panier = 'S'
    inv.current = { kind: 'panier', progress: 0, work: 1 }
    tickInventions(inv, 10, createRng('moins bien'))
    expect(inv.ranks.panier).toBe('S')
    expect(inv.attempts.panier).toBe(1)
  })
})

describe('techniques', () => {
  it('une dizaine, aux règles cohérentes et sans prérequis circulaire', () => {
    expect(INVENTION_KINDS.length).toBeGreaterThanOrEqual(10)
    for (const kind of INVENTION_KINDS) {
      const rules = INVENTION_RULES[kind]
      expect(rules.work).toBeGreaterThan(0)
      // Le rang S fait toujours mieux que le rang E, dans le sens de la statistique.
      expect(Math.abs(rules.range.s.mean)).toBeGreaterThan(Math.abs(rules.range.e.mean))
      // On remonte les prérequis sans jamais retomber sur un ancêtre du même chemin
      // (deux chemins qui se rejoignent, en losange, sont permis : les routes demandent
      // portage et agriculture, qui demandent tous deux le panier).
      const climb = (k: InventionKind, path: Set<InventionKind>) => {
        expect(INVENTION_KINDS).toContain(k)
        expect(path.has(k)).toBe(false)
        for (const r of INVENTION_RULES[k].requires ?? []) climb(r, new Set([...path, k]))
      }
      climb(kind, new Set())
    }
  })

  it('attend ses prérequis', () => {
    const inv = createInventions()
    expect(cannotStart(inv, 'propulseur', { silex: 99 })).toBe("Il faut d'abord : Lance")
    inv.ranks.lance = 'E'
    expect(cannotStart(inv, 'propulseur', { silex: 99 })).toBeNull()
    expect(cannotStart(inv, 'propulseur', {})).toBe('Il faut 10 silex')
  })
})
