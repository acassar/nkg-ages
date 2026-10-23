/**
 * Mesure du moteur sans affichage : génération du monde, coût d'un pas et des chemins.
 * Un pas est une semaine : c'est l'unité que l'hôte joue en temps réel.
 * Usage : pnpm bench [pas]. Échoue si le budget est dépassé.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { advance, applyCommand, createGame, STEPS_PER_MONTH } from '../src/engine'

const STEPS = Number(process.argv[2] ?? 2000 * STEPS_PER_MONTH)
const BUDGET_STEP_MS = 2
const BUDGET_WORLD_MS = 1500
/** Pire pas (recalcul de chemin compris, préchauffage du JIT aussi) : marge pour la CI. */
const BUDGET_WORST_STEP_MS = 30

const t0 = performance.now()
const game = createGame({ seed: 'banc-essai', randomStart: false })
const worldMs = performance.now() - t0

// L'éclaireur part vers des coins lointains, à travers le brouillard : chaque arrêt
// (arrivée ou renoncement) relance un ordre, pour mesurer les recalculs de chemin.
const scout = game.units[0]!
const { width, height } = game.world
const targets = [
  [width * 0.1, height * 0.1],
  [width * 0.9, height * 0.8],
  [width * 0.5, height * 0.5],
  [width * 0.05, height * 0.9],
] as const
let order = 0
let worstOrderMs = 0
let worstStepMs = 0
const sendNext = () => {
  const [x, y] = targets[order++ % targets.length]!
  const t = performance.now()
  applyCommand(game, { type: 'moveUnits', unitIds: [scout.id], x, y })
  worstOrderMs = Math.max(worstOrderMs, performance.now() - t)
}
sendNext()
const t1 = performance.now()
for (let i = 0; i < STEPS; i++) {
  if (!scout.target) sendNext()
  const t = performance.now()
  advance(game)
  worstStepMs = Math.max(worstStepMs, performance.now() - t)
}
const stepMs = (performance.now() - t1) / STEPS

const report = {
  world: `${game.world.width} × ${game.world.height}`,
  worldMs: Number(worldMs.toFixed(1)),
  steps: STEPS,
  months: game.clock.tick,
  stepMs: Number(stepMs.toFixed(4)),
  worstStepMs: Number(worstStepMs.toFixed(2)),
  orders: order,
  worstOrderMs: Number(worstOrderMs.toFixed(2)),
  territoryCells: game.territory.ownedCount,
}
mkdirSync('ci-out', { recursive: true })
writeFileSync('ci-out/bench-engine.json', JSON.stringify(report, null, 2))
console.log(report)
if (
  stepMs > BUDGET_STEP_MS ||
  worstStepMs > BUDGET_WORST_STEP_MS ||
  worstOrderMs > BUDGET_WORST_STEP_MS ||
  worldMs > BUDGET_WORLD_MS
) {
  console.error(
    `Budget dépassé : pas ≤ ${BUDGET_STEP_MS} ms (pire ≤ ${BUDGET_WORST_STEP_MS} ms, ordre aussi), monde ≤ ${BUDGET_WORLD_MS} ms`,
  )
  process.exit(1)
}
