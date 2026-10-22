import { describe, expect, it } from 'vitest'
import { applyCommand, clearDirty, createGame, step, type GameState } from '@/engine/game'
import { isWater } from '@/engine/content/biomes'
import { Visibility } from '@/engine/fog/fog'
import { TRIBE_RULES } from '@/engine/content/tribe'
import { PLAYER } from '@/engine/territory/territory'
import fc from 'fast-check'

const options = { seed: 'scénario', randomStart: false, width: 256, height: 128 }

/** Empreinte de l'état, pour comparer deux parties. */
function fingerprint(g: GameState): string {
  let fog = 0
  let land = 0
  for (let i = 0; i < g.fog.cells.length; i++) {
    fog = (fog * 31 + g.fog.cells[i]!) | 0
    land = (land * 31 + g.territory.owner[i]!) | 0
  }
  return JSON.stringify({ tick: g.clock.tick, units: g.units, fog, land, rng: g.rng.state })
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
  it('pose un campement et un éclaireur sur un départ viable', () => {
    const g = createGame(options)
    expect(g.camps).toHaveLength(1)
    expect(g.units).toHaveLength(1)
    const camp = g.camps[0]!
    expect(isWater(g.world.biome[Math.floor(camp.y) * g.world.width + Math.floor(camp.x)]!)).toBe(
      false,
    )
    // Le camp tient d'emblée un petit territoire pour nourrir la tribu.
    expect(g.territory.ownedCount).toBeGreaterThan(20)
    expect(g.territory.playerWeight).toBeGreaterThan(0)
    expect(g.tribe.population).toBe(TRIBE_RULES.startPopulation)
    expect(g.clock.paused).toBe(true)
  })

  it('voit autour du campement dès le départ', () => {
    const g = createGame(options)
    const c = g.camps[0]!
    expect(g.fog.cells[Math.floor(c.y) * g.world.width + Math.floor(c.x)]).toBe(Visibility.Visible)
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

  it('refuse une destination hors du monde, dans l’eau connue ou sans unité', () => {
    const g = createGame(options)
    const id = g.units[0]!.id
    expect(applyCommand(g, { type: 'moveUnits', unitIds: [id], x: -1, y: 5 }).ok).toBe(false)
    expect(applyCommand(g, { type: 'moveUnits', unitIds: [id], x: NaN, y: 5 }).ok).toBe(false)
    const water = knownWater(g)
    expect(applyCommand(g, { type: 'moveUnits', unitIds: [id], ...water })).toEqual({
      ok: false,
      reason: 'Destination infranchissable',
    })
    const c = g.camps[0]!
    expect(applyCommand(g, { type: 'moveUnits', unitIds: [999], x: c.x, y: c.y }).ok).toBe(false)
  })

  it('accepte un clic sur de l’eau encore inconnue : le brouillard ne trahit rien', () => {
    const g = createGame(options)
    const u = g.units[0]!
    expect(g.fog.cells[0]).toBe(Visibility.Unknown)
    expect(isWater(g.world.biome[0]!)).toBe(true)
    expect(applyCommand(g, { type: 'moveUnits', unitIds: [u.id], x: 0.5, y: 0.5 })).toEqual({
      ok: true,
    })
    expect(u.target).toEqual({ x: 0.5, y: 0.5 })
  })

  it('refuse une destination qu’aucun chemin connu n’atteint', () => {
    const g = createGame(options)
    const u = g.units[0]!
    // On fait comme si le joueur connaissait toute la carte : la case d'eau du coin est
    // refusée, et une terre d'une autre île aussi.
    g.fog.cells.fill(Visibility.Seen)
    const island = otherIsland(g)
    if (!island) return
    expect(applyCommand(g, { type: 'moveUnits', unitIds: [u.id], ...island })).toEqual({
      ok: false,
      reason: 'Aucun chemin connu vers cette destination',
    })
  })

  it('dans un ordre de groupe, l’unité sans chemin abandonne son ancien ordre', () => {
    const g = createGame(options)
    const scout = g.units[0]!
    const camp = g.camps[0]!
    // Une seconde unité, sur une île que le joueur sait séparée du campement.
    g.fog.cells.fill(Visibility.Seen)
    const island = otherIsland(g)
    if (!island) return
    const castaway = {
      ...scout,
      id: 99,
      ...island,
      target: { x: island.x + 0.1, y: island.y },
      path: [],
    }
    g.units.push(castaway)
    const r = applyCommand(g, { type: 'moveUnits', unitIds: [scout.id, 99], x: camp.x, y: camp.y })
    expect(r.ok).toBe(true)
    expect(castaway.target).toBeNull()
    expect(castaway.path).toEqual([])
  })

  it('refuse une commande inconnue sans planter', () => {
    const g = createGame(options)
    expect(applyCommand(g, { type: 'téléporter' } as never).ok).toBe(false)
  })
})

describe('scénarios', () => {
  it('un éclaireur envoyé au loin découvre de nouvelles terres', () => {
    const g = createGame(options)
    const u = g.units[0]!
    const known = () => g.fog.cells.filter((c) => c !== Visibility.Unknown).length
    const before = known()
    // Cherche une destination de terre accessible en ligne droite.
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
      const r = applyCommand(g, { type: 'moveUnits', unitIds: [u.id], x: u.x + dx, y: u.y + dy })
      if (r.ok) {
        target = { x: u.x + dx, y: u.y + dy }
        break
      }
    }
    expect(target).not.toBeNull()
    for (let i = 0; i < 120; i++) step(g)
    expect(known()).toBeGreaterThan(before)
  })

  it('l’éclaireur envoyé dans l’eau inconnue s’arrête au bord, sans jamais nager', () => {
    const g = createGame(options)
    const u = g.units[0]!
    applyCommand(g, { type: 'moveUnits', unitIds: [u.id], x: 0.5, y: 0.5 })
    let ticks = 0
    for (; ticks < 3000 && u.target; ticks++) {
      step(g)
      expect(onWater(g, u)).toBe(false)
    }
    // Le coin est en pleine mer : une fois les côtes découvertes, plus aucun chemin connu
    // assez court n'y mène, l'éclaireur s'arrête au lieu d'errer.
    expect(u.target).toBeNull()
    expect(u.path).toEqual([])
    expect(ticks).toBeLessThan(1500)
    // Le joueur en est prévenu, une seule fois, puis l'envoi suivant repart à vide.
    expect(g.events).toEqual([{ type: 'unitGaveUp', unitId: u.id }])
    clearDirty(g)
    expect(g.events).toEqual([])
  })

  it('une unité qui arrive à destination ne prévient de rien', () => {
    const g = createGame(options)
    const u = g.units[0]!
    const c = g.camps[0]!
    applyCommand(g, { type: 'moveUnits', unitIds: [u.id], x: c.x + 1, y: c.y })
    for (let i = 0; i < 20 && u.target; i++) step(g)
    expect(u.target).toBeNull()
    expect(g.events).toEqual([])
  })

  it('n’entre jamais dans l’eau et finit toujours par arriver ou s’arrêter (fast-check)', () => {
    const g0 = createGame(options)
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: g0.world.width - 1 }),
        fc.integer({ min: 0, max: g0.world.height - 1 }),
        (x, y) => {
          const g = createGame(options)
          const u = g.units[0]!
          const r = applyCommand(g, { type: 'moveUnits', unitIds: [u.id], x: x + 0.5, y: y + 0.5 })
          if (!r.ok) return
          for (let i = 0; i < 2500 && u.target; i++) {
            step(g)
            expect(onWater(g, u)).toBe(false)
          }
          // Arrivé, ou arrêté faute de chemin connu assez court : jamais en errance.
          expect(u.target).toBeNull()
        },
      ),
      { numRuns: 12 },
    )
  }, 60_000)

  it('la tribu se nourrit de son territoire et grandit', () => {
    const g = createGame(options)
    for (let i = 0; i < 240; i++) step(g)
    expect(g.tribe.population).toBeGreaterThan(TRIBE_RULES.startPopulation)
    expect(g.tribe.starvingMonths).toBe(0)
  })

  it('sans rien à récolter, la famine prévient une fois puis décime la tribu', () => {
    const g = createGame(options)
    g.territory.playerWeight = 0
    g.territory.weights = new Float32Array(g.territory.owner.length)
    const famines: number[] = []
    for (let i = 0; i < 200; i++) {
      step(g)
      if (g.events.some((e) => e.type === 'famine')) famines.push(i)
      clearDirty(g)
    }
    expect(famines).toHaveLength(1)
    expect(g.tribe.population).toBe(0)
  })

  it('le territoire grandit avec le temps', () => {
    const g = createGame(options)
    for (let i = 0; i < 200; i++) step(g)
    expect(g.territory.ownedCount).toBeGreaterThan(100)
    expect(g.territory.owner.filter((o) => o === PLAYER).length).toBe(g.territory.ownedCount)
  })

  it('une même graine et les mêmes commandes donnent la même partie', () => {
    const play = () => {
      const g = createGame(options)
      const u = g.units[0]!
      applyCommand(g, { type: 'moveUnits', unitIds: [u.id], x: u.x + 6, y: u.y + 3 })
      for (let i = 0; i < 300; i++) step(g)
      return fingerprint(g)
    }
    expect(play()).toBe(play())
  })

  it('un tick reste rapide sur le monde complet', () => {
    const g = createGame({ seed: 'perf', randomStart: false })
    const t0 = performance.now()
    for (let i = 0; i < 500; i++) step(g)
    const perTick = (performance.now() - t0) / 500
    expect(perTick).toBeLessThan(2)
  })
})
