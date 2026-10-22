// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createInMemoryClient } from '@/client/inMemoryClient'
import { ManualScheduler } from '@/host/scheduler'
import StartScreen from '@/ui/components/StartScreen.vue'
import TopBar from '@/ui/components/TopBar.vue'
import { useClientFactory, useGameStore } from '@/ui/stores/game'

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
    expect(game.selected.size).toBe(1)
  })
})

describe('barre du haut', () => {
  it('affiche la date et pilote la vitesse et la pause par le client', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'barre', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(TopBar)
    expect(wrapper.find('[data-testid=date]').text()).toContain('12 000 av. J.-C.')
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
