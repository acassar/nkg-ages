import { worldToScreen, type Camera } from '@/render/camera'
import type { DepositView } from '@/views/types'

/** Distance en pixels sous laquelle le pointeur désigne un gisement. */
const HIT_RADIUS = 9

/** Gisement le plus proche du pointeur, s'il est assez près (null sinon). */
export function depositAt(
  deposits: readonly DepositView[],
  camera: Camera,
  x: number,
  y: number,
): DepositView | null {
  let best: DepositView | null = null
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
