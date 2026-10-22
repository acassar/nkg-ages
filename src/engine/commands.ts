import type { InventionKind } from './content/inventions'
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
  /** Lance une invention (ou la réinvente pour tenter un meilleur rang). */
  | { type: 'invent'; invention: InventionKind }
  /** L'éclaireur fonde un campement là où il se trouve. */
  | { type: 'foundCamp'; unitId: number }
  /** Forme un chasseur parmi la tribu ; il paraît au camp. */
  | { type: 'recruitHunter' }

export type CommandResult = { ok: true } | { ok: false; reason: string }
