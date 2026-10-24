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
  /** Lance une invention (ou la réinvente pour tenter un meilleur rang). */
  | { type: 'invent'; invention: InventionKind }
  /** Une bande du joueur part vers ce point, avec ses gens. */
  | { type: 'moveCamp'; campId: number; x: number; y: number }
  /** Une bande trop grande se scinde : la moitié des gens part fonder une autre bande. */
  | { type: 'splitBand'; campId: number }
  /** Une bande migre seule quand ses terres s'épuisent (ou reste où on la met). */
  | { type: 'setRoaming'; campId: number; roaming: boolean }
  /** Offre des vivres à un peuple voisin rencontré (désigné par son numéro de propriétaire). */
  | { type: 'gift'; people: number }
  /** Échange du silex contre des vivres avec un peuple voisin. */
  | { type: 'trade'; people: number }
  /** Fait d'un campement un village (le plus ancien qui ne l'est pas, sans `campId`). */
  | { type: 'buildVillage'; campId?: number }
  /** Fait d'un village une cité (le plus ancien, si aucun n'est donné). */
  | { type: 'buildCity'; campId?: number }

export type CommandResult = { ok: true } | { ok: false; reason: string }
