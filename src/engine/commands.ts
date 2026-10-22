import type { Speed } from './core/clock'

/**
 * Commandes : la seule façon d'agir sur une partie.
 * Objets sérialisables, donc transmissibles au Worker, rejouables et utilisables par les robots.
 */
export type Command =
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'togglePause' }
  | { type: 'moveUnits'; unitIds: number[]; x: number; y: number }

export type CommandResult = { ok: true } | { ok: false; reason: string }
