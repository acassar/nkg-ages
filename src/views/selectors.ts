import {
  Biome,
  dateOfTick,
  FIRST_ERA,
  PLAYER,
  ANIMAL_RULES,
  cannotStart,
  cannotRecruit,
  currentScore,
  goalSteps,
  tallyOf,
  cannotFoundCamp,
  maxCamps,
  maxHunters,
  huntersResting,
  HUNT_RULES,
  depositHeld,
  foodCapacity,
  INVENTION_KINDS,
  INVENTION_RULES,
  inventionStat,
  nextCost,
  statAt,
  workPerMonth,
  type RankedStat,
  herdVisible,
  depositYield,
  RESOURCE_KINDS,
  RESOURCE_RULES,
  startYear,
  Visibility,
  UNIT_RULES,
  type GameEvent,
  type GameState,
  type Rect,
} from '@/engine'
import {
  BIOME_IDS,
  type DepositView,
  type InventionView,
  type GameView,
  type GridPatch,
  type TribeView,
  type WorldSnapshot,
} from './types'

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
    river: world.river.slice(),
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
      path: u.path.map((p) => ({ x: p.x, y: p.y })),
      foundCamp: u.kind === 'eclaireur' ? { blocked: cannotFoundCamp(state, u) } : null,
    })),
    camps: state.camps.map((c) => ({ id: c.id, x: c.x, y: c.y, mine: c.owner === PLAYER })),
    fog: patchOf(state.fog.cells, state.world.width, full ? whole : state.fog.dirty),
    territory: patchOf(
      state.territory.owner,
      state.world.width,
      full ? whole : state.territory.dirty,
    ),
    notices: state.events.map((e) => noticeOf(state, e)),
    tribe: tribeView(state),
    deposits: depositViews(state),
    inventions: inventionViews(state),
    herds: state.herds
      .filter((h) => herdVisible(state, h))
      .map((h) => ({
        id: h.id,
        kind: h.kind,
        name: ANIMAL_RULES[h.kind].name,
        x: h.x,
        y: h.y,
        size: h.size,
      })),
    score: currentScore(state),
    goal: goalSteps(FIRST_ERA.goal, tallyOf(state)).map((s) => ({
      label: GOAL_LABELS[s.kind],
      have: s.have,
      need: s.need,
      done: s.have >= s.need,
    })),
    outcome: state.outcome
      ? {
          type: state.outcome.type,
          score: state.outcome.score,
          dateLabel: dateLabelOf(state.outcome.tick),
        }
      : null,
  }
}

const GOAL_LABELS = { population: 'Habitants', camps: 'Campements', inventions: 'Inventions' }

function dateLabelOf(tick: number): string {
  const { year, month } = dateOfTick(tick, startYear())
  return formatDate(year, month)
}

/** Rédige un événement du moteur pour le joueur. */
function noticeOf(state: GameState, event: GameEvent): string {
  switch (event.type) {
    case 'unitGaveUp': {
      const unit = state.units.find((u) => u.id === event.unitId)
      const name = unit ? UNIT_RULES[unit.kind].name : 'Une unité'
      return `${name} renonce : aucun chemin connu assez court ne mène à sa destination.`
    }
    case 'victory':
      return `Victoire : la tribu a atteint l'objectif du ${FIRST_ERA.name.toLowerCase()}.`
    case 'defeat':
      return 'Défaite : la tribu a disparu.'
    case 'famine':
      return 'Famine : les réserves sont vides, la tribu perd des siens chaque mois.'
    case 'invented': {
      const rules = INVENTION_RULES[event.invention]
      const stat = statAt(rules.range, event.rank)
      const best = state.inventions.ranks[event.invention]
      const kept = best && best !== event.rank ? ` (le rang ${best} obtenu avant est gardé)` : ''
      return `Invention : ${rules.name} de rang ${event.rank}, ${rules.stat.toLowerCase()} ${formatStat(stat, rules.unit)}${kept}.`
    }
    case 'meatLost':
      return `Chasse : la réserve est pleine, ${event.amount} rations de viande sont perdues.`
    case 'hunterKilled':
      return `Chasse : un chasseur est mort face aux ${ANIMAL_RULES[event.animal].name.toLowerCase()}.`
  }
}

/** La tribu, arrondie pour l'affichage. */
function tribeView(state: GameState): TribeView {
  const { tribe } = state
  return {
    population: tribe.population,
    food: Math.floor(tribe.food),
    foodCapacity: Math.floor(foodCapacity(state)),
    foodBalance: Math.round((tribe.lastProduction - tribe.lastConsumption) * 10) / 10,
    starving: tribe.starvingMonths > 0,
    materials: RESOURCE_KINDS.filter((k) => tribe.materials[k] !== undefined).map((k) => ({
      kind: k,
      name: RESOURCE_RULES[k].name,
      amount: Math.floor(tribe.materials[k]!),
    })),
    hunters: state.units.filter((u) => u.kind === 'chasseur').length,
    maxHunters: maxHunters(state),
    recruitCost: HUNT_RULES.recruitFood,
    recruitBlocked: cannotRecruit(state),
    huntersResting: huntersResting(state),
    camps: state.camps.filter((c) => c.owner === PLAYER).length,
    maxCamps: maxCamps(state),
  }
}

/** Gisements que le joueur a déjà vus. */
function depositViews(state: GameState): DepositView[] {
  const { cells } = state.fog
  const { width } = state.world
  return state.deposits
    .filter((d) => cells[d.y * width + d.x] !== Visibility.Unknown)
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      name: RESOURCE_RULES[d.kind].name,
      category: RESOURCE_RULES[d.kind].category,
      x: d.x + 0.5,
      y: d.y + 0.5,
      rank: d.rank,
      held: depositHeld(state, d),
      yield: Math.round(depositYield(d) * 10) / 10,
    }))
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

const statNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** « 5,2 ± 1,1 », avec l'unité de la statistique. */
export function formatStat(stat: RankedStat, unit: string): string {
  // « 1 case » au singulier : le français n'accorde qu'à partir de 2.
  const word = unit === 'cases' && Math.abs(stat.mean) < 2 ? 'case' : unit
  const suffix = unit === '' ? '' : unit === '%' ? ' %' : ` ${word}`
  const spread = stat.spread > 0 ? ` ± ${statNumber.format(stat.spread)}` : ''
  const sign = (unit === '%' || unit === 'cases') && stat.mean > 0 ? '+' : ''
  return `${sign}${statNumber.format(stat.mean)}${spread}${suffix}`
}

/** Inventions : faites, en cours ou possibles, avec leur coût et ce qui les bloque. */
function inventionViews(state: GameState): InventionView[] {
  const inv = state.inventions
  const monthly = workPerMonth(state.tribe.population)
  return INVENTION_KINDS.map((kind) => {
    const rules = INVENTION_RULES[kind]
    const stat = inventionStat(inv, kind)
    const cost = nextCost(inv, kind)
    const current = inv.current?.kind === kind ? inv.current : null
    return {
      kind,
      name: rules.name,
      description: rules.description,
      rank: inv.ranks[kind] ?? null,
      stat: stat ? `${rules.stat} ${formatStat(stat, rules.unit)}` : null,
      progress: current ? Math.min(1, current.progress / current.work) : null,
      monthsLeft: current
        ? Math.ceil((current.work - current.progress) / Math.max(monthly, 1e-9))
        : null,
      cost: RESOURCE_KINDS.filter((k) => cost.materials[k] !== undefined).map(
        (k) => `${cost.materials[k]} ${RESOURCE_RULES[k].name.toLowerCase()}`,
      ),
      blocked: current ? null : cannotStart(inv, kind, state.tribe.materials),
    }
  })
}
