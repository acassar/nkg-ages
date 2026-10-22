import {
  Biome,
  dateOfTick,
  FIRST_ERA,
  PLAYER,
  startYear,
  UNIT_RULES,
  type GameState,
  type Rect,
} from '@/engine'
import { BIOME_IDS, type GameView, type GridPatch, type WorldSnapshot } from './types'

// Les identifiants exposés aux vues doivent rester ceux du moteur.
for (const [name, id] of Object.entries(BIOME_IDS)) {
  if (Biome[name as keyof typeof Biome] !== id) throw new Error(`Biome désaligné : ${name}`)
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const

/** « mars 12 000 av. J.-C. » (année historique, sans année 0). */
export function formatDate(year: number, month: number): string {
  const label = MONTHS[month] ?? ''
  const fmt = (n: number) => n.toLocaleString('fr-FR').replace(/\s/g, ' ')
  return year < 0 ? `${label} ${fmt(-year)} av. J.-C.` : `${label} ${fmt(year)}`
}

export function buildWorldSnapshot(state: GameState): WorldSnapshot {
  const { world } = state
  // Eau sur 0..127, terre sur 128..255 : la côte tombe exactement entre 127 et 128.
  const elevation = new Uint8Array(world.elevation.length)
  for (let i = 0; i < elevation.length; i++) {
    const e = Math.max(-1, Math.min(1, world.elevation[i]!))
    elevation[i] = e >= 0 ? 128 + Math.round(e * 127) : 127 + Math.round(e * 127)
  }
  return {
    seed: world.seed,
    width: world.width,
    height: world.height,
    elevation,
    biome: world.biome.slice(),
  }
}

/**
 * Vue de la partie. `full` envoie les grilles entières (début de partie, rechargement),
 * sinon seulement les zones modifiées depuis le dernier envoi.
 */
export function buildGameView(state: GameState, full = false): GameView {
  const { year, month } = dateOfTick(state.clock.tick, startYear())
  const whole: Rect = { x: 0, y: 0, w: state.world.width, h: state.world.height }
  return {
    tick: state.clock.tick,
    speed: state.clock.speed,
    paused: state.clock.paused,
    dateLabel: formatDate(year, month),
    eraName: FIRST_ERA.name,
    units: state.units.map((u) => ({
      id: u.id,
      kind: u.kind,
      name: UNIT_RULES[u.kind].name,
      x: u.x,
      y: u.y,
      target: u.target ? { ...u.target } : null,
    })),
    camps: state.camps.map((c) => ({ id: c.id, x: c.x, y: c.y, mine: c.owner === PLAYER })),
    fog: patchOf(state.fog.cells, state.world.width, full ? whole : state.fog.dirty),
    territory: patchOf(
      state.territory.owner,
      state.world.width,
      full ? whole : state.territory.dirty,
    ),
  }
}

export function patchOf(cells: Uint8Array, width: number, rect: Rect | null): GridPatch | null {
  if (!rect || rect.w <= 0 || rect.h <= 0) return null
  const data = new Uint8Array(rect.w * rect.h)
  for (let y = 0; y < rect.h; y++) {
    const start = (rect.y + y) * width + rect.x
    data.set(cells.subarray(start, start + rect.w), y * rect.w)
  }
  return { ...rect, data }
}
