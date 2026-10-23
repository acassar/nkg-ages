import {
  Biome,
  climateOf,
  cannotGift,
  cannotTrade,
  closeCamps,
  moodOf,
  RELATION_RULES,
  cannotBuildVillage,
  maxVillages,
  villageCount,
  VILLAGE_RULES,
  cannotBuildCity,
  maxCities,
  cityCount,
  inventionBoost,
  CITY_RULES,
  WONDER_RULES,
  wonderHeld,
  ACHIEVEMENTS,
  dateOfTick,
  seasonOf,
  seasonalYield,
  SEASON_RULES,
  FIRST_ERA,
  PLAYER,
  ANIMAL_RULES,
  cannotStart,
  currentScore,
  goalSteps,
  tallyOf,
  BAND_RULES,
  bandAbundance,
  bandsOf,
  campEfficiency,
  cannotSplit,
  tribeEfficiency,
  huntersOf,
  depositHeld,
  resourceKnown,
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
  EVENT_RULES,
  startYear,
  Visibility,
  type GameEvent,
  type Camp,
  type GameState,
  type Rect,
  unionRect,
} from '@/engine'
import { alertsOf } from './alerts'
import {
  BIOME_IDS,
  type BandView,
  type CampView,
  type DepositView,
  type InventionView,
  type SeasonView,
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

/** L'état des terres d'une bande, en mots. */
export function landOf(abundance: number): BandView['land'] {
  if (abundance < BAND_RULES.exhausted) return 'épuisées'
  if (abundance < 0.8) return 'en baisse'
  return 'abondantes'
}

/** Vue d'une bande nomade du joueur, ou null pour un village ou un camp voisin. */
function bandView(state: GameState, camp: Camp): BandView | null {
  if (camp.owner !== PLAYER || camp.village) return null
  const abundance = bandAbundance(state, camp)
  return {
    efficiency: campEfficiency(camp),
    comfortSize: BAND_RULES.comfortSize,
    abundance,
    land: landOf(abundance),
    target: camp.target ? { ...camp.target } : null,
    path: (camp.path ?? []).map((p) => ({ x: p.x, y: p.y })),
    roaming: camp.roaming === true,
    splitBlocked: cannotSplit(state, camp),
    radius: BAND_RULES.radius,
  }
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
    season: seasonView(state, month),
    camps: state.camps
      .filter((c) => c.owner === PLAYER || known(state, c.x, c.y))
      .map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        mine: c.owner === PLAYER,
        village: c.village === true,
        city: c.city === true,
        people: state.peoples.find((p) => p.owner === c.owner)?.name ?? null,
        upgrade: upgradeOf(state, c),
        members: c.owner === PLAYER ? (c.members ?? 0) : null,
        band: bandView(state, c),
      })),
    fog: patchOf(state.fog.cells, state.world.width, full ? whole : state.fog.dirty),
    territory: territoryPatch(
      state,
      full ? whole : changed(state.territory.dirty, state.fog.dirty),
    ),
    abundance: abundancePatch(state, full ? whole : state.abundanceDirty),
    notices: state.events.map((e) => noticeOf(state, e)),
    tribe: tribeView(state),
    deposits: depositViews(state),
    wonders: state.wonders
      .filter((w) => known(state, w.x + 0.5, w.y + 0.5))
      .map((w) => ({
        kind: w.kind,
        name: WONDER_RULES[w.kind].name,
        description: WONDER_RULES[w.kind].description,
        x: w.x + 0.5,
        y: w.y + 0.5,
        held: wonderHeld(state, w),
      })),
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
    achievements: ACHIEVEMENTS.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      done: state.achievements[a.id] !== undefined,
    })),
    hint: hintOf(state),
    alerts: alertsOf(state),
    goal: goalSteps(FIRST_ERA.goal, tallyOf(state)).map((s) => ({
      label: GOAL_LABELS[s.kind],
      have: s.have,
      need: s.need,
      done: s.have >= s.need,
    })),
    peoples: state.peoples
      .filter((p) => p.met && p.tribe.population > 0)
      .map((p) => ({
        id: p.owner,
        name: p.name,
        population: Math.max(10, Math.round(p.tribe.population / 10) * 10),
        relation: Math.round(p.relation),
        mood: moodOf(p.relation),
        giftCost: `${RELATION_RULES.giftFood} rations`,
        giftBlocked: cannotGift(state, p),
        trade: `${RELATION_RULES.tradeSilex} silex → ${RELATION_RULES.tradeFood} rations`,
        tradeBlocked: cannotTrade(state, p),
        tension:
          closeCamps(state, p.owner) > 0 ? 'Vos campements sont trop proches des leurs' : null,
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

/** Saison en cours et son effet sur la cueillette, selon le climat des campements. */
function seasonView(state: GameState, month: number): SeasonView {
  const kind = seasonOf(month)
  return {
    kind,
    name: SEASON_RULES[kind].name,
    gather: Math.round(seasonalYield(month, climateOf(state)) * 100),
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
    case 'bandGaveUp':
      return 'La bande s’arrête : aucun chemin connu assez court ne mène à sa destination.'
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
    case 'rare':
      return rareNotice(event)
    case 'winter':
      return `L'hiver arrive : la cueillette tombe à ${Math.round(event.yieldFactor * 100)} % jusqu'au printemps.`
    case 'peopleMet':
      return `Rencontre : une de vos bandes aperçoit les terres du ${event.name}.`
    case 'raid': {
      if (event.killed > 0)
        return `Raid du ${event.name} : la réserve était vide, ${event.killed} des vôtres ${event.killed > 1 ? 'sont tués' : 'est tué'}.`
      if (event.stolen === 0) return `Raid du ${event.name} : vos chasseurs les repoussent.`
      const saved = event.saved > 0 ? ` (vos chasseurs en sauvent ${event.saved})` : ''
      return `Raid du ${event.name} : ${event.stolen} rations volées${saved}.`
    }
    case 'peopleGone':
      return `Le ${event.name} a disparu : ses terres sont désertes.`
    case 'achievement':
      return `Succès : ${event.name}.`
    case 'meatLost':
      return `Chasse : la réserve est pleine, ${event.amount} rations de viande sont perdues.`
    case 'hunterKilled':
      return `Chasse : un chasseur de la bande est mort face aux ${ANIMAL_RULES[event.animal].name.toLowerCase()}.`
  }
}

/** Rédige un événement rare : son nom, son rang de rareté, puis ce qu'il change. */
function rareNotice(event: Extract<GameEvent, { type: 'rare' }>): string {
  const rules = EVENT_RULES[event.event]
  const n = Math.abs(event.amount)
  const what = ((): string => {
    switch (event.event) {
      case 'abondance':
        return `les baies et le gibier abondent, ${n} rations de plus en réserve`
      case 'tempete':
        return `une tempête gâte une part de la réserve, ${n} rations perdues`
      case 'maladie':
        return `une maladie emporte ${n} ${n > 1 ? 'personnes' : 'personne'}`
      case 'nouveauxVenus':
        return `${n} ${n > 1 ? 'errants rejoignent' : 'errant rejoint'} la tribu`
      case 'migration':
        return `un grand troupeau de ${n} bêtes passe près du camp`
      case 'filon':
        return `un filon de ${RESOURCE_RULES[rules.deposit!.kind].name.toLowerCase()} de rang ${event.rank} affleure sur le territoire`
      case 'etoile':
        return `une étoile filante inspire la tribu, la recherche en cours avance d'un coup`
    }
  })()
  return `${rules.name} (${rules.rank}) : ${what}.`
}

/** La tribu, arrondie pour l'affichage. */
function tribeView(state: GameState): TribeView {
  const { tribe } = state
  return {
    population: tribe.population,
    food: Math.floor(tribe.food),
    foodCapacity: Math.floor(foodCapacity(state)),
    foodBalance:
      Math.round(
        (tribe.lastProduction + tribe.lastCrops - tribe.lastConsumption - tribe.lastSpoiled) * 10,
      ) / 10,
    spoiled: Math.round(tribe.lastSpoiled * 10) / 10,
    starving: tribe.starvingMonths > 0,
    materials: RESOURCE_KINDS.filter((k) => tribe.materials[k] !== undefined).map((k) => ({
      kind: k,
      name: RESOURCE_RULES[k].name,
      amount: Math.floor(tribe.materials[k]!),
    })),
    hunters: huntersOf(state),
    huntersResting: tribe.food >= foodCapacity(state),
    camps: state.camps.filter((c) => c.owner === PLAYER).length,
    bands: bandsOf(state).length,
    efficiency: tribeEfficiency(state),
    villages: villageCount(state),
    maxVillages: maxVillages(state),
    villageCost: VILLAGE_RULES.foodCost,
    villageBlocked: cannotBuildVillage(state),
    cities: cityCount(state),
    maxCities: maxCities(state),
    cityCost: `${CITY_RULES.foodCost} rations et ${CITY_RULES.copperCost} cuivre`,
    cityBlocked: cannotBuildCity(state),
    crops: Math.round(tribe.lastCrops),
  }
}

/** Ce que devient ce campement du joueur s'il grandit : village, puis cité. */
function upgradeOf(state: GameState, camp: Camp): CampView['upgrade'] {
  if (camp.owner !== PLAYER || camp.city) return null
  if (!camp.village)
    return {
      to: 'village',
      cost: `${VILLAGE_RULES.foodCost} rations`,
      blocked: cannotBuildVillage(state, camp.id),
    }
  return {
    to: 'city',
    cost: `${CITY_RULES.foodCost} rations et ${CITY_RULES.copperCost} cuivre`,
    blocked: cannotBuildCity(state, camp.id),
  }
}

/** Gisements que le joueur a déjà vus. */
function depositViews(state: GameState): DepositView[] {
  const { cells } = state.fog
  const { width } = state.world
  return state.deposits
    .filter((d) => cells[d.y * width + d.x] !== Visibility.Unknown && resourceKnown(state, d.kind))
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

function changed(a: Rect | null, b: Rect | null): Rect | null {
  return b ? unionRect(a, b) : a
}

/** Cellule déjà découverte par le joueur (vue ou déjà vue). */
function known(state: GameState, x: number, y: number): boolean {
  const i = Math.floor(y) * state.world.width + Math.floor(x)
  return state.fog.cells[i] !== Visibility.Unknown
}

/**
 * Propriétaires de la zone modifiée, sans rien trahir : sous le brouillard inconnu, les terres
 * d'un peuple voisin restent blanches. La zone suit aussi le brouillard, pour qu'elles
 * paraissent dès qu'on les découvre.
 */
function territoryPatch(state: GameState, rect: Rect | null): GridPatch | null {
  const patch = patchOf(state.territory.owner, state.world.width, rect)
  if (!patch) return null
  const { cells } = state.fog
  for (let y = 0; y < patch.h; y++) {
    for (let x = 0; x < patch.w; x++) {
      const k = y * patch.w + x
      if (
        patch.data[k]! > PLAYER &&
        cells[(patch.y + y) * state.world.width + patch.x + x] === Visibility.Unknown
      )
        patch.data[k] = 0
    }
  }
  return patch
}

/** Abondance de la zone modifiée, en octets (255 : intacte). */
export function abundancePatch(state: GameState, rect: Rect | null): GridPatch | null {
  if (!rect || rect.w <= 0 || rect.h <= 0) return null
  const { width } = state.world
  const data = new Uint8Array(rect.w * rect.h)
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const a = state.abundance[(rect.y + y) * width + rect.x + x]!
      data[y * rect.w + x] = Math.round(Math.min(1, Math.max(0, a)) * 255)
    }
  }
  return { ...rect, data }
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
  const monthly = workPerMonth(state.tribe.population) * (1 + inventionBoost(state))
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

/**
 * Cellules découvertes au-delà desquelles on a exploré : au départ, la bande en voit environ
 * 600 ; il faut l'avoir un peu promenée pour en connaître le double.
 */
const HINT_EXPLORED_CELLS = 1200

/**
 * Conseil du moment pour qui découvre le jeu : la première étape pas encore franchie, ou
 * null une fois les bases acquises.
 */
export function hintOf(state: GameState): string | null {
  const camps = state.camps.filter((c) => c.owner === PLAYER)
  const home = camps[0]
  // Durable : une fois assez de terres découvertes, le conseil ne revient pas quand la bande
  // s'arrête. Un ordre en cours suffit pour réagir tout de suite.
  const explored =
    camps.length > 1 ||
    home?.target != null ||
    (home !== undefined && state.fog.known >= HINT_EXPLORED_CELLS)
  if (!explored)
    return 'Choisissez la bande (clic sur le camp) puis clic droit sur la carte : elle y marche, et ce qu’elle voit se dévoile.'
  const { ranks, current } = state.inventions
  if (Object.keys(ranks).length === 0 && !current)
    return 'Lancez une invention dans le panneau des inventions : le panier nourrit mieux, la lance rend la chasse plus sûre.'
  if (camps.length < 2 && bandAbundance(state, home!) < 0.8)
    return 'La bande épuise ses terres : choisissez-la (clic sur le camp) puis clic droit plus loin pour la déplacer, ou laissez-la « migrer seule ».'
  if (camps.length < 2)
    return `Une bande cueille au mieux jusqu’à ${BAND_RULES.comfortSize} personnes : au-delà, scindez-la (camp choisi, « Scinder ») pour exploiter deux terres.`
  if (villageCount(state) === 0)
    return 'Inventez l’agriculture (après le panier et la taille du silex), puis faites d’un campement un village (« + » des villages).'
  return null
}
