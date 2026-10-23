/**
 * Joueur automatique pour la sonde d'équilibrage. Il joue comme un débutant appliqué :
 * il ne lit que l'état et n'agit que par des commandes, comme l'interface.
 */
import {
  applyCommand,
  cannotBuildCity,
  cannotBuildVillage,
  cannotFoundCamp,
  cannotGift,
  cannotRecruit,
  cannotStart,
  CAMP_RULES,
  huntersResting,
  INVENTION_KINDS,
  PLAYER,
  RELATION_RULES,
  type GameState,
} from '../src/engine'
import { createRng, type Rng } from '../src/engine/core/random'

/** Réglages du joueur automatique. */
export const BOT_RULES = {
  /** Distance visée d'un nouveau campement, en multiples de la distance minimale. */
  campDistance: [1.1, 1.8],
  /** Essais de destination par mois quand l'éclaireur est oisif. */
  tries: 12,
  /** Offre un présent à un voisin dont la relation tombe sous ce seuil, si les vivres le permettent. */
  giftBelow: RELATION_RULES.raidBelow + 20,
} as const

export interface Bot {
  /** Décide et agit pour ce mois. À appeler avant chaque pas du moteur. */
  play(state: GameState): void
}

export function createBot(seed: string): Bot {
  const rng = createRng(`bot:${seed}`)
  return {
    play(state) {
      invent(state)
      grow(state)
      scout(state, rng)
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

/** L'éclaireur fonde un campement dès qu'il le peut ; oisif, il part vers un nouveau site. */
function scout(state: GameState, rng: Rng): void {
  const unit = state.units.find((u) => u.kind === 'eclaireur')
  if (!unit) return
  if (cannotFoundCamp(state, unit) === null) {
    applyCommand(state, { type: 'foundCamp', unitId: unit.id })
    return
  }
  if (unit.target) return
  const camps = state.camps.filter((c) => c.owner === PLAYER)
  const home = rng.pick(camps)
  const [near, far] = BOT_RULES.campDistance
  for (let i = 0; i < BOT_RULES.tries; i++) {
    const angle = rng.next() * Math.PI * 2
    const r = CAMP_RULES.minDistance * (near + rng.next() * (far - near))
    const x = home.x + Math.cos(angle) * r
    const y = home.y + Math.sin(angle) * r
    if (applyCommand(state, { type: 'moveUnits', unitIds: [unit.id], x, y }).ok) return
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
