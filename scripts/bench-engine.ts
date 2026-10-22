/**
 * Mesure du moteur sans affichage : génération du monde, coût d'un tick et des chemins.
 * Usage : pnpm bench [ticks]. Échoue si le budget est dépassé.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { applyCommand, createGame, step } from '../src/engine'

const TICKS = Number(process.argv[2] ?? 2000)
const BUDGET_TICK_MS = 2
const BUDGET_WORLD_MS = 1500
/** Pire tick (recalcul de chemin compris, préchauffage du JIT aussi) : marge pour la CI. */
const BUDGET_WORST_TICK_MS = 30

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
let worstTickMs = 0
const sendNext = () => {
  const [x, y] = targets[order++ % targets.length]!
  const t = performance.now()
  applyCommand(game, { type: 'moveUnits', unitIds: [scout.id], x, y })
  worstOrderMs = Math.max(worstOrderMs, performance.now() - t)
}
sendNext()
const t1 = performance.now()
for (let i = 0; i < TICKS; i++) {
  if (!scout.target) sendNext()
  const t = performance.now()
  step(game)
  worstTickMs = Math.max(worstTickMs, performance.now() - t)
}
const tickMs = (performance.now() - t1) / TICKS

const report = {
  world: `${game.world.width} × ${game.world.height}`,
  worldMs: Number(worldMs.toFixed(1)),
  ticks: TICKS,
  tickMs: Number(tickMs.toFixed(4)),
  worstTickMs: Number(worstTickMs.toFixed(2)),
  orders: order,
  worstOrderMs: Number(worstOrderMs.toFixed(2)),
  territoryCells: game.territory.ownedCount,
}
mkdirSync('ci-out', { recursive: true })
writeFileSync('ci-out/bench-engine.json', JSON.stringify(report, null, 2))
console.log(report)
if (
  tickMs > BUDGET_TICK_MS ||
  worstTickMs > BUDGET_WORST_TICK_MS ||
  worstOrderMs > BUDGET_WORST_TICK_MS ||
  worldMs > BUDGET_WORLD_MS
) {
  console.error(
    `Budget dépassé : tick ≤ ${BUDGET_TICK_MS} ms (pire ≤ ${BUDGET_WORST_TICK_MS} ms, ordre aussi), monde ≤ ${BUDGET_WORLD_MS} ms`,
  )
  process.exit(1)
}
