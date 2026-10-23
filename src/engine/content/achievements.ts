/**
 * Succès : données pures. Chacun se gagne une fois par partie, quand le fait qu'il mesure
 * atteint son seuil ; il est annoncé et reste acquis, même si la situation change ensuite.
 */
export type AchievementFact =
  | 'camps'
  | 'villages'
  | 'cities'
  | 'population'
  | 'peoplesMet'
  | 'allies'
  | 'rankS'
  | 'wonders'
  | 'inventions'

export interface AchievementRules {
  id: string
  name: string
  description: string
  fact: AchievementFact
  /** Seuil à atteindre (au moins). */
  atLeast: number
}

export const ACHIEVEMENTS: readonly AchievementRules[] = [
  {
    id: 'essaimer',
    name: 'Essaimer',
    description: 'Fonder un deuxième campement.',
    fact: 'camps',
    atLeast: 2,
  },
  {
    id: 'rencontre',
    name: 'Premier contact',
    description: 'Rencontrer un peuple voisin.',
    fact: 'peoplesMet',
    atLeast: 1,
  },
  {
    id: 'savoirs',
    name: 'Savoirs',
    description: 'Faire cinq inventions.',
    fact: 'inventions',
    atLeast: 5,
  },
  {
    id: 'sedentaires',
    name: 'Sédentaires',
    description: 'Bâtir un village.',
    fact: 'villages',
    atLeast: 1,
  },
  {
    id: 'centaine',
    name: 'Une centaine',
    description: 'Compter cent habitants.',
    fact: 'population',
    atLeast: 100,
  },
  {
    id: 'chef-doeuvre',
    name: 'Chef-d’œuvre',
    description: 'Obtenir une invention au rang S.',
    fact: 'rankS',
    atLeast: 1,
  },
  {
    id: 'alliance',
    name: 'Alliance',
    description: 'Gagner un peuple allié.',
    fact: 'allies',
    atLeast: 1,
  },
  {
    id: 'merveille',
    name: 'Lieu sacré',
    description: 'Tenir une merveille.',
    fact: 'wonders',
    atLeast: 1,
  },
  {
    id: 'cite',
    name: 'Première cité',
    description: 'Faire d’un village une cité.',
    fact: 'cities',
    atLeast: 1,
  },
]
