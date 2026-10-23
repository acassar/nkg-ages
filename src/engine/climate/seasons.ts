import { CLIMATE_RULES, SEASON_KINDS, SEASON_RULES, type SeasonKind } from '../content/seasons'

/** Saison d'un mois (0 = janvier). */
export function seasonOf(month: number): SeasonKind {
  const m = ((month % 12) + 12) % 12
  return SEASON_KINDS.find((k) => SEASON_RULES[k].months.includes(m))!
}

/** Saison qui commence ce mois-ci, ou null au milieu d'une saison. */
export function seasonStarting(month: number): SeasonKind | null {
  const kind = seasonOf(month)
  return SEASON_RULES[kind].months[0] === ((month % 12) + 12) % 12 ? kind : null
}

/** Force des saisons selon la température (0 glacial, 1 tropical) : le froid les creuse. */
export function climateAmplitude(temperature: number): number {
  const { minAmplitude, coldAmplitude, maxAmplitude } = CLIMATE_RULES
  const cold = 1 - Math.min(1, Math.max(0, temperature))
  return Math.min(maxAmplitude, minAmplitude + cold * coldAmplitude)
}

/** Multiplicateur de cueillette du mois (1 = la moyenne de l'année). */
export function seasonalYield(month: number, amplitude: number): number {
  return Math.max(0, 1 + SEASON_RULES[seasonOf(month)].swing * amplitude)
}

/**
 * Part de la réserve gâtée ce mois-ci. La conservation (mois de réserve en plus)
 * la réduit en proportion : 8 mois de base et 8 de fumage, la moitié des pertes.
 */
export function spoilage(month: number, baseMonths: number, extraMonths = 0): number {
  const base = SEASON_RULES[seasonOf(month)].spoilage
  return base * (baseMonths / Math.max(baseMonths, baseMonths + extraMonths))
}
