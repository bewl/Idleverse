export const SAVE_VERSION = 3; // reward inventory foundation

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

/** Base cargo capacity per ship slot in m³, scaled by hull.baseCargoMultiplier. */
export const BASE_SHIP_CARGO_M3 = 500;
/** Base auto-haul interval in seconds. */
export const BASE_HAUL_SECONDS = 120;
/** Minimum auto-haul interval in seconds regardless of upgrades. */
export const MIN_HAUL_SECONDS = 10;
/** Minimum time spent offloading cargo at HQ after a haul trip arrives. */
export const BASE_HAUL_OFFLOAD_SECONDS = 8;
/** Absolute floor for cargo transfer time after all bonuses are applied. */
export const MIN_HAUL_OFFLOAD_SECONDS = 3;
/** Additional seconds added per cargo unit being offloaded. */
export const HAUL_OFFLOAD_SECONDS_PER_UNIT = 1 / 250;
/** Maximum HQ offload time regardless of cargo volume. */
export const MAX_HAUL_OFFLOAD_SECONDS = 24;
/** Maximum percentage reduction allowed from cargo-transfer-speed sources. */
export const MAX_HAUL_OFFLOAD_SPEED_REDUCTION = 0.7;
/** Hull-based cargo-transfer reduction per point of base cargo multiplier. */
export const HAULER_TRANSFER_HULL_BONUS_PER_MULTIPLIER = 0.02;
/** Cap on hull-derived cargo-transfer reduction. */
export const MAX_HAULER_TRANSFER_HULL_BONUS = 0.24;

export function computeHaulOffloadSeconds(cargoUnits: number, speedReduction = 0): number {
  const scaled = BASE_HAUL_OFFLOAD_SECONDS + Math.max(0, cargoUnits) * HAUL_OFFLOAD_SECONDS_PER_UNIT;
  const cappedReduction = Math.min(MAX_HAUL_OFFLOAD_SPEED_REDUCTION, Math.max(0, speedReduction));
  const adjusted = scaled * (1 - cappedReduction);
  return Math.min(MAX_HAUL_OFFLOAD_SECONDS, Math.max(MIN_HAUL_OFFLOAD_SECONDS, adjusted));
}

