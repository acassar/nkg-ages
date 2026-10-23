import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { applyCommand, createGame, larderOf, step, type GameState } from '@/engine/game'
import { PLAYER } from '@/engine/territory/territory'
import { decodeRuns, encodeRuns, loadGame, saveGame, SAVE_VERSION } from '@/engine/save/save'

const options = { seed: 'sauvegarde', randomStart: false, width: 192, height: 96 }

function run(g: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(g)
}

/** Partie animée : la tribu cherche et la bande migre, pour que tout bouge. */
function busyGame(): GameState {
  const g = createGame(options)
  applyCommand(g, { type: 'setPaused', paused: false })
  applyCommand(g, { type: 'invent', invention: 'lance' })
  // La bande migre seule : ses terres s'épuisent et sa zone se déplace.
  applyCommand(g, { type: 'setRoaming', campId: g.camps[0]!.id, roaming: true })
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
    const band = copy.camps[0]!
    const result = applyCommand(copy, {
      type: 'moveCamp',
      campId: band.id,
      x: band.x - 5,
      y: band.y,
    })
    expect(result.ok).toBe(true)
  })

  it('une sauvegarde d’avant les réserves par bande partage les vivres de la tribu selon les gens', () => {
    const g = busyGame()
    run(g, 6)
    g.camps[0]!.members = 20
    g.tribe.population = 20
    applyCommand(g, { type: 'splitBand', campId: g.camps[0]!.id })
    const data = JSON.parse(JSON.stringify(saveGame(g)))
    // Comme avant : une seule réserve, tenue par la tribu, et des campements sans vivres.
    data.tribe = { ...data.tribe, food: 90, growth: 0, starvingMonths: 0, lastSpoiled: 1 }
    for (const c of data.camps) delete c.larder
    const old = loadGame(data)
    const camps = old.camps.filter((c) => c.owner === PLAYER)
    expect(camps).toHaveLength(2)
    expect(camps.map((c) => larderOf(c).food)).toEqual(
      camps.map((c) => (90 * c.members!) / old.tribe.population),
    )
    expect(Object.keys(old.tribe).sort()).toEqual(['materials', 'population'])
    // Un champ de réserve ajouté depuis manque : il repart de zéro.
    const recent = JSON.parse(JSON.stringify(saveGame(g)))
    delete recent.camps[0].larder.lastMeat
    expect(loadGame(recent).camps[0]!.larder!.lastMeat).toBe(0)
  })

  it('rend l’abondance des terres et les zones des bandes telles quelles', () => {
    const g = busyGame()
    run(g, 120)
    const copy = loadGame(JSON.parse(JSON.stringify(saveGame(g))))
    expect(copy.abundance).toEqual(g.abundance)
    expect(copy.bandCells).toEqual(g.bandCells)
    expect(copy.camps).toEqual(g.camps)
  })

  it('une sauvegarde d’avant les bandes : terres intactes, gens répartis, zone rendue en partant', () => {
    const g = busyGame()
    run(g, 30)
    const data = JSON.parse(JSON.stringify(saveGame(g)))
    delete data.abundance
    delete data.bandCells
    for (const c of data.camps)
      for (const k of ['members', 'target', 'path', 'plannedFog', 'patience', 'roaming'])
        delete c[k]
    const old = loadGame(data)
    expect([...old.abundance].every((a) => a === 1)).toBe(true)
    expect(old.camps[0]!.members).toBe(old.tribe.population)
    expect(old.bandCells.length).toBe(old.territory.ownerCells[1])
    // La bande peut marcher tout de suite.
    expect(old.camps[0]!.path).toEqual([])
  })

  it('une sauvegarde d’avant la métallurgie qui a le bronze reçoit la métallurgie', () => {
    const data = JSON.parse(JSON.stringify(saveGame(busyGame())))
    data.inventions.ranks.bronze = 'B'
    delete data.inventions.ranks.metallurgie
    expect(loadGame(data).inventions.ranks.metallurgie).toBe('E')
    // Sans bronze, rien n'est donné.
    delete data.inventions.ranks.bronze
    expect(loadGame(data).inventions.ranks.metallurgie).toBeUndefined()
  })

  it('une sauvegarde d’avant les bandes seules (éclaireurs, chasseurs) se reprend sans eux', () => {
    const g = busyGame()
    run(g, 12)
    const data = JSON.parse(JSON.stringify(saveGame(g)))
    // Comme avant : un éclaireur et deux chasseurs, déjà comptés parmi les gens.
    data.units = [
      { id: 90, kind: 'eclaireur', x: 3, y: 3, target: null, path: [], auto: false },
      { id: 91, kind: 'chasseur', x: 3, y: 3, target: null, path: [], auto: false },
    ]
    const old = loadGame(data)
    expect('units' in old).toBe(false)
    expect(old.tribe.population).toBe(g.tribe.population)
    expect(saveGame(old)).toEqual(saveGame(loadGame(saveGame(g))))
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
