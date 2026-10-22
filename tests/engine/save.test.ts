import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { applyCommand, createGame, step, type GameState } from '@/engine/game'
import { decodeRuns, encodeRuns, loadGame, saveGame, SAVE_VERSION } from '@/engine/save/save'

const options = { seed: 'sauvegarde', randomStart: false, width: 192, height: 96 }

function run(g: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(g)
}

/** Partie animée : l'éclaireur part au loin et la tribu cherche, pour que tout bouge. */
function busyGame(): GameState {
  const g = createGame(options)
  applyCommand(g, { type: 'setPaused', paused: false })
  const scout = g.units.find((u) => u.kind === 'eclaireur')!
  applyCommand(g, { type: 'moveUnits', unitIds: [scout.id], x: scout.x + 30, y: scout.y + 10 })
  applyCommand(g, { type: 'invent', invention: 'lance' })
  return g
}

describe('sauvegarde', () => {
  it('passe par JSON sans rien perdre', () => {
    const g = busyGame()
    run(g, 200)
    const data = saveGame(g)
    const back = JSON.parse(JSON.stringify(data))
    expect(back).toEqual(data)
    expect(data.version).toBe(SAVE_VERSION)
  })

  it('une partie reprise continue exactement comme l’originale', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 1, max: 300 }),
        (before, after) => {
          const original = busyGame()
          run(original, before)
          const copy = loadGame(JSON.parse(JSON.stringify(saveGame(original))))
          run(original, after)
          run(copy, after)
          expect(saveGame(copy)).toEqual(saveGame(original))
        },
      ),
      { numRuns: 6 },
    )
  }, 60_000)

  it('rend les mêmes grilles que l’originale', () => {
    const g = busyGame()
    run(g, 150)
    const copy = loadGame(saveGame(g))
    expect(copy.fog.cells).toEqual(g.fog.cells)
    expect(copy.territory.owner).toEqual(g.territory.owner)
    // Le rendu repart de zéro : toute la grille est à renvoyer.
    expect(copy.fog.dirty).toEqual({ x: 0, y: 0, w: g.world.width, h: g.world.height })
  })

  it('les commandes restent valables après la reprise', () => {
    const g = busyGame()
    run(g, 50)
    const copy = loadGame(saveGame(g))
    const scout = copy.units.find((u) => u.kind === 'eclaireur')!
    const result = applyCommand(copy, {
      type: 'moveUnits',
      unitIds: [scout.id],
      x: scout.x - 5,
      y: scout.y,
    })
    expect(result.ok).toBe(true)
  })

  it('refuse une sauvegarde d’une autre version', () => {
    const data = { ...saveGame(createGame(options)), version: SAVE_VERSION + 1 }
    expect(() => loadGame(data)).toThrow(/autre version/)
  })

  it('code les grilles en plages, aller et retour', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (cells) => {
        expect(decodeRuns(encodeRuns(cells), cells.length)).toEqual(cells)
      }),
    )
    expect(encodeRuns(new Uint8Array([0, 0, 0, 1, 1, 0]))).toEqual([0, 3, 1, 2, 0, 1])
    expect(() => decodeRuns([0, 5], 4)).toThrow(/abîmée/)
    expect(() => decodeRuns([0, 3], 4)).toThrow(/abîmée/)
  })
})
