import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'
import {
  createSaveSlot,
  createWorkerClient,
  type Command,
  type GameClient,
  type GameView,
  type InventionKind,
  type NewGameOptions,
  type SaveData,
  type SaveSlot,
  type SaveSummary,
  type Speed,
  type WorldSnapshot,
} from '@/client'

let clientFactory: () => GameClient = createWorkerClient
let slotFactory: () => SaveSlot = () => createSaveSlot()

/** Pour les tests : remplace le client du navigateur (Worker) par un autre. */
export function useClientFactory(factory: () => GameClient): void {
  clientFactory = factory
}

/** Pour les tests : remplace l'emplacement de sauvegarde (localStorage) par un autre. */
export function useSaveSlotFactory(factory: () => SaveSlot): void {
  slotFactory = factory
}

/** Intervalle de la sauvegarde automatique, en temps réel (ms). */
export const AUTOSAVE_MS = 20_000

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
  const slot = slotFactory()
  /** Partie à reprendre, montrée sur l'écran d'accueil. */
  const savedGame = shallowRef<SaveSummary | null>(slot.summary())
  let client: GameClient | null = null
  let autosaveTimer: ReturnType<typeof setInterval> | null = null
  let saving = false
  let unsubscribe: (() => void) | null = null
  let errorTimer: ReturnType<typeof setTimeout> | null = null

  /** Affiche un message ; `transient` : il s'efface seul (refus d'une commande en jeu). */
  function report(message: string | null, transient = false) {
    if (errorTimer) clearTimeout(errorTimer)
    errorTimer = null
    error.value = message
    if (message && transient) errorTimer = setTimeout(() => (error.value = null), 4000)
  }

  /** Lâche la partie ; `keep` : elle est d'abord rangée, puis fermée une fois la sauvegarde reçue. */
  function disconnect(keep = false) {
    if (autosaveTimer) clearInterval(autosaveTimer)
    autosaveTimer = null
    unsubscribe?.()
    unsubscribe = null
    const old = client
    client = null
    if (!old) return
    if (keep) void storeFrom(old).finally(() => old.dispose())
    else old.dispose()
  }

  function receive(next: GameView) {
    view.value = markRaw(next)
    // Une tribu disparue ne se reprend pas : on oublie sa sauvegarde.
    if (next.outcome?.type === 'defeat') forgetSave()
    const notice = next.notices.at(-1)
    if (notice) report(notice, true)
    for (const listener of viewListeners) listener(next)
  }

  function forgetSave() {
    slot.clear()
    savedGame.value = null
  }

  /** Range la partie en cours. Sans effet hors partie, après une défaite ou si le stockage refuse. */
  async function saveNow() {
    if (client) await storeFrom(client)
  }

  async function storeFrom(current: GameClient) {
    // La date est lue tout de suite : la vue peut être effacée avant la réponse.
    const label = view.value?.dateLabel
    if (!saving || !label || view.value?.outcome?.type === 'defeat') return
    try {
      const save = await current.save()
      if (save && slot.write(save, label)) savedGame.value = slot.summary()
    } catch {
      // Partie fermée entre-temps : rien à ranger.
    }
  }

  /** `autosave` faux : partie jetable (mesures), qui ne remplace pas la sauvegarde du joueur. */
  const newGame = (options: NewGameOptions, autosave = true) =>
    open((c) => c.newGame(options), autosave)

  /** Reprend la partie sauvegardée ; une sauvegarde illisible est oubliée. */
  async function resume() {
    const save = slot.read()
    if (!save) {
      forgetSave()
      return report('Aucune partie à reprendre')
    }
    await open((c) => c.load(save as SaveData))
    if (!client) forgetSave()
  }

  async function open(
    start: (c: GameClient) => Promise<{ world: WorldSnapshot; view: GameView }>,
    autosave = true,
  ) {
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
      const started = await start(current)
      world.value = markRaw(started.world)
      selected.value = new Set(started.view.units.map((u) => u.id))
      receive(started.view)
      saving = autosave
      if (autosave) autosaveTimer = setInterval(() => void saveNow(), AUTOSAVE_MS)
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
  const buildVillage = () => send({ type: 'buildVillage' })
  const gift = (people: number) => send({ type: 'gift', people })
  const trade = (people: number) => send({ type: 'trade', people })

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

  /** Quitte vers l'accueil ; la partie est rangée d'abord pour pouvoir la reprendre. */
  function quit() {
    disconnect(true)
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
    savedGame,
    newGame,
    resume,
    saveNow,
    send,
    onView,
    setSpeed,
    togglePause,
    setPaused,
    select,
    toggleSelected,
    invent,
    recruitHunter,
    buildVillage,
    gift,
    trade,
    foundCamp,
    moveSelectedTo,
    quit,
    dismissError,
  }
})
