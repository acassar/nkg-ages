import type { Command, CommandResult, NewGameOptions, SaveData } from '@/engine'
import type { GameView, WorldSnapshot } from '@/views/types'

/** Messages entre le client de jeu et l'hôte (Worker ou même fil). */
export type HostRequest =
  | { kind: 'newGame'; requestId: number; options: NewGameOptions }
  | { kind: 'load'; requestId: number; save: SaveData }
  | { kind: 'command'; requestId: number; command: Command }
  | { kind: 'save'; requestId: number }
  | { kind: 'dispose' }

export type HostMessage =
  | { kind: 'started'; requestId: number; world: WorldSnapshot; view: GameView }
  | { kind: 'result'; requestId: number; result: CommandResult }
  | { kind: 'saved'; requestId: number; save: SaveData | null }
  | { kind: 'view'; view: GameView }
  | { kind: 'error'; requestId: number; message: string }
