import { RANK_RULES, RANKS, type Rank } from '../content/rarity'
import type { Rng } from '../core/random'

const TOTAL_WEIGHT = RANKS.reduce((sum, r) => sum + RANK_RULES[r].weight, 0)

/** Tire un rang selon les poids de rareté. */
export function rollRank(rng: Rng): Rank {
  let roll = rng.next() * TOTAL_WEIGHT
  for (const rank of RANKS) {
    roll -= RANK_RULES[rank].weight
    if (roll < 0) return rank
  }
  return RANKS[0]
}

/** Statistique dynamique : une moyenne et un écart, tirée à chaque usage. */
export interface RankedStat {
  mean: number
  spread: number
}

/** Bornes d'une statistique : sa valeur au rang E et au rang S. */
export interface StatRange {
  e: RankedStat
  s: RankedStat
}

/** Statistique d'un rang, interpolée entre les rangs E et S. */
export function statAt(range: StatRange, rank: Rank): RankedStat {
  const t = RANKS.indexOf(rank) / (RANKS.length - 1)
  return {
    mean: range.e.mean + (range.s.mean - range.e.mean) * t,
    spread: range.e.spread + (range.s.spread - range.e.spread) * t,
  }
}

/** Un tirage de la statistique : uniforme dans [moyenne - écart, moyenne + écart]. */
export function rollStat(stat: RankedStat, rng: Rng): number {
  return stat.mean + rng.range(-stat.spread, stat.spread)
}

/** Le meilleur de deux rangs. */
export function bestRank(a: Rank, b: Rank): Rank {
  return RANKS.indexOf(a) >= RANKS.indexOf(b) ? a : b
}
