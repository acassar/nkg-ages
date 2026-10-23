import type { ResourceKind } from '../content/resources'
import { TRIBE_RULES, type TribeRules } from '../content/tribe'

export interface TribeState {
  population: number
  /** Réserve de nourriture, en rations. */
  food: number
  /** Accumulateur de naissances : une personne de plus à chaque unité franchie. */
  growth: number
  /** Mois de famine consécutifs (0 hors famine). */
  starvingMonths: number
  /** Dernier bilan mensuel, pour l'affichage. */
  lastProduction: number
  lastConsumption: number
  /** Rations gâtées dans la réserve au dernier mois. */
  lastSpoiled: number
  /** Rations moissonnées dans les champs des villages au dernier mois. */
  lastCrops: number
  /** Matériaux entassés (silex…), sans limite pour l'instant. */
  materials: Partial<Record<ResourceKind, number>>
}

export function createTribe(rules: TribeRules = TRIBE_RULES): TribeState {
  return {
    population: rules.startPopulation,
    food: rules.startPopulation * rules.rationPerPerson * rules.startReserveMonths,
    growth: 0,
    starvingMonths: 0,
    lastProduction: 0,
    lastConsumption: 0,
    lastSpoiled: 0,
    lastCrops: 0,
    materials: {},
  }
}

/** Ce qu'il s'est passé ce mois-ci, pour prévenir le joueur. */
export type TribeOutcome = 'stable' | 'birth' | 'famineStarts' | 'famine'

/** Rations qu'offre le territoire en un mois, avant de compter les bras. */
export function territoryFood(
  territoryRichness: number,
  depositFood = 0,
  rules: TribeRules = TRIBE_RULES,
): number {
  return territoryRichness * rules.yieldPerCell + depositFood
}

/** Rations récoltées en un mois : bornées par les bras et par ce qu'offre le territoire. */
export function production(
  population: number,
  available: number,
  rules: TribeRules = TRIBE_RULES,
): number {
  return Math.min(population * rules.gatherPerPerson, available)
}

export function storageCapacity(
  population: number,
  extraMonths = 0,
  rules: TribeRules = TRIBE_RULES,
): number {
  return Math.max(1, population) * rules.rationPerPerson * (rules.storageMonths + extraMonths)
}

/** Effets des inventions sur la tribu ce mois-ci. */
export interface TribeBonus {
  /** Part de récolte en plus (0,1 = +10 %). */
  gather: number
  /** Mois de réserve en plus. */
  storageMonths: number
  /** Natalité en plus (0,2 = +20 %). */
  growth?: number
  /** Pertes de famine en moins (0,3 = -30 %). */
  famineShield?: number
  /** Efficacité des cueilleurs (1 : au mieux ; une bande trop grande cueille moins). */
  efficiency?: number
}

export const NO_BONUS: TribeBonus = { gather: 0, storageMonths: 0 }

/**
 * Un mois de vie de la tribu : récolte, repas, puis naissances ou famine.
 * `available` : rations qu'offre le territoire ce mois-ci (voir territoryFood).
 */
export function tickTribe(
  tribe: TribeState,
  available: number,
  bonus: TribeBonus = NO_BONUS,
  /** Habitants occupés ailleurs (les chasseurs) : ils mangent mais ne cueillent pas. */
  away = 0,
  rules: TribeRules = TRIBE_RULES,
): TribeOutcome {
  if (tribe.population <= 0) return 'stable'
  const gatherers = Math.max(0, tribe.population - away)
  const hands = gatherers * (bonus.efficiency ?? 1)
  const produced = production(hands, available, rules) * (1 + bonus.gather)
  const eaten = tribe.population * rules.rationPerPerson
  tribe.lastProduction = produced
  tribe.lastConsumption = eaten
  tribe.food = Math.min(
    tribe.food + produced - eaten,
    storageCapacity(tribe.population, bonus.storageMonths, rules),
  )

  if (tribe.food < 0) {
    tribe.food = 0
    tribe.growth = 0
    const loss = rules.famineLoss * (1 - Math.min(1, bonus.famineShield ?? 0))
    const lost = Math.max(1, Math.round(tribe.population * loss))
    tribe.population = Math.max(0, tribe.population - lost)
    tribe.starvingMonths++
    return tribe.starvingMonths === 1 ? 'famineStarts' : 'famine'
  }
  tribe.starvingMonths = 0
  if (tribe.food >= eaten * rules.comfortMonths) {
    tribe.growth +=
      tribe.population *
      rules.growthPerMonth *
      (1 + (bonus.growth ?? 0)) *
      growthFactor(produced, eaten, rules)
    if (tribe.growth >= 1) {
      const born = Math.floor(tribe.growth)
      tribe.growth -= born
      tribe.population += born
      return 'birth'
    }
  }
  return 'stable'
}

/**
 * Multiplicateur de croissance selon le surplus du mois. Une réserve pleine sans surplus
 * garde une croissance minimale (un quart), pour qu'une tribu à l'équilibre vive encore.
 */
export function growthFactor(produced: number, eaten: number, rules: TribeRules = TRIBE_RULES) {
  if (eaten <= 0) return 0
  const surplus = (produced - eaten) / eaten / rules.surplusForGrowth
  return Math.min(rules.maxGrowthFactor, Math.max(0.25, surplus))
}
