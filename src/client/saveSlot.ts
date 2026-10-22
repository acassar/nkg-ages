import type { SaveData } from '@/engine'

/** Ce dont l'emplacement a besoin d'un stockage : localStorage, ou une table pour les tests. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Ce que l'écran d'accueil montre d'une partie sauvegardée, sans la relire en entier. */
export interface SaveSummary {
  seed: string
  /** Date de la partie, déjà rédigée par la vue (« 12 000 av. J.-C. »). */
  dateLabel: string
  savedAt: number
}

/** Emplacement unique de sauvegarde automatique. Les pannes de stockage ne font jamais planter. */
export interface SaveSlot {
  read(): SaveData | null
  summary(): SaveSummary | null
  write(save: SaveData, dateLabel: string): boolean
  clear(): void
}

const KEY = 'nkg-ages:sauvegarde'
const SUMMARY_KEY = 'nkg-ages:sauvegarde:resume'

function browserStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Accès refusé (navigation privée, cookies bloqués) : pas de sauvegarde, mais le jeu tourne.
    return null
  }
}

export function memoryStorage(): KeyValueStorage {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}

export function createSaveSlot(
  storage: KeyValueStorage | null = browserStorage(),
  now: () => number = Date.now,
): SaveSlot {
  const get = <T>(key: string): T | null => {
    try {
      const text = storage?.getItem(key)
      return text ? (JSON.parse(text) as T) : null
    } catch {
      return null
    }
  }
  return {
    read: () => get<SaveData>(KEY),
    summary: () => get<SaveSummary>(SUMMARY_KEY),
    write(save, dateLabel) {
      if (!storage) return false
      const summary: SaveSummary = { seed: save.options.seed, dateLabel, savedAt: now() }
      try {
        storage.setItem(KEY, JSON.stringify(save))
        storage.setItem(SUMMARY_KEY, JSON.stringify(summary))
        return true
      } catch {
        // Stockage plein : on garde l'ancienne sauvegarde plutôt qu'une moitié de la nouvelle.
        return false
      }
    },
    clear() {
      try {
        storage?.removeItem(KEY)
        storage?.removeItem(SUMMARY_KEY)
      } catch {
        // Rien à faire : il n'y avait déjà plus d'accès.
      }
    },
  }
}
