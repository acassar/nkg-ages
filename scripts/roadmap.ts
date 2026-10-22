/**
 * Régénère la roadmap graphique depuis roadmap.json.
 * Écrit docs/roadmap.svg (README) et public/roadmap.svg (servi avec le jeu).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { renderRoadmap, validateRoadmap, type Roadmap } from './roadmap-render'

const data = JSON.parse(readFileSync('roadmap.json', 'utf8')) as unknown
const problems = validateRoadmap(data)
if (problems.length > 0) {
  console.error(`roadmap.json invalide :\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
const svg = renderRoadmap(data as Roadmap)
for (const path of ['docs/roadmap.svg', 'public/roadmap.svg']) writeFileSync(path, svg)
console.log('Roadmap régénérée : docs/roadmap.svg, public/roadmap.svg')
