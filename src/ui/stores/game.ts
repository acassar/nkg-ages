import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'
import {
  createWorkerClient,
  type Command,
  type GameClient,
  type GameView,
  type InventionKind,
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
  let errorTimer: ReturnType<typeof setTimeout> | null = null

  /** Affiche un message ; `transient` : il s'efface seul (refus d'une commande en jeu). */
  function report(message: string | null, transient = false) {
    if (errorTimer) clearTimeout(errorTimer)
    errorTimer = null
    error.value = message
    if (message && transient) errorTimer = setTimeout(() => (error.value = null), 4000)
  }

  function disconnect() {
    unsubscribe?.()
    unsubscribe = null
    client?.dispose()
    client = null
  }

  function receive(next: GameView) {
    view.value = markRaw(next)
    const notice = next.notices.at(-1)
    if (notice) report(notice, true)
    for (const listener of viewListeners) listener(next)
  }

  async function newGame(options: NewGameOptions) {
    loading.value = true
    report(null)
    try {
      disconnect()
      const current = clientFactory()
      client = current
      const stopViews = current.subscribe(receive)
      const stopFailures = current.onFailure((message) => report(message))
      unsubscribe = () => {
        stopViews()
        stopFailures()
      }
      const started = await current.newGame(options)
      world.value = markRaw(started.world)
      selected.value = new Set(started.view.units.map((u) => u.id))
      receive(started.view)
    } catch (e) {
      disconnect()
      world.value = null
      view.value = null
      report(e instanceof Error ? e.message : String(e))
    } finally {
      loading.value = false
    }
  }

  async function send(command: Command) {
    const current = client
    if (!current) return
    try {
      const result = await current.send(command)
      // Réponse d'une partie quittée ou remplacée entre-temps : on l'ignore.
      if (client !== current) return
      if (!result.ok) report(result.reason, true)
    } catch (e) {
      if (client !== current) return
      report(e instanceof Error ? e.message : String(e))
    }
  }

  /** Les composants de rendu s'abonnent ici pour appliquer les zones modifiées. */
  function onView(listener: ViewListener): () => void {
    viewListeners.add(listener)
    return () => viewListeners.delete(listener)
  }

  const setSpeed = (speed: Speed) => send({ type: 'setSpeed', speed })
  const togglePause = () => send({ type: 'togglePause' })
  const setPaused = (paused: boolean) => send({ type: 'setPaused', paused })
  const invent = (invention: string) =>
    send({ type: 'invent', invention: invention as InventionKind })
  const recruitHunter = () => send({ type: 'recruitHunter' })

  /** Le premier éclaireur choisi fonde un campement là où il se tient. */
  function foundCamp() {
    const scout = view.value?.units.find((u) => selected.value.has(u.id) && u.foundCamp)
    if (!scout) return report('Choisissez un éclaireur pour fonder un campement', true)
    return send({ type: 'foundCamp', unitId: scout.id })
  }

  function select(ids: number[]) {
    selected.value = new Set(ids)
  }

  function toggleSelected(id: number) {
    const next = new Set(selected.value)
    if (!next.delete(id)) next.add(id)
    selected.value = next
  }

  function moveSelectedTo(x: number, y: number) {
    const unitIds = [...selected.value]
    if (unitIds.length === 0) return
    return send({ type: 'moveUnits', unitIds, x, y })
  }

  function quit() {
    disconnect()
    world.value = null
    view.value = null
    selected.value = new Set()
    report(null)
  }

  const dismissError = () => report(null)

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
    toggleSelected,
    invent,
    recruitHunter,
    foundCamp,
    moveSelectedTo,
    quit,
    dismissError,
  }
})
