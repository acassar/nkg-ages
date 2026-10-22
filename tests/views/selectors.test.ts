import { describe, expect, it } from 'vitest'
import { createGame, step } from '@/engine/game'
import {
  buildGameView,
  buildWorldSnapshot,
  formatDate,
  formatStat,
  patchOf,
} from '@/views/selectors'

const game = () => createGame({ seed: 'vues', randomStart: false, width: 128, height: 64 })

describe('dates', () => {
  it('écrit les dates avant notre ère', () => {
    expect(formatDate(-12000, 2)).toBe('mars 12 000 av. J.-C.')
  })
  it('écrit les dates de notre ère', () => {
    expect(formatDate(1789, 6)).toBe('juillet 1 789')
  })
})

describe('morceaux de grille', () => {
  it('copie exactement le rectangle demandé', () => {
    const cells = Uint8Array.from({ length: 16 }, (_, i) => i)
    const p = patchOf(cells, 4, { x: 1, y: 1, w: 2, h: 2 })
    expect(p).toEqual({ x: 1, y: 1, w: 2, h: 2, data: Uint8Array.from([5, 6, 9, 10]) })
  })
  it('ne renvoie rien sans zone modifiée', () => {
    expect(patchOf(new Uint8Array(4), 2, null)).toBeNull()
  })
})

describe('vues de partie', () => {
  it('envoie les grilles entières au départ', () => {
    const g = game()
    const view = buildGameView(g, true)
    expect(view.fog).toMatchObject({ x: 0, y: 0, w: 128, h: 64 })
    expect(view.territory?.data.length).toBe(128 * 64)
    expect(view.units[0]?.name).toBe('Éclaireur')
    expect(view.camps[0]?.mine).toBe(true)
  })

  it("n'envoie ensuite que les zones modifiées", () => {
    const g = game()
    g.fog.dirty = null
    g.territory.dirty = null
    expect(buildGameView(g).fog).toBeNull()
    // Rien ne bouge : rien à renvoyer.
    step(g)
    expect(buildGameView(g).fog).toBeNull()
    const u = g.units[0]!
    u.target = { x: u.x + 3, y: u.y }
    step(g)
    const view = buildGameView(g)
    expect(view.fog).not.toBeNull()
    expect(view.fog!.w * view.fog!.h).toBeLessThan(128 * 64)
  })

  it('montre la tribu, arrondie, et prévient de la famine', () => {
    const g = game()
    g.tribe.food = 12.7
    g.tribe.lastProduction = 10.04
    g.tribe.lastConsumption = 12
    g.events.push({ type: 'famine' })
    const view = buildGameView(g)
    expect(view.tribe).toMatchObject({ population: 12, food: 12, foodBalance: -2, starving: false })
    expect(view.tribe.foodCapacity).toBeGreaterThan(0)
    expect(view.notices[0]).toMatch(/^Famine/)
  })

  it('ne montre que les gisements déjà vus, avec leur rang et leur exploitation', () => {
    const g = game()
    const c = g.camps[0]!
    const at = { x: Math.floor(c.x), y: Math.floor(c.y) }
    g.deposits = [
      { id: 1, kind: 'baies', ...at, rank: 'B' },
      { id: 2, kind: 'silex', x: 0, y: 0, rank: 'S' },
    ]
    g.tribe.materials.silex = 3.7
    const view = buildGameView(g)
    expect(view.deposits).toEqual([
      expect.objectContaining({ id: 1, name: 'Baies', rank: 'B', held: true, category: 'food' }),
    ])
    expect(view.tribe.materials).toEqual([{ kind: 'silex', name: 'Silex', amount: 3 }])
  })

  it('ne montre que les troupeaux en vue, et prévient d’un chasseur tué', () => {
    const g = game()
    const c = g.camps[0]!
    g.herds = [
      { id: 1, kind: 'cerf', x: c.x, y: c.y, size: 5, goal: { x: c.x, y: c.y } },
      { id: 2, kind: 'mammouth', x: 0.5, y: 0.5, size: 4, goal: { x: 0.5, y: 0.5 } },
    ]
    g.events.push({ type: 'hunterKilled', animal: 'mammouth' })
    const view = buildGameView(g)
    expect(view.herds).toEqual([{ id: 1, kind: 'cerf', name: 'Cerfs', x: c.x, y: c.y, size: 5 }])
    expect(view.notices).toEqual(['Chasse : un chasseur est mort face aux mammouths.'])
  })

  it('dit qui peut fonder un campement, et combien la tribu en tient', () => {
    const g = game()
    const view = buildGameView(g)
    const scout = view.units.find((u) => u.kind === 'eclaireur')!
    const hunter = view.units.find((u) => u.kind === 'chasseur')!
    expect(hunter.foundCamp).toBeNull()
    expect(scout.foundCamp?.blocked).toMatch(/habitants/)
    expect(view.tribe).toMatchObject({ camps: 1, maxCamps: 1 })
  })

  it('montre les chasseurs et ce qui empêche d’en former, et prévient de la viande perdue', () => {
    const g = game()
    g.events.push({ type: 'meatLost', amount: 7 })
    let view = buildGameView(g)
    expect(view.tribe).toMatchObject({ hunters: 2, maxHunters: 2, recruitCost: 15 })
    expect(view.tribe.recruitBlocked).toMatch(/habitants/)
    expect(view.notices).toEqual([
      'Chasse : la réserve est pleine, 7 rations de viande sont perdues.',
    ])
    g.units = g.units.filter((u) => u.kind !== 'chasseur')
    view = buildGameView(g)
    expect(view.tribe).toMatchObject({ hunters: 0, recruitBlocked: null })
    expect(view.tribe.huntersResting).toBe(false)
    g.tribe.food = view.tribe.foodCapacity + 1
    expect(buildGameView(g).tribe.huntersResting).toBe(true)
  })

  it('montre les inventions : coût, blocage, avancement et statistique au rang', () => {
    const g = game()
    let view = buildGameView(g)
    const lance = view.inventions.find((i) => i.kind === 'lance')!
    expect(lance).toMatchObject({ rank: null, stat: null, cost: ['15 silex'] })
    expect(lance.blocked).toBe('Il faut 15 silex')
    g.inventions.ranks.lance = 'S'
    g.inventions.current = { kind: 'panier', progress: 45, work: 90 }
    g.events.push({ type: 'invented', invention: 'lance', rank: 'B' })
    view = buildGameView(g)
    const [l, p] = view.inventions
    expect(l).toMatchObject({ rank: 'S', stat: 'Dégâts 7 ± 3' })
    expect(p).toMatchObject({ progress: 0.5, blocked: null })
    expect(p!.monthsLeft).toBeGreaterThan(0)
    expect(view.notices[0]).toBe(
      'Invention : Lance de rang B, dégâts 5,8 ± 1,9 (le rang S obtenu avant est gardé).',
    )
  })

  it('écrit les statistiques avec leur unité', () => {
    expect(formatStat({ mean: 22.5, spread: 3 }, '%')).toBe('+22,5 ± 3 %')
    expect(formatStat({ mean: 4, spread: 0 }, 'mois')).toBe('4 mois')
  })

  it('rédige les événements du moteur pour le joueur', () => {
    const g = game()
    expect(buildGameView(g).notices).toEqual([])
    g.events.push({ type: 'unitGaveUp', unitId: g.units[0]!.id })
    g.events.push({ type: 'unitGaveUp', unitId: 999 })
    expect(buildGameView(g).notices).toEqual([
      'Éclaireur renonce : aucun chemin connu assez court ne mène à sa destination.',
      'Une unité renonce : aucun chemin connu assez court ne mène à sa destination.',
    ])
  })

  it("ne partage pas d'objets mutables avec le moteur", () => {
    const g = game()
    g.units[0]!.target = { x: 3, y: 3 }
    const view = buildGameView(g)
    view.units[0]!.target!.x = 99
    expect(g.units[0]!.target!.x).toBe(3)
  })

  it('code l’altitude sur un octet, eau sous 128 et terre au-dessus', () => {
    const g = game()
    const snap = buildWorldSnapshot(g)
    for (let i = 0; i < snap.elevation.length; i++) {
      expect(snap.elevation[i]! >= 128).toBe(g.world.elevation[i]! >= 0)
    }
    expect(snap.biome).not.toBe(g.world.biome)
    expect(snap.river).not.toBe(g.world.river)
    expect([...snap.river]).toEqual([...g.world.river])
  })
})
