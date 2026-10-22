import { describe, expect, it } from 'vitest'
import { applyCommand, createGame, step, type GameState } from '@/engine/game'
import { isWater } from '@/engine/content/biomes'
import { Visibility } from '@/engine/fog/fog'
import { PLAYER } from '@/engine/territory/territory'

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

describe('création de partie', () => {
  it('pose un campement et un éclaireur sur un départ viable', () => {
    const g = createGame(options)
    expect(g.camps).toHaveLength(1)
    expect(g.units).toHaveLength(1)
    const camp = g.camps[0]!
    expect(isWater(g.world.biome[Math.floor(camp.y) * g.world.width + Math.floor(camp.x)]!)).toBe(
      false,
    )
    expect(g.territory.owned).toHaveLength(1)
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

  it('refuse une destination hors du monde, dans l’eau ou sans unité', () => {
    const g = createGame(options)
    const id = g.units[0]!.id
    expect(applyCommand(g, { type: 'moveUnits', unitIds: [id], x: -1, y: 5 }).ok).toBe(false)
    expect(applyCommand(g, { type: 'moveUnits', unitIds: [id], x: NaN, y: 5 }).ok).toBe(false)
    expect(applyCommand(g, { type: 'moveUnits', unitIds: [id], x: 0.5, y: 0.5 }).ok).toBe(false)
    const c = g.camps[0]!
    expect(applyCommand(g, { type: 'moveUnits', unitIds: [999], x: c.x, y: c.y }).ok).toBe(false)
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

  it('le territoire grandit avec le temps', () => {
    const g = createGame(options)
    for (let i = 0; i < 200; i++) step(g)
    expect(g.territory.owned.length).toBeGreaterThan(100)
    expect(g.territory.owner.filter((o) => o === PLAYER).length).toBe(g.territory.owned.length)
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
