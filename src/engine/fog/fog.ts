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
  /** Augmente seulement quand au moins une cellule change. */
  version: number
  /** Rectangle englobant les cellules modifiées depuis la dernière lecture par l'hôte. */
  dirty: Rect | null
  /** Zones visibles au calcul précédent : seules candidates au passage en « déjà vu ». */
  lastViewed: Rect[]
  /** Numéro de passage par cellule : vaut `pass` si la cellule est vue à ce calcul. */
  seenAt: Uint32Array
  pass: number
}

export function createFog(width: number, height: number): FogState {
  return {
    width,
    height,
    cells: new Uint8Array(width * height),
    version: 0,
    dirty: null,
    lastViewed: [],
    seenAt: new Uint32Array(width * height),
    pass: 0,
  }
}

/**
 * Recalcule la vision. Une cellule visible qui n'est plus vue passe en « déjà vu »,
 * une cellule vue devient visible ; une cellule découverte ne redevient jamais inconnue.
 * Seules les cellules qui changent réellement élargissent la zone sale : un observateur
 * immobile ne coûte aucune mise à jour d'affichage.
 * Coût proportionnel aux zones vues, pas à la taille du monde.
 */
export function updateFog(fog: FogState, viewers: readonly Viewer[]): void {
  const { width, height, cells, seenAt } = fog
  const pass = ++fog.pass
  const viewed: Rect[] = []
  // 1. Marque ce que les observateurs voient à ce calcul.
  for (const v of viewers) {
    const rect = discRect(v.x, v.y, v.sight, width, height)
    if (!rect) continue
    const r2 = v.sight * v.sight
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const dx = x + 0.5 - v.x
        const dy = y + 0.5 - v.y
        if (dx * dx + dy * dy <= r2) seenAt[y * width + x] = pass
      }
    }
    viewed.push(rect)
  }

  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const touch = (x: number, y: number) => {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  // 2. Ce qui était visible et ne l'est plus passe en « déjà vu ».
  for (const r of fog.lastViewed) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = y * width + x
        if (cells[i] === Visibility.Visible && seenAt[i] !== pass) {
          cells[i] = Visibility.Seen
          touch(x, y)
        }
      }
    }
  }
  // 3. Ce qui est vu devient visible.
  for (const r of viewed) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = y * width + x
        if (seenAt[i] === pass && cells[i] !== Visibility.Visible) {
          cells[i] = Visibility.Visible
          touch(x, y)
        }
      }
    }
  }
  fog.lastViewed = viewed
  if (x1 >= x0) {
    fog.version++
    fog.dirty = unionRect(fog.dirty, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 })
  }
}
