/**
 * Exploration tick — Phase 4.
 *
 * Each tick, every fleet with isScanning = true advances scan progress on all
 * unrevealed anomalies in its current system.  On revelation, a DiscoveryEntry
 * is added to the fleet discoveries log.
 *
 * Scan formula:
 *   progressPerSecond = fleetScanStrength / anomaly.signatureRadius
 *   fleetScanStrength = Σ ships × (hull.baseSensorStrength + scanStrengthModules)
 *                       × (1 + modifiers['scan-speed'])
 */

import type { GameState, Anomaly, DiscoveryEntry, PlayerFleet } from '@/types/game.types';
import { HULL_DEFINITIONS, MODULE_DEFINITIONS } from '@/game/systems/fleet/fleet.config';
import { generateAnomalies, getGameDay } from '@/game/galaxy/anomaly.gen';
import { generateGalaxy } from '@/game/galaxy/galaxy.gen';

// ─── Result type ─────────────────────────────────────────────────────────

export interface ExplorationTickResult {
  /** Updated anomaly map (only systems that changed). */
  updatedAnomalies: Record<string, Anomaly[]>;
  /** New discovery log entries (newly revealed anomalies). */
  newDiscoveries: DiscoveryEntry[];
}

// ─── Sensor strength helpers ─────────────────────────────────────────────

function getModuleScanBonus(ship: import('@/types/game.types').ShipInstance): number {
  let total = 0;
  for (const slotType of ['high', 'mid', 'low'] as const) {
    for (const moduleId of ship.fittedModules[slotType]) {
      const mod = MODULE_DEFINITIONS[moduleId];
      if (mod?.effects['scan-strength']) total += mod.effects['scan-strength'];
    }
  }
  return total;
}

export function getFleetScanStrength(state: GameState, fleet: PlayerFleet): number {
  const speedMult = 1 + (state.modifiers['scan-speed'] ?? 0);
  let total = 0;
  for (const shipId of fleet.shipIds) {
    const ship = state.systems.fleet.ships[shipId];
    if (!ship) continue;
    const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
    if (!hull) continue;
    const base   = hull.baseSensorStrength;
    const module = getModuleScanBonus(ship);
    total += (base + module) * speedMult;
  }
  return total;
}

// ─── Main exploration tick ────────────────────────────────────────────────

export function tickExploration(
  state: GameState,
  deltaSeconds: number,
): ExplorationTickResult {
  const result: ExplorationTickResult = {
    updatedAnomalies: {},
    newDiscoveries: [],
  };

  // Find all scanning fleets
  const scanningFleets = Object.values(state.systems.fleet.fleets).filter(
    f => f.isScanning && !f.fleetOrder && f.shipIds.length > 0,
  );
  if (scanningFleets.length === 0) return result;

  const galaxy       = generateGalaxy(state.galaxy.seed);
  const allSystemIds = galaxy.map(s => s.id);
  const nowMs        = state.lastUpdatedAt + Math.round(deltaSeconds * 1000);
  const daySeed      = getGameDay(nowMs);

  // Track anomaly arrays by systemId — start with current state
  const anomalyMap: Record<string, Anomaly[]> = { ...state.galaxy.anomalies };

  for (const fleet of scanningFleets) {
    const systemId = fleet.currentSystemId;
    const system   = galaxy.find(s => s.id === systemId);
    if (!system) continue;

    // Lazily generate anomalies for this system if not yet present
    if (!anomalyMap[systemId]) {
      anomalyMap[systemId] = generateAnomalies(
        systemId, system.security, daySeed, allSystemIds, nowMs,
      );
      result.updatedAnomalies[systemId] = anomalyMap[systemId];
    }

    const fleetStrength = getFleetScanStrength(state, fleet);
    if (fleetStrength <= 0) continue;

    const currentAnomalies = anomalyMap[systemId];
    let changed = false;
    const updatedList = currentAnomalies.map(anomaly => {
      // Skip already revealed, depleted, or expired
      if (anomaly.revealed || anomaly.depleted) return anomaly;
      if (anomaly.expiresAt !== null && nowMs > anomaly.expiresAt) {
        changed = true;
        return { ...anomaly, depleted: true };
      }

      const progressPerSecond = fleetStrength / anomaly.signatureRadius;
      const newProgress = Math.min(100, anomaly.scanProgress + progressPerSecond * deltaSeconds);
      const justRevealed = !anomaly.revealed && newProgress >= 100;

      if (justRevealed) {
        changed = true;
        result.newDiscoveries.push({
          id:          `disc-${anomaly.id}`,
          timestamp:   nowMs,
          anomalyType: anomaly.type,
          anomalyName: anomaly.name,
          systemId,
          systemName:  system.name,
        });
        return { ...anomaly, scanProgress: 100, revealed: true };
      }

      if (newProgress !== anomaly.scanProgress) {
        changed = true;
        return { ...anomaly, scanProgress: newProgress };
      }

      return anomaly;
    });

    if (changed) {
      anomalyMap[systemId] = updatedList;
      result.updatedAnomalies[systemId] = updatedList;
    }
  }

  return result;
}
