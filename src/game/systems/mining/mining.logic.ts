import type { GameState } from '@/types/game.types';
import type { GalaxyState } from '@/types/galaxy.types';
import { ORE_BELTS, MINING_UPGRADES } from './mining.config';
import { getSkillLevel } from '@/game/systems/skills/skills.logic';
import {
  BASE_ORE_HOLD_CAPACITY,
  BASE_HAUL_SECONDS,
  MIN_HAUL_SECONDS,
} from '@/game/balance/constants';
import { getSystemById, getSystemBeltIds } from '@/game/galaxy/galaxy.gen';
import { HULL_DEFINITIONS } from '@/game/systems/fleet/fleet.config';

// ─── Result type ────────────────────────────────────────────────────────────

export interface MiningTickResult {
  /**
   * Always empty — belt ore production is now handled by fleet.tick.ts → fleet cargoHolds.
   * Kept for type compatibility with existing save/load code.
   */
  oreHoldDeltas: Record<string, number>;
  /** Updated pool levels for each belt that has respawned this tick. */
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

/** True if the player has unlocked the belt via skill training or the unlock map.
 * No longer checks player location — any skilled corp can mine any belt. */
function isBeltAccessible(state: GameState, beltId: string): boolean {
  const def = ORE_BELTS[beltId];
  if (!def) return false;
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

/** Effective auto-haul interval in seconds.
 * Reduced by haul-speed modifier (skills/upgrades) and by ships with activity 'hauling'.
 * Hauling ships each contribute their pilot's hauling skill × hull cargo multiplier.
 * Maximum combined reduction is capped at 70%. */
export function getHaulIntervalSeconds(state: GameState): number {
  const haulMod = state.modifiers['haul-speed'] ?? 0;

  let activityBonus = 0;
  for (const ship of Object.values(state.systems.fleet.ships)) {
    if (ship.activity !== 'hauling') continue;
    if (!ship.assignedPilotId) continue;
    const pilot = state.systems.fleet.pilots[ship.assignedPilotId];
    if (!pilot) continue;
    // Each hauling ship reduces interval proportionally based on pilot + cargo hull
    const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
    const cargoMult = hull ? hull.baseCargoMultiplier : 1.0;
    activityBonus += 0.05 * cargoMult;
  }

  const totalReduction = Math.min(0.70, haulMod + activityBonus);
  return Math.max(MIN_HAUL_SECONDS, Math.floor(BASE_HAUL_SECONDS * (1 - totalReduction)));
}

/**
 * Returns the belt IDs present in the given system.
 * Pure function — does not depend on player location.
 */
export function getBeltsForSystem(systemId: string, galaxySeed: number): string[] {
  const system = getSystemById(galaxySeed, systemId);
  return getSystemBeltIds(system);
}

/**
 * Richness multiplier for a belt in a specific system (1.0 = nominal).
 * Pure function — does not depend on player location.
 */
export function getBeltRichnessForSystem(galaxy: GalaxyState, beltId: string, systemId: string): number {
  const system = getSystemById(galaxy.seed, systemId);
  for (const body of system.bodies) {
    if (body.beltIds.includes(beltId)) {
      const override = galaxy.beltRichnessOverride?.[systemId]?.[beltId];
      return override ?? body.richness[beltId] ?? 1.0;
    }
  }
  return 1.0;
}

/**
 * Richness multiplier for a belt in the current system (1.0 = nominal).
 * Higher richness = faster yield rate.
 */
export function getBeltRichness(state: GameState, beltId: string): number {
  if (!state.galaxy) return 1.0;
  return getBeltRichnessForSystem(state.galaxy, beltId, state.galaxy.currentSystemId);
}

/** Effective pool size for a belt after upgrades/skills. */
export function getEffectiveBeltPool(state: GameState, beltId: string): number {
  const def = ORE_BELTS[beltId];
  if (!def) return 0;
  const poolMod = state.modifiers['belt-pool-size'] ?? 0;
  return Math.floor(def.poolSize * (1 + poolMod));
}

// ─── Main tick function ──────────────────────────────────────────────────────

/**
 * Ticks belt pool respawn timers only.
 * Ore production is now handled exclusively by fleet.tick.ts → fleet cargoHolds.
 * This function restores depleted belt pools when their respawn timer expires.
 */
export function tickMining(state: GameState, deltaSeconds: number): MiningTickResult {
  const beltRespawnAt = state.systems.mining.beltRespawnAt ?? {};
  const nowMs = state.lastUpdatedAt + Math.round(deltaSeconds * 1000);

  const newBeltPool: Record<string, number> = {};
  const newBeltRespawnAt: Record<string, number> = {};

  // Restore any belts whose respawn timer has elapsed
  for (const [beltId, respawnAt] of Object.entries(beltRespawnAt)) {
    if (respawnAt > 0 && nowMs >= respawnAt) {
      newBeltPool[beltId]      = getEffectiveBeltPool(state, beltId);
      newBeltRespawnAt[beltId] = 0;
    }
  }

  return { oreHoldDeltas: {}, newBeltPool, newBeltRespawnAt, autoDeactivated: [] };
}

