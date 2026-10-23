/** API publique du moteur. Les autres couches n'importent que d'ici. */
export type { Command, CommandResult } from './commands'
export {
  SPEEDS,
  MONTHS_PER_SECOND,
  STEPS_PER_MONTH,
  stepsDue,
  stepsPerSecond,
  dateOfTick,
  isSpeed,
} from './core/clock'
export type { Speed, ClockState, GameDate } from './core/clock'
export type { Rect } from './core/geometry'
export { unionRect } from './core/geometry'
export { Biome, BIOMES, BIOME_COUNT, isWater } from './content/biomes'
export type { BiomeId } from './content/biomes'
export { ERAS, FIRST_ERA, SCORE_RULES } from './content/eras'
export { Visibility } from './fog/fog'
export { PLAYER, NO_OWNER } from './territory/territory'
export { TRIBE_RULES } from './content/tribe'
export { INVENTION_KINDS, INVENTION_RULES } from './content/inventions'
export type { InventionKind } from './content/inventions'
export { cannotStart, inventionStat, nextCost, workPerMonth } from './inventions/inventions'
export { CAMP_RULES } from './content/camps'
export { BAND_RULES } from './content/bands'
export { ANIMAL_KINDS, ANIMAL_RULES, HUNT_RULES } from './content/fauna'
export type { AnimalKind } from './content/fauna'
export type { Herd } from './fauna/fauna'
export { RANKS, RANK_RULES } from './content/rarity'
export type { Rank } from './content/rarity'
export { RESOURCE_KINDS, RESOURCE_RULES } from './content/resources'
export { EXPLORE_RULES } from './content/units'
export { bandSight, herdsSeenBy } from './bands/sight'
export type { ResourceKind } from './content/resources'
export { depositYield } from './resources/deposits'
export { rollRank, statAt, rollStat } from './rarity/rarity'
export type { RankedStat } from './rarity/rarity'
export type { Deposit } from './resources/deposits'
export { storageCapacity } from './tribe/tribe'
export type { TribeState } from './tribe/tribe'
export {
  createGame,
  applyCommand,
  advance,
  step,
  clearDirty,
  startYear,
  depositHeld,
  resourceKnown,
  foodCapacity,
  herdVisible,
  currentScore,
  tallyOf,
  bandsOf,
  bandAbundance,
  campEfficiency,
  tribeEfficiency,
  cannotSplit,
  huntersIn,
  huntersOf,
  climateOf,
  cannotGift,
  cannotTrade,
  closeCamps,
  moodOf,
  cannotBuildVillage,
  maxVillages,
  villageCount,
  cannotBuildCity,
  maxCities,
  cityCount,
  inventionBoost,
  wonderHeld,
  achievementFacts,
  cropsOf,
  START_CHOICES,
} from './game'
export type { GameState, GameEvent, NewGameOptions, Camp, Outcome, People } from './game'
export { goalSteps, goalReached, scoreOf } from './score/score'
export type { Tally, GoalStep } from './score/score'
export type { World } from './world/world'
export { SEASON_KINDS, SEASON_RULES, CLIMATE_RULES } from './content/seasons'
export type { SeasonKind } from './content/seasons'
export { seasonOf, seasonalYield, climateAmplitude, spoilage } from './climate/seasons'
export { saveGame, loadGame, SAVE_VERSION } from './save/save'
export type { SaveData } from './save/save'
export { VILLAGE_RULES, FERTILITY } from './content/villages'
export { CITY_RULES } from './content/cities'
export { WONDER_RULES, WONDER_KINDS, WONDER_PLACEMENT } from './content/wonders'
export type { WonderKind } from './content/wonders'
export { EVENT_KINDS, EVENT_RULES, EVENT_RULES_GLOBAL } from './content/events'
export type { EventKind } from './content/events'
export { PEOPLE_RULES, PEOPLE_NAMES } from './content/peoples'
export { RELATION_RULES, MOODS } from './content/relations'
export { WORLD_SIZES, GAME_SETUP } from './content/setup'
export type { WorldSize } from './content/setup'
export { ACHIEVEMENTS } from './content/achievements'
