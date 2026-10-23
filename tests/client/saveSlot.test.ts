import { describe, expect, it } from 'vitest'
import { createSaveSlot, memoryStorage, type KeyValueStorage } from '@/client/saveSlot'
import { createGame, saveGame } from '@/engine'

const save = saveGame(
  createGame({ seed: 'emplacement', randomStart: false, width: 64, height: 32 }),
)

describe('emplacement de sauvegarde', () => {
  it('écrit, relit, résume puis oublie une partie', () => {
    const slot = createSaveSlot(memoryStorage(), () => 42)
    expect(slot.read()).toBeNull()
    expect(slot.write(save, 'printemps')).toBe(true)
    expect(slot.read()).toEqual(save)
    expect(slot.summary()).toEqual({ seed: 'emplacement', dateLabel: 'printemps', savedAt: 42 })
    slot.clear()
    expect(slot.read()).toBeNull()
    expect(slot.summary()).toBeNull()
  })

  it('sans stockage, ou stockage plein, le jeu continue sans sauvegarde', () => {
    expect(createSaveSlot(null).write(save, 'x')).toBe(false)
    expect(createSaveSlot(null).read()).toBeNull()
    const full: KeyValueStorage = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(createSaveSlot(full).write(save, 'x')).toBe(false)
  })

  it('un contenu illisible vaut une absence de sauvegarde', () => {
    const storage = memoryStorage()
    storage.setItem('nkg-ages:sauvegarde', '{pas du json')
    expect(createSaveSlot(storage).read()).toBeNull()
  })
})
