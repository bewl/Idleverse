import type { ManufacturingRecipeDefinition } from '@/types/game.types';

export interface ProjectJob {
  recipeId: string;
  quantity: number;
}

export interface ProjectPlan {
  jobs: ProjectJob[];
  feasible: boolean;
  missingRaw: Record<string, number>;
}

/** Map: output-resource-id → recipeId that produces it (filtered to unlocked recipes). */
function buildOutputIndex(
  recipes: Record<string, ManufacturingRecipeDefinition>,
  unlockedIds: Set<string>,
): Record<string, string> {
  const index: Record<string, string> = {};
  for (const [recipeId, recipe] of Object.entries(recipes)) {
    if (!unlockedIds.has(recipeId)) continue;
    for (const outputId of Object.keys(recipe.outputs)) {
      index[outputId] = recipeId;
    }
  }
  return index;
}

/**
 * Given a set of required resources (the "final costs" of an action) and the player's
 * current inventory, determine:
 *  - which manufacturing jobs need to be queued (in execution order: ingredients first)
 *  - whether it is feasible at all (i.e. raw materials are available)
 *  - what raw-material shortfalls exist
 *
 * The algorithm performs a DFS over the recipe graph. For each needed resource that
 * isn't in inventory, it finds an unlocked recipe that produces it, resolves that
 * recipe's inputs recursively (post-order), then records the job.
 */
export function resolveProjectJobs(
  finalCosts: Record<string, number>,
  currentResources: Record<string, number>,
  recipes: Record<string, ManufacturingRecipeDefinition>,
  unlockedIds: Set<string>,
): ProjectPlan {
  const outputIndex = buildOutputIndex(recipes, unlockedIds);

  // Simulate inventory changes as we plan steps.
  const simInventory: Record<string, number> = { ...currentResources };
  const orderedJobs: ProjectJob[] = [];
  const missingRaw: Record<string, number> = {};

  function resolve(needed: Record<string, number>, depth = 0): void {
    if (depth > 12) return; // safeguard against circular recipes

    for (const [resourceId, amount] of Object.entries(needed)) {
      const have = simInventory[resourceId] ?? 0;
      const deficit = amount - have;

      if (deficit <= 0) {
        // Consume from simulated inventory.
        simInventory[resourceId] = have - amount;
        continue;
      }

      const recipeId = outputIndex[resourceId];
      if (!recipeId) {
        // No recipe available — this is a raw-material shortfall.
        missingRaw[resourceId] = (missingRaw[resourceId] ?? 0) + deficit;
        continue;
      }

      const recipe = recipes[recipeId];
      const outputQty = recipe.outputs[resourceId];
      const runsNeeded = Math.ceil(deficit / outputQty);

      // First, recursively resolve inputs needed for this recipe's runs.
      const inputsNeeded: Record<string, number> = {};
      for (const [inId, inAmt] of Object.entries(recipe.inputs)) {
        inputsNeeded[inId] = inAmt * runsNeeded;
      }
      resolve(inputsNeeded, depth + 1);

      // Record this job after its dependencies (post-order = correct queue order).
      orderedJobs.push({ recipeId, quantity: runsNeeded });

      // Update simulated inventory: produced output minus what's needed.
      const produced = runsNeeded * outputQty;
      simInventory[resourceId] = (simInventory[resourceId] ?? 0) + produced - amount;
    }
  }

  resolve(finalCosts);

  return {
    jobs: orderedJobs,
    feasible: Object.keys(missingRaw).length === 0,
    missingRaw,
  };
}
