/**
 * Horloge de jeu : un tick vaut un mois de jeu, découpé en pas (des semaines).
 * Les bandes et les bêtes bougent à chaque pas, l'économie tourne une fois par mois.
 * Les vitesses 1 à 5 fixent le nombre de mois par seconde réelle.
 */
export type Speed = 1 | 2 | 3 | 4 | 5

export const SPEEDS: readonly Speed[] = [1, 2, 3, 4, 5]

/** Pas par mois : le mouvement avance par semaine pour rester fluide quand le temps ralentit. */
export const STEPS_PER_MONTH = 4

/**
 * Mois de jeu par seconde réelle. À la vitesse 1, une saison dure 12 secondes : on a le
 * temps de suivre ce qui se passe. La vitesse 5 sert à laisser filer les années calmes.
 */
export const MONTHS_PER_SECOND: Readonly<Record<Speed, number>> = {
  1: 0.25,
  2: 0.5,
  3: 1,
  4: 3,
  5: 9,
}

/** Garde-fou : au-delà, on rattrape plus tard plutôt que de geler l'affichage. */
export const MAX_STEPS_PER_FRAME = 12

export interface ClockState {
  /** Mois écoulés depuis le début. */
  tick: number
  /** Pas déjà joués dans le mois en cours (0 à STEPS_PER_MONTH - 1). */
  step: number
  speed: Speed
  paused: boolean
}

export function createClock(): ClockState {
  return { tick: 0, step: 0, speed: 1, paused: true }
}

export function isSpeed(value: unknown): value is Speed {
  return typeof value === 'number' && (SPEEDS as readonly number[]).includes(value)
}

/** Pas joués par seconde réelle à cette vitesse. */
export function stepsPerSecond(speed: Speed): number {
  return MONTHS_PER_SECOND[speed] * STEPS_PER_MONTH
}

/**
 * Nombre de pas à jouer après `elapsedMs` de temps réel.
 * `carry` garde la fraction de pas non jouée d'une image à l'autre.
 */
export function stepsDue(
  clock: Readonly<ClockState>,
  elapsedMs: number,
  carry: number,
): { steps: number; carry: number } {
  if (clock.paused || elapsedMs <= 0) return { steps: 0, carry: clock.paused ? 0 : carry }
  const exact = carry + (elapsedMs / 1000) * stepsPerSecond(clock.speed)
  const whole = Math.floor(exact)
  const steps = Math.min(whole, MAX_STEPS_PER_FRAME)
  // Un retard trop grand (onglet en arrière-plan) est abandonné, pas accumulé.
  return { steps, carry: whole > steps ? 0 : exact - whole }
}

export interface GameDate {
  /** Année historique : négative avant notre ère, jamais 0 (on passe de -1 à 1). */
  year: number
  /** Mois de 0 (janvier) à 11. */
  month: number
}

export function dateOfTick(tick: number, startYear: number): GameDate {
  let year = startYear + Math.floor(tick / 12)
  if (startYear < 0 && year >= 0) year += 1
  return { year, month: tick % 12 }
}
