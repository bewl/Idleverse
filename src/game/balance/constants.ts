export const SAVE_VERSION = 2; // incremented for full Eve-pivot data migration

export const UPGRADE_GROWTH_RATE = 1.15;
export const OFFLINE_CAP_SECONDS = 24 * 60 * 60;

/**
 * Base training seconds per skill level for rank-1 skills.
 * Actual time = SKILL_LEVEL_SECONDS[level - 1] × skill.rank
 *
 *   Lv1 =  1 min,  Lv2 =  5 min,  Lv3 = 30 min,  Lv4 = 3 hr,  Lv5 = 18 hr
 */
export const SKILL_LEVEL_SECONDS: readonly number[] = [60, 300, 1800, 10800, 64800];

/** Seconds to train a specific skill level. */
export function skillTrainingSeconds(rank: number, level: number): number {
  const base = SKILL_LEVEL_SECONDS[level - 1] ?? SKILL_LEVEL_SECONDS[4];
  return base * rank;
}

/** Cost of an upgrade at a given level: baseCost × GROWTH_RATE ^ level */
export function upgradeCost(baseCost: number, level: number): number {
  return Math.ceil(baseCost * Math.pow(UPGRADE_GROWTH_RATE, level));
}

// ─── Ore Hold & Haul ──────────────────────────────────────────────────────
/** Base ore hold capacity in units before any skill/upgrade bonuses. */
export const BASE_ORE_HOLD_CAPACITY = 5_000;

/** Hull damage repaired per second while a ship is idle. ~1.5% per minute. */
export const IDLE_REPAIR_RATE_PER_SEC = 1.5 / 60;
/** Base auto-haul interval in seconds. */
export const BASE_HAUL_SECONDS = 120;
/** Minimum auto-haul interval in seconds regardless of upgrades. */
export const MIN_HAUL_SECONDS = 10;

