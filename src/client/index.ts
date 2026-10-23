export type {
  GameClient,
  Command,
  CommandResult,
  InventionKind,
  NewGameOptions,
  SaveData,
} from './client'
export { createWorkerClient } from './workerClient'
export * from '@/views/types'
export { createSaveSlot, memoryStorage } from './saveSlot'
export type { SaveSlot, SaveSummary } from './saveSlot'
// Les choix de l'écran de départ : de simples données, sans le reste du moteur.
export { WORLD_SIZES, GAME_SETUP, type WorldSize } from '@/engine/content/setup'
