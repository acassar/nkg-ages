import { describe, expect, it } from 'vitest'
import { GameHost } from '@/host/host'
import { ManualScheduler } from '@/host/scheduler'
import type { GameView } from '@/views/types'

const options = { seed: 'hôte', randomStart: false, width: 128, height: 64 }

function setup() {
  const scheduler = new ManualScheduler()
  const host = new GameHost(scheduler)
  const views: GameView[] = []
  host.onView((v) => views.push(v))
  const started = host.newGame(options)
  return { scheduler, host, views, started }
}

describe('hôte de partie', () => {
  it('démarre avec le monde et une vue complète', () => {
    const { started } = setup()
    expect(started.world.width).toBe(128)
    expect(started.view.paused).toBe(true)
    expect(started.view.fog?.w).toBe(128)
  })

  it('ne fait rien avancer en pause', () => {
    const { scheduler, host } = setup()
    scheduler.advance(5000)
    expect(host.game?.clock.tick).toBe(0)
  })

  it.each([
    [1, 1],
    [3, 4],
    [5, 36],
  ] as const)('joue environ le bon nombre de mois en 4 s à la vitesse %i', (speed, expected) => {
    const { scheduler, host } = setup()
    host.send({ type: 'setSpeed', speed })
    host.send({ type: 'setPaused', paused: false })
    scheduler.advance(4000)
    const months = host.game!.clock.tick
    expect(months).toBeGreaterThanOrEqual(expected - 1)
    expect(months).toBeLessThanOrEqual(expected)
  })

  it('fait bouger les unités entre deux mois', () => {
    const { scheduler, host, views } = setup()
    const scout = host.game!.units.find((u) => u.kind === 'eclaireur')!
    const from = { x: scout.x, y: scout.y }
    host.send({ type: 'moveUnits', unitIds: [scout.id], x: from.x + 6, y: from.y })
    host.send({ type: 'setPaused', paused: false })
    const count = views.length
    // Un peu plus d'une seconde à la vitesse 1 : pas encore un mois, mais l'éclaireur avance.
    scheduler.advance(1100)
    expect(host.game!.clock.tick).toBe(0)
    expect(views.length).toBeGreaterThan(count)
    const moved = host.game!.units.find((u) => u.id === scout.id)!
    expect(Math.hypot(moved.x - from.x, moved.y - from.y)).toBeGreaterThan(0)
  })

  it('publie une vue après chaque commande acceptée et chaque avance', () => {
    const { scheduler, host, views } = setup()
    host.send({ type: 'setSpeed', speed: 2 })
    expect(views.at(-1)?.speed).toBe(2)
    host.send({ type: 'togglePause' })
    const count = views.length
    scheduler.advance(4000)
    expect(views.length).toBeGreaterThan(count)
    expect(views.at(-1)?.tick).toBeGreaterThan(0)
  })

  it('renvoie le refus d’une commande invalide sans publier', () => {
    const { host, views } = setup()
    const count = views.length
    expect(host.send({ type: 'moveUnits', unitIds: [], x: 1, y: 1 }).ok).toBe(false)
    expect(views.length).toBe(count)
  })

  it('refuse les commandes sans partie et s’arrête proprement', () => {
    const { scheduler, host } = setup()
    host.dispose()
    expect(host.send({ type: 'togglePause' }).ok).toBe(false)
    scheduler.advance(1000)
    expect(host.game).toBeNull()
  })

  it('une nouvelle partie remplace la précédente', () => {
    const { scheduler, host } = setup()
    host.send({ type: 'setPaused', paused: false })
    scheduler.advance(2000)
    host.newGame({ ...options, seed: 'autre' })
    expect(host.game?.clock.tick).toBe(0)
  })
})

describe('sauvegarde par l’hôte', () => {
  it('reprend une partie au même point, en pause, avec une vue complète', () => {
    const { scheduler, host } = setup()
    host.send({ type: 'setPaused', paused: false })
    scheduler.advance(2000)
    const save = host.save()!
    const other = new GameHost(new ManualScheduler())
    const { world, view } = other.load(save)
    expect(world.width).toBe(128)
    expect(view.tick).toBe(save.clock.tick)
    expect(view.paused).toBe(true)
    expect(view.fog?.w).toBe(128)
    expect(view.territory?.w).toBe(128)
  })

  it('sans partie, rien à sauvegarder', () => {
    expect(new GameHost(new ManualScheduler()).save()).toBeNull()
  })
})
