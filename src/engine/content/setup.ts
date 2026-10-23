import { PEOPLE_NAMES, PEOPLE_RULES } from './peoples'

/**
 * Options de partie proposées à l'écran de départ : données pures. Chacune se traduit en
 * options de création (`NewGameOptions`).
 */
export type WorldSize = 'petit' | 'normal' | 'grand'

export const WORLD_SIZES: Readonly<
  Record<WorldSize, { name: string; width: number; height: number }>
> = {
  petit: { name: 'Petit', width: 384, height: 192 },
  normal: { name: 'Normal', width: 512, height: 256 },
  grand: { name: 'Grand', width: 768, height: 384 },
}

export const GAME_SETUP = {
  defaultSize: 'normal' as WorldSize,
  /** Peuples voisins au choix : de la tribu seule au monde jusqu'à un nom par peuple. */
  minPeoples: 0,
  maxPeoples: PEOPLE_NAMES.length,
  defaultPeoples: PEOPLE_RULES.count,
} as const
