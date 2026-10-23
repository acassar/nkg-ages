import { describe, expect, it } from 'vitest'
import { CITY_RULES } from '@/engine/content/cities'
import { VILLAGE_RULES } from '@/engine/content/villages'
import { INVENTION_RULES } from '@/engine/content/inventions'
import {
  advance,
  applyCommand,
  cannotBuildCity,
  createGame,
  foodCapacity,
  inventionBoost,
  step,
  type GameState,
} from '@/engine/game'
import { createRng } from '@/engine/core/random'
import { tickInventions } from '@/engine/inventions/inventions'
import { PLAYER } from '@/engine/territory/territory'
import { buildGameView } from '@/views/selectors'
import { home } from '../home'

const options = {
  seed: 'cités',
  randomStart: false,
  width: 192,
  height: 96,
  rareEvents: false,
  peoples: 0,
}

/** Partie où la tribu écrit, assez nombreuse, avec un village, des vivres et du cuivre. */
function scribes(): GameState {
  const g = createGame(options)
  g.inventions.ranks.agriculture = 'E'
  g.inventions.ranks.ecriture = 'E'
  g.tribe.population = CITY_RULES.peoplePerCity
  home(g).food = VILLAGE_RULES.foodCost
  applyCommand(g, { type: 'buildVillage' })
  home(g).food = 1000
  g.tribe.materials.cuivre = CITY_RULES.copperCost
  return g
}

describe('cités', () => {
  it('il faut l’écriture, un village, assez d’habitants, des vivres et du cuivre', () => {
    const g = scribes()
    expect(cannotBuildCity(g)).toBeNull()
    g.tribe.materials.cuivre = CITY_RULES.copperCost - 1
    expect(cannotBuildCity(g)).toMatch(/cuivre/)
    g.tribe.materials.cuivre = CITY_RULES.copperCost
    home(g).food = CITY_RULES.foodCost - 1
    expect(cannotBuildCity(g)).toMatch(/rations/)
    home(g).food = 1000
    g.tribe.population = CITY_RULES.peoplePerCity - 1
    expect(cannotBuildCity(g)).toMatch(/habitants/)
    g.tribe.population = CITY_RULES.peoplePerCity
    g.camps.forEach((c) => delete c.village)
    expect(cannotBuildCity(g)).toMatch(/village/)
    delete g.inventions.ranks.ecriture
    expect(cannotBuildCity(g)).toBe(`Il faut d'abord : ${INVENTION_RULES.ecriture.name}`)
  })

  it('bâtir une cité coûte vivres et cuivre, puis pas plus que la population ne permet', () => {
    const g = scribes()
    const capacity = foodCapacity(g)
    home(g).food = 500
    expect(applyCommand(g, { type: 'buildCity' })).toEqual({ ok: true })
    expect(home(g).food).toBe(500 - CITY_RULES.foodCost)
    expect(g.tribe.materials.cuivre).toBe(0)
    expect(g.camps.find((c) => c.owner === PLAYER)!.city).toBe(true)
    expect(foodCapacity(g)).toBeGreaterThan(capacity)
    g.tribe.materials.cuivre = 50
    expect(applyCommand(g, { type: 'buildCity' })).toMatchObject({ ok: false })
    const view = buildGameView(g)
    expect(view.tribe).toMatchObject({ cities: 1, maxCities: 1 })
    expect(view.camps.find((c) => c.mine)!.city).toBe(true)
  })

  it('une cité porte le territoire plus loin qu’un village', () => {
    const run = (city: boolean) => {
      const g = scribes()
      if (city) applyCommand(g, { type: 'buildCity' })
      for (let i = 0; i < 1500; i++) {
        g.tribe.population = CITY_RULES.peoplePerCity
        step(g)
      }
      return g.territory.ownedCount
    }
    expect(run(true)).toBeGreaterThan(run(false))
  }, 60_000)
})

describe('écriture', () => {
  it('l’écriture et les cités accélèrent les inventions', () => {
    const g = scribes()
    const none = createGame(options)
    expect(inventionBoost(none)).toBe(0)
    const writing = inventionBoost(g)
    expect(writing).toBeCloseTo(0.2)
    applyCommand(g, { type: 'buildCity' })
    expect(inventionBoost(g)).toBeCloseTo(writing + CITY_RULES.workBonus)
  })

  it('le travail en plus finit une invention plus tôt', () => {
    const months = (boost: number) => {
      const inv = createGame(options).inventions
      inv.current = { kind: 'feu', progress: 0, work: 140 }
      const rng = createRng('savoir')
      let n = 0
      while (!tickInventions(inv, 50, rng, boost)) n++
      return n
    }
    expect(months(0.8)).toBeLessThan(months(0))
  })
})

describe('routes', () => {
  it('une bande marche plus vite sur ses terres, pas ailleurs', () => {
    const walked = (roads: boolean, onHome: boolean) => {
      const g = createGame(options)
      if (roads) g.inventions.ranks.routes = 'S'
      const band = g.camps[0]!
      const from = { x: band.x, y: band.y }
      // Une terre tenue à quelques cases du camp : le chemin passe par nos terres.
      const { width } = g.world
      let target = -1
      g.territory.owner.forEach((o, i) => {
        const d = Math.hypot((i % width) + 0.5 - from.x, Math.floor(i / width) + 0.5 - from.y)
        if (target < 0 && o === PLAYER && d > 4 && d < 6) target = i
      })
      const order = applyCommand(g, {
        type: 'moveCamp',
        campId: band.id,
        x: (target % width) + 0.5,
        y: Math.floor(target / width) + 0.5,
      })
      expect(order).toEqual({ ok: true })
      if (!onHome) g.territory.owner.fill(0)
      // Un seul pas : la bande n'a pas encore atteint sa destination.
      advance(g)
      return Math.hypot(band.x - from.x, band.y - from.y)
    }
    expect(walked(true, true)).toBeGreaterThan(walked(false, true))
    expect(walked(true, false)).toBeCloseTo(walked(false, false))
  })
})
