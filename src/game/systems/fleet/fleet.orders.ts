/**
 * Fleet order system — autonomous ship movement.
 *
 * Ships with a non-null `fleetOrder` advance one hop per call to
 * `advanceFleetOrder()`, which is called every tick cycle.
 *
 * Design notes:
 * - Routes are pre-computed by issueFleetOrder() and stored on the ship.
 * - Each tick the ship moves one leg (hop) forward on the route.
 * - On arrival the order is cleared and the ship resumes its previous activity
 *   (or goes idle if pauseOnArrival was set).
 * - issueFleetOrder() uses the galaxy-wide BFS route planner with optional
 *   security filter.
 */

import type { GameState, ShipInstance } from '@/types/game.types';
import type { FleetOrder, RouteSecurityFilter } from '@/types/faction.types';
import { findRoute } from '@/game/galaxy/route.logic';
import { generateGalaxy } from '@/game/galaxy/galaxy.gen';
import { computeFleetJumpRange } from './fleet.logic';

// ─── Jump range constant ──────────────────────────────────────────────────

/** Default autonomous jump range for standalone ship orders (in LY). */
export const FLEET_ORDER_JUMP_RANGE_LY = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────

function getShipById(state: GameState, shipId: string): ShipInstance | undefined {
  return state.systems.fleet.ships[shipId];
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

  const fromId = fleet.currentSystemId;
  if (fromId === destinationId) return null;

  const jumpRange = fleet.maxJumpRangeLY > 0
    ? fleet.maxJumpRangeLY
    : computeFleetJumpRange(state, fleet.shipIds);

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
        fleets: { ...state.systems.fleet.fleets, [fleetId]: { ...fleet, fleetOrder: order } },
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
): FleetOrderTickResult {
  let s = state;
  const arrivals: Array<{ shipId: string; systemId: string }> = [];

  for (const [shipId, ship] of Object.entries(s.systems.fleet.ships)) {
    if (!ship.fleetOrder) continue;

    const order = ship.fleetOrder;
    const nextLeg = order.currentLeg + 1;

    if (nextLeg >= order.route.length) {
      // Order complete — ship is already at destination; clear the order
      const updatedShip: ShipInstance = {
        ...ship,
        fleetOrder: null,
        activity: order.pauseOnArrival ? 'idle' : ship.activity === 'transport' ? 'idle' : ship.activity,
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
      continue;
    }

    // Advance one hop
    const nextSystemId = order.route[nextLeg];

    const updatedOrder: FleetOrder = {
      ...order,
      currentLeg: nextLeg,
      legDepartedAt: Date.now(),
    };

    const didArrive = nextLeg === order.route.length - 1;

    const updatedShip: ShipInstance = {
      ...ship,
      systemId: nextSystemId,
      fleetOrder: didArrive ? null : updatedOrder,
      activity: didArrive
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

    if (didArrive) {
      arrivals.push({ shipId, systemId: nextSystemId });
    }
  }

  // ── Fleet GROUP order advancement ─────────────────────────────────────
  for (const [fleetId, fleet] of Object.entries(s.systems.fleet.fleets)) {
    if (!fleet.fleetOrder) continue;

    const order = fleet.fleetOrder;
    const nextLeg = order.currentLeg + 1;

    if (nextLeg >= order.route.length) {
      // Already at destination — clear order
      let newShips = { ...s.systems.fleet.ships };
      for (const sid of fleet.shipIds) {
        const ship = newShips[sid];
        if (ship) newShips = { ...newShips, [sid]: { ...ship, activity: 'idle' } };
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
              [fleetId]: { ...fleet, fleetOrder: null },
            },
          },
        },
      };
      for (const sid of fleet.shipIds) arrivals.push({ shipId: sid, systemId: fleet.currentSystemId });
      continue;
    }

    const nextSystemId = order.route[nextLeg];
    const didArrive = nextLeg === order.route.length - 1;

    const updatedOrder: FleetOrder = {
      ...order,
      currentLeg: nextLeg,
      legDepartedAt: Date.now(),
    };

    // Move all ships in the fleet to the next system
    let newShips = { ...s.systems.fleet.ships };
    for (const sid of fleet.shipIds) {
      const ship = newShips[sid];
      if (ship) {
        newShips = {
          ...newShips,
          [sid]: {
            ...ship,
            systemId: nextSystemId,
            activity: didArrive ? 'idle' : 'transport',
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
              currentSystemId: nextSystemId,
              fleetOrder: didArrive ? null : updatedOrder,
            },
          },
        },
      },
    };

    if (didArrive) {
      for (const sid of fleet.shipIds) arrivals.push({ shipId: sid, systemId: nextSystemId });
    }
  }

  return { newState: s, arrivals };
}
