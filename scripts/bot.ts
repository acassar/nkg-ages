/**
 * Joueur automatique pour la sonde d'équilibrage. Il joue comme un débutant appliqué :
 * il ne lit que l'état et n'agit que par des commandes, comme l'interface.
 */
import {
  applyCommand,
  cannotBuildCity,
  cannotBuildVillage,
  BAND_RULES,
  bandsOf,
  cannotGift,
  cannotRecruit,
  cannotStart,
  huntersResting,
  INVENTION_KINDS,
  RELATION_RULES,
  type GameState,
} from '../src/engine'

/** Réglages du joueur automatique. */
export const BOT_RULES = {
  /** Offre un présent à un voisin dont la relation tombe sous ce seuil, si les vivres le permettent. */
  giftBelow: RELATION_RULES.raidBelow + 20,
} as const

export interface Bot {
  /** Décide et agit pour ce mois. À appeler avant chaque pas du moteur. */
  play(state: GameState): void
}

export function createBot(_seed: string): Bot {
  return {
    play(state) {
      invent(state)
      grow(state)
      scout(state)
      bands(state)
      recruit(state)
      diplomacy(state)
    },
  }
}

/** Toujours une invention en cours : la moins chère de celles qu'on peut lancer. */
function invent(state: GameState): void {
  if (state.inventions.current) return
  // Les inventions jamais faites d'abord, dans l'ordre du contenu, puis on réinvente.
  const fresh = INVENTION_KINDS.filter((k) => !state.inventions.ranks[k])
  const again = INVENTION_KINDS.filter((k) => state.inventions.ranks[k])
  for (const invention of [...fresh, ...again]) {
    if (cannotStart(state.inventions, invention, state.tribe.materials) !== null) continue
    applyCommand(state, { type: 'invent', invention })
    return
  }
}

/** Villages et cités dès qu'on le peut. */
function grow(state: GameState): void {
  if (cannotBuildCity(state) === null) applyCommand(state, { type: 'buildCity' })
  if (cannotBuildVillage(state) === null) applyCommand(state, { type: 'buildVillage' })
}

/** L'éclaireur oisif part explorer. */
function scout(state: GameState): void {
  const unit = state.units.find((u) => u.kind === 'eclaireur')
  if (!unit || unit.target || unit.explore) return
  applyCommand(state, { type: 'explore', unitIds: [unit.id] })
}

/** Les bandes migrent seules ; une bande qui dépasse sa taille idéale se scinde. */
function bands(state: GameState): void {
  for (const band of bandsOf(state)) {
    if (!band.roaming) applyCommand(state, { type: 'setRoaming', campId: band.id, roaming: true })
    if ((band.members ?? 0) > BAND_RULES.comfortSize)
      applyCommand(state, { type: 'splitBand', campId: band.id })
  }
}

/** Autant de chasseurs que possible, sauf quand la réserve est pleine. */
function recruit(state: GameState): void {
  if (huntersResting(state)) return
  if (cannotRecruit(state) === null) applyCommand(state, { type: 'recruitHunter' })
}

/** Un présent aux voisins qui deviennent hostiles. */
function diplomacy(state: GameState): void {
  for (const people of state.peoples) {
    if (!people.met || people.relation >= BOT_RULES.giftBelow) continue
    if (cannotGift(state, people) === null)
      applyCommand(state, { type: 'gift', people: people.owner })
  }
}
