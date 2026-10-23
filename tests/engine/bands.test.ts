import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  bandEfficiency,
  createAbundance,
  cellsRect,
  depletedCells,
  exploit,
  forageAround,
  refreshZones,
} from '@/engine/bands/bands'
import { BAND_RULES } from '@/engine/content/bands'
import { Biome, isWater } from '@/engine/content/biomes'
import {
  applyCommand,
  bandAbundance,
  bandsOf,
  createGame,
  step,
  syncMembers,
  type GameState,
} from '@/engine/game'
import { createTerritory, NO_OWNER, PLAYER, claim } from '@/engine/territory/territory'
import type { World } from '@/engine/world/world'

const options = { seed: 'bandes', randomStart: false, width: 256, height: 128, peoples: 0 }

/** Petit monde de plaine, avec de l'eau là où la fonction le dit. */
function plainWorld(
  width: number,
  height: number,
  water = (_x: number, _y: number) => false,
): World {
  const biome = new Uint8Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) biome[y * width + x] = water(x, y) ? Biome.Ocean : Biome.Plain
  const zeros = new Float32Array(width * height)
  return {
    seed: 'test',
    width,
    height,
    elevation: zeros,
    moisture: zeros,
    temperature: zeros,
    biome,
    river: new Uint8Array(width * height),
  }
}

/** Une terre libre, à cette distance au moins de la bande, la plus proche possible. */
function landAway(g: GameState, from: { x: number; y: number }, distance: number) {
  const { width, height, biome } = g.world
  let best: { x: number; y: number } | null = null
  let bestD = Infinity
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x + 0.5 - from.x, y + 0.5 - from.y)
      if (d < distance || d >= bestD || isWater(biome[y * width + x]!)) continue
      best = { x: x + 0.5, y: y + 0.5 }
      bestD = d
    }
  return best!
}

describe('efficacité d’une bande', () => {
  it('reste entière jusqu’à la taille idéale, puis baisse, sans tomber sous le plancher', () => {
    expect(bandEfficiency(BAND_RULES.comfortSize)).toBe(1)
    expect(bandEfficiency(BAND_RULES.comfortSize + 15)).toBeCloseTo(
      1 - 15 * BAND_RULES.lossPerPerson,
    )
    expect(bandEfficiency(10_000)).toBe(BAND_RULES.minEfficiency)
    fc.assert(
      fc.property(fc.nat(500), fc.nat(500), (a, b) => {
        const [small, big] = a < b ? [a, b] : [b, a]
        expect(bandEfficiency(big)).toBeLessThanOrEqual(bandEfficiency(small))
      }),
    )
  })
})

describe('épuisement des terres', () => {
  it('englobe les cellules usées dans un rectangle (pour n’envoyer que lui au rendu)', () => {
    expect(cellsRect([], 10)).toBeNull()
    // Cellules (3, 1), (7, 2) et (5, 4) d'une grille de 10 de large.
    expect(cellsRect([13, 27, 45], 10)).toEqual({ x: 3, y: 1, w: 5, h: 4 })
  })

  it('les terres du joueur s’épuisent selon la part cueillie, toutes repoussent', () => {
    const abundance = createAbundance(4)
    abundance[3] = 0.5
    const depleted = [3]
    // Le joueur exploite les cellules 0 et 1.
    exploit([0, 1], abundance, depleted, 1, 1)
    expect(abundance[0]).toBeLessThan(1)
    expect(abundance[0]).toBeCloseTo(abundance[1]!)
    expect(abundance[2]).toBe(1)
    expect(abundance[3]).toBeGreaterThan(0.5)
    // Rien cueilli : rien ne s'épuise.
    const before = abundance[0]!
    exploit([0, 1], abundance, depleted, 0, 1)
    expect(abundance[0]).toBeGreaterThan(before)
    expect([...depleted].sort((a, b) => a - b)).toEqual(depletedCells(abundance))
  })

  it('invariant : l’abondance reste entre 0 et 1, quoi qu’on cueille (fast-check)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.double({ min: -1, max: 3, noNaN: true }),
            fc.double({ min: 0, max: 1.5, noNaN: true }),
          ),
          { maxLength: 40 },
        ),
        (months) => {
          const abundance = createAbundance(3)
          const depleted: number[] = []
          for (const [share, season] of months) {
            exploit([0, 1], abundance, depleted, share, season)
            // La liste des cellules à repousser reste exacte, sans doublon.
            expect([...depleted].sort((a, b) => a - b)).toEqual(depletedCells(abundance))
          }
          for (const a of abundance) {
            expect(a).toBeGreaterThanOrEqual(0)
            expect(a).toBeLessThanOrEqual(1)
          }
        },
      ),
    )
  })

  it('mesure l’abondance moyenne autour d’un point, sans compter l’eau', () => {
    const world = plainWorld(10, 10, (x) => x >= 5)
    const weights = new Float32Array(100).fill(1)
    const abundance = createAbundance(100)
    for (let i = 0; i < 100; i++) if (i % 10 < 5) abundance[i] = 0.5
    const around = forageAround(world, weights, abundance, 4.5, 4.5, 3)
    expect(around.mean).toBeCloseTo(0.5)
  })
})

describe('zones des bandes', () => {
  it('suivent la bande : elles prennent les terres libres autour, puis les rendent', () => {
    const world = plainWorld(40, 10)
    const t = createTerritory(40, 10)
    let held = refreshZones(t, world, [{ x: 5.5, y: 5.5 }], [], 3)
    expect(held.length).toBeGreaterThan(20)
    expect(t.owner[5 * 40 + 5]).toBe(PLAYER)
    held = refreshZones(t, world, [{ x: 30.5, y: 5.5 }], held, 3)
    expect(t.owner[5 * 40 + 5]).toBe(NO_OWNER)
    expect(t.owner[5 * 40 + 30]).toBe(PLAYER)
    expect(t.ownerCells[PLAYER]).toBe(held.length)
  })

  it('ne rendent jamais une terre qu’elles n’ont pas prise (celle d’un village)', () => {
    const world = plainWorld(20, 10)
    const t = createTerritory(20, 10)
    claim(t, 5, 5, PLAYER)
    let held = refreshZones(t, world, [{ x: 5.5, y: 5.5 }], [], 2)
    held = refreshZones(t, world, [{ x: 15.5, y: 5.5 }], held, 2)
    expect(t.owner[5 * 20 + 5]).toBe(PLAYER)
    expect(held).not.toContain(5 * 20 + 5)
  })

  it('invariant : ni l’eau ni la terre d’un autre, comptes justes, d’un seul tenant (fast-check)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.nat(29), fc.nat(19)), { minLength: 1, maxLength: 8 }),
        fc.array(fc.tuple(fc.nat(29), fc.nat(19)), { maxLength: 30 }),
        (moves, rival) => {
          const world = plainWorld(30, 20, (x, y) => (x * 7 + y * 3) % 11 === 0)
          const t = createTerritory(30, 20)
          for (const [x, y] of rival) if (!isWater(world.biome[y * 30 + x]!)) claim(t, x, y, 2)
          const theirs = new Uint8Array(t.owner)
          let held: number[] = []
          for (const [x, y] of moves) {
            held = refreshZones(t, world, [{ x: x + 0.5, y: y + 0.5 }], held, 4)
            for (const i of held) {
              expect(t.owner[i]).toBe(PLAYER)
              expect(isWater(world.biome[i]!)).toBe(false)
            }
            expect(new Set(held).size).toBe(held.length)
            for (let i = 0; i < theirs.length; i++) if (theirs[i] === 2) expect(t.owner[i]).toBe(2)
            const counted = t.owner.reduce((n, o) => n + (o === PLAYER ? 1 : 0), 0)
            expect(t.ownerCells[PLAYER] ?? 0).toBe(counted)
          }
        },
      ),
      { numRuns: 60 },
    )
  })
})

describe('bandes en jeu', () => {
  it('la tribu commence par une bande qui porte tous ses gens et tient une zone', () => {
    const g = createGame(options)
    const [band] = bandsOf(g)
    expect(bandsOf(g)).toHaveLength(1)
    expect(band!.members).toBe(g.tribe.population)
    expect(g.bandCells.length).toBeGreaterThan(0)
    expect(g.territory.owner[Math.floor(band!.y) * g.world.width + Math.floor(band!.x)]).toBe(
      PLAYER,
    )
  })

  it('une bande qui reste sur place épuise ses terres et cueille de moins en moins', () => {
    const g = createGame({ ...options, rareEvents: false })
    g.units = []
    // Assez de bras pour cueillir tout ce que les terres offrent : c'est la terre qui borne.
    g.tribe.population = 60
    g.tribe.food = 5000
    syncMembers(g)
    const band = bandsOf(g)[0]!
    for (let i = 0; i < 6; i++) step(g)
    const early = g.tribe.lastProduction
    for (let i = 0; i < 36; i++) step(g)
    // Même saison, trois ans plus tard : la cueillette a fondu.
    expect(bandAbundance(g, band)).toBeLessThan(0.8)
    expect(g.tribe.lastProduction).toBeLessThan(early)
  })

  it('déplacée, elle marche avec ses gens ; sa zone la suit et rend les terres quittées', () => {
    const g = createGame(options)
    const band = bandsOf(g)[0]!
    const home = { x: band.x, y: band.y }
    const homeCell = Math.floor(home.y) * g.world.width + Math.floor(home.x)
    const far = landAway(g, home, BAND_RULES.radius * 3)
    // Le chemin passe par l'inconnu, supposé praticable : l'ordre est accepté.
    expect(applyCommand(g, { type: 'moveCamp', campId: band.id, ...far })).toEqual({ ok: true })
    for (let i = 0; i < 24 && band.target; i++) step(g)
    expect(Math.hypot(band.x - home.x, band.y - home.y)).toBeGreaterThan(BAND_RULES.radius * 2)
    expect(g.territory.owner[homeCell]).toBe(NO_OWNER)
    expect(g.territory.owner[Math.floor(band.y) * g.world.width + Math.floor(band.x)]).toBe(PLAYER)
  })

  it('refuse de déplacer ce qui n’est pas une bande, ou vers l’eau connue', () => {
    const g = createGame(options)
    const band = bandsOf(g)[0]!
    expect(applyCommand(g, { type: 'moveCamp', campId: 999, x: 1, y: 1 }).ok).toBe(false)
    expect(applyCommand(g, { type: 'moveCamp', campId: band.id, x: -5, y: 1 }).ok).toBe(false)
    band.village = true
    expect(
      applyCommand(g, { type: 'moveCamp', campId: band.id, x: band.x + 1, y: band.y }),
    ).toEqual({
      ok: false,
      reason: 'Aucune bande choisie',
    })
  })

  it('une bande assez grande se scinde : deux bandes, mêmes gens au total', () => {
    const g = createGame(options)
    const band = bandsOf(g)[0]!
    expect(applyCommand(g, { type: 'splitBand', campId: band.id })).toEqual({
      ok: false,
      reason: `Il faut ${BAND_RULES.minSplit * 2} personnes dans la bande`,
    })
    g.tribe.population = 41
    syncMembers(g)
    band.roaming = true
    expect(applyCommand(g, { type: 'splitBand', campId: band.id })).toEqual({ ok: true })
    const bands = bandsOf(g)
    expect(bands).toHaveLength(2)
    expect(bands.map((b) => b.members)).toEqual([21, 20])
    // La nouvelle bande hérite de la consigne et part vers d'autres terres.
    expect(bands[1]!.roaming).toBe(true)
    for (let i = 0; i < 12; i++) step(g)
    expect(bandsOf(g).reduce((n, b) => n + (b.members ?? 0), 0)).toBe(g.tribe.population)
  })

  it('une bande qui migre seule quitte ses terres épuisées pour de plus riches', () => {
    const g = createGame({ ...options, rareEvents: false })
    const band = bandsOf(g)[0]!
    // Tout est connu, et tout est épuisé sauf loin d'ici.
    g.fog.cells.fill(1)
    const { width } = g.world
    for (let i = 0; i < g.abundance.length; i++) {
      const d = Math.hypot((i % width) + 0.5 - band.x, Math.floor(i / width) + 0.5 - band.y)
      g.abundance[i] = d < BAND_RULES.radius * 1.5 ? 0.1 : 1
    }
    step(g)
    expect(band.target).toBeNull()
    applyCommand(g, { type: 'setRoaming', campId: band.id, roaming: true })
    step(g)
    expect(band.target).not.toBeNull()
  })

  it('une bande qui migre seule quitte aussi des terres intactes mais trop pauvres pour elle', () => {
    // Scénario de la graine sonde-5 : abondance 0,58, jamais « épuisée », et la bande stagnait.
    const g = createGame({ ...options, rareEvents: false })
    const band = bandsOf(g)[0]!
    g.fog.cells.fill(1)
    const weights = g.territory.weights!
    const { width } = g.world
    for (let i = 0; i < weights.length; i++) {
      const d = Math.hypot((i % width) + 0.5 - band.x, Math.floor(i / width) + 0.5 - band.y)
      if (d < BAND_RULES.radius * 1.5) weights[i] = weights[i]! * 0.05
    }
    band.roaming = true
    step(g)
    expect(bandAbundance(g, band)).toBeGreaterThanOrEqual(BAND_RULES.exhausted)
    expect(band.target).not.toBeNull()
  })

  it('après une scission, la jeune bande part même vers des terres moins riches', () => {
    // Scénario de la graine sonde-3 : sans site plus riche, la jeune bande restait collée.
    const g = createGame({ ...options, rareEvents: false })
    const band = bandsOf(g)[0]!
    g.fog.cells.fill(1)
    const weights = g.territory.weights!
    const { width } = g.world
    for (let i = 0; i < weights.length; i++) {
      const d = Math.hypot((i % width) + 0.5 - band.x, Math.floor(i / width) + 0.5 - band.y)
      if (d >= BAND_RULES.radius) weights[i] = weights[i]! * 0.3
    }
    g.tribe.population = 40
    syncMembers(g)
    applyCommand(g, { type: 'splitBand', campId: band.id })
    const young = bandsOf(g)[1]!
    expect(young.target).not.toBeNull()
    const { x, y } = young.target!
    expect(Math.hypot(x - band.x, y - band.y)).toBeGreaterThanOrEqual(BAND_RULES.radius * 2 - 1)
  })

  it('deux bandes collées qui migrent seules se séparent', () => {
    const g = createGame({ ...options, rareEvents: false })
    const band = bandsOf(g)[0]!
    g.fog.cells.fill(1)
    g.tribe.population = 40
    syncMembers(g)
    applyCommand(g, { type: 'splitBand', campId: band.id })
    const young = bandsOf(g)[1]!
    young.target = null
    young.path = []
    band.roaming = true
    young.roaming = true
    step(g)
    expect(bandsOf(g).some((b) => b.target)).toBe(true)
  })

  it('devenue village, elle ne marche plus et garde ses terres', () => {
    const g = createGame(options)
    const band = bandsOf(g)[0]!
    g.inventions.ranks.agriculture = 'E'
    g.tribe.population = 100
    g.tribe.food = 1000
    syncMembers(g)
    const far = landAway(g, band, BAND_RULES.radius * 3)
    applyCommand(g, { type: 'moveCamp', campId: band.id, ...far })
    expect(applyCommand(g, { type: 'buildVillage', campId: band.id })).toEqual({ ok: true })
    expect(band.target).toBeNull()
    expect(bandsOf(g)).toHaveLength(0)
    const cell = Math.floor(band.y) * g.world.width + Math.floor(band.x)
    for (let i = 0; i < 12; i++) step(g)
    expect(g.territory.owner[cell]).toBe(PLAYER)
    expect(applyCommand(g, { type: 'moveCamp', campId: band.id, ...far }).ok).toBe(false)
  })

  it('chaque campement prend sa part des naissances, même le plus petit', () => {
    // Scénario de la sonde : arrondi au plus gros, la naissance du mois allait toujours au
    // plus grand village ; les petits restaient à 13 personnes pendant vingt ans.
    const g = createGame(options)
    const big = bandsOf(g)[0]!
    const small = { ...big, id: 99, x: big.x + 20, members: 13, share: undefined }
    big.members = 100
    g.camps.push(small)
    g.tribe.population = 113
    for (let month = 0; month < 120; month++) {
      g.tribe.population++
      syncMembers(g)
    }
    // 233 personnes, réparties comme au départ : environ 206 et 27.
    expect(small.members).toBeGreaterThanOrEqual(26)
    expect(big.members! + small.members!).toBe(233)
    // Et les départs se répartissent de même.
    for (let month = 0; month < 120; month++) {
      g.tribe.population--
      syncMembers(g)
    }
    expect(small.members).toBe(13)
    expect(big.members).toBe(100)
  })

  it('les naissances se partagent entre trois bandes, selon leur taille', () => {
    // Bug relevé en jeu : chaque naissance seule allait au plus gros campement, les autres stagnaient.
    const g = createGame(options)
    const first = g.camps[0]!
    g.camps = [
      { ...first, members: 30 },
      { ...first, id: 501, members: 20, x: first.x + 20 },
      { ...first, id: 502, members: 20, x: first.x + 40 },
    ]
    g.tribe.population = 70
    for (let k = 0; k < 70; k++) {
      g.tribe.population++
      syncMembers(g)
    }
    // La population a doublé : chacun a doublé, à une personne près.
    expect(g.camps.map((c) => c.members)).toEqual([60, 40, 40])
    for (let k = 0; k < 28; k++) {
      g.tribe.population--
      syncMembers(g)
    }
    const members = g.camps.map((c) => c.members!)
    expect(members.reduce((a, b) => a + b, 0)).toBe(112)
    ;[48, 32, 32].forEach((m, i) => expect(Math.abs(members[i]! - m)).toBeLessThanOrEqual(1))
  })

  it('invariant : les gens des campements font toujours la population (fast-check)', () => {
    const g = createGame(options)
    const first = { ...g.camps[0]! }
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 1, maxLength: 12 }),
        fc.array(fc.integer({ min: 0, max: 30 }), { minLength: 1, maxLength: 4 }),
        (populations, members) => {
          g.camps = [{ ...first }]
          members.forEach((m, k) => {
            if (k === 0) g.camps[0]!.members = m
            else g.camps.push({ ...first, id: 500 + k, members: m, x: first.x + k })
          })
          for (const p of populations) {
            g.tribe.population = p
            syncMembers(g)
            const mine = g.camps.filter((c) => c.owner === PLAYER)
            expect(mine.length).toBeGreaterThan(0)
            expect(mine.reduce((n, c) => n + (c.members ?? 0), 0)).toBe(p)
            // Un campement vidé disparaît, sauf quand la tribu entière a disparu.
            if (mine.length > 1 && p > 0) for (const c of mine) expect(c.members).toBeGreaterThan(0)
          }
        },
      ),
      { numRuns: 40 },
    )
  })
})
