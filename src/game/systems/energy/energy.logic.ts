import type { GameState } from '@/types/game.types';
import { ENERGY_SOURCES, BASE_ENERGY_DEMAND } from './energy.config';
import { getMiningEnergyDemand } from '@/game/systems/mining/mining.logic';

export function calcEnergySupply(state: GameState): number {
  const efficiencyBonus = 1 + (state.modifiers['energy-efficiency'] ?? 0);
  let supply = 0;
  for (const [sourceId, level] of Object.entries(state.systems.energy.sources)) {
    const def = ENERGY_SOURCES[sourceId];
    if (!def || level <= 0) continue;
    if (def.unlockResearch && !state.systems.research.unlockedNodes[def.unlockResearch]) continue;
    supply += def.supplyPerLevel * level * efficiencyBonus;
  }
  return supply;
}

export function calcEnergyDemand(state: GameState): number {
  let demand = getMiningEnergyDemand(state);
  if (state.systems.manufacturing.queue.length > 0) demand += BASE_ENERGY_DEMAND.manufacturing;
  if (state.systems.research.activeNodeId !== null) demand += BASE_ENERGY_DEMAND.researchLab;
  const reductionMod = state.modifiers['energy-demand-reduction'] ?? 0;
  return demand * (1 - reductionMod);
}

export function tickEnergy(state: GameState): {
  totalSupply: number;
  totalDemand: number;
  powerFactor: number;
} {
  const totalSupply = calcEnergySupply(state);
  const totalDemand = calcEnergyDemand(state);
  const powerFactor = totalDemand > 0 ? Math.min(1, totalSupply / totalDemand) : 1;
  return { totalSupply, totalDemand, powerFactor };
}
