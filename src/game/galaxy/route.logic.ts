/**
 * Route planning for the galaxy navigation system.
 *
 * Algorithm selection per security filter:
 *  - 'shortest'   — BFS (fewest hops, no security restrictions)
 *  - 'avoid-null' — BFS excluding nullsec intermediate nodes
 *  - 'avoid-low'  — BFS excluding lowsec + nullsec intermediate nodes
 *  - 'safest'     — Dijkstra with heavy node-cost penalties for lowsec/nullsec,
 *                   so the planner strongly prefers highsec but won't refuse
 *                   to route if no all-highsec path exists
 *
 * Jump connections are implicit: every pair within jumpRangeLY is adjacent.
 * Warp distances are 2D (x,y) only — Z elevation is purely visual.
 */

import type { StarSystem, SystemSecurity } from '@/types/galaxy.types';
import type { RouteSecurityFilter } from '@/types/faction.types';
import { systemDistance, GALAXY_WIDTH_LY } from '@/game/galaxy/galaxy.gen';

// ─── Unit helpers ─────────────────────────────────────────────────────────────

/** Convert light-years to normalised galaxy units (galaxy is GALAXY_WIDTH_LY wide). */
export function lyToUnits(ly: number): number {
  return ly / GALAXY_WIDTH_LY;
}

/** Convert normalised galaxy units back to light-years. */
export function unitsToLy(units: number): number {
  return units * GALAXY_WIDTH_LY;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface RouteResult {
  /** Ordered system IDs from origin to destination, inclusive. */
  path: string[];
  /** Total distance in galaxy units (sum of hop distances). */
  totalUnits: number;
  /** Total distance in light-years. */
  totalLy: number;
  /** Number of jumps (hops). */
  hops: number;
  /**
   * Security tier of the DESTINATION system for each leg.
   * Length === path.length - 1.  Used to colour-code route legs on the map.
   */
  legSecurity: SystemSecurity[];
}

// ─── Safety weights for Dijkstra (safest mode) ───────────────────────────────

/**
 * Node traversal cost by security tier.
 * highsec = 1 (free), lowsec = 20 (costly), nullsec = 100 (very costly).
 * A route through 20 lowsec systems costs the same as 1 nullsec—the planner
 * will take significant detours to stay in highsec.
 */
const SAFETY_WEIGHT: Record<SystemSecurity, number> = {
  highsec: 1,
  lowsec:  20,
  nullsec: 100,
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildAdjacency(
  systems: StarSystem[],
  jumpRange: number,
): { adj: Map<string, string[]>; sysMap: Map<string, StarSystem> } {
  const adj    = new Map<string, string[]>();
  const sysMap = new Map<string, StarSystem>();
  for (const sys of systems) { adj.set(sys.id, []); sysMap.set(sys.id, sys); }

  for (let i = 0; i < systems.length; i++) {
    for (let j = i + 1; j < systems.length; j++) {
      if (systemDistance(systems[i], systems[j]) <= jumpRange) {
        adj.get(systems[i].id)!.push(systems[j].id);
        adj.get(systems[j].id)!.push(systems[i].id);
      }
    }
  }
  return { adj, sysMap };
}

/**
 * BFS — fewest hops.  Forbidden set bans certain security tiers on intermediate
 * nodes; the destination is always reachable regardless of its tier.
 */
function bfsFindPath(
  fromId: string,
  toId: string,
  adj: Map<string, string[]>,
  sysMap: Map<string, StarSystem>,
  forbidden: Set<SystemSecurity>,
): string[] | null {
  const queue: string[][] = [[fromId]];
  const visited = new Set<string>([fromId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    for (const neighbor of (adj.get(current) ?? [])) {
      const neighborSys = sysMap.get(neighbor)!;
      if (neighbor !== toId && forbidden.has(neighborSys.security)) continue;

      const newPath = [...path, neighbor];
      if (neighbor === toId) return newPath;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(newPath);
      }
    }
  }
  return null;
}

/**
 * Dijkstra — minimises safety-weighted hop cost.
 * Nullsec nodes are extremely expensive, lowsec nodes moderately so.
 * Returns undefined if destination is unreachable.
 */
function dijkstraSafest(
  fromId: string,
  toId: string,
  adj: Map<string, string[]>,
  sysMap: Map<string, StarSystem>,
): string[] | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();

  // O(V²) Dijkstra — fast enough for ≤400 nodes
  const unvisited = new Set<string>(adj.keys());
  dist.set(fromId, 0);

  while (unvisited.size > 0) {
    // Find unvisited node with minimum tentative distance
    let minDist = Infinity;
    let current: string | null = null;
    for (const id of unvisited) {
      const d = dist.get(id) ?? Infinity;
      if (d < minDist) { minDist = d; current = id; }
    }
    if (current === null || minDist === Infinity) break;
    if (current === toId) break;
    unvisited.delete(current);

    for (const neighbor of (adj.get(current) ?? [])) {
      const neighborSys = sysMap.get(neighbor)!;
      const edgeCost = SAFETY_WEIGHT[neighborSys.security];
      const newCost  = minDist + edgeCost;
      if (newCost < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, newCost);
        prev.set(neighbor, current);
      }
    }
  }

  if (!(dist.get(toId)! < Infinity) && !prev.has(toId)) return null;

  // Reconstruct path
  const path: string[] = [];
  let curr: string | undefined = toId;
  while (curr !== undefined) {
    path.unshift(curr);
    curr = prev.get(curr);
  }
  return path[0] === fromId ? path : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Find a route between two star systems, respecting jump range and security filter.
 *
 * @param systems        Full galaxy system list.
 * @param fromId         Origin system ID.
 * @param toId           Destination system ID.
 * @param jumpRangeLY    Maximum single-hop jump distance in light-years.
 * @param securityFilter Routing strategy (default 'shortest').
 */
export function findRoute(
  systems: StarSystem[],
  fromId: string,
  toId: string,
  jumpRangeLY: number,
  securityFilter: RouteSecurityFilter = 'shortest',
): RouteResult | null {
  if (fromId === toId) {
    return { path: [fromId], totalUnits: 0, totalLy: 0, hops: 0, legSecurity: [] };
  }

  const { adj, sysMap } = buildAdjacency(systems, lyToUnits(jumpRangeLY));

  // Choose algorithm
  let path: string[] | null;
  if (securityFilter === 'safest') {
    path = dijkstraSafest(fromId, toId, adj, sysMap);
  } else {
    const forbidden = new Set<SystemSecurity>();
    if (securityFilter === 'avoid-null' || securityFilter === 'avoid-low') forbidden.add('nullsec');
    if (securityFilter === 'avoid-low') forbidden.add('lowsec');
    path = bfsFindPath(fromId, toId, adj, sysMap, forbidden);
  }

  if (!path) return null;

  // Compute route stats + per-leg security annotation
  let totalUnits = 0;
  const legSecurity: SystemSecurity[] = [];
  for (let k = 0; k < path.length - 1; k++) {
    const a = sysMap.get(path[k])!;
    const b = sysMap.get(path[k + 1])!;
    totalUnits += systemDistance(a, b);
    legSecurity.push(b.security);
  }

  return { path, totalUnits, totalLy: unitsToLy(totalUnits), hops: path.length - 1, legSecurity };
}

/**
 * Returns all system IDs reachable from `fromId` in a single jump.
 * Used for jump range highlighting on the map.
 */
export function getReachableSystems(
  systems: StarSystem[],
  fromId: string,
  jumpRangeLY: number,
): Set<string> {
  const jumpRange = lyToUnits(jumpRangeLY);
  const fromSys = systems.find(s => s.id === fromId);
  if (!fromSys) return new Set();

  const reachable = new Set<string>();
  for (const sys of systems) {
    if (sys.id === fromId) continue;
    if (systemDistance(fromSys, sys) <= jumpRange) {
      reachable.add(sys.id);
    }
  }
  return reachable;
}
