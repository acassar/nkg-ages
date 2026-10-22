import type { Command, CommandResult, NewGameOptions } from '@/engine'
import type { GameView, WorldSnapshot } from '@/views/types'

export type { Command, CommandResult, NewGameOptions }

/**
 * Seul point d'entrée de l'interface vers le jeu : on envoie des commandes,
 * on reçoit des vues. L'implémentation (Worker, même fil) est interchangeable.
 */
export interface GameClient {
  newGame(options: NewGameOptions): Promise<{ world: WorldSnapshot; view: GameView }>
  send(command: Command): Promise<CommandResult>
  subscribe(listener: (view: GameView) => void): () => void
  dispose(): void
}
