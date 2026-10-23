/**
 * Saisons et climat : données pures. Chaque saison écarte la récolte de sa moyenne
 * (`swing`, de moyenne nulle sur l'année) ; le climat du campement dit de combien.
 */
export type SeasonKind = 'hiver' | 'printemps' | 'ete' | 'automne'

export interface SeasonRules {
  name: string
  /** Mois de la saison (0 = janvier). */
  months: readonly number[]
  /** Écart de la cueillette, en part de l'amplitude du climat (-1 : le creux de l'hiver). */
  swing: number
  /** Part de la réserve qui se gâte chaque mois, sans conservation. */
  spoilage: number
}

export const SEASON_KINDS: readonly SeasonKind[] = ['hiver', 'printemps', 'ete', 'automne']

export const SEASON_RULES: Readonly<Record<SeasonKind, SeasonRules>> = {
  hiver: { name: 'Hiver', months: [11, 0, 1], swing: -1, spoilage: 0 },
  printemps: { name: 'Printemps', months: [2, 3, 4], swing: 0.1, spoilage: 0.02 },
  ete: { name: 'Été', months: [5, 6, 7], swing: 0.45, spoilage: 0.04 },
  automne: { name: 'Automne', months: [8, 9, 10], swing: 0.45, spoilage: 0.02 },
}

export const CLIMATE_RULES = {
  /** Amplitude des saisons sous le climat le plus chaud (température 1). */
  minAmplitude: 0.15,
  /** Amplitude ajoutée par degré de froid (1 - température), jusqu'au maximum. */
  coldAmplitude: 0.7,
  maxAmplitude: 0.8,
} as const
