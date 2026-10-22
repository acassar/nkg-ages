import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'
import {
  createWorkerClient,
  type Command,
  type GameClient,
  type GameView,
  type NewGameOptions,
  type Speed,
  type WorldSnapshot,
} from '@/client'

let clientFactory: () => GameClient = createWorkerClient

/** Pour les tests : remplace le client du navigateur (Worker) par un autre. */
export function useClientFactory(factory: () => GameClient): void {
  clientFactory = factory
}

type ViewListener = (view: GameView) => void

/**
 * Pont entre l'interface et le jeu. Il ne contient aucune règle :
 * il transmet des intentions au client et garde la dernière vue reçue.
 */
export const useGameStore = defineStore('game', () => {
  const world = shallowRef<WorldSnapshot | null>(null)
  const view = shallowRef<GameView | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(false)
  const selected = ref<Set<number>>(new Set())
  const viewListeners = new Set<ViewListener>()
  let client: GameClient | null = null
  let unsubscribe: (() => void) | null = null

  function receive(next: GameView) {
    view.value = markRaw(next)
    for (const listener of viewListeners) listener(next)
  }

  async function newGame(options: NewGameOptions) {
    loading.value = true
    error.value = null
    try {
      unsubscribe?.()
      client?.dispose()
      client = clientFactory()
      unsubscribe = client.subscribe(receive)
      const started = await client.newGame(options)
      world.value = markRaw(started.world)
      selected.value = new Set(started.view.units.map((u) => u.id))
      receive(started.view)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function send(command: Command) {
    if (!client) return
    const result = await client.send(command)
    if (!result.ok) error.value = result.reason
  }

  /** Les composants de rendu s'abonnent ici pour appliquer les zones modifiées. */
  function onView(listener: ViewListener): () => void {
    viewListeners.add(listener)
    return () => viewListeners.delete(listener)
  }

  const setSpeed = (speed: Speed) => send({ type: 'setSpeed', speed })
  const togglePause = () => send({ type: 'togglePause' })
  const setPaused = (paused: boolean) => send({ type: 'setPaused', paused })

  function select(ids: number[]) {
    selected.value = new Set(ids)
  }

  function moveSelectedTo(x: number, y: number) {
    const unitIds = [...selected.value]
    if (unitIds.length === 0) return
    return send({ type: 'moveUnits', unitIds, x, y })
  }

  function quit() {
    unsubscribe?.()
    client?.dispose()
    client = null
    world.value = null
    view.value = null
  }

  return {
    world,
    view,
    error,
    loading,
    selected,
    newGame,
    send,
    onView,
    setSpeed,
    togglePause,
    setPaused,
    select,
    moveSelectedTo,
    quit,
  }
})
