import { ANIMAL_RULES, HUNT_RULES } from '../content/fauna'
import { BAND_RULES } from '../content/bands'
import type { Herd } from '../fauna/fauna'
import { inventionMean, type InventionsState } from '../inventions/inventions'

/** Ce qu'il faut savoir de la partie pour dire ce que voit une bande. */
interface Sighting {
  herds: readonly Herd[]
  inventions: InventionsState
}

/**
 * Cellules que voit un campement du joueur (bande ou village) : ses gens parcourent le pays
 * autour de lui, et le pistage leur fait lire les traces plus loin.
 */
export function bandSight(inventions: InventionsState): number {
  return BAND_RULES.sight + inventionMean(inventions, 'pistage')
}

/**
 * Troupeaux que voit une bande (ou un village) en ce moment, du plus proche au plus loin :
 * ce sont les seuls qu'elle peut chasser.
 */
export function herdsSeenBy(state: Sighting, band: { x: number; y: number }): Herd[] {
  const sight = bandSight(state.inventions)
  const seen: { herd: Herd; d: number }[] = []
  for (const herd of state.herds) {
    const d = Math.hypot(herd.x - band.x, herd.y - band.y)
    if (d <= sight && herd.size > 0) seen.push({ herd, d })
  }
  // À égale distance, l'ordre des troupeaux départage : le résultat ne dépend que de l'état.
  return seen.sort((a, b) => a.d - b.d).map((s) => s.herd)
}

/** Les troupeaux qu'une bande ose chasser seule : pas les plus dangereux. */
export function safePrey(herd: Herd): boolean {
  return ANIMAL_RULES[herd.kind].danger <= HUNT_RULES.maxDanger
}
