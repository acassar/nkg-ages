import { larderOf, type GameState } from '@/engine/game'
import { PLAYER } from '@/engine/territory/territory'

/** Réserve du premier campement du joueur (la bande de départ, tant qu'elle est seule). */
export function home(g: GameState) {
  return larderOf(g.camps.find((c) => c.owner === PLAYER)!)
}
