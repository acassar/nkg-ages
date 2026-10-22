import { GameHost } from '@/host/host'
import type { Scheduler } from '@/host/scheduler'
import type { GameClient } from './client'

/** Client qui fait tourner l'hôte dans le même fil : tests, robots, outils. */
export function createInMemoryClient(scheduler?: Scheduler): GameClient & { host: GameHost } {
  const host = new GameHost(scheduler)
  return {
    host,
    newGame: async (options) => host.newGame(options),
    send: async (command) => host.send(command),
    subscribe: (listener) => host.onView(listener),
    // Dans le même fil, une panne remonte directement comme exception.
    onFailure: () => () => {},
    dispose: () => host.dispose(),
  }
}
