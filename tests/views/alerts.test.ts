import { describe, expect, it } from 'vitest'
import { PLAYER, RELATION_RULES } from '@/engine'
import { createGame, step } from '@/engine/game'
import { ALERT_RULES, alertsOf } from '@/views/alerts'

const game = () => createGame({ seed: 'alertes', randomStart: false, width: 128, height: 64 })
const ids = (state: ReturnType<typeof game>) => alertsOf(state).map((a) => a.id)

describe('alertes', () => {
  it('au départ : aucune invention en cours, rien d’autre à piloter', () => {
    const state = game()
    expect(ids(state)).toContain('recherche')
    expect(ids(state).some((id) => id.startsWith('eclaireur') || id === 'chasseur')).toBe(false)
  })

  it('l’alerte de recherche disparaît dès qu’une invention tourne', () => {
    const state = game()
    state.inventions.current = { kind: 'panier', progress: 0, work: 100 }
    expect(ids(state)).not.toContain('recherche')
  })

  it('la famine passe avant tout, et montre le camp', () => {
    const state = game()
    state.tribe.starvingMonths = 2
    const [first] = alertsOf(state)
    const home = state.camps.find((c) => c.owner === PLAYER)!
    expect(first).toMatchObject({ id: 'famine', level: 'danger', target: { x: home.x, y: home.y } })
  })

  it('prévient quand les vivres ne tiennent plus que quelques mois', () => {
    const state = game()
    state.tribe.food = 20
    state.tribe.lastProduction = 0
    state.tribe.lastCrops = 0
    state.tribe.lastSpoiled = 0
    state.tribe.lastConsumption = 12
    const alert = alertsOf(state).find((a) => a.id === 'vivres')
    expect(alert?.text).toBe('Vivres pour 1 mois à ce rythme')
    state.tribe.food = 12 * ALERT_RULES.lowFoodMonths
    expect(ids(state)).not.toContain('vivres')
  })

  it('annonce l’hiver à la fin de l’automne quand la réserve est maigre', () => {
    const state = game()
    state.clock.tick = 10 // novembre
    state.tribe.lastConsumption = 12
    state.tribe.food = 10
    expect(ids(state)).toContain('hiver')
    state.tribe.food = 12 * ALERT_RULES.winterMonths
    expect(ids(state)).not.toContain('hiver')
    state.tribe.food = 10
    state.clock.tick = 5 // juin
    expect(ids(state)).not.toContain('hiver')
  })

  it('signale un voisin hostile, seulement une fois rencontré', () => {
    const state = game()
    const people = state.peoples[0]
    if (!people) return
    people.relation = RELATION_RULES.raidBelow - 1
    people.met = false
    expect(ids(state)).not.toContain(`raids-${people.owner}`)
    people.met = true
    expect(ids(state)).toContain(`raids-${people.owner}`)
  })

  it('dit quand les réserves pleines mettent les chasseurs au repos', () => {
    const state = game()
    state.tribe.food = 1e6
    expect(ids(state)).toContain('reserves-pleines')
    expect(ids(state)).not.toContain('chasseur')
  })

  it('range les alertes du plus grave au plus anodin, sans doublon', () => {
    const state = game()
    for (let i = 0; i < 30; i++) step(state)
    state.tribe.starvingMonths = 1
    const order = { danger: 0, warning: 1, info: 2 }
    const alerts = alertsOf(state)
    const levels = alerts.map((a) => order[a.level])
    expect([...levels].sort((a, b) => a - b)).toEqual(levels)
    expect(new Set(alerts.map((a) => a.id)).size).toBe(alerts.length)
  })
})
