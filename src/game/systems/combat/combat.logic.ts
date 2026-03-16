import type { GameState } from '@/types/game.types';
import type { NpcGroupDef, CombatLogEntry } from '@/types/combat.types';
import {
  NPC_FACTION_CONFIGS_BY_SECURITY,
  NPC_GROUP_COUNT_BY_SECURITY,
  COMBAT_TICK_INTERVAL_SECONDS,
  COMBAT_LOG_MAX_ENTRIES,
  NPC_RESPAWN_HOURS,
} from './combat.config';
import { mulberry32, childSeed, randInt, randFloat, randPick } from '@/game/utils/prng';
import { generateGalaxy } from '@/game/galaxy/galaxy.gen';
import { getCorpHqBonusFromState } from '@/game/systems/factions/faction.logic';
import { computeRoleAdjustedCombatStats } from '@/game/systems/fleet/fleet.logic';
import { getOperationalFleetShipIds } from '@/game/systems/fleet/wings.logic';

// ─── String → seed helper ───────────────────────────────────────────────────

/** FNV-1a hash: maps arbitrary string to a stable uint32. */
function strHash(s: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

// ─── NPC group generation ──────────────────────────────────────────────────

/**
 * Deterministically generate NPC groups for a system.
 * Returns an empty array for highsec systems.
 */
export function generateNpcGroupsForSystem(
  galaxySeed: number,
  systemId: string,
): NpcGroupDef[] {
  const galaxy = generateGalaxy(galaxySeed);
  const system = galaxy.find(s => s.id === systemId);
  if (!system || system.security === 'highsec') return [];

  const secKey = system.security as 'lowsec' | 'nullsec';
  const configs = NPC_FACTION_CONFIGS_BY_SECURITY[secKey];
  const [minGroups, maxGroups] = NPC_GROUP_COUNT_BY_SECURITY[secKey];

  const systemSeed = childSeed(galaxySeed, strHash(systemId));
  const rng = mulberry32(systemSeed);

  const count = randInt(rng, minGroups, maxGroups);
  const groups: NpcGroupDef[] = [];

  for (let i = 0; i < count; i++) {
    const cfg = randPick(rng, configs);
    const strength = randInt(rng, cfg.strengthRange[0], cfg.strengthRange[1]);
    const name = randPick(rng, cfg.groupNames);
    const group: NpcGroupDef = {
      id: `npc-${systemId}-${i}`,
      systemId,
      name,
      factionId: cfg.factionId,
      strength,
      bounty: Math.round(strength * cfg.bountyMultiplier),
      lootTable: cfg.lootTable,
    };
    groups.push(group);
  }

  return groups;
}

/**
 * Returns all NPC groups in a system that are currently alive (not in respawn cooldown).
 */
export function getAliveNpcGroupsInSystem(state: GameState, systemId: string): NpcGroupDef[] {
  const allGroups = generateNpcGroupsForSystem(state.galaxy.seed, systemId);
  const nowMs = Date.now();
  return allGroups.filter(g => {
    const dead = state.galaxy.npcGroupStates[g.id];
    return !dead || dead.respawnAt <= nowMs;
  });
}

// ─── Fleet combat rating ───────────────────────────────────────────────────

/**
 * Sum total effective combat power of a fleet, accounting for roles, doctrine,
 * hull condition, and pilot bonuses.
 * Ships with hull damage >= 80% are offline and excluded.
 */
export function computeFleetCombatRating(state: GameState, fleetId: string): number {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return 0;

  const operationalShipIds = getOperationalFleetShipIds(fleet);
  const fleetShips = operationalShipIds
    .map(id => state.systems.fleet.ships[id])
    .filter(Boolean)
    .filter(s => s.hullDamage < 80);

  if (fleetShips.length === 0) return 0;

  const { effectiveDPS } = computeRoleAdjustedCombatStats(fleet, fleetShips);
  return effectiveDPS;
}

// ─── Combat resolution ─────────────────────────────────────────────────────

interface CombatResult {
  victory: boolean;
  /** Average hull damage % dealt to fleet ships this engagement. */
  avgHullDamage: number;
  bountyEarned: number;
  lootGained: Record<string, number>;
}

/**
 * Resolve a single combat engagement between a fleet and an NPC group.
 * Uses deterministic PRNG seeded from fleet ID + current time bucket.
 */
export function resolveCombat(
  state: GameState,
  fleetId: string,
  npcGroup: NpcGroupDef,
  nowMs: number,
): CombatResult {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return { victory: false, avgHullDamage: 30, bountyEarned: 0, lootGained: {} };

  const fleetShips = getOperationalFleetShipIds(fleet)
    .map(id => state.systems.fleet.ships[id])
    .filter(Boolean)
    .filter(s => s.hullDamage < 80);

  const combatStats = computeRoleAdjustedCombatStats(fleet, fleetShips);
  const fleetRating = combatStats.effectiveDPS;
  const hqLootMultiplier = getCorpHqBonusFromState(state)?.combatLootQualityMultiplier ?? 1;

  // Seeded variance: different each engagement but deterministic for replay
  const seed = childSeed(strHash(fleetId), Math.floor(nowMs / (COMBAT_TICK_INTERVAL_SECONDS * 1000)));
  const rng = mulberry32(seed);

  const varianceRange = combatStats.varianceMultiplier;
  const variance = randFloat(rng, -varianceRange, varianceRange);

  const powerRatio = npcGroup.strength > 0 ? fleetRating / npcGroup.strength : 10;
  const adjustedRatio = powerRatio * (1 + variance);

  const victory = adjustedRatio >= 1.0;

  // Hull damage — less on victory, more on defeat. Tank role mitigates damage.
  const tankMult  = combatStats.tankRating > 0 ? Math.max(0.3, 1 - combatStats.tankRating * 0.05) : 1;
  let avgHullDamage: number;
  if (victory) {
    avgHullDamage = Math.max(1, (5 + 15 * (1 - Math.min(adjustedRatio, 2))) * tankMult);
  } else {
    avgHullDamage = Math.min(40, (20 + 30 * (1 - Math.min(adjustedRatio, 1))) * tankMult);
  }

  if (!victory) {
    return { victory, avgHullDamage, bountyEarned: 0, lootGained: {} };
  }

  // Loot rolls on victory
  const lootGained: Record<string, number> = {};
  for (const entry of npcGroup.lootTable) {
    if (rng() < entry.chance * combatStats.lootQualityMult * hqLootMultiplier) {
      const qty = randInt(rng, entry.minQty, entry.maxQty);
      lootGained[entry.resourceId] = (lootGained[entry.resourceId] ?? 0) + qty;
    }
  }

  return {
    victory,
    avgHullDamage,
    bountyEarned: npcGroup.bounty,
    lootGained,
  };
}

// ─── Combat tick ───────────────────────────────────────────────────────────

interface CombatTickResult {
  newState: GameState;
}

/**
 * Process one tick of combat for all fleets with active combat orders.
 * A fleet must not have an active travel order (fleetOrder) to engage in combat.
 */
export function tickCombat(state: GameState, deltaSeconds: number): CombatTickResult {
  const nowMs = Date.now();
  let s = state;

  const galaxy = generateGalaxy(s.galaxy.seed);
  const systemMap = new Map(galaxy.map(sys => [sys.id, sys]));

  for (const fleet of Object.values(s.systems.fleet.fleets)) {
    const combatOrder = fleet.combatOrder;
    if (!combatOrder) continue;
    if (fleet.fleetOrder) continue; // Fleet is in transit — pause combat

    // Throttle: only one engagement per COMBAT_TICK_INTERVAL_SECONDS
    const secondsSinceLastCombat = (nowMs - combatOrder.lastCombatAt) / 1000;
    if (secondsSinceLastCombat < COMBAT_TICK_INTERVAL_SECONDS) continue;

    const system = systemMap.get(fleet.currentSystemId);
    if (!system || system.security === 'highsec') continue;

    const aliveGroups = getAliveNpcGroupsInSystem(s, fleet.currentSystemId);
    if (aliveGroups.length === 0) continue;

    // Pick target: raid → specific group, patrol → weakest alive group
    let target: NpcGroupDef | undefined;
    if (combatOrder.type === 'raid' && combatOrder.targetGroupId) {
      target = aliveGroups.find(g => g.id === combatOrder.targetGroupId);
    }
    if (!target) {
      // Patrol or raid target not found — fight weakest alive group
      target = aliveGroups.reduce((weakest, g) => g.strength < weakest.strength ? g : weakest, aliveGroups[0]);
    }
    if (!target) continue;

    const result = resolveCombat(s, fleet.id, target, nowMs);

    // Apply hull damage per ship (role-specific multipliers)
    const updatedShips = { ...s.systems.fleet.ships };
    const fleetShipIds = getOperationalFleetShipIds(fleet).filter(id => updatedShips[id] && updatedShips[id].hullDamage < 80);
    for (const shipId of fleetShipIds) {
      const ship = updatedShips[shipId];
      let roleDamageMult = 1.0;
      switch (ship.role) {
        case 'tank':    roleDamageMult = 1.3 / 1.5; break; // tanks intentionally absorb more but have tankMult
        case 'dps':     roleDamageMult = 0.8; break;
        case 'scout':   roleDamageMult = 0.6; break;
        case 'support': roleDamageMult = 0.7; break;
        default:        roleDamageMult = 1.0;
      }
      const shipDamage = result.avgHullDamage * roleDamageMult;
      updatedShips[shipId] = {
        ...ship,
        hullDamage: Math.min(100, ship.hullDamage + shipDamage),
      };
    }

    // Apply loot to cargo resources
    let resources = { ...s.resources };
    if (result.victory) {
      for (const [resourceId, qty] of Object.entries(result.lootGained)) {
        resources = {
          ...resources,
          [resourceId]: (resources[resourceId] ?? 0) + qty,
        };
      }
      // Credit bounty as credits (use 'credits' resource)
      if (result.bountyEarned > 0) {
        resources = {
          ...resources,
          credits: (resources.credits ?? 0) + result.bountyEarned,
        };
      }
    }

    // Mark NPC group dead with respawn timer
    let newNpcGroupStates = { ...s.galaxy.npcGroupStates };
    if (result.victory) {
      const respawnHours = randFloat(mulberry32(strHash(target.id + nowMs)), NPC_RESPAWN_HOURS[0], NPC_RESPAWN_HOURS[1]);
      newNpcGroupStates = {
        ...newNpcGroupStates,
        [target.id]: { respawnAt: nowMs + respawnHours * 3600 * 1000 },
      };
    }

    // Build combat log entry
    const logEntry: CombatLogEntry = {
      id: `combat-${fleet.id}-${nowMs}`,
      timestamp: nowMs,
      fleetId: fleet.id,
      fleetName: fleet.name,
      systemId: fleet.currentSystemId,
      systemName: system.name,
      npcName: target.name,
      victory: result.victory,
      bountyEarned: result.bountyEarned,
      lootGained: result.lootGained,
      avgHullDamage: result.avgHullDamage,
    };

    const existingLog = s.systems.fleet.combatLog ?? [];
    const newLog = [logEntry, ...existingLog].slice(0, COMBAT_LOG_MAX_ENTRIES);

    // Update combat order timing; clear raid order if the target was destroyed on victory
    let newCombatOrder = { ...combatOrder, lastCombatAt: nowMs };
    if (result.victory && combatOrder.type === 'raid' && combatOrder.targetGroupId === target.id) {
      newCombatOrder = null as unknown as typeof newCombatOrder; // raid complete
    }

    // Collapse updated fleet
    const updatedFleet = {
      ...fleet,
      combatOrder: newCombatOrder,
    };

    s = {
      ...s,
      resources,
      galaxy: {
        ...s.galaxy,
        npcGroupStates: newNpcGroupStates,
      },
      systems: {
        ...s.systems,
        fleet: {
          ...s.systems.fleet,
          ships: updatedShips,
          fleets: {
            ...s.systems.fleet.fleets,
            [fleet.id]: updatedFleet,
          },
          combatLog: newLog,
        },
      },
    };
  }

  return { newState: s };
}

// ─── Order management ──────────────────────────────────────────────────────

/**
 * Issues a patrol order. Requires spaceship-command >= 2.
 * Returns null if the requirement is not met or fleet doesn't exist.
 */
export function issuePatrolOrderInState(state: GameState, fleetId: string): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;

  // Require at least one pilot in the fleet with spaceship-command >= 2
  const fleetPilotIds = getOperationalFleetShipIds(fleet)
    .map(id => state.systems.fleet.ships[id]?.assignedPilotId)
    .filter(Boolean) as string[];

  const hasQualifiedPilot = fleetPilotIds.some(pilotId => {
    const pilot = state.systems.fleet.pilots[pilotId];
    return pilot && (pilot.skills.levels['spaceship-command'] ?? 0) >= 2;
  });

  if (!hasQualifiedPilot) return null;

  const system = generateGalaxy(state.galaxy.seed).find(s => s.id === fleet.currentSystemId);
  if (!system || system.security === 'highsec') return null;

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        fleets: {
          ...state.systems.fleet.fleets,
          [fleetId]: {
            ...fleet,
            combatOrder: { type: 'patrol', lastCombatAt: 0 },
          },
        },
      },
    },
  };
}

/**
 * Issues a raid order against a specific NPC group. Requires military-operations >= 1.
 * Returns null if the requirement is not met, fleet doesn't exist, or NPC group is dead.
 */
export function issueCombatRaidOrderInState(
  state: GameState,
  fleetId: string,
  npcGroupId: string,
): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;

  const fleetPilotIds = getOperationalFleetShipIds(fleet)
    .map(id => state.systems.fleet.ships[id]?.assignedPilotId)
    .filter(Boolean) as string[];

  const hasQualifiedPilot = fleetPilotIds.some(pilotId => {
    const pilot = state.systems.fleet.pilots[pilotId];
    return pilot && (pilot.skills.levels['military-operations'] ?? 0) >= 1;
  });

  if (!hasQualifiedPilot) return null;

  // Verify target group exists and is alive
  const nowMs = Date.now();
  const dead = state.galaxy.npcGroupStates[npcGroupId];
  if (dead && dead.respawnAt > nowMs) return null; // group is dead

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        fleets: {
          ...state.systems.fleet.fleets,
          [fleetId]: {
            ...fleet,
            combatOrder: { type: 'raid', targetGroupId: npcGroupId, lastCombatAt: 0 },
          },
        },
      },
    },
  };
}

/**
 * Cancels the active combat order on a fleet.
 */
export function cancelCombatOrderInState(state: GameState, fleetId: string): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        fleets: {
          ...state.systems.fleet.fleets,
          [fleetId]: { ...fleet, combatOrder: null },
        },
      },
    },
  };
}
