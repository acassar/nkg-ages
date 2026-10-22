/**
 * Mesure de la carte : monde entier affiché, temps à vitesse 5 (frontières et brouillard
 * qui bougent), rendu à chaque image. Écrit ci-out/bench-map.json.
 * Usage : pnpm build && pnpm bench:map [--min-fps=N]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { launch } from './browser.mjs'
import { serveBuild } from './serve.mjs'

const minFps = Number(process.argv.find((a) => a.startsWith('--min-fps='))?.split('=')[1] ?? 0)
const { url, close } = await serveBuild()
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${url}?bench`)
await page.waitForFunction(() => window.__nkgBench?.intervals.length > 30, null, { timeout: 30000 })
// On oublie le démarrage, puis on mesure 5 secondes.
await page.evaluate(() => {
  window.__nkgBench.intervals.length = 0
  window.__nkgBench.renderMs.length = 0
})
await page.waitForTimeout(5000)
const sample = await page.evaluate(() => ({
  intervals: [...window.__nkgBench.intervals],
  renderMs: [...window.__nkgBench.renderMs],
  tickLabel: document.querySelector('[data-testid=date]')?.textContent ?? '',
}))
await browser.close()
await close()

const sorted = (xs) => [...xs].sort((a, b) => a - b)
const pct = (xs, p) => sorted(xs)[Math.min(xs.length - 1, Math.floor(p * xs.length))] ?? 0
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const report = {
  frames: sample.intervals.length,
  fps: Math.round(1000 / mean(sample.intervals)),
  frameP95Ms: Number(pct(sample.intervals, 0.95).toFixed(1)),
  renderMeanMs: Number(mean(sample.renderMs).toFixed(2)),
  date: sample.tickLabel,
  errors,
}
mkdirSync('ci-out', { recursive: true })
writeFileSync('ci-out/bench-map.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (errors.length > 0 || report.fps < minFps) process.exit(1)
