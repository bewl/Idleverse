import type { GameState, PlayerFleet, FleetWing, ShipInstance, PilotInstance } from '@/types/game.types';
import type { FleetOrder, RouteSecurityFilter } from '@/types/faction.types';
import { HULL_DEFINITIONS } from '@/game/systems/fleet/fleet.config';
import { BASE_SHIP_CARGO_M3 } from '@/game/balance/constants';
import { findRoute } from '@/game/galaxy/route.logic';
import { generateGalaxy } from '@/game/galaxy/galaxy.gen';
import { calcWarpDuration } from '@/game/galaxy/travel.logic';
import { getCombinedCommanderBonus } from './commander.logic';
import { getShipTransitWarpMultiplier, setShipActivity } from './fleet.logic';

// ─── Cargo capacity ────────────────────────────────────────────────────────

/**
 * Total cargo capacity (m³) for all ships assigned to a wing.
 * Uses BASE_SHIP_CARGO_M3 × hull.baseCargoMultiplier per ship.
 */
export function getWingCargoCapacity(
  wing: FleetWing,
  ships: Record<string, ShipInstance>,
  cargoBonus = 0,
): number {
  return wing.shipIds.reduce((sum, sid) => {
    const ship = ships[sid];
    const hull = ship ? HULL_DEFINITIONS[ship.shipDefinitionId] : null;
    return sum + (hull ? BASE_SHIP_CARGO_M3 * hull.baseCargoMultiplier : 0);
  }, 0) * (1 + cargoBonus);
}

export function getWingCargoUsed(wing: FleetWing): number {
  return Object.values(wing.cargoHold ?? {}).reduce((sum, qty) => sum + qty, 0);
}

export function getFleetStoredCargo(fleet: PlayerFleet): number {
  const fleetCargo = Object.values(fleet.cargoHold ?? {}).reduce((sum, qty) => sum + qty, 0);
  const wingCargo = (fleet.wings ?? []).reduce((sum, wing) => sum + getWingCargoUsed(wing), 0);
  return fleetCargo + wingCargo;
}

export function getFleetStorageCapacity(
  fleet: PlayerFleet,
  ships: Record<string, ShipInstance>,
  pilots?: Record<string, PilotInstance>,
): number {
  const haulingWings = getHaulingWings(fleet);
  if (haulingWings.length > 0) {
    return haulingWings.reduce((sum, wing) => {
      const cargoBonus = pilots
        ? getCombinedCommanderBonus(pilots, fleet, wing, 'commander-cargo-capacity')
        : 0;
      return sum + getWingCargoCapacity(wing, ships, cargoBonus);
    }, 0);
  }

  return fleet.shipIds.reduce((sum, sid) => {
    const ship = ships[sid];
    const hull = ship ? HULL_DEFINITIONS[ship.shipDefinitionId] : null;
    return sum + (hull ? BASE_SHIP_CARGO_M3 * hull.baseCargoMultiplier : 0);
  }, 0);
}

export function getWingCargoTotals(fleet: PlayerFleet): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const wing of fleet.wings ?? []) {
    for (const [resourceId, qty] of Object.entries(wing.cargoHold ?? {})) {
      totals[resourceId] = (totals[resourceId] ?? 0) + qty;
    }
  }
  return totals;
}

// ─── Wing helpers ──────────────────────────────────────────────────────────

export function getHaulingWings(fleet: PlayerFleet): FleetWing[] {
  return fleet.wings?.filter(wing => wing.type === 'hauling') ?? [];
}

export function getEscortWing(fleet: PlayerFleet, haulingWing: FleetWing): FleetWing | null {
  if (haulingWing.type !== 'hauling' || !haulingWing.escortWingId) return null;
  return fleet.wings?.find(wing => wing.id === haulingWing.escortWingId && wing.type === 'combat') ?? null;
}

export function hasActiveEscortWing(fleet: PlayerFleet, haulingWing: FleetWing): boolean {
  const escortWing = getEscortWing(fleet, haulingWing);
  return !!escortWing && escortWing.shipIds.length > 0;
}

export function getHaulingWingPreferredSecurityFilter(
  fleet: PlayerFleet,
  haulingWing: FleetWing,
): RouteSecurityFilter {
  return hasActiveEscortWing(fleet, haulingWing) ? 'shortest' : 'safest';
}

export function hasDispatchedHaulingWing(fleet: PlayerFleet): boolean {
  return getHaulingWings(fleet).some(wing => wing.isDispatched);
}

export function getWingByShipId(fleet: PlayerFleet, shipId: string): FleetWing | null {
  return fleet.wings?.find(wing => wing.shipIds.includes(shipId)) ?? null;
}

export function getWingCurrentSystemId(
  fleet: PlayerFleet,
  wing: FleetWing,
  ships: Record<string, ShipInstance>,
): string | null {
  const relevantShipIds = wing.isDispatched && wing.type === 'hauling'
    ? getWingDispatchShipIds(fleet, wing)
    : wing.shipIds;
  let currentSystemId: string | null = null;
  for (const shipId of relevantShipIds) {
    const ship = ships[shipId];
    if (!ship) continue;
    if (currentSystemId === null) {
      currentSystemId = ship.systemId;
      continue;
    }
    if (ship.systemId !== currentSystemId) return null;
  }
  return currentSystemId;
}

export function getOperationalFleetShipIds(fleet: PlayerFleet): string[] {
  return [...new Set((fleet.wings ?? []).flatMap(wing => wing.shipIds))];
}

export function getOperationalFleetShips(
  fleet: PlayerFleet,
  ships: Record<string, ShipInstance>,
): ShipInstance[] {
  return getOperationalFleetShipIds(fleet)
    .map(shipId => ships[shipId])
    .filter(Boolean) as ShipInstance[];
}

export function assignWingToMiningBelt(
  state: GameState,
  fleetId: string,
  wingId: string,
  beltId: string,
): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet || fleet.fleetOrder) return null;

  const wing = fleet.wings?.find(candidate => candidate.id === wingId && candidate.type === 'mining') ?? null;
  if (!wing || wing.isDispatched || wing.shipIds.length === 0) return null;

  let nextState = state;
  for (const shipId of wing.shipIds) {
    const ship = nextState.systems.fleet.ships[shipId];
    if (!ship || ship.fleetOrder || ship.systemId !== fleet.currentSystemId) return null;
    const updatedState = setShipActivity(nextState, shipId, 'mining', beltId);
    if (!updatedState) return null;
    nextState = updatedState;
  }

  return nextState;
}

/**
 * Get all ship IDs to dispatch for a haul trip:
 * the hauling wing's ships plus any assigned escort (combat) wing's ships.
 */
export function getWingDispatchShipIds(fleet: PlayerFleet, haulingWing: FleetWing): string[] {
  const ids = new Set(haulingWing.shipIds);
  const escortWing = getEscortWing(fleet, haulingWing);
  if (escortWing) {
    escortWing.shipIds.forEach(id => ids.add(id));
  }
  return [...ids];
}

export function getHaulingWingEffectiveSecurityFilter(
  fleet: PlayerFleet,
  haulingWing: FleetWing,
  ships: Record<string, ShipInstance>,
): RouteSecurityFilter {
  for (const shipId of getWingDispatchShipIds(fleet, haulingWing)) {
    const filter = ships[shipId]?.fleetOrder?.securityFilter;
    if (filter) return filter;
  }
  return getHaulingWingPreferredSecurityFilter(fleet, haulingWing);
}

function findHaulingWingRoute(
  galaxy: ReturnType<typeof generateGalaxy>,
  fromSystemId: string,
  toSystemId: string,
  jumpRange: number,
  preferredFilters: RouteSecurityFilter[],
) {
  for (const filter of preferredFilters) {
    const route = findRoute(galaxy, fromSystemId, toSystemId, jumpRange, filter);
    if (route && route.hops > 0) return { route, filter };
  }
  return null;
}

function getShipLegDurationSeconds(
  state: GameState,
  fleet: PlayerFleet,
  ship: ShipInstance,
  route: string[],
  currentLeg: number,
  galaxy: ReturnType<typeof generateGalaxy>,
): number {
  const fromSystem = galaxy.find(system => system.id === route[currentLeg]);
  const toSystem = galaxy.find(system => system.id === route[currentLeg + 1]);
  if (!fromSystem || !toSystem) return 1;
  return calcWarpDuration(state, fromSystem, toSystem, getShipTransitWarpMultiplier(state, ship, fleet, getWingByShipId(fleet, ship.id)));
}

// ─── Dispatch ──────────────────────────────────────────────────────────────

/**
 * Dispatch a fleet's hauling wing (+ optional escort) to Corp HQ.
 * Issues individual FleetOrders so only dispatched ships travel while
 * mining ships remain at the fleet's current system.
 * Returns updated GameState or null if dispatch is not possible.
 */
export function dispatchHaulerWing(
  state: GameState,
  fleetId: string,
  wingId: string,
  homeSystemId: string,
): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;
  if (fleet.fleetOrder) return null;

  const haulingWing = fleet.wings.find(wing => wing.id === wingId && wing.type === 'hauling');
  if (!haulingWing || haulingWing.isDispatched) return null;

  const shipIds = getWingDispatchShipIds(fleet, haulingWing);
  if (shipIds.length === 0) return null;
  if (shipIds.some(shipId => state.systems.fleet.ships[shipId]?.fleetOrder)) return null;

  const fromSystem = fleet.currentSystemId;
  if (fromSystem === homeSystemId) return null;

  const galaxy = generateGalaxy(state.galaxy.seed);
  const jumpRange = fleet.maxJumpRangeLY > 0 ? fleet.maxJumpRangeLY : 10;
  const preferredSecurityFilters: RouteSecurityFilter[] = hasActiveEscortWing(fleet, haulingWing)
    ? ['shortest', 'avoid-null', 'safest']
    : ['safest', 'avoid-null', 'shortest'];
  const routeResult = findHaulingWingRoute(galaxy, fromSystem, homeSystemId, jumpRange, preferredSecurityFilters);
  if (!routeResult) return null;
  const { route, filter } = routeResult;

  const order: FleetOrder = {
    destinationSystemId: homeSystemId,
    route: route.path,
    currentLeg: 0,
    securityFilter: filter,
    pauseOnArrival: false,
    legDepartedAt: Date.now(),
  };

  let newShips = { ...state.systems.fleet.ships };
  for (const sid of shipIds) {
    const ship = newShips[sid];
    if (!ship) continue;
    newShips = {
      ...newShips,
      [sid]: {
        ...ship,
        fleetOrder: {
          ...order,
          legDurationSeconds: getShipLegDurationSeconds(state, fleet, ship, route.path, 0, galaxy),
        },
        activity: 'transport',
      },
    };
  }

  const updatedWings = fleet.wings.map(w =>
    w.id === haulingWing.id
      ? { ...w, isDispatched: true, haulingOriginSystemId: fromSystem }
      : w,
  );

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: newShips,
        fleets: { ...state.systems.fleet.fleets, [fleetId]: { ...fleet, wings: updatedWings } },
      },
    },
  };
}

// ─── Arrival & return ──────────────────────────────────────────────────────

/**
 * Called each tick after fleet orders advance.
 * When all dispatched wing ships have arrived at Corp HQ:
 *   1. Dumps the hauling wing cargoHold to corp resources.
 *   2. Issues return FleetOrders to send ships back to their origin.
 * Returns updated GameState or null if conditions are not met.
 */
export function processWingArrivalAtHQ(
  state: GameState,
  fleetId: string,
  wingId: string,
  homeSystemId: string,
): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;

  const haulingWing = fleet.wings?.find(w => w.id === wingId && w.isDispatched && w.type === 'hauling');
  if (!haulingWing?.haulingOriginSystemId) return null;

  const dispatchedIds = getWingDispatchShipIds(fleet, haulingWing);
  if (dispatchedIds.length === 0) return null;

  const ships = state.systems.fleet.ships;
  const allAtHQ = dispatchedIds.every(sid => {
    const ship = ships[sid];
    return ship && !ship.fleetOrder && ship.systemId === homeSystemId;
  });
  if (!allAtHQ) return null;

  // Dump hauling wing cargoHold to corp resources
  let s = state;
  const newResources = { ...s.resources };
  const currentFleet = s.systems.fleet.fleets[fleetId];
  for (const [resourceId, amount] of Object.entries(haulingWing.cargoHold ?? {})) {
    if (amount > 0) newResources[resourceId] = (newResources[resourceId] ?? 0) + amount;
  }
  const clearedWings = currentFleet.wings.map(wing =>
    wing.id === haulingWing.id ? { ...wing, cargoHold: {} } : wing,
  );
  s = {
    ...s,
    resources: newResources,
    systems: {
      ...s.systems,
      fleet: {
        ...s.systems.fleet,
        fleets: { ...s.systems.fleet.fleets, [fleetId]: { ...currentFleet, wings: clearedWings } },
      },
    },
  };

  // Issue return FleetOrders to each dispatched ship
  const returnOrigin = haulingWing.haulingOriginSystemId;
  const updatedFleet = s.systems.fleet.fleets[fleetId];
  const galaxy = generateGalaxy(s.galaxy.seed);
  const jumpRange = updatedFleet.maxJumpRangeLY > 0 ? updatedFleet.maxJumpRangeLY : 10;
  const preferredSecurityFilters: RouteSecurityFilter[] = hasActiveEscortWing(updatedFleet, haulingWing)
    ? ['shortest', 'avoid-null', 'safest']
    : ['safest', 'avoid-null', 'shortest'];
  let newShips = { ...s.systems.fleet.ships };
  for (const sid of dispatchedIds) {
    const ship = newShips[sid];
    if (!ship || ship.systemId === returnOrigin) continue;
    const routeResult = findHaulingWingRoute(galaxy, homeSystemId, returnOrigin, jumpRange, preferredSecurityFilters);
    if (routeResult) {
      const { route, filter } = routeResult;
      const order: FleetOrder = {
        destinationSystemId: returnOrigin,
        route: route.path,
        currentLeg: 0,
        securityFilter: filter,
        pauseOnArrival: false,
        legDepartedAt: Date.now(),
      };
      newShips = {
        ...newShips,
        [sid]: {
          ...ship,
          fleetOrder: {
            ...order,
            legDurationSeconds: getShipLegDurationSeconds(s, updatedFleet, ship, route.path, 0, galaxy),
          },
          activity: 'transport',
        },
      };
    }
  }

  return { ...s, systems: { ...s.systems, fleet: { ...s.systems.fleet, ships: newShips } } };
}

/**
 * Called each tick after fleet orders advance.
 * When all dispatched wing ships have returned to their origin:
 *   Reactivates ships (mining or idle) and clears the dispatch state.
 * Returns updated GameState or null if conditions are not met.
 */
export function processWingReturn(
  state: GameState,
  fleetId: string,
  wingId: string,
): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;

  const haulingWing = fleet.wings?.find(w => w.id === wingId && w.isDispatched && w.type === 'hauling');
  if (!haulingWing?.haulingOriginSystemId) return null;

  const dispatchedIds = getWingDispatchShipIds(fleet, haulingWing);
  if (dispatchedIds.length === 0) return null;

  const ships = state.systems.fleet.ships;
  const returnOrigin = haulingWing.haulingOriginSystemId;
  const allReturned = dispatchedIds.every(sid => {
    const ship = ships[sid];
    return ship && !ship.fleetOrder && ship.systemId === returnOrigin;
  });
  if (!allReturned) return null;

  let newShips = { ...state.systems.fleet.ships };
  for (const sid of dispatchedIds) {
    const ship = newShips[sid];
    if (ship) {
      newShips = { ...newShips, [sid]: { ...ship, activity: ship.assignedBeltId ? 'mining' : 'idle' } };
    }
  }

  const updatedWings = fleet.wings.map(w =>
    w.id === haulingWing.id
      ? { ...w, isDispatched: false, haulingOriginSystemId: null }
      : w,
  );

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: newShips,
        fleets: { ...state.systems.fleet.fleets, [fleetId]: { ...fleet, wings: updatedWings } },
      },
    },
  };
}
