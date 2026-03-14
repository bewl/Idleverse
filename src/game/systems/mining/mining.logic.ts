import type { GameState } from '@/types/game.types';
import { MINING_TARGETS, MINING_UPGRADES } from './mining.config';
import { prestigeBonus } from '@/game/balance/constants';

export function getMiningEfficiencyMultiplier(state: GameState): number {
  let multiplier = 1;
  for (const [upgradeId, level] of Object.entries(state.systems.mining.upgrades)) {
    if (level <= 0) continue;
    const def = MINING_UPGRADES[upgradeId];
    if (!def) continue;
    multiplier += (def.effects['mining-efficiency'] ?? 0) * level;
  }
  return multiplier;
}

export function getMiningYieldMultiplier(state: GameState): number {
  let multiplier = 1;
  for (const [upgradeId, level] of Object.entries(state.systems.mining.upgrades)) {
    if (level <= 0) continue;
    const def = MINING_UPGRADES[upgradeId];
    if (!def) continue;
    multiplier += (def.effects['mining-yield'] ?? 0) * level;
  }
  return multiplier;
}

export function getMiningEnergyDemand(state: GameState): number {
  let demand = 0;
  for (const [targetId, isActive] of Object.entries(state.systems.mining.targets)) {
    if (!isActive) continue;
    const def = MINING_TARGETS[targetId];
    if (def) demand += def.energyCost;
  }
  return demand;
}

/** Returns resource deltas for one simulation step. */
export function tickMining(
  state: GameState,
  deltaSeconds: number
): Record<string, number> {
  const { targets } = state.systems.mining;
  const { powerFactor } = state.systems.energy;
  const researchMultiplier = 1 + (state.modifiers['mining-efficiency'] ?? 0);
  const efficiencyMultiplier = getMiningEfficiencyMultiplier(state);
  const yieldMultiplier = getMiningYieldMultiplier(state);
  const globalBonus = prestigeBonus(state.prestige.points);

  const deltas: Record<string, number> = {};

  for (const [targetId, isActive] of Object.entries(targets)) {
    if (!isActive) continue;
    const def = MINING_TARGETS[targetId];
    if (!def) continue;
    if (def.unlockResearch && !state.systems.research.unlockedNodes[def.unlockResearch]) continue;

    for (const output of def.outputs) {
      const amount =
        output.baseRate
        * efficiencyMultiplier
        * yieldMultiplier
        * researchMultiplier
        * globalBonus
        * powerFactor
        * deltaSeconds;
      deltas[output.resourceId] = (deltas[output.resourceId] ?? 0) + amount;
    }
  }

  return deltas;
}
