import { SCORE_RULES, type EraGoal } from '../content/eras'
import { RANK_RULES, type Rank } from '../content/rarity'

/** Ce que l'on compte d'une partie, sans dépendre de l'état complet. */
export interface Tally {
  population: number
  territoryCells: number
  camps: number
  /** Rangs des inventions faites. */
  inventions: readonly Rank[]
  years: number
}

export interface GoalStep {
  /** Ce qui est compté, et la cible. */
  kind: keyof EraGoal
  have: number
  need: number
}

/** Avancement vers l'objectif de l'ère, élément par élément. */
export function goalSteps(goal: EraGoal, tally: Tally): GoalStep[] {
  return [
    { kind: 'population', have: tally.population, need: goal.population },
    { kind: 'camps', have: tally.camps, need: goal.camps },
    { kind: 'inventions', have: tally.inventions.length, need: goal.inventions },
  ]
}

export function goalReached(goal: EraGoal, tally: Tally): boolean {
  return goalSteps(goal, tally).every((s) => s.have >= s.need)
}

/** Score de la partie ; `wonAtYear` ajoute le bonus de victoire, plus fort s'il est tôt. */
export function scoreOf(
  tally: Tally,
  wonAtYear: number | null = null,
  rules = SCORE_RULES,
): number {
  let score =
    tally.population * rules.perPerson +
    Math.floor(tally.territoryCells / 10) * rules.perTenCells +
    tally.camps * rules.perCamp +
    tally.inventions.reduce((sum, r) => sum + rules.perInvention * RANK_RULES[r].power, 0) +
    Math.floor(tally.years) * rules.perYear
  if (wonAtYear !== null) score += rules.victory * 0.5 ** (wonAtYear / rules.victoryHalfLifeYears)
  return Math.round(score)
}
