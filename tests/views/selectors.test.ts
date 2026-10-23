import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { applyCommand, clearDirty, createGame, step, type GameState } from '@/engine/game'
import { loadGame, saveGame } from '@/engine/save/save'
import {
  buildGameView,
  buildWorldSnapshot,
  formatDate,
  formatStat,
  patchOf,
} from '@/views/selectors'
import { home } from '../home'

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
    expect('units' in view).toBe(false)
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
    const band = g.camps[0]!
    band.target = { x: band.x + 3, y: band.y }
    step(g)
    const view = buildGameView(g)
    expect(view.fog).not.toBeNull()
    expect(view.fog!.w * view.fog!.h).toBeLessThan(128 * 64)
  })

  it('envoie l’abondance des terres : entière au départ, puis la zone usée chaque mois', () => {
    const g = game()
    const first = buildGameView(g, true).abundance!
    expect(first).toMatchObject({ x: 0, y: 0, w: 128, h: 64 })
    expect(first.data.every((v) => v === 255)).toBe(true)
    clearDirty(g)
    expect(buildGameView(g).abundance).toBeNull()
    step(g)
    const worn = buildGameView(g).abundance!
    expect(worn.w * worn.h).toBeLessThan(128 * 64)
    expect(worn.data.some((v) => v < 255)).toBe(true)
  })

  it('invariant : une texture tenue à jour par les seuls envois suit l’abondance (fast-check)', async () => {
    // Ce que fait le rendu : il part de la grille entière puis n'applique que les morceaux.
    const encode = (g: GameState) => Uint8Array.from(g.abundance, (a) => Math.round(a * 255))
    const apply = (mirror: Uint8Array, g: GameState) => {
      const p = buildGameView(g).abundance
      clearDirty(g)
      if (!p) return
      for (let y = 0; y < p.h; y++)
        mirror.set(p.data.subarray(y * p.w, (y + 1) * p.w), (p.y + y) * 128 + p.x)
    }
    // Asynchrone, rendant la main chaque mois : un long test synchrone bloque le worker de
    // vitest, qui ne répond plus au processus principal sous la couverture (erreur en CI).
    const yieldToLoop = () => new Promise((resolve) => setTimeout(resolve, 0))
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 12 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 5 }),
        fc.constantFrom([12, 0], [-12, 0], [0, 10], [0, -10]),
        async (months, reload, moveAt, [dx, dy]) => {
          let g = game()
          const mirror = buildGameView(g, true).abundance!.data.slice()
          clearDirty(g)
          for (let m = 0; m < months; m++) {
            // La bande part plus loin : les terres quittées repoussent hors de sa zone.
            if (m === moveAt) {
              const c = g.camps[0]!
              applyCommand(g, { type: 'moveCamp', campId: c.id, x: c.x + dx!, y: c.y + dy! })
            }
            await yieldToLoop()
            step(g)
            // Une partie reprise renvoie tout.
            if (reload && m === Math.floor(months / 2)) g = loadGame(saveGame(g))
            apply(mirror, g)
            expect(mirror).toEqual(encode(g))
          }
        },
      ),
      { numRuns: 4 },
    )
  }, 30_000)

  it('montre la tribu, arrondie, et prévient de la famine', () => {
    const g = game()
    home(g).food = 12.7
    home(g).lastProduction = 10.04
    home(g).lastConsumption = 12
    g.events.push({ type: 'famine', campId: g.camps[0]!.id })
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
    expect(view.notices).toEqual(['Chasse : un chasseur de la bande est mort face aux mammouths.'])
  })

  it('montre la bande : ses gens, son efficacité, ses terres et ce qui empêche de la scinder', () => {
    const g = game()
    const view = buildGameView(g)
    const camp = view.camps.find((c) => c.mine)!
    expect(camp.members).toBe(g.tribe.population)
    expect(camp.band).toMatchObject({ efficiency: 1, land: 'abondantes', target: null })
    expect(camp.band!.splitBlocked).toMatch(/personnes/)
    expect(view.tribe).toMatchObject({ camps: 1, bands: 1, efficiency: 1 })
    // Trop grande, elle cueille moins bien ; sur des terres épuisées, l'état le dit.
    g.camps[0]!.members = 40
    g.abundance.fill(0.2)
    const later = buildGameView(g).camps.find((c) => c.mine)!
    expect(later.band!.efficiency).toBeLessThan(1)
    expect(later.band!.land).toBe('épuisées')
    expect(later.band!.splitBlocked).toBeNull()
    // Un village n'est plus une bande.
    g.camps[0]!.village = true
    expect(buildGameView(g).camps.find((c) => c.mine)!.band).toBeNull()
  })

  it('rédige les événements rares avec leur rang', () => {
    const g = game()
    g.events.push(
      { type: 'rare', event: 'maladie', amount: -1 },
      { type: 'rare', event: 'nouveauxVenus', amount: 3 },
      { type: 'rare', event: 'filon', amount: 0, rank: 'A' },
      { type: 'rare', event: 'tempete', amount: -9 },
    )
    expect(buildGameView(g).notices).toEqual([
      'Maladie (C) : une maladie emporte 1 personne.',
      'Nouveaux venus (C) : 3 errants rejoignent la tribu.',
      'Filon (A) : un filon de silex de rang A affleure sur le territoire.',
      'Tempête (D) : une tempête gâte une part de la réserve, 9 rations perdues.',
    ])
  })

  it('montre la saison, annonce l’hiver et compte la nourriture gâtée dans le bilan', () => {
    const g = game()
    expect(buildGameView(g).season).toMatchObject({ kind: 'hiver', name: 'Hiver' })
    g.clock.tick = 6
    const summer = buildGameView(g).season
    expect(summer.kind).toBe('ete')
    expect(summer.gather).toBeGreaterThan(100)
    g.events.push({ type: 'winter', yieldFactor: 0.48 })
    home(g).lastProduction = 20
    home(g).lastConsumption = 12
    home(g).lastSpoiled = 1.5
    const view = buildGameView(g)
    expect(view.notices).toEqual([
      "L'hiver arrive : la cueillette tombe à 48 % jusqu'au printemps.",
    ])
    expect(view.tribe).toMatchObject({ foodBalance: 6.5, spoiled: 1.5 })
  })

  it('montre les villages, ce qui empêche d’en bâtir et la moisson dans le bilan', () => {
    const g = game()
    let view = buildGameView(g)
    expect(view.tribe).toMatchObject({ villages: 0, maxVillages: 0, crops: 0 })
    expect(view.tribe.villageBlocked).toMatch(/Agriculture/)
    expect(view.camps[0]!.village).toBe(false)
    g.camps[0]!.village = true
    home(g).lastProduction = 10
    home(g).lastCrops = 30
    home(g).lastConsumption = 12
    home(g).lastSpoiled = 0
    view = buildGameView(g)
    expect(view.camps[0]!.village).toBe(true)
    expect(view.tribe).toMatchObject({ villages: 1, crops: 30, foodBalance: 28 })
  })

  it('ne liste que les peuples rencontrés, avec leur humeur et ce qu’on peut leur proposer', () => {
    const g = createGame({ seed: 'voisins', randomStart: false, width: 320, height: 160 })
    expect(buildGameView(g).peoples).toEqual([])
    const p = g.peoples[0]!
    p.met = true
    p.relation = 25
    p.tribe.population = 137
    const [view] = buildGameView(g).peoples
    expect(view).toMatchObject({ id: p.owner, name: p.name, population: 140, mood: 'Amical' })
    expect(view!.trade).toBe('10 silex → 25 rations')
    expect(view!.tradeBlocked).toMatch(/silex/)
  })

  it('montre les chasseurs des bandes, et prévient de la viande perdue', () => {
    const g = game()
    g.events.push({ type: 'meatLost', amount: 7 })
    let view = buildGameView(g)
    expect(view.tribe.hunters).toBe(2)
    expect(view.notices).toEqual([
      'Chasse : la réserve est pleine, 7 rations de viande sont perdues.',
    ])
    g.camps[0]!.members = 3
    home(g).food = 0
    view = buildGameView(g)
    expect(view.tribe.hunters).toBe(0)
    expect(view.tribe.huntersResting).toBe(false)
    home(g).food = view.tribe.foodCapacity + 1
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

  it('montre le score, l’objectif et la fin de partie', () => {
    const g = game()
    let view = buildGameView(g)
    expect(view.score).toBeGreaterThan(0)
    expect(view.goal.map((s) => s.label)).toEqual(['Habitants', 'Campements', 'Inventions'])
    expect(view.goal[0]).toMatchObject({ have: 12, done: false })
    expect(view.outcome).toBeNull()
    g.outcome = { type: 'defeat', tick: 13, score: 42 }
    g.events.push({ type: 'defeat' }, { type: 'victory' })
    view = buildGameView(g)
    expect(view.outcome).toMatchObject({ type: 'defeat', score: 42 })
    expect(view.outcome!.dateLabel).toMatch(/^février 11.999 av\. J\.-C\.$/)
    expect(view.notices).toEqual([
      'Défaite : la tribu a disparu.',
      "Victoire : la tribu a atteint l'objectif du paléolithique.",
    ])
  })

  it('écrit les statistiques avec leur unité', () => {
    expect(formatStat({ mean: 22.5, spread: 3 }, '%')).toBe('+22,5 ± 3 %')
    expect(formatStat({ mean: 4, spread: 0 }, 'mois')).toBe('4 mois')
    expect(formatStat({ mean: -20, spread: 5 }, '%')).toBe('-20 ± 5 %')
    expect(formatStat({ mean: 3, spread: 0 }, 'cases')).toBe('+3 cases')
    expect(formatStat({ mean: 1, spread: 0 }, 'cases')).toBe('+1 case')
  })

  it('rédige les événements du moteur pour le joueur', () => {
    const g = game()
    expect(buildGameView(g).notices).toEqual([])
    g.events.push({ type: 'bandGaveUp', campId: g.camps[0]!.id })
    g.events.push({ type: 'hunterKilled', animal: 'sanglier' })
    expect(buildGameView(g).notices).toEqual([
      'La bande s’arrête : aucun chemin connu assez court ne mène à sa destination.',
      'Chasse : un chasseur de la bande est mort face aux sangliers.',
    ])
  })

  it("ne partage pas d'objets mutables avec le moteur", () => {
    const g = game()
    g.camps[0]!.target = { x: 3, y: 3 }
    const view = buildGameView(g)
    view.camps[0]!.band!.target!.x = 99
    expect(g.camps[0]!.target!.x).toBe(3)
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

describe('campements choisis', () => {
  it('dit ce que devient chaque campement du joueur, et ce qui l’en empêche', () => {
    const g = game()
    const camp = buildGameView(g).camps.find((c) => c.mine)!
    expect(camp.upgrade).toMatchObject({
      to: 'village',
      blocked: expect.stringMatching(/Agriculture/),
    })
    g.camps[0]!.village = true
    expect(buildGameView(g).camps[0]!.upgrade).toMatchObject({
      to: 'city',
      cost: expect.stringMatching(/cuivre/),
    })
    g.camps[0]!.city = true
    expect(buildGameView(g).camps[0]!.upgrade).toBeNull()
  })
})
