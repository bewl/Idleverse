import { useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { MANUFACTURING_RECIPES, RECIPE_ORDER } from '@/game/systems/manufacturing/manufacturing.config';
import { canAffordRecipe } from '@/game/systems/manufacturing/manufacturing.logic';
import { MANUFACTURING_RECIPES as RECIPES } from '@/game/systems/manufacturing/manufacturing.config';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { formatResourceAmount } from '@/game/resources/resourceRegistry';
import { getManufacturingSpeedMultiplier } from '@/game/systems/manufacturing/manufacturing.logic';

export function ManufacturingPanel() {
  const state = useGameStore(s => s.state);
  const queueManufacturing = useGameStore(s => s.queueManufacturing);
  const cancelManufacturingJob = useGameStore(s => s.cancelManufacturingJob);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const { queue } = state.systems.manufacturing;
  const activeJob = queue[0];
  const activeRecipe = activeJob ? RECIPES[activeJob.recipeId] : null;
  const speedMult = getManufacturingSpeedMultiplier(state);
  const powerFactor = state.systems.energy.powerFactor;
  const effectiveSpeed = speedMult * powerFactor;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="panel-header">🏭 Manufacturing Complex</h2>
        <p className="text-slate-500 text-xs">
          Convert raw materials into advanced components. Speed: {(effectiveSpeed * 100).toFixed(0)}%
        </p>
      </div>

      {/* Active job */}
      {activeJob && activeRecipe && (
        <div className="panel border-cyan-700/40">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="text-xs text-cyan-400 uppercase tracking-wider mb-0.5">Producing…</div>
              <div className="text-slate-200 text-xs font-bold">
                {activeRecipe.name} ×{activeJob.quantity}
              </div>
            </div>
            <button className="btn-danger text-xs" onClick={() => cancelManufacturingJob(0)}>
              Cancel (50% refund)
            </button>
          </div>
          <ProgressBar
            value={(activeRecipe.timeCost * activeJob.quantity) > 0
              ? activeJob.progress / (activeRecipe.timeCost * activeJob.quantity)
              : 0}
          />
          <div className="flex justify-between mt-1 text-xs text-slate-500">
            <span>{activeJob.progress.toFixed(0)}s</span>
            <span>{(activeRecipe.timeCost * activeJob.quantity).toFixed(0)}s total</span>
          </div>
        </div>
      )}

      {/* Queue (rest of jobs) */}
      {queue.length > 1 && (
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Queue ({queue.length - 1} waiting)</div>
          <div className="flex flex-col gap-1.5">
            {queue.slice(1).map((job, i) => {
              const recipe = RECIPES[job.recipeId];
              return (
                <div key={i} className="panel p-2 flex items-center justify-between">
                  <span className="text-slate-300 text-xs">{recipe?.name ?? job.recipeId} ×{job.quantity}</span>
                  <button className="btn-secondary text-xs py-0.5" onClick={() => cancelManufacturingJob(i + 1)}>
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recipes */}
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Recipes</div>
        <div className="flex flex-col gap-2">
          {RECIPE_ORDER.map(recipeId => {
            const def = MANUFACTURING_RECIPES[recipeId];
            if (!def) return null;
            const locked = def.prerequisiteResearch
              ? !state.systems.research.unlockedNodes[def.prerequisiteResearch]
              : false;
            const qty = quantities[recipeId] ?? 1;
            const affordable = canAffordRecipe(recipeId, qty, state);

            const inputParts = Object.entries(def.inputs).map(
              ([r, amt]) => `${formatResourceAmount(amt * qty, 0)} ${r}`
            );
            const outputParts = Object.entries(def.outputs).map(
              ([r, amt]) => `${formatResourceAmount(amt * qty, 0)} ${r}`
            );

            return (
              <div key={recipeId} className={`panel p-3 ${locked ? 'opacity-40' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-slate-200 text-xs font-bold">{def.name}</div>
                    <p className="text-slate-500 text-xs mt-0.5">{def.description}</p>
                    <div className="mt-1.5 text-xs flex flex-wrap gap-2">
                      <span className="text-slate-500">In: {inputParts.join(', ')}</span>
                      <span className="text-cyan-400/80">→ {outputParts.join(', ')}</span>
                      <span className="text-slate-600">⏱ {(def.timeCost * qty / effectiveSpeed).toFixed(1)}s</span>
                    </div>
                    {locked && (
                      <div className="mt-1 text-xs text-slate-600">🔒 Requires: {def.prerequisiteResearch}</div>
                    )}
                  </div>
                  {!locked && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={qty}
                        onChange={e => setQuantities(q => ({ ...q, [recipeId]: Math.max(1, parseInt(e.target.value) || 1) }))}
                        className="w-12 bg-space-700 border border-slate-600 rounded text-xs text-slate-200 text-center px-1 py-1"
                      />
                      <button
                        className="btn-primary"
                        disabled={!affordable}
                        onClick={() => queueManufacturing(recipeId, qty)}
                      >
                        Queue
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
