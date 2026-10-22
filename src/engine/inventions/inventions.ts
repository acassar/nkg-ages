import type { Rank } from '../content/rarity'
import { INVENTION_RULES, INVENTION_WORK, type InventionKind } from '../content/inventions'
import { RESOURCE_RULES, type ResourceKind } from '../content/resources'
import type { Rng } from '../core/random'
import { bestRank, rollRank, statAt, type RankedStat } from '../rarity/rarity'

export interface InventionsState {
  /** Meilleur rang obtenu pour chaque invention faite. */
  ranks: Partial<Record<InventionKind, Rank>>
  /** Nombre de fois qu'une invention a été faite (renchérit la suivante). */
  attempts: Partial<Record<InventionKind, number>>
  /** Recherche en cours, une à la fois. */
  current: { kind: InventionKind; progress: number; work: number } | null
}

export function createInventions(): InventionsState {
  return { ranks: {}, attempts: {}, current: null }
}

/** Coût du prochain essai d'une invention : travail et matériaux. */
export function nextCost(
  state: InventionsState,
  kind: InventionKind,
): { work: number; materials: Partial<Record<ResourceKind, number>> } {
  const factor = INVENTION_WORK.retryFactor ** (state.attempts[kind] ?? 0)
  const rules = INVENTION_RULES[kind]
  const materials: Partial<Record<ResourceKind, number>> = {}
  for (const [k, v] of Object.entries(rules.cost) as [ResourceKind, number][])
    materials[k] = Math.ceil(v * factor)
  return { work: Math.ceil(rules.work * factor), materials }
}

/** Pourquoi l'invention ne peut pas être lancée, ou null si elle le peut. */
export function cannotStart(
  state: InventionsState,
  kind: InventionKind,
  stock: Partial<Record<ResourceKind, number>>,
): string | null {
  if (state.current) return 'Une invention est déjà en cours'
  if (state.ranks[kind] === 'S') return 'Déjà au meilleur rang'
  const missing = (INVENTION_RULES[kind].requires ?? []).filter((k) => !state.ranks[k])
  if (missing.length > 0)
    return `Il faut d'abord : ${missing.map((k) => INVENTION_RULES[k].name).join(', ')}`
  const { materials } = nextCost(state, kind)
  for (const [k, need] of Object.entries(materials) as [ResourceKind, number][])
    if ((stock[k] ?? 0) < need) return `Il faut ${need} ${RESOURCE_RULES[k].name.toLowerCase()}`
  return null
}

/** Lance une invention : prélève les matériaux. À n'appeler que si cannotStart rend null. */
export function startInvention(
  state: InventionsState,
  kind: InventionKind,
  stock: Partial<Record<ResourceKind, number>>,
): void {
  const { work, materials } = nextCost(state, kind)
  for (const [k, need] of Object.entries(materials) as [ResourceKind, number][])
    stock[k] = (stock[k] ?? 0) - need
  state.current = { kind, progress: 0, work }
}

/** Points de travail produits en un mois par la tribu. */
export function workPerMonth(population: number): number {
  if (population <= 0) return 0
  return INVENTION_WORK.base + population / INVENTION_WORK.peoplePerPoint
}

/**
 * Un mois de recherche. Rend l'invention achevée et son rang tiré (le meilleur est
 * gardé), ou null.
 */
export function tickInventions(
  state: InventionsState,
  population: number,
  rng: Rng,
): { kind: InventionKind; rank: Rank } | null {
  const current = state.current
  if (!current) return null
  current.progress += workPerMonth(population)
  if (current.progress < current.work) return null
  const rank = rollRank(rng)
  const kind = current.kind
  const previous = state.ranks[kind]
  state.ranks[kind] = previous ? bestRank(previous, rank) : rank
  state.attempts[kind] = (state.attempts[kind] ?? 0) + 1
  state.current = null
  return { kind, rank }
}

/** Statistique de l'invention au rang obtenu, ou null si elle n'est pas faite. */
export function inventionStat(state: InventionsState, kind: InventionKind): RankedStat | null {
  const rank = state.ranks[kind]
  return rank ? statAt(INVENTION_RULES[kind].range, rank) : null
}

/** Moyenne de la statistique au rang obtenu, 0 si l'invention n'est pas faite. */
export function inventionMean(state: InventionsState, kind: InventionKind): number {
  return inventionStat(state, kind)?.mean ?? 0
}
