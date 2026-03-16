import type { GameState, ShipInstance } from '@/types/game.types';
import { useGameStore } from '@/stores/gameStore';
import { ORE_BELTS } from '@/game/systems/mining/mining.config';
import { getBeltRichnessForSystem } from '@/game/systems/mining/mining.logic';
import { HULL_DEFINITIONS, MODULE_DEFINITIONS } from '@/game/systems/fleet/fleet.config';
import { getPilotMiningBonus, getPilotMoraleMultiplier } from '@/game/systems/fleet/pilot.logic';
import { getCombinedCommanderBonus } from '@/game/systems/fleet/commander.logic';
import { getWingByShipId } from '@/game/systems/fleet/wings.logic';
import { MANUFACTURING_RECIPES } from '@/game/systems/manufacturing/manufacturing.config';
import { getManufacturingSpeedMultiplier } from '@/game/systems/manufacturing/manufacturing.logic';

function getModuleBonus(ship: ShipInstance, effectKey: string): number {
  let total = 0;
  for (const slotType of ['high', 'mid', 'low'] as const) {
    for (const moduleId of ship.fittedModules[slotType]) {
      const mod = MODULE_DEFINITIONS[moduleId];
      if (mod?.effects[effectKey]) total += mod.effects[effectKey];
    }
  }
  return total;
}

export function getFleetMiningResourceRates(state: GameState): Record<string, number> {
  const rates: Record<string, number> = {};
  const corpSkillMult = 1 + (state.modifiers['mining-yield'] ?? 0);
  const deepOreBonus = 1 + (state.modifiers['deep-ore-yield'] ?? 0);
  const beltRespawnAt = state.systems.mining.beltRespawnAt ?? {};

  for (const ship of Object.values(state.systems.fleet.ships)) {
    if (ship.activity !== 'mining' || !ship.assignedPilotId || !ship.assignedBeltId) continue;

    const fleet = ship.fleetId ? state.systems.fleet.fleets[ship.fleetId] : null;
    const wing = fleet ? getWingByShipId(fleet, ship.id) : null;
    if (fleet && !wing) continue;

    const pilot = state.systems.fleet.pilots[ship.assignedPilotId];
    const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
    const beltDef = ORE_BELTS[ship.assignedBeltId];
    if (!pilot || !hull || !beltDef) continue;
    if ((beltRespawnAt[ship.assignedBeltId] ?? 0) > 0) continue;

    const moduleMining = getModuleBonus(ship, 'mining-yield');
    const pilotMining = getPilotMiningBonus(pilot);
    const moraleMult = getPilotMoraleMultiplier(pilot);
    const richnessFactor = fleet && state.galaxy
      ? getBeltRichnessForSystem(state.galaxy, ship.assignedBeltId, fleet.currentSystemId)
      : 1;
    const deepFactor = beltDef.securityTier === 'lowsec' || beltDef.securityTier === 'nullsec'
      ? deepOreBonus
      : 1;
    const commanderMult = fleet
      ? 1 + getCombinedCommanderBonus(state.systems.fleet.pilots, fleet, wing, 'mining-yield')
      : 1;
    const yieldMultiplier = (hull.baseMiningBonus + moduleMining + pilotMining) * moraleMult * corpSkillMult * richnessFactor * deepFactor * commanderMult;

    for (const output of beltDef.outputs) {
      const amount = output.baseRate * yieldMultiplier;
      if (amount > 0) {
        rates[output.resourceId] = (rates[output.resourceId] ?? 0) + amount;
      }
    }
  }

  return rates;
}

/** Net per-second rates for every resource (positive = gaining, negative = consuming). */
export function useResourceRates(): Record<string, number> {
  const state = useGameStore(s => s.state);

  const rates: Record<string, number> = getFleetMiningResourceRates(state);

  // ── Manufacturing: active job output/input projection ─────────────────
  const { queue } = state.systems.manufacturing;
  if (queue.length > 0) {
    const job    = queue[0];
    const recipe = MANUFACTURING_RECIPES[job.recipeId];
    if (recipe) {
      const speed      = getManufacturingSpeedMultiplier(state);
      const unitsPerSec = speed / recipe.timeCost;
      for (const [id, amt] of Object.entries(recipe.outputs)) {
        rates[id] = (rates[id] ?? 0) + amt * unitsPerSec;
      }
      for (const [id, amt] of Object.entries(recipe.inputs)) {
        rates[id] = (rates[id] ?? 0) - amt * unitsPerSec;
      }
    }
  }

  return rates;
}

/** Per-belt ore output rates (ore units/s). */
export function useMiningOutputRates(): Record<string, number> {
  const state = useGameStore(s => s.state);
  return getFleetMiningResourceRates(state);
}
