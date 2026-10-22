/**
 * Horloge de jeu : un tick vaut un mois de jeu.
 * Les vitesses 1 à 5 fixent le nombre de ticks par seconde réelle.
 */
export type Speed = 1 | 2 | 3 | 4 | 5

export const SPEEDS: readonly Speed[] = [1, 2, 3, 4, 5]

export const TICKS_PER_SECOND: Readonly<Record<Speed, number>> = {
  1: 1,
  2: 3,
  3: 8,
  4: 24,
  5: 72,
}

/** Garde-fou : au-delà, on rattrape plus tard plutôt que de geler l'affichage. */
export const MAX_TICKS_PER_FRAME = 12

export interface ClockState {
  tick: number
  speed: Speed
  paused: boolean
}

export function createClock(): ClockState {
  return { tick: 0, speed: 1, paused: true }
}

export function isSpeed(value: unknown): value is Speed {
  return typeof value === 'number' && (SPEEDS as readonly number[]).includes(value)
}

/**
 * Nombre de ticks à jouer après `elapsedMs` de temps réel.
 * `carry` garde la fraction de tick non jouée d'une image à l'autre.
 */
export function ticksDue(
  clock: Readonly<ClockState>,
  elapsedMs: number,
  carry: number,
): { ticks: number; carry: number } {
  if (clock.paused || elapsedMs <= 0) return { ticks: 0, carry: clock.paused ? 0 : carry }
  const exact = carry + (elapsedMs / 1000) * TICKS_PER_SECOND[clock.speed]
  const whole = Math.floor(exact)
  const ticks = Math.min(whole, MAX_TICKS_PER_FRAME)
  // Un retard trop grand (onglet en arrière-plan) est abandonné, pas accumulé.
  return { ticks, carry: whole > ticks ? 0 : exact - whole }
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
