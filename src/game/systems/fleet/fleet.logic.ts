import type { GameState, ShipInstance, FleetActivity, PlayerFleet, ShipRole, FleetDoctrine } from '@/types/game.types';
import { HULL_DEFINITIONS, MODULE_DEFINITIONS, DOCTRINE_DEFINITIONS } from './fleet.config';
import { getPilotMiningBonus, getPilotCombatBonus, getPilotHaulingBonus, getPilotMoraleMultiplier, canPilotFlyShip } from './pilot.logic';
import { BASE_SHIP_CARGO_M3 } from '@/game/balance/constants';
import { ORE_BELTS } from '@/game/systems/mining/mining.config';

// ─── Ship deployment ───────────────────────────────────────────────────────

/**
 * Total cargo capacity in m³ for a fleet, summed from each ship's hull.
 * Uses BASE_SHIP_CARGO_M3 × hull.baseCargoMultiplier per ship.
 */
export function computeFleetCargoCapacity(
  fleet: PlayerFleet,
  ships: Record<string, ShipInstance>,
): number {
  let total = 0;
  for (const shipId of fleet.shipIds) {
    const ship = ships[shipId];
    if (!ship) continue;
    const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
    if (!hull) continue;
    total += BASE_SHIP_CARGO_M3 * hull.baseCargoMultiplier;
  }
  return total;
}

/**
 * Deploy a ship from resources into the active fleet.
 * Deducts the hull resource from inventory and creates a ShipInstance.
 * Returns null if the hull definition is unknown or resources are insufficient.
 */
export function deployShip(
  state: GameState,
  hullId: string,
  customName?: string,
): GameState | null {
  const hull = HULL_DEFINITIONS[hullId];
  if (!hull) return null;

  const have = state.resources[hull.resourceId] ?? 0;
  if (have < 1) return null;

  const shipId = `ship-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const ship: ShipInstance = {
    id: shipId,
    shipDefinitionId: hullId,
    customName,
    activity: 'idle',
    assignedPilotId: null,
    systemId: state.galaxy.currentSystemId,
    fittedModules: { high: [], mid: [], low: [] },
    deployedAt: Date.now(),
    fleetOrder: null,
    fleetId: null,
    role: 'unassigned',
    hullDamage: 0,
  };

  return {
    ...state,
    resources: {
      ...state.resources,
      [hull.resourceId]: have - 1,
    },
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: { ...state.systems.fleet.ships, [shipId]: ship },
      },
    },
  };
}

/**
 * Recall (decommission) a deployed ship back into resources.
 * Any assigned pilot is unassigned first.
 */
export function recallShip(state: GameState, shipId: string): GameState | null {
  const ship = state.systems.fleet.ships[shipId];
  if (!ship) return null;

  const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
  const newShips = { ...state.systems.fleet.ships };
  delete newShips[shipId];

  // Unassign pilot if one was assigned
  let newPilots = { ...state.systems.fleet.pilots };
  if (ship.assignedPilotId) {
    const pilot = newPilots[ship.assignedPilotId];
    if (pilot) {
      newPilots = { ...newPilots, [pilot.id]: { ...pilot, assignedShipId: null, status: 'idle' } };
    }
  }

  // Return hull to resources if definition exists
  const newResources = { ...state.resources };
  if (hull) {
    newResources[hull.resourceId] = (newResources[hull.resourceId] ?? 0) + 1;
  }

  return {
    ...state,
    resources: newResources,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: newShips,
        pilots: newPilots,
      },
    },
  };
}

// ─── Pilot assignment ──────────────────────────────────────────────────────

/**
 * Assign or unassign a pilot to a ship.
 * Pass `shipId = null` to simply unassign the pilot from whatever they're flying.
 */
export function assignPilotToShip(
  state: GameState,
  pilotId: string,
  shipId: string | null,
): GameState | null {
  const pilot = state.systems.fleet.pilots[pilotId];
  if (!pilot) return null;

  let newPilots = { ...state.systems.fleet.pilots };
  let newShips  = { ...state.systems.fleet.ships };

  // Remove pilot from their current ship
  if (pilot.assignedShipId) {
    const old = newShips[pilot.assignedShipId];
    if (old) {
      newShips = { ...newShips, [old.id]: { ...old, assignedPilotId: null, activity: 'idle' } };
    }
  }

  if (shipId === null) {
    newPilots = { ...newPilots, [pilotId]: { ...pilot, assignedShipId: null, status: 'idle' } };
  } else {
    const ship = newShips[shipId];
    if (!ship) return null;

    const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
    if (!canPilotFlyShip(pilot, hull?.requiredPilotSkill)) return null;

    // If another pilot was in the target ship, unassign them
    if (ship.assignedPilotId && ship.assignedPilotId !== pilotId) {
      const displacing = newPilots[ship.assignedPilotId];
      if (displacing) {
        newPilots = { ...newPilots, [displacing.id]: { ...displacing, assignedShipId: null, status: 'idle' } };
      }
    }

    newShips  = { ...newShips,  [shipId]:   { ...ship,  assignedPilotId: pilotId } };
    newPilots = { ...newPilots, [pilotId]: { ...pilot, assignedShipId: shipId, status: 'docked' } };
  }

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: { ...state.systems.fleet, ships: newShips, pilots: newPilots },
    },
  };
}

// ─── Activity management ───────────────────────────────────────────────────

/** Set the activity for a ship (and mark its pilot as active/docked accordingly). */
export function setShipActivity(
  state: GameState,
  shipId: string,
  activity: FleetActivity,
  assignedBeltId?: string,
): GameState | null {
  const ship = state.systems.fleet.ships[shipId];
  if (!ship) return null;

  // Belt skill gate: block assignment to restricted belts if player lacks the required skill
  if (activity === 'mining') {
    const effectiveBeltId = assignedBeltId ?? ship.assignedBeltId;
    if (effectiveBeltId) {
      const req = ORE_BELTS[effectiveBeltId]?.requiredSkill;
      if (req && (state.systems.skills.levels[req.skillId] ?? 0) < req.minLevel) return null;
    }
  }

  const newShip: ShipInstance = {
    ...ship,
    activity,
    assignedBeltId: assignedBeltId ?? (activity === 'mining' ? ship.assignedBeltId : undefined),
  };

  let newPilots = { ...state.systems.fleet.pilots };
  if (ship.assignedPilotId) {
    const pilot = newPilots[ship.assignedPilotId];
    if (pilot) {
      const newStatus = activity === 'idle' ? 'docked' : 'active';
      newPilots = { ...newPilots, [pilot.id]: { ...pilot, status: newStatus } };
    }
  }

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: { ...state.systems.fleet.ships, [shipId]: newShip },
        pilots: newPilots,
      },
    },
  };
}

// ─── Module fitting ────────────────────────────────────────────────────────

/** Fit a module into a slot. Returns null if slot count is exceeded or module not found. */
export function fitModule(
  state: GameState,
  shipId: string,
  slotType: 'high' | 'mid' | 'low',
  moduleId: string,
): GameState | null {
  const ship = state.systems.fleet.ships[shipId];
  if (!ship) return null;

  const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
  if (!hull) return null;

  const mod = MODULE_DEFINITIONS[moduleId];
  if (!mod || mod.slotType !== slotType) return null;

  const currentSlots = ship.fittedModules[slotType];
  if (currentSlots.length >= hull.moduleSlots[slotType]) return null;

  const newFittedModules = {
    ...ship.fittedModules,
    [slotType]: [...currentSlots, moduleId],
  };

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: {
          ...state.systems.fleet.ships,
          [shipId]: { ...ship, fittedModules: newFittedModules },
        },
      },
    },
  };
}

/** Remove a module by slot index. */
export function removeModule(
  state: GameState,
  shipId: string,
  slotType: 'high' | 'mid' | 'low',
  index: number,
): GameState | null {
  const ship = state.systems.fleet.ships[shipId];
  if (!ship) return null;

  const currentSlots = ship.fittedModules[slotType];
  if (index < 0 || index >= currentSlots.length) return null;

  const newSlots = currentSlots.filter((_, i) => i !== index);

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: {
          ...state.systems.fleet.ships,
          [shipId]: {
            ...ship,
            fittedModules: { ...ship.fittedModules, [slotType]: newSlots },
          },
        },
      },
    },
  };
}

// ─── Aggregate metrics ─────────────────────────────────────────────────────

/** Total ISK payroll per real day across all hired pilots. */
export function getTotalFleetPayroll(state: GameState): number {
  return Object.values(state.systems.fleet.pilots).reduce(
    (sum, p) => sum + (p.payrollPerDay ?? 0),
    0,
  );
}

/**
 * Effective mining output multiplier for a specific ship+pilot pair.
 * This stacks hull hull bonus × module bonuses × pilot skills × morale.
 */
export function getShipMiningMultiplier(state: GameState, shipId: string): number {
  const ship = state.systems.fleet.ships[shipId];
  if (!ship) return 0;

  const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
  if (!hull) return 0;

  // Hull base mining bonus
  let multiplier = hull.baseMiningBonus;

  // Module bonuses
  for (const slotType of ['high', 'mid', 'low'] as const) {
    for (const moduleId of ship.fittedModules[slotType]) {
      const mod = MODULE_DEFINITIONS[moduleId];
      if (mod?.effects['mining-yield']) {
        multiplier += mod.effects['mining-yield'];
      }
    }
  }

  // Pilot skills + morale
  if (ship.assignedPilotId) {
    const pilot = state.systems.fleet.pilots[ship.assignedPilotId];
    if (pilot) {
      multiplier += getPilotMiningBonus(pilot);
      multiplier *= getPilotMoraleMultiplier(pilot);
    }
  }

  return Math.max(0, multiplier);
}

/** Total hauling interval reduction from all active hauling ships. */
export function getFleetHaulingBonus(state: GameState): number {
  let bonus = 0;
  for (const ship of Object.values(state.systems.fleet.ships)) {
    if (ship.activity !== 'hauling') continue;
    if (!ship.assignedPilotId) continue;
    const pilot = state.systems.fleet.pilots[ship.assignedPilotId];
    if (!pilot) continue;

    const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
    const haulingBonus = getPilotHaulingBonus(pilot);
    const cargoMult = hull ? hull.baseCargoMultiplier : 1.0;

    bonus += haulingBonus + cargoMult * 0.05;
  }
  return bonus;
}

/**
 * Instantly repair a ship to full hull integrity. Costs 1 hull-plate resource.
 * Returns null if the ship doesn't exist, has no damage, or no hull-plate is available.
 */
export function repairShipInState(state: GameState, shipId: string): GameState | null {
  const ship = state.systems.fleet.ships[shipId];
  if (!ship || ship.hullDamage <= 0) return null;
  const hullPlates = state.resources['hull-plate'] ?? 0;
  if (hullPlates < 1) return null;

  return {
    ...state,
    resources: { ...state.resources, 'hull-plate': hullPlates - 1 },
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: { ...state.systems.fleet.ships, [shipId]: { ...ship, hullDamage: 0 } },
      },
    },
  };
}

// ─── Fleet group management ────────────────────────────────────────────────

/** Base jump range for fleet groups in LY. */
export const BASE_FLEET_JUMP_RANGE_LY = 15;

/**
 * Compute the maximum single-hop jump range for a set of ship IDs.
 * Uses the best warpSpeedBonus hull in the group (fastest ship scouts the route).
 */
export function computeFleetJumpRange(state: GameState, shipIds: string[]): number {
  let maxBonus = 0;
  for (const sid of shipIds) {
    const ship = state.systems.fleet.ships[sid];
    if (!ship) continue;
    const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
    if (hull && hull.warpSpeedBonus > maxBonus) maxBonus = hull.warpSpeedBonus;
  }
  return Math.round(BASE_FLEET_JUMP_RANGE_LY + maxBonus * 100);
}

/**
 * Create a named fleet group from a list of standalone ships.
 * Ships must not already belong to another fleet.
 * Returns null if the player has reached maxFleets or any ship validation fails.
 */
export function createPlayerFleet(
  state: GameState,
  name: string,
  shipIds: string[],
): GameState | null {
  const { fleets, maxFleets, ships } = state.systems.fleet;
  if (Object.keys(fleets).length >= maxFleets) return null;
  if (shipIds.length === 0) return null;

  // Validate all ships exist, are standalone, and agree on a system
  const firstShip = ships[shipIds[0]];
  if (!firstShip) return null;
  const systemId = firstShip.systemId;

  for (const sid of shipIds) {
    const s = ships[sid];
    if (!s) return null;
    if (s.fleetId !== null) return null;    // already in a fleet
    if (s.systemId !== systemId) return null; // must be co-located
  }

  const fleetId = `fleet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const defaultWingId = `wing-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const fleet: PlayerFleet = {
    id: fleetId,
    name: name.trim() || `Fleet ${Object.keys(fleets).length + 1}`,
    shipIds: [...shipIds],
    currentSystemId: systemId,
    fleetOrder: null,
    combatOrder: null,
    isScanning: false,
    maxJumpRangeLY: computeFleetJumpRange(state, shipIds),
    doctrine: 'balanced',
    cargoHold: {},
    commanderId: null,
    wings: [{
      id: defaultWingId,
      name: 'Operations Wing 1',
      type: 'mining',
      shipIds: [...shipIds],
      commanderId: null,
      cargoHold: {},
      escortWingId: null,
      isDispatched: false,
      haulingOriginSystemId: null,
    }],
  };

  // Tag all ships with the fleet IDI wan
  let newShips = { ...ships };
  for (const sid of shipIds) {
    newShips = { ...newShips, [sid]: { ...newShips[sid], fleetId } };
  }

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        fleets: { ...fleets, [fleetId]: fleet },
        ships: newShips,
      },
    },
  };
}

/**
 * Disband a fleet group. Ships stay in place but become standalone (fleetId = null).
 * Any active fleet order is cancelled first.
 */
export function disbandPlayerFleet(state: GameState, fleetId: string): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;

  let newShips = { ...state.systems.fleet.ships };
  for (const sid of fleet.shipIds) {
    const s = newShips[sid];
    if (s) newShips = { ...newShips, [sid]: { ...s, fleetId: null, activity: 'idle' } };
  }

  const newFleets = { ...state.systems.fleet.fleets };
  delete newFleets[fleetId];

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: { ...state.systems.fleet, fleets: newFleets, ships: newShips },
    },
  };
}

/**
 * Add a standalone ship to an existing fleet.
 * The ship must be in the same system as the fleet and not currently in transit.
 */
export function addShipToFleet(
  state: GameState,
  fleetId: string,
  shipId: string,
): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  const ship  = state.systems.fleet.ships[shipId];
  if (!fleet || !ship) return null;
  if (ship.fleetId !== null) return null;
  if (ship.systemId !== fleet.currentSystemId) return null;
  if (fleet.fleetOrder !== null) return null; // don't add while fleet is in transit

  const newShipIds = [...fleet.shipIds, shipId];
  const newFleet: PlayerFleet = {
    ...fleet,
    shipIds: newShipIds,
    maxJumpRangeLY: computeFleetJumpRange(
      { ...state, systems: { ...state.systems, fleet: { ...state.systems.fleet, ships: { ...state.systems.fleet.ships, [shipId]: { ...ship, fleetId } } } } },
      newShipIds,
    ),
  };
  const newShip = { ...ship, fleetId };

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        fleets: { ...state.systems.fleet.fleets, [fleetId]: newFleet },
        ships:  { ...state.systems.fleet.ships, [shipId]: newShip },
      },
    },
  };
}

/**
 * Remove a ship from a fleet, making it standalone.
 * Not allowed while the fleet is in transit.
 */
export function removeShipFromFleet(
  state: GameState,
  fleetId: string,
  shipId: string,
): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  const ship  = state.systems.fleet.ships[shipId];
  if (!fleet || !ship) return null;
  if (ship.fleetId !== fleetId) return null;
  if (fleet.fleetOrder !== null) return null; // can't split fleet mid-transit

  const newShipIds = fleet.shipIds.filter(id => id !== shipId);
  const newShip = { ...ship, fleetId: null };

  if (newShipIds.length === 0) {
    // Auto-disband empty fleet
    const newFleets = { ...state.systems.fleet.fleets };
    delete newFleets[fleetId];
    return {
      ...state,
      systems: {
        ...state.systems,
        fleet: {
          ...state.systems.fleet,
          fleets: newFleets,
          ships: { ...state.systems.fleet.ships, [shipId]: newShip },
        },
      },
    };
  }

  const nextWings = (fleet.wings ?? []).map(wing => {
    const nextShipIds = wing.shipIds.filter(id => id !== shipId);
    const commanderShipId = wing.commanderId ? state.systems.fleet.pilots[wing.commanderId]?.assignedShipId : null;
    return {
      ...wing,
      shipIds: nextShipIds,
      commanderId: commanderShipId && nextShipIds.includes(commanderShipId) ? wing.commanderId : null,
    };
  });

  const newFleet: PlayerFleet = {
    ...fleet,
    shipIds: newShipIds,
    maxJumpRangeLY: computeFleetJumpRange(state, newShipIds),
    wings: nextWings,
  };

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        fleets: { ...state.systems.fleet.fleets, [fleetId]: newFleet },
        ships:  { ...state.systems.fleet.ships, [shipId]: newShip },
      },
    },
  };
}

/** Rename a fleet. */
export function renamePlayerFleet(
  state: GameState,
  fleetId: string,
  name: string,
): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;
  const trimmed = name.trim().slice(0, 32);
  if (!trimmed) return null;
  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        fleets: { ...state.systems.fleet.fleets, [fleetId]: { ...fleet, name: trimmed } },
      },
    },
  };
}

// ─── Fleet Roles & Doctrines ─────────────────────────────────────────────────

/**
 * Auto-suggest a doctrine based on the role composition of a fleet's ships.
 */
export function suggestDoctrine(fleetShips: ShipInstance[]): FleetDoctrine {
  if (fleetShips.length === 0) return 'balanced';
  const total = fleetShips.length;
  const count = (role: ShipRole) => fleetShips.filter(s => s.role === role).length;
  const scoutRatio = count('scout') / total;
  const tankRatio  = count('tank')  / total;
  const dpsRatio   = count('dps')   / total;

  if (scoutRatio >= 0.3)                        return 'stealth-raid';
  if (tankRatio  >= 0.4)                        return 'shield-wall';
  if (dpsRatio   >= 0.6)                        return 'brawl';
  if (dpsRatio   >= 0.4 && scoutRatio >= 0.2)   return 'sniper';
  return 'balanced';
}

/**
 * Returns whether the required role for a doctrine is present in the fleet.
 */
export function getDoctrineRequirementsMet(doctrine: FleetDoctrine, fleetShips: ShipInstance[]): boolean {
  const def = DOCTRINE_DEFINITIONS[doctrine];
  if (!def) return true; // unknown doctrine (stale persisted state) — treat as met
  if (def.requires === null) return true;
  return fleetShips.some(s => s.role === def.requires);
}

/**
 * Compute role-adjusted effective combat stats for a fleet.
 * Used by Phase 2 combat resolution.
 */
export function computeRoleAdjustedCombatStats(
  fleet: PlayerFleet,
  fleetShips: ShipInstance[],
): {
  effectiveDPS: number;
  tankRating: number;
  supportRepairRate: number;
  varianceMultiplier: number;
  lootQualityMult: number;
} {
  const doctrine = DOCTRINE_DEFINITIONS[fleet.doctrine];

  // Base DPS from ship definitions scaled by hull condition
  const baseDPS = fleetShips.reduce((sum, ship) => {
    const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
    const condition = (100 - ship.hullDamage) / 100;
    return sum + (hull?.baseCombatRating ?? 0.5) * condition;
  }, 0);

  // Tank ships provide extra damage absorption
  const tankCount    = fleetShips.filter(s => s.role === 'tank').length;
  const supportCount = fleetShips.filter(s => s.role === 'support').length;

  return {
    effectiveDPS:       baseDPS * doctrine.dpsMult,
    tankRating:         (baseDPS * 0.5 + tankCount * 1.5) * doctrine.tankMult,
    supportRepairRate:  supportCount * 0.8,
    varianceMultiplier: doctrine.varianceRange,
    lootQualityMult:    doctrine.lootMult,
  };
}

/**
 * Assign a combat role to a ship. Returns null if the ship doesn't exist.
 */
export function setShipRoleInState(state: GameState, shipId: string, role: ShipRole): GameState | null {
  const ship = state.systems.fleet.ships[shipId];
  if (!ship) return null;
  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: { ...state.systems.fleet.ships, [shipId]: { ...ship, role } },
      },
    },
  };
}

/**
 * Set the doctrine for a fleet. Returns null if the fleet doesn't exist.
 */
export function setFleetDoctrineInState(state: GameState, fleetId: string, doctrine: FleetDoctrine): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;
  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        fleets: { ...state.systems.fleet.fleets, [fleetId]: { ...fleet, doctrine } },
      },
    },
  };
}
