import { ACHIEVEMENTS, type AchievementFact } from '../content/achievements'

/** Ce que mesurent les succès, relevé sur la partie. */
export type AchievementFacts = Readonly<Record<AchievementFact, number>>

/**
 * Inscrit les succès nouvellement atteints (au tick donné) et les rend, dans l'ordre des
 * données. Un succès déjà acquis ne revient jamais.
 */
export function unlockAchievements(
  unlocked: Record<string, number>,
  facts: AchievementFacts,
  tick: number,
): string[] {
  const fresh: string[] = []
  for (const a of ACHIEVEMENTS) {
    if (unlocked[a.id] !== undefined || facts[a.fact] < a.atLeast) continue
    unlocked[a.id] = tick
    fresh.push(a.id)
  }
  return fresh
}
