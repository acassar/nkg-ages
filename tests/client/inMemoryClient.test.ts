import { describe, expect, it } from 'vitest'
import { createInMemoryClient } from '@/client/inMemoryClient'
import { ManualScheduler } from '@/host/scheduler'
import type { GameView } from '@/views/types'

describe('client de jeu en mémoire', () => {
  it('lance une partie, transmet les commandes et diffuse les vues', async () => {
    const scheduler = new ManualScheduler()
    const client = createInMemoryClient(scheduler)
    const views: GameView[] = []
    const stop = client.subscribe((v) => views.push(v))
    const { world, view } = await client.newGame({
      seed: 'client',
      randomStart: true,
      width: 128,
      height: 64,
    })
    expect(world.biome.length).toBe(128 * 64)
    expect(view.camps.filter((c) => c.mine)).toHaveLength(1)
    expect(await client.send({ type: 'setSpeed', speed: 5 })).toEqual({ ok: true })
    await client.send({ type: 'togglePause' })
    scheduler.advance(4000)
    expect(views.at(-1)?.tick).toBeGreaterThan(30)
    stop()
    const count = views.length
    scheduler.advance(500)
    expect(views.length).toBe(count)
    client.dispose()
  })
})
