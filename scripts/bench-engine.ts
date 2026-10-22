/**
 * Mesure du moteur sans affichage : génération du monde et coût d'un tick.
 * Usage : pnpm bench [ticks]. Échoue si le budget est dépassé.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { applyCommand, createGame, step } from '../src/engine'

const TICKS = Number(process.argv[2] ?? 2000)
const BUDGET_TICK_MS = 2
const BUDGET_WORLD_MS = 1500

const t0 = performance.now()
const game = createGame({ seed: 'banc-essai', randomStart: false })
const worldMs = performance.now() - t0

const scout = game.units[0]!
applyCommand(game, { type: 'moveUnits', unitIds: [scout.id], x: scout.x + 30, y: scout.y + 10 })
const t1 = performance.now()
for (let i = 0; i < TICKS; i++) step(game)
const tickMs = (performance.now() - t1) / TICKS

const report = {
  world: `${game.world.width} × ${game.world.height}`,
  worldMs: Number(worldMs.toFixed(1)),
  ticks: TICKS,
  tickMs: Number(tickMs.toFixed(4)),
  territoryCells: game.territory.owned.length,
}
mkdirSync('ci-out', { recursive: true })
writeFileSync('ci-out/bench-engine.json', JSON.stringify(report, null, 2))
console.log(report)
if (tickMs > BUDGET_TICK_MS || worldMs > BUDGET_WORLD_MS) {
  console.error(`Budget dépassé : tick ≤ ${BUDGET_TICK_MS} ms, monde ≤ ${BUDGET_WORLD_MS} ms`)
  process.exit(1)
}
