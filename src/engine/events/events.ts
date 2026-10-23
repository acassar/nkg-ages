import { EVENT_KINDS, EVENT_RULES, EVENT_RULES_GLOBAL, type EventKind } from '../content/events'
import type { Rng } from '../core/random'

/** Ce qui rend un événement possible ce mois-ci (une étoile filante sans recherche n'aide pas). */
export interface EventContext {
  month: number
  /** Années écoulées depuis le début de la partie. */
  years: number
  researching: boolean
}

export function eventPossible(kind: EventKind, context: EventContext): boolean {
  const rules = EVENT_RULES[kind]
  if (rules.months && !rules.months.includes(context.month)) return false
  if (rules.harmful && context.years < EVENT_RULES_GLOBAL.graceYears) return false
  if (rules.invention !== undefined && !context.researching) return false
  return true
}

/**
 * Tire l'événement du mois, ou null. Un seul tirage d'aléa par mois, quoi qu'il arrive :
 * la suite des tirages ne dépend pas de ce qui était possible.
 */
export function pickEvent(context: EventContext, rng: Rng): EventKind | null {
  let roll = rng.next()
  for (const kind of EVENT_KINDS) {
    const chance = monthlyChance(kind)
    if (roll < chance) return eventPossible(kind, context) ? kind : null
    roll -= chance
  }
  return null
}

/** Chance par mois où l'événement peut survenir : sur l'année, on retrouve `chancePerYear`. */
export function monthlyChance(kind: EventKind): number {
  const rules = EVENT_RULES[kind]
  return rules.chancePerYear / (rules.months?.length ?? 12)
}
