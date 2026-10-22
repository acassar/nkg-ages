import type { HostMessage, HostRequest } from '@/host/protocol'
import type { GameView } from '@/views/types'
import type { GameClient } from './client'

/** Ce dont le client a besoin d'un Worker : de quoi le remplacer dans les tests. */
export interface WorkerLike {
  postMessage(message: HostRequest): void
  terminate(): void
  onmessage: ((event: MessageEvent<HostMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
}

const browserWorker = (): WorkerLike =>
  new Worker(new URL('../host/worker.ts', import.meta.url), { type: 'module' })

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

/** Client du navigateur : le moteur tourne dans un Web Worker, l'affichage reste fluide. */
export function createWorkerClient(createWorker: () => WorkerLike = browserWorker): GameClient {
  const worker = createWorker()
  const listeners = new Set<(view: GameView) => void>()
  const failureListeners = new Set<(message: string) => void>()
  const pending = new Map<number, Pending>()
  let nextRequest = 1
  let closed: string | null = null
  let disposed = false

  const failAll = (message: string) => {
    for (const p of pending.values()) p.reject(new Error(message))
    pending.clear()
  }

  const fail = (message: string) => {
    closed = message
    failAll(message)
    for (const l of failureListeners) l(message)
  }

  worker.onmessage = (event) => {
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
      waiting.resolve({ world: message.world, view: message.view })
    else waiting.resolve(message.result)
  }
  worker.onerror = (event) => {
    event.preventDefault?.()
    fail(`Le moteur du jeu s'est arrêté : ${event.message || 'erreur inconnue'}`)
  }
  worker.onmessageerror = () => fail('Message illisible reçu du moteur du jeu')

  const request = <T>(build: (requestId: number) => HostRequest): Promise<T> => {
    if (closed) return Promise.reject(new Error(closed))
    return new Promise<T>((resolve, reject) => {
      const requestId = nextRequest++
      pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject })
      worker.postMessage(build(requestId))
    })
  }

  return {
    newGame: (options) => request((requestId) => ({ kind: 'newGame', requestId, options })),
    send: (command) => request((requestId) => ({ kind: 'command', requestId, command })),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onFailure(listener) {
      failureListeners.add(listener)
      return () => failureListeners.delete(listener)
    },
    dispose() {
      // Après une panne, `closed` est déjà rempli : le Worker doit quand même être arrêté.
      if (disposed) return
      disposed = true
      if (!closed) {
        closed = 'Partie fermée'
        failAll(closed)
        worker.postMessage({ kind: 'dispose' })
      }
      worker.terminate()
      listeners.clear()
      failureListeners.clear()
    },
  }
}
