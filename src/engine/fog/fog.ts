import { discRect, unionRect, type Rect } from '../core/geometry'

/** État d'une cellule pour le joueur. */
export const Visibility = { Unknown: 0, Seen: 1, Visible: 2 } as const

export interface Viewer {
  x: number
  y: number
  sight: number
}

export interface FogState {
  width: number
  height: number
  cells: Uint8Array
  /** Augmente à chaque changement. */
  version: number
  /** Zone modifiée depuis la dernière lecture par l'hôte. */
  dirty: Rect | null
  /** Zones visibles au tick précédent, à rabaisser en « déjà vu ». */
  lastViewed: Rect[]
}

export function createFog(width: number, height: number): FogState {
  return {
    width,
    height,
    cells: new Uint8Array(width * height),
    version: 0,
    dirty: null,
    lastViewed: [],
  }
}

/**
 * Recalcule la vision : ce qui était visible devient « déjà vu », puis chaque
 * observateur rend visible son disque. Une cellule découverte ne redevient jamais inconnue.
 * Coût proportionnel aux zones vues, pas à la taille du monde.
 */
export function updateFog(fog: FogState, viewers: readonly Viewer[]): void {
  const { width, height, cells } = fog
  let changed = false
  for (const r of fog.lastViewed) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = y * width + x
        if (cells[i] === 2) cells[i] = 1
      }
    }
    fog.dirty = unionRect(fog.dirty, r)
  }
  const viewed: Rect[] = []
  for (const v of viewers) {
    const rect = discRect(v.x, v.y, v.sight, width, height)
    if (!rect) continue
    const r2 = v.sight * v.sight
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const dx = x + 0.5 - v.x
        const dy = y + 0.5 - v.y
        if (dx * dx + dy * dy > r2) continue
        const i = y * width + x
        if (cells[i] !== 2) {
          cells[i] = 2
          changed = true
        }
      }
    }
    viewed.push(rect)
    fog.dirty = unionRect(fog.dirty, rect)
  }
  // Un rabaissement sans nouvelle cellule visible change aussi l'affichage.
  if (changed || fog.lastViewed.length > 0) fog.version++
  fog.lastViewed = viewed
}
