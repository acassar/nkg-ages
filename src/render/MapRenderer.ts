import type { CampView, DepositView, GameView, UnitView, WorldSnapshot } from '@/views/types'
import type { Camera } from './camera'

/** Ce que la carte affiche par-dessus le terrain. */
export interface OverlayState {
  deposits: readonly DepositView[]
  units: readonly UnitView[]
  camps: readonly CampView[]
  selected: ReadonlySet<number>
}

/**
 * Contrat du rendu de la carte. L'interface ne connaît que lui :
 * l'implémentation WebGL peut être remplacée sans toucher au reste.
 */
export interface MapRenderer {
  setWorld(world: WorldSnapshot): void
  /** Applique les zones modifiées (brouillard, territoire) d'une vue. */
  applyView(view: GameView): void
  resize(cssWidth: number, cssHeight: number, pixelRatio: number): void
  render(camera: Camera, overlay: OverlayState): void
  dispose(): void
}
