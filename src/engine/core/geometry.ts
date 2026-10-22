/** Rectangle de cellules, bornes incluses à gauche, exclues à droite. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b }
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  }
}

/** Rectangle englobant un disque, coupé aux bords de la grille. */
export function discRect(
  cx: number,
  cy: number,
  radius: number,
  width: number,
  height: number,
): Rect | null {
  const x0 = Math.max(0, Math.floor(cx - radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const x1 = Math.min(width, Math.ceil(cx + radius) + 1)
  const y1 = Math.min(height, Math.ceil(cy + radius) + 1)
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}
