export const SAVE_VERSION = 1;

export const UPGRADE_GROWTH_RATE = 1.15;
export const STORAGE_CAPACITY_BASE = 1000;
export const STORAGE_CAPACITY_PER_LEVEL = 0.25;

export const RESEARCH_TIER_MULTIPLIERS: readonly number[] = [1, 2, 5, 10];

export const MASTERY_BASE_XP = 100;
export const MASTERY_XP_EXPONENT = 1.5;

export const PRESTIGE_BONUS_PER_POINT = 0.02;
export const OFFLINE_CAP_SECONDS = 24 * 60 * 60;

/** Cost of upgrade at a given level: baseCost × GROWTH_RATE ^ level */
export function upgradeCost(baseCost: number, level: number): number {
  return Math.ceil(baseCost * Math.pow(UPGRADE_GROWTH_RATE, level));
}

/** XP needed to advance past the current mastery level. */
export function masteryXpRequired(level: number): number {
  return Math.ceil(MASTERY_BASE_XP * Math.pow(level, MASTERY_XP_EXPONENT));
}

/** Prestige points awarded for a given lifetime production total. */
export function calcPrestigePoints(lifetimeProduction: number): number {
  if (lifetimeProduction <= 0) return 0;
  return Math.floor(Math.log10(lifetimeProduction));
}

/** Production multiplier from accumulated prestige points. */
export function prestigeBonus(points: number): number {
  return 1 + points * PRESTIGE_BONUS_PER_POINT;
}

/** Effective research time accounting for tier and tree depth. */
export function calcResearchTime(baseTime: number, tier: number, depth: number): number {
  const idx = Math.min(tier - 1, RESEARCH_TIER_MULTIPLIERS.length - 1);
  const mult = RESEARCH_TIER_MULTIPLIERS[idx] ?? 1;
  return baseTime * mult * depth;
}
