/**
 * Sonde d'équilibrage : un joueur automatique joue des dizaines de parties et l'on mesure
 * quand chaque étape arrive (années de jeu), la population, les famines, les réserves pleines.
 * Usage : pnpm sonde [parties] [années]. Écrit ci-out/sonde.json et un tableau dans la console.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  createGame,
  foodCapacity,
  INVENTION_KINDS,
  PLAYER,
  step,
  type GameState,
} from '../src/engine'
import { createBot } from './bot'

const GAMES = Number(process.argv[2] ?? 40)
const YEARS = Number(process.argv[3] ?? 60)
/** Années où l'on relève la population. */
const CHECKPOINTS = [5, 10, 20, 30, 45, 60].filter((y) => y <= YEARS)

/** Étapes datées : la première année où la condition est vraie. */
const MILESTONES: Record<string, (s: GameState) => boolean> = {
  'première invention': (s) => Object.keys(s.inventions.ranks).length >= 1,
  '3 inventions': (s) => Object.keys(s.inventions.ranks).length >= 3,
  '6 inventions': (s) => Object.keys(s.inventions.ranks).length >= 6,
  '2e campement': (s) => campsOf(s) >= 2,
  '3e campement': (s) => campsOf(s) >= 3,
  agriculture: (s) => s.inventions.ranks.agriculture !== undefined,
  'premier village': (s) => s.camps.some((c) => c.owner === PLAYER && c.village),
  bronze: (s) => s.inventions.ranks.bronze !== undefined,
  écriture: (s) => s.inventions.ranks.ecriture !== undefined,
  'première cité': (s) => s.camps.some((c) => c.owner === PLAYER && c.city),
  'tout l’arbre': (s) => Object.keys(s.inventions.ranks).length >= INVENTION_KINDS.length,
  victoire: (s) => s.outcome?.type === 'victory',
}

const campsOf = (s: GameState) => s.camps.filter((c) => c.owner === PLAYER).length

interface GameReport {
  seed: string
  /** Année de chaque étape, ou null si jamais atteinte. */
  milestones: Record<string, number | null>
  population: Record<number, number>
  famineMonths: number
  /** Part des mois passés réserve pleine (chasseurs au repos). */
  fullMonths: number
  defeat: number | null
}

function play(seed: string): GameReport {
  const state = createGame({ seed, randomStart: true })
  const bot = createBot(seed)
  const milestones: Record<string, number | null> = {}
  for (const name of Object.keys(MILESTONES)) milestones[name] = null
  const population: Record<number, number> = {}
  let famineMonths = 0
  let full = 0
  let defeat: number | null = null
  for (let month = 0; month < YEARS * 12; month++) {
    bot.play(state)
    step(state)
    // La victoire ne met pas fin à la sonde (step ignore la pause) : on veut voir la suite.
    const year = state.clock.tick / 12
    for (const [name, reached] of Object.entries(MILESTONES))
      if (milestones[name] === null && reached(state)) milestones[name] = round(year)
    if (state.tribe.starvingMonths > 0) famineMonths++
    if (state.tribe.food >= foodCapacity(state)) full++
    if (state.clock.tick % 12 === 0 && CHECKPOINTS.includes(year))
      population[year] = state.tribe.population
    state.events.length = 0
    if (state.outcome?.type === 'defeat') {
      defeat = round(year)
      break
    }
  }
  return {
    seed,
    milestones,
    population,
    famineMonths,
    fullMonths: full / (YEARS * 12),
    defeat,
  }
}

const round = (n: number) => Math.round(n * 10) / 10

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
}

function spread(values: number[], total: number) {
  return {
    p10: quantile(values, 0.1),
    médiane: quantile(values, 0.5),
    p90: quantile(values, 0.9),
    atteint: `${Math.round((values.length / total) * 100)} %`,
  }
}

const t0 = performance.now()
const games = Array.from({ length: GAMES }, (_, i) => play(`sonde-${i}`))
const seconds = (performance.now() - t0) / 1000

const steps: Record<string, ReturnType<typeof spread>> = {}
for (const name of Object.keys(MILESTONES)) {
  const years = games.map((g) => g.milestones[name]).filter((y): y is number => y !== null)
  steps[name] = spread(years, GAMES)
}
const population: Record<string, ReturnType<typeof spread>> = {}
for (const year of CHECKPOINTS) {
  const values = games.map((g) => g.population[year]).filter((p): p is number => p !== undefined)
  population[`an ${year}`] = spread(values, GAMES)
}
const report = {
  parties: GAMES,
  années: YEARS,
  secondes: round(seconds),
  défaites: games.filter((g) => g.defeat !== null).length,
  'mois de famine (moyenne)': round(games.reduce((a, g) => a + g.famineMonths, 0) / GAMES),
  'réserve pleine (part des mois)': `${Math.round((games.reduce((a, g) => a + g.fullMonths, 0) / GAMES) * 100)} %`,
  étapes: steps,
  population,
}
mkdirSync('ci-out', { recursive: true })
writeFileSync('ci-out/sonde.json', JSON.stringify({ ...report, games }, null, 2))
console.log(
  `${GAMES} parties de ${YEARS} ans en ${report.secondes} s · défaites ${report.défaites} · ` +
    `famine ${report['mois de famine (moyenne)']} mois · réserve pleine ${report['réserve pleine (part des mois)']}`,
)
console.log('\nÉtapes (année de jeu) :')
console.table(steps)
console.log('Population :')
console.table(population)
