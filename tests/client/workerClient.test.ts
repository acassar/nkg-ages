import { describe, expect, it, vi } from 'vitest'
import { createWorkerClient, type WorkerLike } from '@/client/workerClient'
import { createHostEndpoint } from '@/host/endpoint'
import { GameHost } from '@/host/host'
import type { HostMessage, HostRequest } from '@/host/protocol'
import { ManualScheduler } from '@/host/scheduler'
import type { GameView } from '@/views/types'

const options = { seed: 'worker', randomStart: false, width: 128, height: 64 }

/** Faux Worker : relie le client à un vrai hôte, messages livrés de façon asynchrone. */
class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<HostMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  readonly received: HostRequest[] = []
  terminated = false
  /** Si vrai, le « worker » ne répond plus (requêtes en suspens). */
  silent = false
  private readonly handle: (request: HostRequest) => void

  constructor(readonly host: GameHost) {
    this.handle = createHostEndpoint(host, (message) =>
      queueMicrotask(() => this.onmessage?.({ data: message } as MessageEvent<HostMessage>)),
    )
  }

  postMessage(request: HostRequest): void {
    this.received.push(request)
    if (!this.silent) queueMicrotask(() => this.handle(request))
  }

  terminate(): void {
    this.terminated = true
  }

  crash(message: string): void {
    this.onerror?.({ message, preventDefault: () => {} } as ErrorEvent)
  }
}

function setup(host = new GameHost(new ManualScheduler())) {
  const worker = new FakeWorker(host)
  const client = createWorkerClient(() => worker)
  return {
    worker,
    client,
    host,
    scheduler: (host as unknown as { scheduler: ManualScheduler }).scheduler,
  }
}

describe('client de jeu par Worker', () => {
  it('lance une partie, transmet les commandes et diffuse les vues', async () => {
    const { client, scheduler } = setup()
    const views: GameView[] = []
    client.subscribe((v) => views.push(v))
    const { world, view } = await client.newGame(options)
    expect(world.width).toBe(128)
    expect(view.tick).toBe(0)
    expect(await client.send({ type: 'setSpeed', speed: 5 })).toEqual({ ok: true })
    await client.send({ type: 'togglePause' })
    scheduler.advance(500)
    await Promise.resolve()
    expect(views.at(-1)?.tick).toBeGreaterThan(0)
  })

  it('sauvegarde la partie et la reprend par le Worker', async () => {
    const { client, scheduler } = setup()
    await client.newGame(options)
    await client.send({ type: 'togglePause' })
    scheduler.advance(1000)
    const save = await client.save()
    expect(save?.options.seed).toBe('worker')
    const other = setup().client
    const { view } = await other.load(JSON.parse(JSON.stringify(save)))
    expect(view.tick).toBe(save!.clock.tick)
    await expect(other.load({ ...save!, version: 0 })).rejects.toThrow(/autre version/)
  })

  it('transmet le refus d’une commande', async () => {
    const { client } = setup()
    await client.newGame(options)
    const result = await client.send({ type: 'moveCamp', campId: 999, x: 1, y: 1 })
    expect(result.ok).toBe(false)
  })

  it('rejette la requête quand l’hôte lève une exception, au lieu de la laisser figée', async () => {
    const host = new GameHost(new ManualScheduler())
    host.send = () => {
      throw new Error('panne interne')
    }
    const { client } = setup(host)
    await client.newGame(options)
    await expect(client.send({ type: 'togglePause' })).rejects.toThrow('panne interne')
  })

  it('rejette une partie impossible à créer', async () => {
    const host = new GameHost(new ManualScheduler())
    host.newGame = () => {
      throw new Error('aucun départ')
    }
    const { client } = setup(host)
    await expect(client.newGame(options)).rejects.toThrow('aucun départ')
  })

  it('signale une panne du Worker et rejette les requêtes en cours et suivantes', async () => {
    const { client, worker } = setup()
    const failures: string[] = []
    client.onFailure((m) => failures.push(m))
    worker.silent = true
    const waiting = client.newGame(options)
    worker.crash('boom')
    await expect(waiting).rejects.toThrow('boom')
    expect(failures).toHaveLength(1)
    await expect(client.send({ type: 'togglePause' })).rejects.toThrow('boom')
  })

  it('à la fermeture, rejette les requêtes en attente et arrête le Worker', async () => {
    const { client, worker } = setup()
    worker.silent = true
    const waiting = client.send({ type: 'togglePause' })
    client.dispose()
    await expect(waiting).rejects.toThrow('Partie fermée')
    expect(worker.terminated).toBe(true)
    expect(worker.received.at(-1)).toEqual({ kind: 'dispose' })
    await expect(client.send({ type: 'togglePause' })).rejects.toThrow()
    client.dispose()
    expect(worker.received.filter((r) => r.kind === 'dispose')).toHaveLength(1)
  })

  it('arrête le Worker à la fermeture, même après une panne', async () => {
    const { client, worker } = setup()
    worker.crash('boom')
    client.dispose()
    expect(worker.terminated).toBe(true)
    // Le Worker en panne ne reçoit pas de demande de fermeture.
    expect(worker.received.some((r) => r.kind === 'dispose')).toBe(false)
  })

  it('ignore une réponse à une requête inconnue', async () => {
    const { worker, client } = setup()
    const spy = vi.fn()
    client.subscribe(spy)
    worker.onmessage?.({
      data: { kind: 'result', requestId: 999, result: { ok: true } },
    } as MessageEvent<HostMessage>)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("point d'entrée de l'hôte", () => {
  it('ferme l’hôte et le Worker sur demande', () => {
    const host = new GameHost(new ManualScheduler())
    const close = vi.fn()
    const handle = createHostEndpoint(host, () => {}, close)
    handle({ kind: 'newGame', requestId: 1, options })
    handle({ kind: 'dispose' })
    expect(close).toHaveBeenCalled()
    expect(host.game).toBeNull()
  })
})
