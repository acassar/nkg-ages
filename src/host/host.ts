import {
  applyCommand,
  clearDirty,
  createGame,
  loadGame,
  saveGame,
  step,
  ticksDue,
  type Command,
  type CommandResult,
  type GameState,
  type NewGameOptions,
  type SaveData,
} from '@/engine'
import { buildGameView, buildWorldSnapshot } from '@/views/selectors'
import type { GameView, WorldSnapshot } from '@/views/types'
import { realScheduler, type Scheduler } from './scheduler'

/** Cadence de la boucle de l'hôte (ms). */
export const FRAME_MS = 16

/**
 * Hôte d'une partie : fait avancer le moteur en temps réel selon la vitesse,
 * applique les commandes et publie les vues. Ne connaît ni l'interface ni le rendu.
 */
export class GameHost {
  private state: GameState | null = null
  private carry = 0
  private last = 0
  private stop: (() => void) | null = null
  private readonly listeners = new Set<(view: GameView) => void>()

  constructor(private readonly scheduler: Scheduler = realScheduler) {}

  newGame(options: NewGameOptions): { world: WorldSnapshot; view: GameView } {
    return this.start(createGame(options))
  }

  /** Reprend une partie sauvegardée, en pause : le joueur relance quand il est prêt. */
  load(save: SaveData): { world: WorldSnapshot; view: GameView } {
    const state = loadGame(save)
    state.clock.paused = true
    return this.start(state)
  }

  /** Photographie de la partie en cours, à ranger où le client veut. */
  save(): SaveData | null {
    return this.state ? saveGame(this.state) : null
  }

  private start(state: GameState): { world: WorldSnapshot; view: GameView } {
    this.stop?.()
    this.state = state
    this.carry = 0
    const world = buildWorldSnapshot(state)
    const view = buildGameView(state, true)
    clearDirty(state)
    this.last = this.scheduler.now()
    this.stop = this.scheduler.every(FRAME_MS, () => this.frame())
    return { world, view }
  }

  send(command: Command): CommandResult {
    if (!this.state) return { ok: false, reason: 'Aucune partie en cours' }
    const result = applyCommand(this.state, command)
    if (result.ok) this.publish()
    return result
  }

  onView(listener: (view: GameView) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Accès en lecture pour les tests et les robots ; l'interface ne l'utilise jamais. */
  get game(): Readonly<GameState> | null {
    return this.state
  }

  dispose(): void {
    this.stop?.()
    this.stop = null
    this.state = null
    this.listeners.clear()
  }

  private frame(): void {
    const state = this.state
    if (!state) return
    const now = this.scheduler.now()
    const due = ticksDue(state.clock, now - this.last, this.carry)
    this.last = now
    this.carry = due.carry
    for (let i = 0; i < due.ticks; i++) step(state)
    if (due.ticks > 0) this.publish()
  }

  private publish(): void {
    const state = this.state
    if (!state) return
    const view = buildGameView(state)
    clearDirty(state)
    for (const listener of this.listeners) listener(view)
  }
}
