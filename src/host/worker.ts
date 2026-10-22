/// <reference lib="webworker" />
import { createHostEndpoint } from './endpoint'
import { GameHost } from './host'
import type { HostRequest } from './protocol'

const scope = self as unknown as DedicatedWorkerGlobalScope
const handle = createHostEndpoint(
  new GameHost(),
  (message, transfer = []) => scope.postMessage(message, transfer),
  () => scope.close(),
)
scope.onmessage = (event: MessageEvent<HostRequest>) => handle(event.data)
