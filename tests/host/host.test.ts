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
    [3, 8],
    [5, 72],
  ] as const)('joue environ le bon nombre de ticks en 1 s à la vitesse %i', (speed, expected) => {
    const { scheduler, host } = setup()
    host.send({ type: 'setSpeed', speed })
    host.send({ type: 'setPaused', paused: false })
    scheduler.advance(1000)
    const ticks = host.game!.clock.tick
    expect(ticks).toBeGreaterThanOrEqual(expected - 1)
    expect(ticks).toBeLessThanOrEqual(expected)
  })

  it('publie une vue après chaque commande acceptée et chaque avance', () => {
    const { scheduler, host, views } = setup()
    host.send({ type: 'setSpeed', speed: 2 })
    expect(views.at(-1)?.speed).toBe(2)
    host.send({ type: 'togglePause' })
    const count = views.length
    scheduler.advance(1000)
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
