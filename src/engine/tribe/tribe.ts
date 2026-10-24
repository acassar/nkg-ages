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

/**
 * Un groupe qui vit de sa réserve : la tribu d'un peuple voisin, ou un campement du joueur
 * (bande ou village), qui a ses propres vivres.
 */
export type Group = Omit<TribeState, 'materials'>

/** Réserve d'un campement du joueur : ses vivres et son dernier bilan (ses gens sont à part). */
export type Larder = Omit<Group, 'population'> & {
  /** Rations de viande rapportées par ses chasseurs au dernier mois. */
  lastMeat: number
}

/** Une réserve neuve, avec tant de rations. */
export function createLarder(food: number): Larder {
  return {
    food,
    growth: 0,
    starvingMonths: 0,
    lastProduction: 0,
    lastConsumption: 0,
    lastSpoiled: 0,
    lastCrops: 0,
    lastMeat: 0,
  }
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
 * Le groupe ne cueille que ce qui lui manque pour finir le mois réserve pleine : au-delà,
 * il userait ses terres pour rien. Les naissances suivent les vivres en réserve, tant
 * qu'elle ne fond pas.
 */
export function tickTribe(
  tribe: Group,
  available: number,
  bonus: TribeBonus = NO_BONUS,
  /** Habitants occupés ailleurs (les chasseurs) : ils mangent mais ne cueillent pas. */
  away = 0,
  /** Rations déjà rentrées ce mois-ci dans `tribe.food` (viande, moisson). */
  brought = 0,
  rules: TribeRules = TRIBE_RULES,
): TribeOutcome {
  if (tribe.population <= 0) return 'stable'
  const before = tribe.food - brought
  const gatherers = Math.max(0, tribe.population - away)
  const hands = gatherers * (bonus.efficiency ?? 1)
  const could = production(hands, available, rules) * (1 + bonus.gather)
  const eaten = tribe.population * rules.rationPerPerson
  const capacity = storageCapacity(tribe.population, bonus.storageMonths, rules)
  const produced = Math.max(0, Math.min(could, capacity + eaten - tribe.food))
  tribe.lastProduction = produced
  tribe.lastConsumption = eaten
  tribe.food = Math.min(tribe.food + produced - eaten, capacity)

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
  // Une réserve qui fond ce mois-ci (l'hiver, des terres usées) ne fait pas naître.
  if (tribe.food >= before && tribe.food >= eaten * rules.comfortMonths) {
    tribe.growth +=
      tribe.population *
      rules.growthPerMonth *
      (1 + (bonus.growth ?? 0)) *
      growthFactor(tribe.food, eaten, rules)
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
 * Multiplicateur de croissance selon les mois de vivres en réserve : `minGrowthFactor` au seuil
 * de confort, `maxGrowthFactor` à `fullMonths` mois, en ligne droite entre les deux. En mois,
 * et non en part de la réserve, évite que la conservation (une réserve plus grande) ne
 * freine la natalité d'une bande qui a autant à manger.
 */
export function growthFactor(food: number, eaten: number, rules: TribeRules = TRIBE_RULES) {
  if (eaten <= 0) return 0
  const months = food / eaten
  if (months < rules.comfortMonths) return 0
  const t = (months - rules.comfortMonths) / (rules.fullMonths - rules.comfortMonths)
  const { minGrowthFactor: low, maxGrowthFactor: high } = rules
  return Math.min(high, low + t * (high - low))
}
