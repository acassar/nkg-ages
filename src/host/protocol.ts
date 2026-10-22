import type { Command, CommandResult, NewGameOptions } from '@/engine'
import type { GameView, WorldSnapshot } from '@/views/types'

/** Messages entre le client de jeu et l'hôte (Worker ou même fil). */
export type HostRequest =
  | { kind: 'newGame'; requestId: number; options: NewGameOptions }
  | { kind: 'command'; requestId: number; command: Command }
  | { kind: 'dispose' }

export type HostMessage =
  | { kind: 'started'; requestId: number; world: WorldSnapshot; view: GameView }
  | { kind: 'result'; requestId: number; result: CommandResult }
  | { kind: 'view'; view: GameView }
  | { kind: 'error'; requestId: number; message: string }
