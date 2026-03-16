import type { GameState, ManufacturingJob, Blueprint, ResearchJob, CopyJob } from '@/types/game.types';
import { MANUFACTURING_RECIPES, BLUEPRINT_DEFINITIONS, BASE_RESEARCH_TIME, BASE_COPY_TIME_MULTIPLIER, DEFAULT_RESEARCH_SLOTS } from './manufacturing.config';

export function getManufacturingSpeedMultiplier(state: GameState): number {
  return 1 + (state.modifiers['manufacturing-speed'] ?? 0);
}

export function getResearchSpeedMultiplier(state: GameState): number {
  return 1 + (state.modifiers['blueprint-research-speed'] ?? 0);
}

export function getMaxResearchSlots(state: GameState): number {
  const science = state.systems.skills.levels['science'] ?? 0;
  return DEFAULT_RESEARCH_SLOTS + (science >= 3 ? 1 : 0) + (science >= 5 ? 1 : 0);
}

/** Compute total time in seconds to research from currentLevel → currentLevel+1. */
export function getResearchTimeForLevel(currentLevel: number): number {
  return Math.round(BASE_RESEARCH_TIME * Math.pow(1.5, currentLevel));
}

/** Compute total copy time in seconds (same formula, 0.5× rate). */
export function getCopyTime(runs: number): number {
  return Math.round(BASE_RESEARCH_TIME * BASE_COPY_TIME_MULTIPLIER * runs);
}

export function canAffordRecipe(recipeId: string, qty: number, state: GameState, blueprintId?: string): boolean {
  const recipe = MANUFACTURING_RECIPES[recipeId];
  if (!recipe) return false;
  if (recipe.requiredSkill) {
    const lvl = state.systems.skills.levels[recipe.requiredSkill.skillId] ?? 0;
    if (lvl < recipe.requiredSkill.minLevel) return false;
  }
  if (recipe.isTech2) {
    // Require a valid T2 BPC
    if (!blueprintId) return false;
    const bpc = state.systems.manufacturing.blueprints.find(b => b.id === blueprintId);
    if (!bpc || bpc.type !== 'copy' || bpc.tier !== 2 || bpc.itemId !== recipeId) return false;
    if (bpc.copiesRemaining !== null && bpc.copiesRemaining < 1) return false;
    if (bpc.isLocked) return false;
  }
  for (const [resourceId, amount] of Object.entries(recipe.inputs)) {
    if ((state.resources[resourceId] ?? 0) < amount * qty) return false;
  }
  return true;
}

export interface ManufacturingTickResult {
  completedJobs: Array<{ recipeId: string; qty: number; blueprintId?: string }>;
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
    result.completedJobs.push({ recipeId: job.recipeId, qty: job.quantity, blueprintId: job.blueprintId });
    for (const [resourceId, amount] of Object.entries(recipe.outputs)) {
      result.resourceProduced[resourceId] = (result.resourceProduced[resourceId] ?? 0) + amount * job.quantity;
    }
  }

  return result;
}

// ─── Research / Copy tick ──────────────────────────────────────────────────

export interface ResearchTickResult {
  completedResearch: ResearchJob[];
  completedCopies: CopyJob[];
  /** New/updated blueprints to merge into state (T2 BPOs unlocked, level-ups). */
  blueprintUpdates: Blueprint[];
  /** IDs of blueprints to add (freshly created T2 BPOs or BPCs). */
  newBlueprints: Blueprint[];
  /** IDs of blueprints to unlock (isLocked → false). */
  unlockBlueprintIds: string[];
}

export function tickResearch(
  state: GameState,
  deltaSeconds: number,
): ResearchTickResult {
  const result: ResearchTickResult = {
    completedResearch: [],
    completedCopies: [],
    blueprintUpdates: [],
    newBlueprints: [],
    unlockBlueprintIds: [],
  };

  if (
    (state.systems.manufacturing.researchJobs?.length ?? 0) === 0 &&
    (state.systems.manufacturing.copyJobs?.length ?? 0) === 0
  ) return result;

  const speedMultiplier = getResearchSpeedMultiplier(state);
  const effectiveDelta  = deltaSeconds * speedMultiplier;

  // Advance research jobs
  for (const job of state.systems.manufacturing.researchJobs) {
    const newProgress = job.progress + effectiveDelta;
    if (newProgress >= job.totalTime) {
      result.completedResearch.push(job);
      // Level up the blueprint
      const bp = state.systems.manufacturing.blueprints.find(b => b.id === job.blueprintId);
      if (bp) {
        const newLevel = job.targetLevel;
        const updated: Blueprint = { ...bp, researchLevel: newLevel, isLocked: false };
        result.blueprintUpdates.push(updated);
        // At level 5: unlock T2 BPO if one doesn't already exist
        if (newLevel >= 5) {
          const def = BLUEPRINT_DEFINITIONS[bp.itemId];
          if (def?.t2RecipeId) {
            const alreadyHasT2 = state.systems.manufacturing.blueprints.some(
              b => b.itemId === def.t2RecipeId && b.tier === 2 && b.type === 'original',
            );
            if (!alreadyHasT2) {
              result.newBlueprints.push({
                id: `bpo-t2-${def.t2RecipeId}`,
                itemId: def.t2RecipeId,
                tier: 2,
                type: 'original',
                researchLevel: 0,
                copiesRemaining: null,
                isLocked: false,
              });
            }
          }
        }
      }
    }
  }

  // Advance copy jobs
  for (const job of state.systems.manufacturing.copyJobs) {
    const newProgress = job.progress + effectiveDelta;
    if (newProgress >= job.totalTime) {
      result.completedCopies.push(job);
      // Find source BPO and unlock it
      const bp = state.systems.manufacturing.blueprints.find(b => b.id === job.blueprintId);
      if (bp) {
        result.unlockBlueprintIds.push(bp.id);
        // Create the BPC
        result.newBlueprints.push({
          id: `bpc-${bp.itemId}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          itemId: bp.itemId,
          tier: bp.tier,
          type: 'copy',
          researchLevel: 0,
          copiesRemaining: job.runs,
          isLocked: false,
        });
      }
    }
  }

  return result;
}

