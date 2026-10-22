/** API publique du moteur. Les autres couches n'importent que d'ici. */
export type { Command, CommandResult } from './commands'
export { SPEEDS, TICKS_PER_SECOND, ticksDue, dateOfTick, isSpeed } from './core/clock'
export type { Speed, ClockState, GameDate } from './core/clock'
export type { Rect } from './core/geometry'
export { Biome, BIOMES, BIOME_COUNT, isWater } from './content/biomes'
export type { BiomeId } from './content/biomes'
export { ERAS, FIRST_ERA } from './content/eras'
export { Visibility } from './fog/fog'
export { PLAYER, NO_OWNER } from './territory/territory'
export { UNIT_RULES } from './units/units'
export { TRIBE_RULES } from './content/tribe'
export { RANKS, RANK_RULES } from './content/rarity'
export type { Rank } from './content/rarity'
export { RESOURCE_KINDS, RESOURCE_RULES } from './content/resources'
export type { ResourceKind } from './content/resources'
export { depositYield, rollRank } from './resources/deposits'
export type { Deposit } from './resources/deposits'
export { storageCapacity } from './tribe/tribe'
export type { TribeState } from './tribe/tribe'
export type { UnitKind } from './units/units'
export {
  createGame,
  applyCommand,
  step,
  clearDirty,
  startYear,
  depositHeld,
  START_CHOICES,
} from './game'
export type { GameState, GameEvent, NewGameOptions, Camp } from './game'
export type { World } from './world/world'
