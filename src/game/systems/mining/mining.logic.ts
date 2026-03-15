import type { GameState } from '@/types/game.types';
import { ORE_BELTS, MINING_UPGRADES } from './mining.config';
import { getSkillLevel } from '@/game/systems/skills/skills.logic';
import {
  BASE_ORE_HOLD_CAPACITY,
  BASE_HAUL_SECONDS,
  MIN_HAUL_SECONDS,
} from '@/game/balance/constants';
import { getSystemById, getSystemBeltIds } from '@/game/galaxy/galaxy.gen';

// ─── Result type ────────────────────────────────────────────────────────────

export interface MiningTickResult {
  /** Ore units added to the hold this tick, keyed by resourceId. */
  oreHoldDeltas: Record<string, number>;
  /** Updated pool levels for each belt that was mined (or respawned). */
  newBeltPool: Record<string, number>;
  /** Updated respawn timestamps (0 = belt is active). */
  newBeltRespawnAt: Record<string, number>;
  /** Belt IDs that were auto-deactivated because their pool hit 0. */
  autoDeactivated: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Total upgrade yield multiplier from purchased upgrades. */
export function getMiningUpgradeMultiplier(state: GameState): number {
  let bonus = 0;
  for (const [upgradeId, level] of Object.entries(state.systems.mining.upgrades)) {
    if (level <= 0) continue;
    const def = MINING_UPGRADES[upgradeId];
    if (!def) continue;
    bonus += (def.effects['mining-yield'] ?? 0) * level;
  }
  return 1 + bonus;
}

/** Multiplier from the Mining and Astrogeology skills. */
export function getMiningSkillMultiplier(state: GameState): number {
  const miningMod = state.modifiers['mining-yield'] ?? 0;
  return 1 + miningMod;
}

/** Fleet ship multiplier (highest active miningYieldMultiplier from assigned ships). */
export function getFleetMiningMultiplier(state: GameState): number {
  let best = 1;
  for (const ship of Object.values(state.systems.fleet.ships)) {
    if (ship.activity !== 'mining') continue;
    // TODO: reference ship definitions for actual multiplier — Phase 5
    best = Math.max(best, 1);
  }
  return best;
}

/** True if the player has unlocked the belt via skill training or the unlock map. */
function isBeltAccessible(state: GameState, beltId: string): boolean {
  const def = ORE_BELTS[beltId];
  if (!def) return false;
  // Belt must exist in the current system
  if (state.galaxy) {
    const currentSystem = getSystemById(state.galaxy.seed, state.galaxy.currentSystemId);
    const systemBelts   = getSystemBeltIds(currentSystem);
    if (!systemBelts.includes(beltId)) return false;
  }
  if (!def.requiredSkill) return true;
  if (state.unlocks[beltId]) return true;
  const lvl = getSkillLevel(state, def.requiredSkill.skillId);
  return lvl >= def.requiredSkill.minLevel;
}

/** Effective ore hold capacity in units (base × skill/upgrade modifiers). */
export function getOreHoldCapacity(state: GameState): number {
  const holdMod = state.modifiers['ore-hold-capacity'] ?? 0;
  return Math.floor(BASE_ORE_HOLD_CAPACITY * (1 + holdMod));
}

/** Current units stored in the ore hold. */
export function getOreHoldUsed(state: GameState): number {
  return Object.values(state.systems.mining.oreHold ?? {}).reduce((s, v) => s + v, 0);
}

/** Effective auto-haul interval in seconds. */
export function getHaulIntervalSeconds(state: GameState): number {
  const haulMod = state.modifiers['haul-speed'] ?? 0;
  return Math.max(MIN_HAUL_SECONDS, Math.floor(BASE_HAUL_SECONDS * (1 - haulMod)));
}

/**
 * Returns the belt IDs available in the current system, respecting skill gates.
 * Used by MiningPanel to know which tabs/belts to show.
 */
export function getCurrentSystemBeltIds(state: GameState): string[] {
  if (!state.galaxy) return Object.keys(ORE_BELTS);
  const system = getSystemById(state.galaxy.seed, state.galaxy.currentSystemId);
  return getSystemBeltIds(system);
}

/**
 * Richness multiplier for a belt in the current system (1.0 = nominal).
 * Higher richness = faster yield rate.
 */
export function getBeltRichness(state: GameState, beltId: string): number {
  if (!state.galaxy) return 1.0;
  const system = getSystemById(state.galaxy.seed, state.galaxy.currentSystemId);
  for (const body of system.bodies) {
    if (body.beltIds.includes(beltId)) {
      const override = state.galaxy.beltRichnessOverride?.[state.galaxy.currentSystemId]?.[beltId];
      return override ?? body.richness[beltId] ?? 1.0;
    }
  }
  return 1.0;
}

/** Effective pool size for a belt after upgrades/skills. */
function getEffectiveBeltPool(state: GameState, beltId: string): number {
  const def = ORE_BELTS[beltId];
  if (!def) return 0;
  const poolMod = state.modifiers['belt-pool-size'] ?? 0;
  return Math.floor(def.poolSize * (1 + poolMod));
}

// ─── Main tick function ──────────────────────────────────────────────────────

/** Produces ore into the hold, handles pool depletion and respawning. */
export function tickMining(state: GameState, deltaSeconds: number): MiningTickResult {
  const { targets } = state.systems.mining;
  const beltPool       = state.systems.mining.beltPool ?? {};
  const beltRespawnAt  = state.systems.mining.beltRespawnAt ?? {};
  const upgradeMultiplier = getMiningUpgradeMultiplier(state);
  const skillMultiplier   = getMiningSkillMultiplier(state);
  const fleetMultiplier   = getFleetMiningMultiplier(state);
  const deepOreBonus      = 1 + (state.modifiers['deep-ore-yield'] ?? 0);
  const nowMs             = state.lastUpdatedAt + Math.round(deltaSeconds * 1000);

  const capacity        = getOreHoldCapacity(state);
  const currentHoldUsed = getOreHoldUsed(state);
  let availableHoldSpace = Math.max(0, capacity - currentHoldUsed);

  const oreHoldDeltas:   Record<string, number> = {};
  const newBeltPool:     Record<string, number> = {};
  const newBeltRespawnAt: Record<string, number> = {};
  const autoDeactivated: string[] = [];

  // ── 1. Check respawn timers ──────────────────────────────────────────────
  for (const [beltId, respawnAt] of Object.entries(beltRespawnAt)) {
    if (respawnAt > 0 && nowMs >= respawnAt) {
      // Belt has respawned — restore pool; leave respawnAt as 0
      newBeltPool[beltId]     = getEffectiveBeltPool(state, beltId);
      newBeltRespawnAt[beltId] = 0;
    }
  }

  // ── 2. Mine active belts ────────────────────────────────────────────────
  for (const [beltId, isActive] of Object.entries(targets)) {
    if (!isActive) continue;
    if (!isBeltAccessible(state, beltId)) continue;

    const def = ORE_BELTS[beltId];
    if (!def) continue;

    // Is this belt in a respawning state?
    const effectiveRespawnAt = newBeltRespawnAt[beltId] ?? beltRespawnAt[beltId] ?? 0;
    if (effectiveRespawnAt > 0) continue; // still depleted

    const effectivePool = getEffectiveBeltPool(state, beltId);
    // Undefined pool entry = belt is at full capacity (safe default for old saves)
    const poolRemaining = newBeltPool[beltId] ?? beltPool[beltId] ?? effectivePool;

    const isDeep = def.securityTier === 'lowsec' || def.securityTier === 'nullsec';
    const deepFactor    = isDeep ? deepOreBonus : 1;
    const richnessFactor = getBeltRichness(state, beltId);

    // Total raw yield for this tick across all outputs
    let totalYieldThisTick = 0;
    for (const output of def.outputs) {
      totalYieldThisTick +=
        output.baseRate * upgradeMultiplier * skillMultiplier * fleetMultiplier * deepFactor * richnessFactor * deltaSeconds;
    }

    // Clamp to: available hold space AND remaining pool
    const actualYield = Math.min(totalYieldThisTick, availableHoldSpace, poolRemaining);
    if (actualYield <= 0) continue;

    // Distribute proportionally across outputs
    const scale = actualYield / totalYieldThisTick;
    for (const output of def.outputs) {
      const amount =
        output.baseRate * upgradeMultiplier * skillMultiplier * fleetMultiplier * deepFactor * richnessFactor * deltaSeconds * scale;
      if (amount > 0) {
        oreHoldDeltas[output.resourceId] = (oreHoldDeltas[output.resourceId] ?? 0) + amount;
      }
    }

    availableHoldSpace -= actualYield;

    const newPool = poolRemaining - actualYield;
    newBeltPool[beltId] = newPool;

    if (newPool <= 0) {
      // Belt exhausted
      newBeltPool[beltId]      = 0;
      const respawnSpeedMod    = state.modifiers['belt-respawn-speed'] ?? 0;
      const respawnMs          = Math.floor(def.respawnSeconds / (1 + respawnSpeedMod)) * 1000;
      newBeltRespawnAt[beltId] = nowMs + respawnMs;
      autoDeactivated.push(beltId);
    }
  }

  return { oreHoldDeltas, newBeltPool, newBeltRespawnAt, autoDeactivated };
}

