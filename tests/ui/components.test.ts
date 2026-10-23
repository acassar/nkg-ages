// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createInMemoryClient } from '@/client/inMemoryClient'
import { createSaveSlot, memoryStorage, type SaveSlot } from '@/client/saveSlot'
import { ManualScheduler } from '@/host/scheduler'
import StartScreen from '@/ui/components/StartScreen.vue'
import AlertsPanel from '@/ui/components/AlertsPanel.vue'
import GameScreen from '@/ui/components/GameScreen.vue'
import GoalsPanel from '@/ui/components/GoalsPanel.vue'
import HintBox from '@/ui/components/HintBox.vue'
import InventionsPanel from '@/ui/components/InventionsPanel.vue'
import OutcomeDialog from '@/ui/components/OutcomeDialog.vue'
import PeoplesPanel from '@/ui/components/PeoplesPanel.vue'
import SelectionBar from '@/ui/components/SelectionBar.vue'
import TopBar from '@/ui/components/TopBar.vue'
import { AUTOSAVE_MS, useClientFactory, useGameStore, useSaveSlotFactory } from '@/ui/stores/game'
import { BIOME_IDS, type GameView } from '@/views/types'

let scheduler: ManualScheduler
let slot: SaveSlot

beforeEach(() => {
  setActivePinia(createPinia())
  scheduler = new ManualScheduler()
  useClientFactory(() => createInMemoryClient(scheduler))
  slot = createSaveSlot(memoryStorage(), () => 0)
  useSaveSlotFactory(() => slot)
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
    // La bande de départ est choisie d'emblée : un clic droit suffit pour la faire marcher.
    expect(game.selectedCamp).toBe(game.view!.camps.find((c) => c.mine)!.id)
  })

  it('transmet la taille du monde, le nombre de voisins et les événements rares', async () => {
    const wrapper = mount(StartScreen)
    await wrapper.find('input[name=seed]').setValue('lascaux')
    await wrapper.find('select[name=size]').setValue('petit')
    await wrapper.find('select[name=peoples]').setValue('0')
    await wrapper.find('input[name=rareEvents]').setValue(false)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const game = useGameStore()
    expect(game.world).toMatchObject({ seed: 'lascaux', width: 384, height: 192 })
    expect(game.view?.peoples).toEqual([])
    await game.saveNow()
    expect(slot.read()?.options).toMatchObject({ peoples: 0, rareEvents: false })
  }, 30_000)
})

describe('conseils et succès', () => {
  it('affiche le conseil du moment, qu’on peut taire, et le compte des succès', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'conseil', randomStart: false, width: 128, height: 64 })
    const hint = mount(HintBox)
    expect(hint.find('[data-testid=hint]').text()).toMatch(/bande/)
    await hint.find('[data-testid=hint-close]').trigger('click')
    expect(hint.find('[data-testid=hint]').exists()).toBe(false)
    const goals = mount(GoalsPanel)
    expect(goals.find('[data-testid=achievements]').text()).toBe('0')
  })
})

describe('alertes', () => {
  it('liste les alertes, se replie, et une alerte située centre la carte', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'alertes', randomStart: false, width: 128, height: 64 })
    // Une alerte située (comme une bande sur des terres épuisées), ajoutée à la vue.
    const here = { id: 'essai', level: 'info' as const, text: 'Ici', target: { x: 3, y: 4 } }
    game.view = { ...game.view!, alerts: [...game.view!.alerts, here] }
    const wrapper = mount(AlertsPanel)
    const count = game.view!.alerts.length
    expect(count).toBeGreaterThan(0)
    expect(wrapper.find('[data-testid=alerts-count]').text()).toBe(String(count))
    expect(wrapper.find('[data-testid=alert-recherche]').text()).toBe('Aucune invention en cours')

    const situated = game.view!.alerts.find((a) => a.target)!
    await wrapper.find(`[data-testid=alert-${situated.id}]`).trigger('click')
    expect(game.focus).toMatchObject(situated.target!)

    await wrapper.find('[data-testid=alerts-toggle]').trigger('click')
    expect(wrapper.find('[data-testid=alert-recherche]').exists()).toBe(false)
    // Replié, le compte reste visible.
    expect(wrapper.find('[data-testid=alerts-count]').text()).toBe(String(count))
  })
})

describe('barre du haut', () => {
  it('affiche la date et pilote la vitesse et la pause par le client', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'barre', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(TopBar)
    expect(wrapper.find('[data-testid=date]').text()).toContain('12 000 av. J.-C.')
    expect(wrapper.find('[data-testid=season]').text()).toMatch(/^Hiver · \d+ %$/)
    expect(wrapper.find('[data-testid=population]').text()).toBe('12')
    expect(wrapper.find('[data-testid=food]').text()).toBe('36')
    expect(wrapper.find('[data-testid=hunters]').text()).toBe('2')
    // Deux chasseurs pour douze habitants : une personne sur six chasse.
    // Les chasseurs chassent seuls : rien à former.
    expect(wrapper.find('[data-testid=recruit]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=hunters-resting]').exists()).toBe(false)
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
    game.selectCamp(null)
    await game.moveSelectedTo(1, 1)
    expect(game.error).toBeNull()
    game.selectCamp(game.view!.camps[0]!.id)
    await game.moveSelectedTo(-5, -5)
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
    game.selectCamp(game.view!.camps[0]!.id)
    await game.moveSelectedTo(-5, -5)
    await flushPromises()
    expect(wrapper.find('[data-testid=notice]').text()).toContain('hors du monde')
    vi.advanceTimersByTime(4100)
    await flushPromises()
    expect(wrapper.find('[data-testid=notice]').exists()).toBe(false)
  })

  it('une bande choisie se déplace au clic droit, se scinde et migre seule', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'bande', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(SelectionBar)
    const camp = game.view!.camps.find((c) => c.mine)!
    game.selectCamp(camp.id)
    await flushPromises()
    expect(wrapper.find('[data-testid=camp-selection]').text()).toContain(
      `Bande de ${camp.members}`,
    )
    expect(wrapper.find('[data-testid=band-state]').text()).toContain('terres abondantes')
    // Trop petite pour se scinder : le bouton le dit.
    const split = wrapper.find('[data-testid=band-split]')
    expect(split.attributes('disabled')).toBeDefined()
    expect(split.attributes('title')).toMatch(/personnes/)
    // Migrer seule : un interrupteur.
    await wrapper.find('[data-testid=band-roaming]').trigger('click')
    await flushPromises()
    expect(game.view!.camps.find((c) => c.id === camp.id)!.band!.roaming).toBe(true)
    // Le clic droit envoie la bande choisie, sur une terre en vue.
    const world = game.world!
    const water = [BIOME_IDS.Ocean, BIOME_IDS.DeepOcean] as number[]
    const dx = [3, -3, 2, -2, 4, -4].find(
      (d) =>
        !water.includes(world.biome[Math.floor(camp.y) * world.width + Math.floor(camp.x) + d]!),
    )!
    await game.moveSelectedTo(camp.x + dx, camp.y)
    await flushPromises()
    expect(game.error).toBeNull()
    expect(game.view!.camps.find((c) => c.id === camp.id)!.band!.target).not.toBeNull()
  })

  it('un clic sur un campement le choisit : on voit ce qu’il peut devenir', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'camp-choisi', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(SelectionBar)
    const camp = game.view!.camps.find((c) => c.mine)!
    game.selectCamp(camp.id)
    await flushPromises()
    const panel = wrapper.find('[data-testid=camp-selection]')
    expect(panel.text()).toContain('Bande')
    // Sans agriculture, le village est refusé, et la raison est dite.
    expect(wrapper.find('[data-testid=camp-upgrade]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid=camp-why]').text()).toMatch(/Agriculture/)
    // Plus d'éclaireur ni de chasseur à former : la bande fait tout elle-même.
    expect(wrapper.find('[data-testid=camp-scout]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=camp-hunter]').exists()).toBe(false)
    game.selectCamp(null)
    await flushPromises()
    expect(wrapper.find('[data-testid=camp-selection]').exists()).toBe(false)
  })

  it('retour au menu : plus d’erreur ni de sélection', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'menu', randomStart: false, width: 128, height: 64 })
    game.selectCamp(game.view!.camps[0]!.id)
    await game.moveSelectedTo(-5, -5)
    expect(game.error).not.toBeNull()
    game.quit()
    expect(game.error).toBeNull()
    expect(game.selectedCamp).toBeNull()
    expect(game.world).toBeNull()
  })

  it('un refus se ferme avec le bouton', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'fermer', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(GameScreen, { global: { stubs: { MapView: true } } })
    game.selectCamp(game.view!.camps[0]!.id)
    await game.moveSelectedTo(-5, -5)
    await flushPromises()
    await wrapper.find('[data-testid=notice] button').trigger('click')
    expect(game.error).toBeNull()
  })

  it('ignore la réponse d’une commande arrivée après le retour au menu', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'tardif', randomStart: false, width: 128, height: 64 })
    game.selectCamp(game.view!.camps[0]!.id)
    const pending = game.moveSelectedTo(-5, -5)
    game.quit()
    await pending
    expect(game.error).toBeNull()
  })

  it('montre un message du jeu (bande qui renonce), puis l’efface seul', async () => {
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
    push!({ ...game.view!, notices: ['La bande s’arrête : aucun chemin connu.'] })
    await flushPromises()
    expect(wrapper.find('[data-testid=notice]').text()).toContain('La bande s’arrête')
    vi.advanceTimersByTime(4100)
    await flushPromises()
    expect(wrapper.find('[data-testid=notice]').exists()).toBe(false)
  })

  it('le panneau des inventions lance une invention par le client', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'inventer', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(InventionsPanel)
    const lance = wrapper.find('[data-testid=invention-lance] button')
    expect(lance.attributes('disabled')).toBeDefined()
    expect(lance.attributes('title')).toBe('Il faut 15 silex')
    // La raison s'affiche aussi sous le bouton, prérequis compris.
    expect(wrapper.find('[data-testid=invention-propulseur] .why').text()).toBe(
      "Il faut d'abord : Lance",
    )
    await wrapper.find('[data-testid=invention-panier] button').trigger('click')
    await flushPromises()
    expect(game.view!.inventions.find((i) => i.kind === 'panier')!.progress).toBe(0)
    expect(wrapper.find('[data-testid=invention-panier] .progress').exists()).toBe(true)
    // Une invention en cours : on ne répète pas « déjà en cours » sous chaque bouton.
    expect(wrapper.find('[data-testid=invention-feu] .why').exists()).toBe(false)
    await wrapper.find('.title').trigger('click')
    expect(wrapper.find('ul').exists()).toBe(false)
  })
})

describe('fin de partie', () => {
  it('montre l’objectif et le score', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'objectif', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(GoalsPanel)
    expect(wrapper.findAll('li')).toHaveLength(3)
    expect(wrapper.find('li').text()).toMatch(/Habitants\s*12 \/ 250/)
    expect(Number(wrapper.find('[data-testid=score]').text())).toBe(game.view!.score)
  })

  it('une victoire se referme pour continuer, une défaite ne propose que le menu', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'fin', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(OutcomeDialog)
    expect(wrapper.find('[data-testid=outcome]').exists()).toBe(false)
    const victory = { type: 'victory' as const, score: 1500, dateLabel: 'mars 11 950 av. J.-C.' }
    game.view = { ...game.view!, paused: true, outcome: victory }
    await flushPromises()
    expect(wrapper.find('h2').text()).toBe('Victoire')
    await wrapper.find('[data-testid=keep-playing]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid=outcome]').exists()).toBe(false)
    expect(game.view!.paused).toBe(false)
    game.view = { ...game.view!, outcome: { ...victory, type: 'defeat' } }
    await flushPromises()
    expect(wrapper.find('h2').text()).toBe('Défaite')
    expect(wrapper.find('[data-testid=keep-playing]').exists()).toBe(false)
    await wrapper.findAll('button').at(-1)!.trigger('click')
    expect(game.world).toBeNull()
  })
})

describe('peuples voisins', () => {
  it('le panneau n’apparaît qu’après une rencontre, et ses boutons passent par le client', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'voisinage', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(PeoplesPanel)
    expect(wrapper.find('[data-testid=peoples]').exists()).toBe(false)
    const people = {
      id: 7,
      name: 'Peuple du Héron',
      population: 40,
      relation: 0,
      mood: 'Neutre',
      giftCost: '30 rations',
      giftBlocked: null,
      trade: '10 silex → 25 rations',
      tradeBlocked: 'Ils ne vous font pas assez confiance',
      tension: 'Vos campements sont trop proches des leurs',
    }
    game.view = { ...game.view!, peoples: [people] }
    await flushPromises()
    expect(wrapper.find('[data-testid=people-7]').text()).toContain('Neutre (0)')
    expect(wrapper.find('[data-testid=trade]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid=tension]').text()).toMatch(/trop proches/)
    await wrapper.find('[data-testid=gift]').trigger('click')
    await flushPromises()
    // Le moteur ne connaît pas ce peuple : il refuse, et le refus s'affiche.
    expect(game.error).toBe('Peuple inconnu')
  })
})

describe('villages', () => {
  it('le bouton n’apparaît qu’une fois un village possible, et passe par le client', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'hameau', randomStart: false, width: 128, height: 64 })
    const wrapper = mount(TopBar)
    expect(wrapper.find('[data-testid=build-village]').exists()).toBe(false)
    const tribe = { ...game.view!.tribe, maxVillages: 1, villageBlocked: null }
    game.view = { ...game.view!, tribe }
    await flushPromises()
    const button = wrapper.find('[data-testid=build-village]')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await flushPromises()
    // Le moteur refuse (pas d'agriculture) : le refus s'affiche, rien n'a été bâti en douce.
    expect(game.error).toMatch(/Agriculture/)
  })
})

describe('sauvegarde automatique', () => {
  afterEach(() => vi.useRealTimers())

  it('range la partie en quittant, puis la reprend depuis l’accueil, en pause', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'reprise', randomStart: false, width: 128, height: 64 })
    await game.setPaused(false)
    scheduler.advance(8000)
    const tick = game.view!.tick
    const dateLabel = game.view!.dateLabel
    expect(tick).toBeGreaterThan(0)
    game.quit()
    expect(game.world).toBeNull()
    await flushPromises()
    expect(slot.summary()).toEqual({ seed: 'reprise', dateLabel, savedAt: 0 })

    const wrapper = mount(StartScreen)
    expect(wrapper.find('[data-testid=resume]').text()).toContain('reprise')
    await wrapper.find('[data-testid=resume]').trigger('click')
    await flushPromises()
    expect(game.world?.seed).toBe('reprise')
    expect(game.view!.tick).toBe(tick)
    expect(game.view!.paused).toBe(true)
  })

  it('sauvegarde d’elle-même à intervalle régulier', async () => {
    vi.useFakeTimers()
    const game = useGameStore()
    await game.newGame({ seed: 'minuterie', randomStart: false, width: 128, height: 64 })
    expect(slot.read()).toBeNull()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect(slot.read()?.options.seed).toBe('minuterie')
    expect(game.savedGame?.seed).toBe('minuterie')
  })

  it('une partie de mesure ne remplace pas la sauvegarde du joueur', async () => {
    const game = useGameStore()
    await game.newGame({ seed: 'mesure', randomStart: false, width: 128, height: 64 }, false)
    await game.saveNow()
    game.quit()
    await flushPromises()
    expect(slot.read()).toBeNull()
  })

  it('une défaite efface la sauvegarde', async () => {
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
    await game.newGame({ seed: 'perdue', randomStart: false, width: 128, height: 64 })
    await game.saveNow()
    expect(slot.read()).not.toBeNull()
    push!({ ...game.view!, outcome: { type: 'defeat', score: 0, dateLabel: 'x' } })
    expect(slot.read()).toBeNull()
    expect(game.savedGame).toBeNull()
    await game.saveNow()
    expect(slot.read()).toBeNull()
  })

  it('une sauvegarde illisible est oubliée avec un message', async () => {
    const game = useGameStore()
    slot.write({ version: -1, options: { seed: 'vieille' } } as never, 'hier')
    await game.resume()
    expect(game.world).toBeNull()
    expect(game.error).toMatch(/autre version/)
    expect(slot.read()).toBeNull()
  })
})
