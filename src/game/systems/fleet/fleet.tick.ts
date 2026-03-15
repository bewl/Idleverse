import type { GameState, PilotInstance, FleetState } from '@/types/game.types';
import { HULL_DEFINITIONS, MODULE_DEFINITIONS } from './fleet.config';
import { tickPilotSkillTraining, tickMorale, getPilotMoraleMultiplier, getPilotMiningBonus } from './pilot.logic';
import { IDLE_REPAIR_RATE_PER_SEC } from '@/game/balance/constants';

// ─── Tick result ───────────────────────────────────────────────────────────

export interface FleetTickResult {
  /** Additional ore deltas accumulated from fleet mining ships this tick (resourceId → units). */
  oreDeltas: Record<string, number>;
  /** Updated fleet state (pilot skills, morale, statuses). */
  newFleetState: FleetState;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/** Sum up module bonuses for a given effect key across all fitted slots of a ship. */
function getModuleBonus(ship: import('@/types/game.types').ShipInstance, effectKey: string): number {
  let total = 0;
  for (const slotType of ['high', 'mid', 'low'] as const) {
    for (const moduleId of ship.fittedModules[slotType]) {
      const mod = MODULE_DEFINITIONS[moduleId];
      if (mod?.effects[effectKey]) total += mod.effects[effectKey];
    }
  }
  return total;
}

// ─── Main tick ─────────────────────────────────────────────────────────────

/**
 * Advance the entire fleet by deltaSeconds:
 * - Tick each pilot's morale and personal skill training.
 * - Calculate mining ore deltas from active mining ships.
 *
 * Fleet mining output is additive on top of the existing mining tick
 * and keyed to belt output per the current system's belt pool.
 */
export function tickFleet(state: GameState, deltaSeconds: number): FleetTickResult {
  const fleet = state.systems.fleet;
  const oreDeltas: Record<string, number> = {};

  const newPilots: Record<string, PilotInstance> = {};

  // ── Iterate pilots — tick morale + skill training ──────────────────────
  for (const [pilotId, pilot] of Object.entries(fleet.pilots)) {
    const skillResult = tickPilotSkillTraining(pilot, deltaSeconds);
    const newMorale   = tickMorale(pilot, deltaSeconds);

    // Accumulate stats if the pilot is flying a mining ship this tick
    let oreMinedDelta = 0;
    const assignedShip = pilot.assignedShipId ? fleet.ships[pilot.assignedShipId] : null;
    if (assignedShip?.activity === 'mining') {
      const hull = HULL_DEFINITIONS[assignedShip.shipDefinitionId];
      if (hull) {
        const hullMining  = hull.baseMiningBonus;
        const moduleMining = getModuleBonus(assignedShip, 'mining-yield');
        const pilotMining  = getPilotMiningBonus(pilot);
        const moraleMult   = getPilotMoraleMultiplier({ ...pilot, morale: newMorale });
        // Yield per second (normalized; actual rate scaled by the system/belt later in mining.tick)
        oreMinedDelta = (hullMining + moduleMining + pilotMining) * moraleMult * deltaSeconds;
      }
    }

    newPilots[pilotId] = {
      ...pilot,
      morale:     newMorale,
      skills:     skillResult.newSkillState,
      experience: pilot.experience + deltaSeconds * (assignedShip?.activity !== 'idle' ? 1 : 0),
      stats: {
        ...pilot.stats,
        oreMinedTotal: pilot.stats.oreMinedTotal + oreMinedDelta,
      },
    };
  }

  // ── Iterate ships — calculate fleet mining contribution ────────────────
  for (const ship of Object.values(fleet.ships)) {
    if (ship.activity !== 'mining') continue;
    if (!ship.assignedPilotId) continue;

    const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
    if (!hull) continue;

    const pilot = newPilots[ship.assignedPilotId];
    if (!pilot) continue;

    // Determine which belts to mine: use the ship's assigned belt if set,
    // otherwise contribute to nothing (belt assignment required for fleet ships).
    if (!ship.assignedBeltId) continue;

    const hullMining   = hull.baseMiningBonus;
    const moduleMining = getModuleBonus(ship, 'mining-yield');
    const pilotMining  = getPilotMiningBonus(pilot);
    const moraleMult   = getPilotMoraleMultiplier(pilot);

    // Fleet mining yield expressed as a fractional unit scalar per second.
    // The actual ore resource IDs are resolved by the belt definitions in mining.tick;
    // this value will be integrated there. We use a synthetic key based on beltId
    // to pass the multiplier through to the mining tick.
    const yieldPerSecond = (hullMining + moduleMining + pilotMining) * moraleMult * deltaSeconds;

    const key = `fleet:${ship.assignedBeltId}`;
    oreDeltas[key] = (oreDeltas[key] ?? 0) + yieldPerSecond;
  }

  // ── Passive idle repair — ships on idle slowly recover hull damage ────────
  // Ships whose fleet has an active combatOrder are excluded (can't repair mid-fight).
  const combatActiveShipIds = new Set<string>();
  for (const f of Object.values(fleet.fleets)) {
    if (f.combatOrder) {
      for (const sid of f.shipIds) combatActiveShipIds.add(sid);
    }
  }

  const repairedShips = { ...fleet.ships };
  for (const [shipId, ship] of Object.entries(repairedShips)) {
    if (ship.hullDamage <= 0) continue;
    if (ship.activity !== 'idle') continue;
    if (combatActiveShipIds.has(shipId)) continue;
    const repaired = Math.min(ship.hullDamage, IDLE_REPAIR_RATE_PER_SEC * deltaSeconds);
    repairedShips[shipId] = { ...ship, hullDamage: Math.max(0, ship.hullDamage - repaired) };
  }

  return {
    oreDeltas,
    newFleetState: {
      ...fleet,
      ships: repairedShips,
      pilots: newPilots,
    },
  };
}
