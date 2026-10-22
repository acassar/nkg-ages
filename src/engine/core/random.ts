/**
 * Générateur pseudo-aléatoire à graine (mulberry32).
 * Une même graine redonne la même suite : parties rejouables, tests déterministes.
 * Son état tient dans un entier, donc il se sauvegarde tel quel.
 */
export interface Rng {
  /** Réel dans [0, 1). */
  next(): number
  /** Entier dans [min, max] (bornes incluses). */
  int(min: number, max: number): number
  /** Réel dans [min, max). */
  range(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  /** Générateur indépendant, dérivé de l'état courant et d'un libellé. */
  fork(label: string): Rng
  /** État courant, à sauvegarder. */
  readonly state: number
}

/** Empreinte FNV-1a 32 bits d'une chaîne. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function seedFrom(seed: string | number): number {
  return typeof seed === 'number' ? seed >>> 0 : hashString(seed)
}

export function createRng(seed: string | number): Rng {
  let state = seedFrom(seed)
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick : liste vide')
      return items[Math.floor(next() * items.length)] as (typeof items)[number]
    },
    fork: (label) => createRng((state ^ hashString(label)) >>> 0),
    get state() {
      return state
    },
  }
}
