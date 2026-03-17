/**
 * Fleet order system — autonomous ship movement.
 *
 * Ships with a non-null `fleetOrder` advance along timed warp legs.
 *
 * Design notes:
 * - Routes are pre-computed by issueFleetOrder() and stored on the ship.
 * - Each leg has a computed duration derived from the galaxy warp model.
 * - On arrival the order is cleared and the ship resumes its previous activity
 *   (or goes idle if pauseOnArrival was set).
 * - issueFleetOrder() uses the galaxy-wide BFS route planner with optional
 *   security filter.
 */

import type { GameState, PlayerFleet, ShipInstance } from '@/types/game.types';
import type { FleetOrder, RouteSecurityFilter } from '@/types/faction.types';
import type { StarSystem } from '@/types/galaxy.types';
import { findRoute } from '@/game/galaxy/route.logic';
import { generateGalaxy } from '@/game/galaxy/galaxy.gen';
import { calcWarpDuration } from '@/game/galaxy/travel.logic';
import { computeFleetJumpRange, getFleetTransitWarpMultiplier, getShipTransitWarpMultiplier } from './fleet.logic';
import { hasDispatchedHaulingWing } from './wings.logic';

// ─── Jump range constant ──────────────────────────────────────────────────

/** Default autonomous jump range for standalone ship orders (in LY). */
export const FLEET_ORDER_JUMP_RANGE_LY = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────

function getShipById(state: GameState, shipId: string): ShipInstance | undefined {
  return state.systems.fleet.ships[shipId];
}

function getSystemById(systems: StarSystem[], systemId: string): StarSystem | undefined {
  return systems.find(system => system.id === systemId);
}

function computeRouteLegDurationSeconds(
  state: GameState,
  route: string[],
  legIndex: number,
  systems: StarSystem[],
  extraWarpSpeedMultiplier: number,
): number {
  const from = getSystemById(systems, route[legIndex]);
  const to = getSystemById(systems, route[legIndex + 1]);
  if (!from || !to) return 1;
  return calcWarpDuration(state, from, to, extraWarpSpeedMultiplier);
}

export function getShipOrderLegDurationSeconds(
  state: GameState,
  ship: ShipInstance,
  order: FleetOrder,
  systems: StarSystem[],
): number {
  return order.legDurationSeconds
    ?? computeRouteLegDurationSeconds(state, order.route, order.currentLeg, systems, getShipTransitWarpMultiplier(state, ship));
}

export function getFleetOrderLegDurationSeconds(
  state: GameState,
  fleet: PlayerFleet,
  ships: Record<string, ShipInstance>,
  order: FleetOrder,
  systems: StarSystem[],
): number {
  return order.legDurationSeconds
    ?? computeRouteLegDurationSeconds(state, order.route, order.currentLeg, systems, getFleetTransitWarpMultiplier(state, fleet.shipIds, fleet));
}

function getOrderProgress(order: FleetOrder, durationSeconds: number, nowMs: number): number {
  if (durationSeconds <= 0) return 1;
  const elapsedSeconds = Math.max(0, (nowMs - order.legDepartedAt) / 1000);
  return Math.min(1, elapsedSeconds / durationSeconds);
}

export function getShipOrderProgress(
  state: GameState,
  ship: ShipInstance,
  order: FleetOrder,
  systems: StarSystem[],
  nowMs: number,
): number {
  return getOrderProgress(order, getShipOrderLegDurationSeconds(state, ship, order, systems), nowMs);
}

export function getFleetOrderProgress(
  state: GameState,
  fleet: PlayerFleet,
  ships: Record<string, ShipInstance>,
  order: FleetOrder,
  systems: StarSystem[],
  nowMs: number,
): number {
  return getOrderProgress(order, getFleetOrderLegDurationSeconds(state, fleet, ships, order, systems), nowMs);
}

export function getShipOrderEtaSeconds(
  state: GameState,
  ship: ShipInstance,
  order: FleetOrder,
  systems: StarSystem[],
  nowMs: number,
): number {
  const extraWarpSpeedMultiplier = getShipTransitWarpMultiplier(state, ship);
  let remaining = Math.max(0, getShipOrderLegDurationSeconds(state, ship, order, systems) - ((nowMs - order.legDepartedAt) / 1000));
  for (let legIndex = order.currentLeg + 1; legIndex < order.route.length - 1; legIndex += 1) {
    remaining += computeRouteLegDurationSeconds(state, order.route, legIndex, systems, extraWarpSpeedMultiplier);
  }
  return remaining;
}

export function getFleetOrderEtaSeconds(
  state: GameState,
  fleet: PlayerFleet,
  ships: Record<string, ShipInstance>,
  order: FleetOrder,
  systems: StarSystem[],
  nowMs: number,
): number {
  const extraWarpSpeedMultiplier = getFleetTransitWarpMultiplier(state, fleet.shipIds, fleet);
  let remaining = Math.max(0, getFleetOrderLegDurationSeconds(state, fleet, ships, order, systems) - ((nowMs - order.legDepartedAt) / 1000));
  for (let legIndex = order.currentLeg + 1; legIndex < order.route.length - 1; legIndex += 1) {
    remaining += computeRouteLegDurationSeconds(state, order.route, legIndex, systems, extraWarpSpeedMultiplier);
  }
  return remaining;
}

function advanceOrderByElapsedTime(
  state: GameState,
  order: FleetOrder,
  systems: StarSystem[],
  extraWarpSpeedMultiplier: number,
  nowMs: number,
): { nextOrder: FleetOrder | null; currentSystemId: string; arrived: boolean } {
  let currentLeg = order.currentLeg;
  let legDepartedAt = order.legDepartedAt;
  let currentSystemId = order.route[currentLeg] ?? order.destinationSystemId;
  let legDurationSeconds = order.legDurationSeconds
    ?? computeRouteLegDurationSeconds(state, order.route, currentLeg, systems, extraWarpSpeedMultiplier);

  while (currentLeg < order.route.length - 1) {
    const arrivalAt = legDepartedAt + Math.round(legDurationSeconds * 1000);
    if (nowMs < arrivalAt) {
      return {
        nextOrder: { ...order, currentLeg, legDepartedAt, legDurationSeconds },
        currentSystemId,
        arrived: false,
      };
    }

    currentLeg += 1;
    currentSystemId = order.route[currentLeg] ?? currentSystemId;

    if (currentLeg >= order.route.length - 1) {
      return { nextOrder: null, currentSystemId, arrived: true };
    }

    legDepartedAt = arrivalAt;
    legDurationSeconds = computeRouteLegDurationSeconds(state, order.route, currentLeg, systems, extraWarpSpeedMultiplier);
  }

  return { nextOrder: null, currentSystemId, arrived: true };
}

// ─── Issue order ──────────────────────────────────────────────────────────

/**
 * Issue a fleet order to move a ship to a destination system.
 *
 * @param state          Current game state.
 * @param shipId         The ship receiving the order.
 * @param destinationId  Target system ID.
 * @param securityFilter Route optimization / avoidance preference.
 * @param pauseOnArrival If true, ship goes idle on arrival instead of mining.
 * @returns Updated GameState, or null if no route exists or ship not found.
 */
export function issueFleetOrder(
  state: GameState,
  shipId: string,
  destinationId: string,
  securityFilter: RouteSecurityFilter = 'shortest',
  pauseOnArrival = false,
): GameState | null {
  const ship = getShipById(state, shipId);
  if (!ship) return null;

  const fromId = ship.systemId;
  if (fromId === destinationId) return null; // already there

  const galaxy = generateGalaxy(state.galaxy.seed);
  const route = findRoute(galaxy, fromId, destinationId, FLEET_ORDER_JUMP_RANGE_LY, securityFilter);
  if (!route || route.hops === 0) return null; // no path found

  const order: FleetOrder = {
    destinationSystemId: destinationId,
    route: route.path,       // includes both origin and destination
    currentLeg: 0,
    securityFilter,
    pauseOnArrival,
    legDepartedAt: Date.now(),
    legDurationSeconds: computeRouteLegDurationSeconds(state, route.path, 0, galaxy, getShipTransitWarpMultiplier(state, ship)),
  };

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: {
          ...state.systems.fleet.ships,
          [shipId]: { ...ship, fleetOrder: order, activity: 'transport' },
        },
      },
    },
  };
}

// ─── Cancel order ─────────────────────────────────────────────────────────

/**
 * Cancel a ship's fleet order and leave it idle at its current position.
 */
export function cancelFleetOrder(state: GameState, shipId: string): GameState | null {
  const ship = getShipById(state, shipId);
  if (!ship || !ship.fleetOrder) return null;

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: {
          ...state.systems.fleet.ships,
          [shipId]: { ...ship, fleetOrder: null, activity: 'idle' },
        },
      },
    },
  };
}

// ─── Fleet GROUP orders ────────────────────────────────────────────────────

/**
 * Issue a movement order to an entire fleet group.
 * Uses the fleet's current system as the origin and its maxJumpRangeLY for routing.
 * Returns updated GameState or null if no route is found / fleet not found.
 */
export function issueFleetGroupOrder(
  state: GameState,
  fleetId: string,
  destinationId: string,
  securityFilter: RouteSecurityFilter = 'shortest',
  pauseOnArrival = false,
): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;
  if (hasDispatchedHaulingWing(fleet)) return null;

  const fromId = fleet.currentSystemId;
  if (fromId === destinationId) return null;

  const computedJumpRange = computeFleetJumpRange(state, fleet.shipIds);
  const jumpRange = Math.max(fleet.maxJumpRangeLY, computedJumpRange);

  const galaxy = generateGalaxy(state.galaxy.seed);
  const route  = findRoute(galaxy, fromId, destinationId, jumpRange, securityFilter);
  if (!route || route.hops === 0) return null;

  const order: FleetOrder = {
    destinationSystemId: destinationId,
    route: route.path,
    currentLeg: 0,
    securityFilter,
    pauseOnArrival,
    legDepartedAt: Date.now(),
    legDurationSeconds: computeRouteLegDurationSeconds(state, route.path, 0, galaxy, getFleetTransitWarpMultiplier(state, fleet.shipIds, fleet)),
  };

  // Update all ships in the fleet to 'transport' activity
  let newShips = { ...state.systems.fleet.ships };
  for (const sid of fleet.shipIds) {
    const s = newShips[sid];
    if (s) newShips = { ...newShips, [sid]: { ...s, activity: 'transport' } };
  }

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: newShips,
        fleets: {
          ...state.systems.fleet.fleets,
          [fleetId]: {
            ...fleet,
            maxJumpRangeLY: jumpRange,
            fleetOrder: order,
          },
        },
      },
    },
  };
}

/**
 * Cancel a fleet group's active order. The fleet stays at its current system.
 */
export function cancelFleetGroupOrder(state: GameState, fleetId: string): GameState | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet || !fleet.fleetOrder) return null;
  if (hasDispatchedHaulingWing(fleet)) return null;

  let newShips = { ...state.systems.fleet.ships };
  for (const sid of fleet.shipIds) {
    const s = newShips[sid];
    if (s) newShips = { ...newShips, [sid]: { ...s, activity: 'idle' } };
  }

  return {
    ...state,
    systems: {
      ...state.systems,
      fleet: {
        ...state.systems.fleet,
        ships: newShips,
        fleets: {
          ...state.systems.fleet.fleets,
          [fleetId]: { ...fleet, fleetOrder: null },
        },
      },
    },
  };
}

// ─── Advance order (called each tick) ─────────────────────────────────────

export interface FleetOrderTickResult {
  newState: GameState;
  /** Ships that arrived at their destination this tick. */
  arrivals: Array<{ shipId: string; systemId: string }>;
}

/**
 * Advance all active fleet orders by one hop.
 * Should be called once per game tick.
 */
export function advanceFleetOrders(
  state: GameState,
  nowMs: number,
): FleetOrderTickResult {
  let s = state;
  const arrivals: Array<{ shipId: string; systemId: string }> = [];
  const galaxy = generateGalaxy(state.galaxy.seed);

  for (const [shipId, ship] of Object.entries(s.systems.fleet.ships)) {
    if (!ship.fleetOrder) continue;

    const order = ship.fleetOrder;
    const advancedOrder = advanceOrderByElapsedTime(
      s,
      order,
      galaxy,
      getShipTransitWarpMultiplier(s, ship),
      nowMs,
    );

    const updatedShip: ShipInstance = {
      ...ship,
      systemId: advancedOrder.currentSystemId,
      fleetOrder: advancedOrder.nextOrder,
      activity: advancedOrder.arrived
        ? (order.pauseOnArrival ? 'idle' : 'idle')
        : 'transport',
    };

    s = {
      ...s,
      systems: {
        ...s.systems,
        fleet: {
          ...s.systems.fleet,
          ships: { ...s.systems.fleet.ships, [shipId]: updatedShip },
        },
      },
    };

    if (advancedOrder.arrived) {
      arrivals.push({ shipId, systemId: advancedOrder.currentSystemId });
    }
  }

  // ── Fleet GROUP order advancement ─────────────────────────────────────
  for (const [fleetId, fleet] of Object.entries(s.systems.fleet.fleets)) {
    if (!fleet.fleetOrder) continue;

    const order = fleet.fleetOrder;
    const advancedOrder = advanceOrderByElapsedTime(
      s,
      order,
      galaxy,
      getFleetTransitWarpMultiplier(s, fleet.shipIds, fleet),
      nowMs,
    );

    // Move all ships in the fleet to the resolved system for this tick
    let newShips = { ...s.systems.fleet.ships };
    for (const sid of fleet.shipIds) {
      const ship = newShips[sid];
      if (ship) {
        newShips = {
          ...newShips,
          [sid]: {
            ...ship,
            systemId: advancedOrder.currentSystemId,
            activity: advancedOrder.arrived ? 'idle' : 'transport',
          },
        };
      }
    }

    s = {
      ...s,
      systems: {
        ...s.systems,
        fleet: {
          ...s.systems.fleet,
          ships: newShips,
          fleets: {
            ...s.systems.fleet.fleets,
            [fleetId]: {
              ...fleet,
              currentSystemId: advancedOrder.currentSystemId,
              fleetOrder: advancedOrder.nextOrder,
            },
          },
        },
      },
    };

    if (advancedOrder.arrived) {
      for (const sid of fleet.shipIds) arrivals.push({ shipId: sid, systemId: advancedOrder.currentSystemId });
    }
  }

  return { newState: s, arrivals };
}
