import { describe, expect, it } from 'vitest'
import { PEOPLE_NAMES, PEOPLE_RULES } from '@/engine/content/peoples'
import { GAME_SETUP, WORLD_SIZES } from '@/engine/content/setup'
import { DEFAULT_WORLD_HEIGHT, DEFAULT_WORLD_WIDTH } from '@/engine/world/generate'

describe('options de partie', () => {
  it('la taille normale est celle du générateur, et les tailles vont croissant', () => {
    expect(WORLD_SIZES[GAME_SETUP.defaultSize]).toMatchObject({
      width: DEFAULT_WORLD_WIDTH,
      height: DEFAULT_WORLD_HEIGHT,
    })
    const areas = Object.values(WORLD_SIZES).map((s) => s.width * s.height)
    expect([...areas].sort((a, b) => a - b)).toEqual(areas)
  })

  it('le nombre de voisins proposé reste dans les noms disponibles et couvre le défaut', () => {
    expect(GAME_SETUP.maxPeoples).toBeLessThanOrEqual(PEOPLE_NAMES.length)
    expect(GAME_SETUP.defaultPeoples).toBe(PEOPLE_RULES.count)
    expect(GAME_SETUP.defaultPeoples).toBeGreaterThanOrEqual(GAME_SETUP.minPeoples)
    expect(GAME_SETUP.defaultPeoples).toBeLessThanOrEqual(GAME_SETUP.maxPeoples)
  })
})
