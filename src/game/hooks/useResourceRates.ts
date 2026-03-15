import { useGameStore } from '@/stores/gameStore';
import { ORE_BELTS } from '@/game/systems/mining/mining.config';
import { getMiningSkillMultiplier, getMiningUpgradeMultiplier } from '@/game/systems/mining/mining.logic';
import { MANUFACTURING_RECIPES } from '@/game/systems/manufacturing/manufacturing.config';
import { getManufacturingSpeedMultiplier } from '@/game/systems/manufacturing/manufacturing.logic';

/** Net per-second rates for every resource (positive = gaining, negative = consuming). */
export function useResourceRates(): Record<string, number> {
  const state = useGameStore(s => s.state);

  const rates: Record<string, number> = {};
  const upgradeMultiplier = getMiningUpgradeMultiplier(state);
  const skillMultiplier   = getMiningSkillMultiplier(state);

  // ── Mining production ─────────────────────────────────────────────────
  for (const [beltId, isActive] of Object.entries(state.systems.mining.targets)) {
    if (!isActive) continue;
    const def = ORE_BELTS[beltId];
    if (!def) continue;
    for (const output of def.outputs) {
      const r = output.baseRate * upgradeMultiplier * skillMultiplier;
      rates[output.resourceId] = (rates[output.resourceId] ?? 0) + r;
    }
  }

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
  const upgradeMultiplier = getMiningUpgradeMultiplier(state);
  const skillMultiplier   = getMiningSkillMultiplier(state);
  const rates: Record<string, number> = {};
  for (const [beltId, isActive] of Object.entries(state.systems.mining.targets)) {
    if (!isActive) continue;
    const def = ORE_BELTS[beltId];
    if (!def) continue;
    for (const output of def.outputs) {
      const r = output.baseRate * upgradeMultiplier * skillMultiplier;
      rates[output.resourceId] = (rates[output.resourceId] ?? 0) + r;
    }
  }
  return rates;
}
