import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../..', import.meta.url))
const bin = `${root}node_modules/.bin/depcruise`

/** Lance dependency-cruiser avec la configuration du projet et renvoie les règles violées. */
async function violations(cwd: string) {
  const args = ['src', '--config', `${root}.dependency-cruiser.cjs`, '--output-type', 'json']
  const { stdout } = await run(bin, args, { cwd, maxBuffer: 32 * 1024 * 1024 }).catch(
    (e: { stdout: string }) => e,
  )
  const report = JSON.parse(stdout) as {
    summary: { violations: { rule: { name: string } }[]; totalCruised: number }
    modules: { dependencies: unknown[] }[]
  }
  return {
    rules: report.summary.violations.map((v) => v.rule.name),
    edges: report.modules.reduce((n, m) => n + m.dependencies.length, 0),
  }
}

describe("frontières de l'architecture", () => {
  it('le code du jeu les respecte', async () => {
    const { rules, edges } = await violations(root)
    expect(rules).toEqual([])
    // Garde-fou : si les imports n'étaient plus résolus, la vérification serait vide.
    expect(edges).toBeGreaterThan(50)
  }, 30000)

  it('une violation est bien détectée', async () => {
    const { rules } = await violations(fileURLToPath(new URL('./fixtures/archi', import.meta.url)))
    expect(rules).toEqual(
      expect.arrayContaining(['interface-sans-moteur', 'rendu-sans-moteur', 'moteur-pur']),
    )
  }, 30000)
})
