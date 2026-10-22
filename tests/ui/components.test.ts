// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createInMemoryClient } from '@/client/inMemoryClient'
import { ManualScheduler } from '@/host/scheduler'
import StartScreen from '@/ui/components/StartScreen.vue'
import GameScreen from '@/ui/components/GameScreen.vue'
import InventionsPanel from '@/ui/components/InventionsPanel.vue'
import TopBar from '@/ui/components/TopBar.vue'
import { useClientFactory, useGameStore } from '@/ui/stores/game'
import type { GameView } from '@/views/types'

let scheduler: ManualScheduler

beforeEach(() => {
  setActivePinia(createPinia())
  scheduler = new ManualScheduler()
  useClientFactory(() => createInMemoryClient(scheduler))
})

describe('écran de départ', () => {
  it('lance une partie avec la graine et l’option de placement', async () => {
    const wrapper = mount(StartScreen)
    await wrapper.find('input[name=seed]').setValue('chauvet')
    await wrapper.find('input[name=randomStart]').setValue(false)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const game = useGameStore()
    expect(game.world?.seed).toBe('chauvet')
    expect(game.selected.size).toBe(3)
  })
})

describe('barre du haut', () => {
  it('affiche la date et pilote la vitesse et la pause par le client', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'barre', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(TopBar)
    expect(wrapper.find('[data-testid=date]').text()).toContain('12 000 av. J.-C.')
    expect(wrapper.find('[data-testid=population]').text()).toBe('12')
    expect(wrapper.find('[data-testid=food]').text()).toBe('36')
    expect(wrapper.find('[data-testid=hunters]').text()).toBe('2')
    // Deux chasseurs pour douze habitants : la tribu n'en entretient pas plus.
    const recruit = wrapper.find('[data-testid=recruit]')
    expect(recruit.attributes('disabled')).toBeDefined()
    expect(recruit.attributes('title')).toMatch(/habitants/)
    await wrapper.find('[data-testid=speed-4]').trigger('click')
    await flushPromises()
    expect(game.view?.speed).toBe(4)
    await wrapper.find('[data-testid=pause]').trigger('click')
    await flushPromises()
    expect(game.view?.paused).toBe(false)
    scheduler.advance(1000)
    await flushPromises()
    expect(wrapper.find('[data-testid=date]').text()).not.toContain('janvier 12')
  })

  it('montre le refus du jeu sans planter', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'refus', randomStart: false, width: 128, height: 64 })
    game.select([])
    await game.moveSelectedTo(1, 1)
    expect(game.error).toBeNull()
    game.select([999])
    await game.moveSelectedTo(1, 1)
    expect(game.error).not.toBeNull()
  })
})

describe('écran de jeu', () => {
  afterEach(() => vi.useRealTimers())

  it('montre un refus de commande en jeu, puis l’efface seul', async () => {
    vi.useFakeTimers()
    const game = useGameStore()
    await game.newGame({ seed: 'avis', randomStart: false, width: 128, height: 64 })
    // La carte WebGL n'existe pas sous jsdom : on ne monte que l'avis.
    const wrapper = mount(GameScreen, { global: { stubs: { MapView: true } } })
    const camp = game.view!.camps[0]!
    game.select([999])
    await game.moveSelectedTo(camp.x, camp.y)
    await flushPromises()
    expect(wrapper.find('[data-testid=notice]').text()).toContain('Aucune unité')
    vi.advanceTimersByTime(4100)
    await flushPromises()
    expect(wrapper.find('[data-testid=notice]').exists()).toBe(false)
  })

  it('retour au menu : plus d’erreur ni de sélection', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'menu', randomStart: false, width: 128, height: 64 })
    game.select([999])
    await game.moveSelectedTo(1, 1)
    expect(game.error).not.toBeNull()
    game.quit()
    expect(game.error).toBeNull()
    expect(game.selected.size).toBe(0)
    expect(game.world).toBeNull()
  })

  it('un refus se ferme avec le bouton', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'fermer', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(GameScreen, { global: { stubs: { MapView: true } } })
    game.select([999])
    await game.moveSelectedTo(1, 1)
    await flushPromises()
    await wrapper.find('[data-testid=notice] button').trigger('click')
    expect(game.error).toBeNull()
  })

  it('ignore la réponse d’une commande arrivée après le retour au menu', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'tardif', randomStart: false, width: 128, height: 64 })
    game.select([999])
    const pending = game.moveSelectedTo(1, 1)
    game.quit()
    await pending
    expect(game.error).toBeNull()
  })

  it('montre un message du jeu (éclaireur qui renonce), puis l’efface seul', async () => {
    vi.useFakeTimers()
    // Client en mémoire dont on peut pousser une vue à la main.
    let push: ((view: GameView) => void) | null = null
    useClientFactory(() => {
      const inner = createInMemoryClient(scheduler)
      return {
        ...inner,
        subscribe(listener) {
          push = listener
          return inner.subscribe(listener)
        },
      }
    })
    const game = useGameStore()
    await game.newGame({ seed: 'avis-jeu', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(GameScreen, { global: { stubs: { MapView: true } } })
    push!({ ...game.view!, notices: ['Éclaireur renonce : aucun chemin connu.'] })
    await flushPromises()
    expect(wrapper.find('[data-testid=notice]').text()).toContain('Éclaireur renonce')
    vi.advanceTimersByTime(4100)
    await flushPromises()
    expect(wrapper.find('[data-testid=notice]').exists()).toBe(false)
  })

  it('Maj + clic ajoute ou retire une unité de la sélection', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'choix', randomStart: false, width: 128, height: 64 })
    game.select([1])
    game.toggleSelected(2)
    expect([...game.selected]).toEqual([1, 2])
    game.toggleSelected(1)
    expect([...game.selected]).toEqual([2])
  })

  it('le panneau des inventions lance une invention par le client', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'inventer', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(InventionsPanel)
    const lance = wrapper.find('[data-testid=invention-lance] button')
    expect(lance.attributes('disabled')).toBeDefined()
    expect(lance.attributes('title')).toBe('Il faut 15 silex')
    await wrapper.find('[data-testid=invention-panier] button').trigger('click')
    await flushPromises()
    expect(game.view!.inventions.find((i) => i.kind === 'panier')!.progress).toBe(0)
    expect(wrapper.find('[data-testid=invention-panier] .progress').exists()).toBe(true)
    await wrapper.find('.title').trigger('click')
    expect(wrapper.find('ul').exists()).toBe(false)
  })
})
