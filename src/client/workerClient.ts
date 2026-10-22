import type { HostMessage, HostRequest } from '@/host/protocol'
import type { GameView, WorldSnapshot } from '@/views/types'
import type { CommandResult, GameClient } from './client'

type Pending = { resolve: (value: never) => void; reject: (error: Error) => void }

/** Client du navigateur : le moteur tourne dans un Web Worker, l'affichage reste fluide. */
export function createWorkerClient(): GameClient {
  const worker = new Worker(new URL('../host/worker.ts', import.meta.url), { type: 'module' })
  const listeners = new Set<(view: GameView) => void>()
  const pending = new Map<number, Pending>()
  let nextRequest = 1

  worker.onmessage = (event: MessageEvent<HostMessage>) => {
    const message = event.data
    if (message.kind === 'view') {
      for (const l of listeners) l(message.view)
      return
    }
    const waiting = pending.get(message.requestId)
    if (!waiting) return
    pending.delete(message.requestId)
    if (message.kind === 'error') waiting.reject(new Error(message.message))
    else if (message.kind === 'started')
      (waiting.resolve as (v: { world: WorldSnapshot; view: GameView }) => void)({
        world: message.world,
        view: message.view,
      })
    else (waiting.resolve as (v: CommandResult) => void)(message.result)
  }

  const request = <T>(build: (requestId: number) => HostRequest): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const requestId = nextRequest++
      pending.set(requestId, { resolve: resolve as (value: never) => void, reject })
      worker.postMessage(build(requestId))
    })

  return {
    newGame: (options) => request((requestId) => ({ kind: 'newGame', requestId, options })),
    send: (command) => request((requestId) => ({ kind: 'command', requestId, command })),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      worker.postMessage({ kind: 'dispose' } satisfies HostRequest)
      worker.terminate()
      listeners.clear()
    },
  }
}
