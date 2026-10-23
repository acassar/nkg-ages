import { worldToScreen, type Camera } from '@/render/camera'
import type { DepositView, WonderView } from '@/views/types'

/** Distance en pixels sous laquelle le pointeur désigne un gisement. */
const HIT_RADIUS = 9

/** Gisement (ou merveille) le plus proche du pointeur, s'il est assez près (null sinon). */
export function depositAt<T extends { x: number; y: number }>(
  deposits: readonly T[],
  camera: Camera,
  x: number,
  y: number,
): T | null {
  let best: T | null = null
  let bestDistance = HIT_RADIUS
  for (const d of deposits) {
    const s = worldToScreen(camera, d.x, d.y)
    const distance = Math.hypot(s.x - x, s.y - y)
    if (distance < bestDistance) {
      best = d
      bestDistance = distance
    }
  }
  return best
}

const amount = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** Description d'un gisement pour l'infobulle. */
export function describeDeposit(d: DepositView): string {
  const unit = d.category === 'food' ? 'rations' : 'unités'
  const state = d.held ? 'exploité par la tribu' : 'hors du territoire'
  return `${d.name} · rang ${d.rank} · ${amount.format(d.yield)} ${unit}/mois · ${state}`
}

/** Description d'une merveille pour l'infobulle. */
export function describeWonder(w: WonderView): string {
  const state = w.held ? 'sur vos terres' : 'hors du territoire'
  return `${w.name} · merveille · ${w.description} · ${state}`
}
