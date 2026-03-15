import type { GameState, ManufacturingJob } from '@/types/game.types';
import { MANUFACTURING_RECIPES } from './manufacturing.config';

export function getManufacturingSpeedMultiplier(state: GameState): number {
  return 1 + (state.modifiers['manufacturing-speed'] ?? 0);
}

export function canAffordRecipe(recipeId: string, qty: number, state: GameState): boolean {
  const recipe = MANUFACTURING_RECIPES[recipeId];
  if (!recipe) return false;
  if (recipe.requiredSkill) {
    const lvl = state.systems.skills.levels[recipe.requiredSkill.skillId] ?? 0;
    if (lvl < recipe.requiredSkill.minLevel) return false;
  }
  for (const [resourceId, amount] of Object.entries(recipe.inputs)) {
    if ((state.resources[resourceId] ?? 0) < amount * qty) return false;
  }
  return true;
}

export interface ManufacturingTickResult {
  completedJobs: Array<{ recipeId: string; qty: number }>;
  resourceProduced: Record<string, number>;
  progressIncrement: number;
}

export function tickManufacturing(
  state: GameState,
  deltaSeconds: number,
): ManufacturingTickResult {
  const result: ManufacturingTickResult = {
    completedJobs: [],
    resourceProduced: {},
    progressIncrement: 0,
  };

  if (state.systems.manufacturing.queue.length === 0) return result;

  const speedMultiplier = getManufacturingSpeedMultiplier(state);
  const effectiveDelta  = deltaSeconds * speedMultiplier;
  result.progressIncrement = effectiveDelta;

  const job: ManufacturingJob = state.systems.manufacturing.queue[0];
  const recipe = MANUFACTURING_RECIPES[job.recipeId];
  if (!recipe) return result;

  const totalTime  = recipe.timeCost * job.quantity;
  const newProgress = job.progress + effectiveDelta;

  if (newProgress >= totalTime) {
    result.completedJobs.push({ recipeId: job.recipeId, qty: job.quantity });
    for (const [resourceId, amount] of Object.entries(recipe.outputs)) {
      result.resourceProduced[resourceId] = (result.resourceProduced[resourceId] ?? 0) + amount * job.quantity;
    }
  }

  return result;
}

