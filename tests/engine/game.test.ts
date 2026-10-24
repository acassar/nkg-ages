import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  clearDirty,
  createGame,
  currentScore,
  depositHeld,
  foodCapacity,
  huntersOf,
  plannedHunters,
  step,
  type Camp,
  type GameState,
} from '@/engine/game'
import { HUNT_RULES } from '@/engine/content/fauna'
import { BAND_RULES } from '@/engine/content/bands'
import { bandSight } from '@/engine/bands/sight'
import { FIRST_ERA, SCORE_RULES } from '@/engine/content/eras'
import { INVENTION_KINDS } from '@/engine/content/inventions'
import { BIOMES, isWater, type BiomeId } from '@/engine/content/biomes'
import { RIVER_RULES } from '@/engine/content/rivers'
import { Visibility } from '@/engine/fog/fog'
import { TRIBE_RULES } from '@/engine/content/tribe'
import { PLAYER } from '@/engine/territory/territory'
import fc from 'fast-check'
import { createRng } from '@/engine/core/random'
import { home } from '../home'
import { createLarder } from '@/engine/tribe/tribe'

// Sans peuples voisins : ces scénarios suivent la tribu du joueur seule (voir peoples.test.ts).
const options = { seed: 'scénario', randomStart: false, width: 256, height: 128, peoples: 0 }

/** Empreinte de l'état, pour comparer deux parties. */
function fingerprint(g: GameState): string {
  let fog = 0
  let land = 0
  for (let i = 0; i < g.fog.cells.length; i++) {
    fog = (fog * 31 + g.fog.cells[i]!) | 0
    land = (land * 31 + g.territory.owner[i]!) | 0
  }
  return JSON.stringify({
    tick: g.clock.tick,
    camps: g.camps,
    fog,
    land,
    rng: g.rng.state,
    fauna: g.faunaRng.state,
  })
}

function onWater(g: GameState, u: { x: number; y: number }): boolean {
  return isWater(g.world.biome[Math.floor(u.y) * g.world.width + Math.floor(u.x)]!)
}

/** Une case d'eau déjà découverte par le joueur. */
function knownWater(g: GameState): { x: number; y: number } {
  const i = g.fog.cells.findIndex((c, i) => c !== Visibility.Unknown && isWater(g.world.biome[i]!))
  expect(i).toBeGreaterThanOrEqual(0)
  return { x: (i % g.world.width) + 0.5, y: Math.floor(i / g.world.width) + 0.5 }
}

/** Une terre qu'aucune suite de terres ne relie au campement, s'il y en a une. */
function otherIsland(g: GameState): { x: number; y: number } | null {
  const { width, height, biome } = g.world
  const c = g.camps[0]!
  const start = Math.floor(c.y) * width + Math.floor(c.x)
  const seen = new Uint8Array(width * height)
  const queue = [start]
  seen[start] = 1
  while (queue.length > 0) {
    const i = queue.pop()!
    const x = i % width
    const y = (i - x) / width
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const n = ny * width + nx
      if (seen[n] || isWater(biome[n]!)) continue
      seen[n] = 1
      queue.push(n)
    }
  }
  const i = [...biome.keys()].find((i) => !seen[i] && !isWater(biome[i]!))
  return i === undefined ? null : { x: (i % width) + 0.5, y: Math.floor(i / width) + 0.5 }
}

describe('création de partie', () => {
  it('les berges des fleuves nourrissent davantage', () => {
    const g = createGame(options)
    const i = g.world.river.findIndex((r) => r > 0)
    const food = BIOMES[g.world.biome[i] as BiomeId].food
    expect(g.territory.weights![i]).toBeCloseTo(food + RIVER_RULES.food)
  })

  it('pose une bande sur un départ viable, sans éclaireur ni chasseur à piloter', () => {
    const g = createGame(options)
    expect(g.camps).toHaveLength(1)
    expect('units' in g).toBe(false)
    const camp = g.camps[0]!
    expect(isWater(g.world.biome[Math.floor(camp.y) * g.world.width + Math.floor(camp.x)]!)).toBe(
      false,
    )
    // Le camp tient d'emblée un petit territoire pour nourrir la tribu.
    expect(g.territory.ownedCount).toBeGreaterThan(20)
    expect(g.territory.playerWeight).toBeGreaterThan(0)
    expect(g.tribe.population).toBe(TRIBE_RULES.startPopulation)
    expect(camp.members).toBe(TRIBE_RULES.startPopulation)
    expect(g.clock.paused).toBe(true)
  })

  it('voit autour de la bande, à toute sa vue, dès le départ', () => {
    const g = createGame(options)
    const c = g.camps[0]!
    const { width } = g.world
    expect(g.fog.cells[Math.floor(c.y) * width + Math.floor(c.x)]).toBe(Visibility.Visible)
    // Bien plus loin que sa zone : ses gens parcourent le pays.
    const far = Math.floor(c.y) * width + Math.floor(c.x + BAND_RULES.sight - 1)
    expect(BAND_RULES.sight).toBeGreaterThan(BAND_RULES.radius)
    expect(g.fog.cells[far]).toBe(Visibility.Visible)
    const beyond = Math.floor(c.y) * width + Math.floor(c.x + BAND_RULES.sight + 2)
    expect(g.fog.cells[beyond]).toBe(Visibility.Unknown)
  })

  it('propose 3 départs au choix, et le choisi est utilisé', () => {
    const g = createGame({ ...options, startIndex: 2 })
    expect(g.starts).toHaveLength(3)
    expect(Math.floor(g.camps[0]!.x)).toBe(g.starts[2]!.x)
  })

  it.each([-3, 99, 1.7, NaN])('ramène un index de départ hors bornes (%f) dans la liste', (i) => {
    const g = createGame({ ...options, startIndex: i })
    expect(g.starts.some((s) => s.x === Math.floor(g.camps[0]!.x))).toBe(true)
  })

  it('tire un départ au hasard en placement aléatoire, de façon reproductible', () => {
    const a = createGame({ ...options, randomStart: true })
    const b = createGame({ ...options, randomStart: true })
    expect(a.camps[0]).toEqual(b.camps[0])
  })
})

describe('commandes', () => {
  it('change la vitesse et la pause', () => {
    const g = createGame(options)
    expect(applyCommand(g, { type: 'setSpeed', speed: 4 })).toEqual({ ok: true })
    expect(g.clock.speed).toBe(4)
    applyCommand(g, { type: 'togglePause' })
    expect(g.clock.paused).toBe(false)
    applyCommand(g, { type: 'setPaused', paused: true })
    expect(g.clock.paused).toBe(true)
  })

  it('refuse une vitesse inconnue', () => {
    const g = createGame(options)
    expect(applyCommand(g, { type: 'setSpeed', speed: 9 as never }).ok).toBe(false)
    expect(g.clock.speed).toBe(1)
  })

  it('refuse une destination hors du monde, dans l’eau connue ou sans bande', () => {
    const g = createGame(options)
    const id = g.camps[0]!.id
    expect(applyCommand(g, { type: 'moveCamp', campId: id, x: -1, y: 5 }).ok).toBe(false)
    expect(applyCommand(g, { type: 'moveCamp', campId: id, x: NaN, y: 5 }).ok).toBe(false)
    const water = knownWater(g)
    expect(applyCommand(g, { type: 'moveCamp', campId: id, ...water })).toEqual({
      ok: false,
      reason: 'Destination infranchissable',
    })
    const c = g.camps[0]!
    expect(applyCommand(g, { type: 'moveCamp', campId: 999, x: c.x, y: c.y }).ok).toBe(false)
  })

  it('accepte un clic sur de l’eau encore inconnue : le brouillard ne trahit rien', () => {
    const g = createGame(options)
    const band = g.camps[0]!
    expect(g.fog.cells[0]).toBe(Visibility.Unknown)
    expect(isWater(g.world.biome[0]!)).toBe(true)
    expect(applyCommand(g, { type: 'moveCamp', campId: band.id, x: 0.5, y: 0.5 })).toEqual({
      ok: true,
    })
    expect(band.target).toEqual({ x: 0.5, y: 0.5 })
  })

  it('refuse une destination qu’aucun chemin connu n’atteint', () => {
    const g = createGame(options)
    const band = g.camps[0]!
    // On fait comme si le joueur connaissait toute la carte : la case d'eau du coin est
    // refusée, et une terre d'une autre île aussi.
    g.fog.cells.fill(Visibility.Seen)
    const island = otherIsland(g)
    if (!island) return
    expect(applyCommand(g, { type: 'moveCamp', campId: band.id, ...island })).toEqual({
      ok: false,
      reason: 'Aucun chemin connu vers cette destination',
    })
  })

  it('lance une invention par commande, puis l’annonce achevée avec son rang', () => {
    const g = createGame(options)
    expect(applyCommand(g, { type: 'invent', invention: 'lance' })).toEqual({
      ok: false,
      reason: 'Il faut 15 silex',
    })
    expect(applyCommand(g, { type: 'invent', invention: 'arc' as never })).toEqual({
      ok: false,
      reason: 'Invention inconnue',
    })
    expect(applyCommand(g, { type: 'invent', invention: 'panier' })).toEqual({ ok: true })
    let done = null
    for (let i = 0; i < 300 && !done; i++) {
      step(g)
      done = g.events.find((e) => e.type === 'invented') ?? null
      clearDirty(g)
    }
    expect(done).toMatchObject({ type: 'invented', invention: 'panier' })
    expect(g.inventions.ranks.panier).toBeDefined()
  })

  it('le fumage agrandit la réserve, la lance aide la chasse', () => {
    const g = createGame(options)
    const before = foodCapacity(g)
    g.inventions.ranks.fumage = 'S'
    expect(foodCapacity(g)).toBeGreaterThan(before)

    // Même partie, même chasse : avec une lance S, plus de prises qu'à mains nues.
    const hunt = (withSpear: boolean) => {
      const h = createGame(options)
      if (withSpear) h.inventions.ranks.lance = 'S'
      const band = h.camps[0]!
      let prises = 0
      for (let i = 0; i < 200; i++) {
        h.herds = [{ id: 1, kind: 'cerf', x: band.x + 3, y: band.y, size: 8, goal: band }]
        home(h).food = 0
        step(h)
        prises += 8 - (h.herds[0]?.size ?? 0)
      }
      return prises
    }
    expect(hunt(true)).toBeGreaterThan(hunt(false))
  })

  it('chaque technique agit sur la partie', () => {
    const g = createGame(options)
    const sight = bandSight(g.inventions)
    expect(sight).toBe(BAND_RULES.sight)
    g.inventions.ranks.pistage = 'S'
    expect(bandSight(g.inventions)).toBe(sight + 5)

    // Portage : la bande couvre plus de chemin dans le même temps.
    const walk = (rank: 'S' | null) => {
      const h = createGame(options)
      if (rank) h.inventions.ranks.portage = rank
      const band = h.camps[0]!
      const start = { x: band.x, y: band.y }
      const far = landAt(h, (x, y) => Math.hypot(x - start.x, y - start.y) > 25)
      applyCommand(h, { type: 'moveCamp', campId: band.id, x: far.x + 0.5, y: far.y + 0.5 })
      for (let i = 0; i < 2; i++) step(h)
      return Math.hypot(band.x - start.x, band.y - start.y)
    }
    expect(walk('S')).toBeGreaterThan(walk(null))

    // Taille du silex et harpon : les gisements rendent davantage.
    const yieldOf = (kind: 'silex' | 'poisson', invention: 'taille' | 'harpon' | null) => {
      const h = createGame(options)
      if (invention) h.inventions.ranks[invention] = 'S'
      const c = h.camps[0]!
      h.deposits = [{ id: 1, kind, x: Math.floor(c.x), y: Math.floor(c.y), rank: 'E' }]
      home(h).food = 0
      // Terres épuisées : seuls les gisements nourrissent.
      h.abundance.fill(0)
      step(h)
      return kind === 'silex' ? h.tribe.materials.silex! : home(h).lastProduction
    }
    expect(yieldOf('silex', 'taille')).toBeCloseTo(yieldOf('silex', null) * 2)
    expect(yieldOf('poisson', 'harpon')).toBeGreaterThan(yieldOf('poisson', null))
  })

  it('le propulseur rend la chasse moins meurtrière', () => {
    // Un seul monde pour toutes les manches (le générer coûte cher) : chaque manche
    // repart d'une bande neuve et d'un aléa à elle. Des sangliers, les plus dangereux
    // qu'une bande chasse seule.
    const base = createGame({ ...options, rareEvents: false })
    const start = { ...base.camps[0]! }
    const deaths = (thrower: boolean) => {
      let dead = 0
      for (let run = 0; run < 20; run++) {
        const g = base
        g.rng = createRng(`propulseur-${run}`)
        g.inventions.ranks = { lance: 'E', ...(thrower ? { propulseur: 'S' as const } : {}) }
        const band: Camp = { ...start, path: [], target: null }
        g.camps = [band]
        for (let i = 0; i < 40; i++) {
          g.herds = [{ id: 1, kind: 'sanglier', x: band.x + 2, y: band.y, size: 5, goal: band }]
          home(g).food = 0
          g.tribe.population = 24
          band.members = 24
          clearDirty(g)
          step(g)
          dead += g.events.filter((e) => e.type === 'hunterKilled').length
        }
      }
      return dead
    }
    expect(deaths(true)).toBeLessThan(deaths(false))
  })

  it('défaite : la tribu disparue, tout s’arrête', () => {
    const g = createGame(options)
    g.tribe.population = 0
    g.clock.paused = false
    step(g)
    expect(g.outcome).toMatchObject({ type: 'defeat', tick: 1 })
    expect(g.events).toContainEqual({ type: 'defeat' })
    expect(g.clock.paused).toBe(true)
    expect(applyCommand(g, { type: 'setPaused', paused: false })).toEqual({
      ok: false,
      reason: 'La tribu a disparu',
    })
    step(g)
    expect(g.clock.tick).toBe(1)
  })

  it('victoire à l’objectif de l’ère, une seule fois, puis la partie continue', () => {
    const g = createGame(options)
    const goal = FIRST_ERA.goal
    g.tribe.population = goal.population
    // Les petits campements ajoutés ont une personne chacun ; la bande de départ, le reste.
    g.camps[0]!.members = goal.population - (goal.camps - 1)
    home(g).food = 10_000
    for (let i = 1; i < goal.camps; i++)
      g.camps.push({
        id: 100 + i,
        owner: PLAYER,
        x: 1.5 + i,
        y: 1.5,
        members: 1,
        larder: createLarder(10),
      })
    const kinds = INVENTION_KINDS.slice(0, goal.inventions)
    for (const k of kinds) g.inventions.ranks[k] = 'E'
    step(g)
    expect(g.outcome?.type).toBe('victory')
    expect(g.events).toContainEqual({ type: 'victory' })
    expect(g.clock.paused).toBe(true)
    const won = g.outcome!.score
    expect(won).toBeGreaterThan(SCORE_RULES.victory * 0.9)
    expect(currentScore(g)).toBe(won)
    // On peut continuer : pas de seconde victoire.
    expect(applyCommand(g, { type: 'setPaused', paused: false }).ok).toBe(true)
    clearDirty(g)
    for (let i = 0; i < 12; i++) step(g)
    expect(g.events.filter((e) => e.type === 'victory')).toEqual([])
    expect(g.outcome?.tick).toBe(1)
  })

  it('refuse une commande inconnue sans planter', () => {
    const g = createGame(options)
    expect(applyCommand(g, { type: 'téléporter' } as never).ok).toBe(false)
  })
})

describe('scénarios', () => {
  it('une bande envoyée au loin découvre de nouvelles terres', () => {
    const g = createGame(options)
    const band = g.camps[0]!
    const known = () => g.fog.cells.filter((c) => c !== Visibility.Unknown).length
    const before = known()
    // Cherche une destination de terre accessible.
    let target: { x: number; y: number } | null = null
    for (const [dx, dy] of [
      [25, 0],
      [-25, 0],
      [0, 25],
      [0, -25],
      [18, 18],
      [-18, -18],
      [18, -18],
      [-18, 18],
    ] as const) {
      const at = { campId: band.id, x: band.x + dx, y: band.y + dy }
      if (applyCommand(g, { type: 'moveCamp', ...at }).ok) {
        target = at
        break
      }
    }
    expect(target).not.toBeNull()
    for (let i = 0; i < 30; i++) step(g)
    expect(known()).toBeGreaterThan(before)
  })

  it('la bande envoyée dans l’eau inconnue s’arrête au bord, sans jamais nager', () => {
    const g = createGame({ ...options, rareEvents: false })
    const band = g.camps[0]!
    applyCommand(g, { type: 'moveCamp', campId: band.id, x: 0.5, y: 0.5 })
    let months = 0
    const gaveUp: unknown[] = []
    for (; months < 600 && band.target; months++) {
      step(g)
      expect(onWater(g, band)).toBe(false)
      gaveUp.push(...g.events.filter((e) => e.type === 'bandGaveUp'))
      clearDirty(g)
    }
    // Le coin est en pleine mer : une fois les côtes découvertes, plus aucun chemin connu
    // assez court n'y mène, la bande s'arrête au lieu d'errer, et le joueur en est prévenu.
    expect(band.target).toBeNull()
    expect(band.path).toEqual([])
    expect(months).toBeLessThan(400)
    expect(gaveUp).toEqual([{ type: 'bandGaveUp', campId: band.id }])
  })

  it('une bande qui arrive à destination ne prévient de rien', () => {
    const g = createGame({ ...options, rareEvents: false })
    const band = g.camps[0]!
    applyCommand(g, { type: 'moveCamp', campId: band.id, x: band.x + 1, y: band.y })
    step(g)
    expect(band.target).toBeNull()
    expect(g.events.filter((e) => e.type === 'bandGaveUp')).toEqual([])
  })

  it('n’entre jamais dans l’eau et finit toujours par arriver ou s’arrêter (fast-check)', () => {
    const g0 = createGame(options)
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: g0.world.width - 1 }),
        fc.integer({ min: 0, max: g0.world.height - 1 }),
        (x, y) => {
          const g = createGame(options)
          const band = g.camps[0]!
          const to = { campId: band.id, x: x + 0.5, y: y + 0.5 }
          if (!applyCommand(g, { type: 'moveCamp', ...to }).ok) return
          for (let i = 0; i < 600 && band.target; i++) {
            step(g)
            expect(onWater(g, band)).toBe(false)
          }
          // Arrivée, ou arrêtée faute de chemin connu assez court : jamais en errance.
          expect(band.target).toBeNull()
        },
      ),
      { numRuns: 12 },
    )
  }, 60_000)

  it('la tribu se nourrit de son territoire et grandit', () => {
    const g = createGame(options)
    // Une bande qui reste sur place use ses terres : quelques fins d'hiver maigres, pas plus.
    let starving = 0
    for (let i = 0; i < 240; i++) {
      step(g)
      if (home(g).starvingMonths > 0) starving++
    }
    expect(g.tribe.population).toBeGreaterThan(TRIBE_RULES.startPopulation)
    expect(starving).toBeLessThanOrEqual(6)
  })

  it('sans rien à récolter, la famine prévient une fois puis décime la tribu', () => {
    // Sans événements rares : une abondance ou des nouveaux venus brouilleraient le compte.
    const g = createGame({ ...options, rareEvents: false })
    g.abundance.fill(0)
    g.territory.weights = new Float32Array(g.territory.owner.length)
    g.deposits = []
    const famines: number[] = []
    for (let i = 0; i < 200; i++) {
      step(g)
      if (g.events.some((e) => e.type === 'famine')) famines.push(i)
      clearDirty(g)
    }
    expect(famines).toHaveLength(1)
    expect(g.tribe.population).toBe(0)
  })

  it('les gisements tenus nourrissent la tribu et remplissent ses réserves de matériaux', () => {
    const g = createGame(options)
    g.abundance.fill(0)
    g.territory.weights = new Float32Array(g.territory.owner.length)
    const cell = (x: number, y: number) => ({ x, y })
    // Deux gisements riches posés sur le camp : sans eux, ce serait la famine.
    const c = g.camps[0]!
    const at = cell(Math.floor(c.x), Math.floor(c.y))
    g.deposits = [
      { id: 1, kind: 'baies', ...at, rank: 'S' },
      { id: 2, kind: 'silex', ...at, rank: 'E' },
    ]
    for (let i = 0; i < 24; i++) step(g)
    expect(home(g).starvingMonths).toBe(0)
    expect(g.tribe.materials.silex).toBeCloseTo(24 * 0.5)
  })

  it('la bande chasse seule un troupeau qu’elle voit et nourrit la tribu', () => {
    const g = createGame(options)
    const band = g.camps[0]!
    home(g).food = 0
    g.abundance.fill(0)
    g.territory.weights = new Float32Array(g.territory.owner.length)
    g.deposits = []
    const spot = { x: band.x + BAND_RULES.sight - 3, y: band.y }
    g.herds = [{ id: 1, kind: 'cerf', ...spot, size: 8, goal: { ...spot } }]
    let meat = 0
    let smallest = 8
    for (let i = 0; i < 60 && g.herds.length > 0; i++) {
      const before = home(g).food
      step(g)
      if (home(g).food > before) meat++
      smallest = Math.min(smallest, g.herds[0]?.size ?? 0)
      // Le troupeau fuit : on le ramène en vue pour ce test.
      for (const h of g.herds) Object.assign(h, { ...spot, goal: { ...spot } })
    }
    expect(meat).toBeGreaterThan(0)
    // Sans rien à cueillir, tous les bras libres sont partis chasser.
    expect(huntersOf(g)).toBe(Math.floor(TRIBE_RULES.startPopulation * HUNT_RULES.maxShare))
    // Le troupeau peut se reconstituer ensuite : on regarde sa plus petite taille.
    expect(smallest).toBeLessThan(8)
  })

  it('la chasse peut coûter la vie d’un chasseur, et la tribu perd une personne', () => {
    const g = createGame({ ...options, rareEvents: false })
    const band = g.camps[0]!
    const spot = { x: band.x + 2, y: band.y }
    let killed = 0
    let population = 0
    for (let i = 0; i < 2000 && killed === 0; i++) {
      g.herds = [{ id: 1, kind: 'sanglier', ...spot, size: 5, goal: { ...spot } }]
      home(g).food = 0
      g.tribe.population = 24
      home(g).growth = 0
      band.members = 24
      clearDirty(g)
      step(g)
      killed = g.events.filter((e) => e.type === 'hunterKilled').length
      population = g.tribe.population
    }
    expect(killed).toBe(1)
    expect(population).toBeLessThan(24)
  })

  it('un troupeau hors de vue n’est pas chassé', () => {
    const g = createGame(options)
    const band = g.camps[0]!
    const spot = { x: band.x + BAND_RULES.sight + 6, y: band.y }
    for (let i = 0; i < 24; i++) {
      g.herds = [{ id: 1, kind: 'cerf', ...spot, size: 8, goal: { ...spot } }]
      home(g).food = 0
      step(g)
      expect(g.herds[0]!.size).toBe(8)
    }
  })

  it('une bande ne chasse pas seule les mammouths', () => {
    const g = createGame(options)
    const band = g.camps[0]!
    const spot = { x: band.x + 2, y: band.y }
    for (let i = 0; i < 24; i++) {
      g.herds = [{ id: 1, kind: 'mammouth', ...spot, size: 4, goal: { ...spot } }]
      home(g).food = 0
      clearDirty(g)
      step(g)
      expect(g.herds[0]!.size).toBe(4)
      expect(g.events.filter((e) => e.type === 'hunterKilled')).toEqual([])
    }
  })

  it('réserve pleine, les chasseurs ne risquent pas leur vie', () => {
    const g = createGame(options)
    const band = g.camps[0]!
    const spot = { x: band.x + 2, y: band.y }
    for (let i = 0; i < 200; i++) {
      g.herds = [{ id: 1, kind: 'sanglier', ...spot, size: 5, goal: { ...spot } }]
      home(g).food = foodCapacity(g)
      clearDirty(g)
      step(g)
      expect(g.events.filter((e) => e.type === 'hunterKilled')).toEqual([])
    }
    expect(g.herds[0]!.size).toBe(5)
  })

  it('la viande au-delà de la réserve est signalée comme perdue', () => {
    const g = createGame(options)
    const band = g.camps[0]!
    const spot = { x: band.x + 2, y: band.y }
    const lost: number[] = []
    for (let i = 0; i < 300 && lost.length === 0; i++) {
      g.herds = [{ id: 1, kind: 'cerf', ...spot, size: 8, goal: { ...spot } }]
      home(g).food = foodCapacity(g) - 2
      step(g)
      for (const e of g.events) if (e.type === 'meatLost') lost.push(e.amount)
      clearDirty(g)
    }
    expect(lost.length).toBe(1)
    expect(lost[0]).toBeGreaterThan(0)
    expect(home(g).food).toBeLessThanOrEqual(foodCapacity(g))
  })

  it('l’errance de la faune ne puise pas dans l’aléa de la partie', () => {
    const run = (withHerds: boolean) => {
      const g = createGame(options)
      // Sans chasseurs : seule l'errance des bêtes pourrait toucher à l'aléa de la partie.
      g.camps[0]!.members = 1 / HUNT_RULES.share - 1
      g.tribe.population = 1 / HUNT_RULES.share - 1
      if (!withHerds) g.herds = []
      for (let i = 0; i < 50; i++) step(g)
      return g.rng.state
    }
    expect(run(true)).toEqual(run(false))
  })

  it('la bande répartit seule ses gens : une part chasse, plus quand ses terres manquent', () => {
    const rate = TRIBE_RULES.gatherPerPerson
    const base = Math.floor(12 * HUNT_RULES.share)
    const able = Math.floor(12 * HUNT_RULES.maxShare)
    // Rien ne manque : personne ne sort.
    expect(plannedHunters(12, 0, 100, rate)).toBe(0)
    expect(plannedHunters(0, 50, 0, rate)).toBe(0)
    // Les terres suffisent : la part habituelle chasse, les autres cueillent.
    expect(plannedHunters(12, 20, 100, rate)).toBe(base)
    // Les terres ne suffisent pas : la cueillette n'occupe que trois personnes (4,8 rations),
    // les autres chassent, jusqu'à la moitié de la bande.
    expect(plannedHunters(12, 20, 3 * rate, rate)).toBe(able)
    expect(plannedHunters(12, 20, 9 * rate, rate)).toBe(Math.max(base, 3))
    // Plus de terres, jamais plus de chasseurs.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        fc.double({ min: 0, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 200, noNaN: true }),
        (members, room, land, more) => {
          const h = plannedHunters(members, room, land, rate)
          expect(h).toBeGreaterThanOrEqual(0)
          expect(h).toBeLessThanOrEqual(Math.floor(members * HUNT_RULES.maxShare + 1e-9))
          expect(plannedHunters(members, room, land + more, rate)).toBeLessThanOrEqual(h)
        },
      ),
    )
  })

  it('la tribu tient un gisement de silex dès le départ, quelle que soit la graine', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 8 }), (seed) => {
        const g = createGame({ seed, randomStart: true, width: 128, height: 64 })
        expect(g.deposits.some((d) => d.kind === 'silex' && depositHeld(g, d))).toBe(true)
      }),
      // " '" : départ sur un îlot dont le silex voisin n'était pas relié au territoire.
      { numRuns: 12, examples: [[" '"]] },
    )
  }, 30_000)

  it('le territoire grandit avec le temps', () => {
    const g = createGame(options)
    for (let i = 0; i < 200; i++) step(g)
    expect(g.territory.ownedCount).toBeGreaterThan(100)
    expect(g.territory.owner.filter((o) => o === PLAYER).length).toBe(g.territory.ownedCount)
  })

  it('une même graine et les mêmes commandes donnent la même partie', () => {
    const play = () => {
      const g = createGame(options)
      const band = g.camps[0]!
      applyCommand(g, { type: 'moveCamp', campId: band.id, x: band.x + 6, y: band.y + 3 })
      for (let i = 0; i < 300; i++) step(g)
      return fingerprint(g)
    }
    expect(play()).toBe(play())
  })

  // Garde-fou contre une régression grossière seulement : ce test tourne sous couverture v8,
  // en parallèle des autres fichiers. Le budget réel (2 ms) est vérifié par `pnpm bench`.
  it('un tick reste rapide sur le monde complet', () => {
    const g = createGame({ seed: 'perf', randomStart: false })
    const t0 = performance.now()
    for (let i = 0; i < 500; i++) step(g)
    const perTick = (performance.now() - t0) / 500
    expect(perTick).toBeLessThan(10)
  }, 30_000) // Création du monde complet et 500 pas : sous couverture en CI, plus que les 5 s par défaut.
})

/** Première cellule de terre qui satisfait `ok`, en partant du camp. */
function landAt(g: GameState, ok: (x: number, y: number) => boolean): { x: number; y: number } {
  const { width, height, biome } = g.world
  const home = g.camps[0]!
  let best: { x: number; y: number } | null = null
  let bestD = Infinity
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (isWater(biome[y * width + x]!) || !ok(x, y)) continue
      const d = Math.hypot(x - home.x, y - home.y)
      if (d < bestD) [best, bestD] = [{ x, y }, d]
    }
  if (!best) throw new Error('aucune terre convenable')
  return best
}
