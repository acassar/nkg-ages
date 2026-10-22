import type { GameHost } from './host'
import type { HostMessage, HostRequest } from './protocol'

export type Post = (message: HostMessage, transfer?: Transferable[]) => void

/**
 * Traduit les requêtes du client en appels à l'hôte, et ses réponses en messages.
 * Toute exception devient un message d'erreur rattaché à sa requête : le client n'attend
 * jamais une réponse qui ne viendra pas.
 */
export function createHostEndpoint(host: GameHost, post: Post, close: () => void = () => {}) {
  host.onView((view) => {
    const transfer = [view.fog?.data.buffer, view.territory?.data.buffer].filter(
      (b): b is ArrayBuffer => b instanceof ArrayBuffer,
    )
    post({ kind: 'view', view }, transfer)
  })

  return (request: HostRequest): void => {
    switch (request.kind) {
      case 'newGame':
        try {
          const { world, view } = host.newGame(request.options)
          post({ kind: 'started', requestId: request.requestId, world, view }, [
            world.elevation.buffer as ArrayBuffer,
            world.biome.buffer as ArrayBuffer,
          ])
        } catch (error) {
          post({ kind: 'error', requestId: request.requestId, message: messageOf(error) })
        }
        break
      case 'command':
        try {
          post({ kind: 'result', requestId: request.requestId, result: host.send(request.command) })
        } catch (error) {
          post({ kind: 'error', requestId: request.requestId, message: messageOf(error) })
        }
        break
      case 'dispose':
        host.dispose()
        close()
        break
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
