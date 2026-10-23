import { describe, expect, it } from 'vitest'
import { PLAYER, RELATION_RULES } from '@/engine'
import { applyCommand, createGame, larderOf, step } from '@/engine/game'
import { ALERT_RULES, alertsOf } from '@/views/alerts'
import { home } from '../home'

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
    home(state).starvingMonths = 2
    const [first] = alertsOf(state)
    const camp = state.camps.find((c) => c.owner === PLAYER)!
    expect(first).toMatchObject({
      id: `famine-${camp.id}`,
      level: 'danger',
      target: { x: camp.x, y: camp.y },
    })
  })

  it('chaque bande vit de sa réserve : l’alerte montre celle qui a faim', () => {
    const state = game()
    const first = state.camps.find((c) => c.owner === PLAYER)!
    first.members = 20
    state.tribe.population = 20
    applyCommand(state, { type: 'splitBand', campId: first.id })
    const second = state.camps.filter((c) => c.owner === PLAYER)[1]!
    second.x = first.x + 30
    larderOf(second).starvingMonths = 1
    const alert = alertsOf(state).find((a) => a.id.startsWith('famine'))
    expect(alert).toMatchObject({
      id: `famine-${second.id}`,
      text: 'Famine : bande de 10 perd des siens chaque mois',
      target: { x: second.x, y: second.y },
    })
    expect(ids(state)).not.toContain(`famine-${first.id}`)
  })

  it('prévient quand les vivres ne tiennent plus que quelques mois', () => {
    const state = game()
    home(state).food = 20
    home(state).lastProduction = 0
    home(state).lastCrops = 0
    home(state).lastSpoiled = 0
    home(state).lastConsumption = 12
    const id = `vivres-${state.camps[0]!.id}`
    const alert = alertsOf(state).find((a) => a.id === id)
    expect(alert?.text).toBe('Vivres pour 1 mois à ce rythme')
    home(state).food = 12 * ALERT_RULES.lowFoodMonths
    expect(ids(state)).not.toContain(id)
  })

  it('annonce l’hiver à la fin de l’automne quand la réserve est maigre', () => {
    const state = game()
    state.clock.tick = 10 // novembre
    home(state).lastConsumption = 12
    home(state).food = 10
    expect(ids(state)).toContain('hiver')
    home(state).food = 12 * ALERT_RULES.winterMonths
    expect(ids(state)).not.toContain('hiver')
    home(state).food = 10
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
    home(state).food = 1e6
    expect(ids(state)).toContain('reserves-pleines')
    expect(ids(state)).not.toContain('chasseur')
  })

  it('range les alertes du plus grave au plus anodin, sans doublon', () => {
    const state = game()
    for (let i = 0; i < 30; i++) step(state)
    home(state).starvingMonths = 1
    const order = { danger: 0, warning: 1, info: 2 }
    const alerts = alertsOf(state)
    const levels = alerts.map((a) => order[a.level])
    expect([...levels].sort((a, b) => a - b)).toEqual(levels)
    expect(new Set(alerts.map((a) => a.id)).size).toBe(alerts.length)
  })
})
