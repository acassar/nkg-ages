/// <reference lib="webworker" />
import { GameHost } from './host'
import type { HostMessage, HostRequest } from './protocol'

const scope = self as unknown as DedicatedWorkerGlobalScope
const host = new GameHost()

const post = (message: HostMessage, transfer: Transferable[] = []) =>
  scope.postMessage(message, transfer)

host.onView((view) => {
  const transfer = [view.fog?.data.buffer, view.territory?.data.buffer].filter(
    (b): b is ArrayBuffer => b instanceof ArrayBuffer,
  )
  post({ kind: 'view', view }, transfer)
})

scope.onmessage = (event: MessageEvent<HostRequest>) => {
  const request = event.data
  switch (request.kind) {
    case 'newGame':
      try {
        const { world, view } = host.newGame(request.options)
        post({ kind: 'started', requestId: request.requestId, world, view }, [
          world.elevation.buffer as ArrayBuffer,
          world.biome.buffer as ArrayBuffer,
        ])
      } catch (error) {
        post({ kind: 'error', requestId: request.requestId, message: String(error) })
      }
      break
    case 'command':
      post({ kind: 'result', requestId: request.requestId, result: host.send(request.command) })
      break
    case 'dispose':
      host.dispose()
      scope.close()
      break
  }
}
