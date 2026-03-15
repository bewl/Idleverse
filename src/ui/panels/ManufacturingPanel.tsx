import { useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { MANUFACTURING_RECIPES, RECIPE_ORDER } from '@/game/systems/manufacturing/manufacturing.config';
import { FlairProgressBar } from '@/ui/components/FlairProgressBar';
import { ActivityBar } from '@/ui/effects/ActivityBar';
import { formatResourceAmount, RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { getManufacturingSpeedMultiplier } from '@/game/systems/manufacturing/manufacturing.logic';
import { StatTooltip } from '@/ui/tooltip/StatTooltip';

const QTY_PRESETS = [1, 5, 10, 25] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
  if (s < 60)   return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function maxAffordable(recipeId: string, resources: Record<string, number>): number {
  const recipe = MANUFACTURING_RECIPES[recipeId];
  if (!recipe) return 0;
  const entries = Object.entries(recipe.inputs);
  if (entries.length === 0) return 999;
  return Math.max(0, Math.floor(Math.min(...entries.map(([r, amt]) => (resources[r] ?? 0) / amt))));
}

// ─── Resource cost row ────────────────────────────────────────────────────────

const TIER_FILL: Record<number, { dark: string; bright: string; rgb: string }> = {
  1: { dark: '#78350f', bright: '#fbbf24', rgb: '251,191,36'  },
  2: { dark: '#065976', bright: '#22d3ee', rgb: '34,211,238'  },
  3: { dark: '#4c1d95', bright: '#a78bfa', rgb: '167,139,250' },
  4: { dark: '#9f1239', bright: '#fb7185', rgb: '244,63,94'   },
};
const MET_FILL = { dark: '#064e3b', bright: '#34d399', rgb: '52,211,153' };

function CostBar({ resourceId, required, have }: { resourceId: string; required: number; have: number }) {
  const pct    = Math.min(1, required > 0 ? have / required : 1);
  const enough = have >= required;
  const tier   = RESOURCE_REGISTRY[resourceId]?.tier ?? 1;
  const fill   = enough ? MET_FILL : (TIER_FILL[tier] ?? TIER_FILL[1]);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-28 shrink-0 truncate font-mono ${enough ? 'text-slate-400' : 'text-slate-300'}`}>
        {RESOURCE_REGISTRY[resourceId]?.name ?? resourceId}
      </span>
      <div
        className="flex-1 relative h-1.5 rounded-full overflow-hidden"
        style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(30,41,59,0.5)' }}
      >
        {pct > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{ width: `${pct * 100}%`, background: `linear-gradient(90deg, ${fill.dark} 0%, ${fill.bright} 100%)` }}
          />
        )}
      </div>
      <span className={`font-mono w-28 text-right shrink-0 ${enough ? 'text-emerald-400' : 'text-amber-400'}`}>
        {formatResourceAmount(have, 0)} / {formatResourceAmount(required, 0)}
      </span>
    </div>
  );
}

// ─── Quantity selector ────────────────────────────────────────────────────────

function QtySelector({ qty, maxQty, onChange }: { qty: number; maxQty: number; onChange: (n: number) => void }) {
  const [inputVal, setInputVal] = useState(String(qty));
  function commit(raw: string) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 1) { onChange(n); setInputVal(String(n)); }
    else setInputVal(String(qty));
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {QTY_PRESETS.map(p => (
        <button
          key={p}
          onClick={() => { onChange(p); setInputVal(String(p)); }}
          className={`px-2 py-1 rounded text-xs font-mono border transition-colors duration-100 ${
            qty === p
              ? 'bg-cyan-800/60 border-cyan-500/70 text-cyan-200'
              : 'bg-slate-800 border-slate-600/50 text-slate-400 hover:border-slate-500 hover:text-slate-300'
          }`}
        >×{p}</button>
      ))}
      <button
        onClick={() => { const m = Math.max(1, maxQty); onChange(m); setInputVal(String(m)); }}
        disabled={maxQty < 1}
        className="px-2 py-1 rounded text-xs font-mono border bg-slate-800 border-slate-600/50 text-slate-400 hover:border-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
      >Max</button>
      <input
        type="number" min={1} value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
        className="w-16 px-2 py-1 rounded text-xs font-mono border bg-slate-900 text-slate-200 text-center focus:outline-none focus:border-cyan-600/70 transition-colors border-slate-600/50"
      />
    </div>
  );
}

// ─── Recipe card ──────────────────────────────────────────────────────────────

function RecipeCard({ recipeId }: { recipeId: string }) {
  const state          = useGameStore(s => s.state);
  const queueMfg       = useGameStore(s => s.queueManufacturing);
  const [qty, setQty]  = useState(1);

  const recipe    = MANUFACTURING_RECIPES[recipeId];
  if (!recipe) return null;

  const skillLevels = state.systems.skills.levels;
  const isLocked    = !!(recipe.requiredSkill && (skillLevels[recipe.requiredSkill.skillId] ?? 0) < recipe.requiredSkill.minLevel);
  const maxQty      = maxAffordable(recipeId, state.resources);
  const canQueue    = !isLocked && maxQty >= qty;
  const speedMult   = getManufacturingSpeedMultiplier(state);
  const batchTime   = (recipe.timeCost * qty) / Math.max(speedMult, 0.001);
  const queueLen    = state.systems.manufacturing.queue.length;
  const isShip      = recipe.category === 'ship';

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all duration-200 ${isLocked ? 'opacity-40' : ''}`}
      style={{
        background: 'rgba(3,8,20,0.8)',
        border: isShip ? '1px solid rgba(167,139,250,0.2)' : '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 flex items-start justify-between gap-2"
        style={{ background: isShip ? 'rgba(167,139,250,0.05)' : 'rgba(255,255,255,0.02)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${
              isShip
                ? 'text-violet-400 bg-violet-900/25 border border-violet-700/30'
                : 'text-cyan-400 bg-cyan-900/20 border border-cyan-800/30'
            }`}>{recipe.category}</span>
            {recipe.requiredSkill && (
              <span className={`text-[9px] font-mono ${isLocked ? 'text-red-400' : 'text-emerald-400'}`}>
                {isLocked ? `🔒 ${recipe.requiredSkill.skillId} ${recipe.requiredSkill.minLevel}` : '✓ skill met'}
              </span>
            )}
          </div>
          <span className="text-sm font-bold text-slate-100">{recipe.name}</span>
          <p className="text-xs text-slate-500 mt-0.5">{recipe.description}</p>
        </div>
        <div className="text-right shrink-0">
          {Object.entries(recipe.outputs).map(([r, amt]) => (
            <span key={r} className="block text-xs text-emerald-400 font-mono">+{formatResourceAmount(amt * qty, 0)} {RESOURCE_REGISTRY[r]?.name ?? r}</span>
          ))}
          <span className="text-[10px] text-slate-600 font-mono">⏱ {fmtSeconds(batchTime)}</span>
        </div>
      </div>

      {/* Cost bars */}
      <div className="px-3 py-2 flex flex-col gap-1" style={{ background: 'rgba(0,0,0,0.2)' }}>
        {Object.entries(recipe.inputs).map(([r, amt]) => (
          <CostBar key={r} resourceId={r} required={amt * qty} have={state.resources[r] ?? 0} />
        ))}
      </div>

      {/* Actions */}
      <div className="px-3 py-2.5 flex items-center gap-3 flex-wrap" style={{ background: 'rgba(0,0,0,0.1)' }}>
        <QtySelector qty={qty} maxQty={maxQty} onChange={setQty} />
        <button
          disabled={!canQueue || queueLen >= 50}
          onClick={() => queueMfg(recipeId, qty)}
          className={`ml-auto px-4 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 shrink-0 ${
            canQueue && queueLen < 50
              ? 'bg-cyan-900/50 hover:bg-cyan-800/60 border-cyan-600/60 text-cyan-200 hover:scale-[1.02]'
              : 'bg-slate-800/40 border-slate-700/40 text-slate-600 cursor-not-allowed'
          }`}
        >
          {isLocked ? 'Locked' : queueLen >= 50 ? 'Queue Full' : `Queue ×${qty}`}
        </button>
      </div>
    </div>
  );
}

// ─── Active job card ──────────────────────────────────────────────────────────

function ActiveJobCard({
  effectiveSpeed,
  cancelJob,
}: {
  effectiveSpeed: number;
  cancelJob: () => void;
}) {
  const state = useGameStore(s => s.state);
  const job   = state.systems.manufacturing.queue[0];
  if (!job) return null;
  const recipe      = MANUFACTURING_RECIPES[job.recipeId];
  if (!recipe) return null;

  const totalTime   = recipe.timeCost * job.quantity;
  const progressPct = totalTime > 0 ? job.progress / totalTime : 0;
  const remaining   = Math.max(0, totalTime - job.progress) / Math.max(effectiveSpeed, 0.001);
  const unitsDone   = Math.floor(job.progress / recipe.timeCost);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.95) 0%, rgba(34,211,238,0.04) 100%)',
        border: '1px solid rgba(34,211,238,0.25)',
        boxShadow: '0 0 16px rgba(34,211,238,0.06)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
          <span className="text-sm font-bold text-cyan-200 truncate">{recipe.name}</span>
          <span className="text-xs text-slate-600 font-mono shrink-0">×{job.quantity}</span>
          {job.quantity > 1 && (
            <span className="text-xs text-slate-500 font-mono">{unitsDone}/{job.quantity} done</span>
          )}
        </div>
        <button
          onClick={cancelJob}
          className="text-xs text-red-400/60 hover:text-red-400 px-2 py-0.5 rounded border border-transparent hover:border-red-800/40 transition-colors shrink-0"
        >✕ Cancel</button>
      </div>
      <FlairProgressBar value={progressPct} color="cyan" />
      <ActivityBar active rate={Math.min(1, effectiveSpeed)} color="cyan" />
      <div className="flex items-center justify-between text-xs">
        <div className="flex flex-wrap gap-1">
          {Object.entries(recipe.outputs).map(([r, amt]) => (
            <span key={r} className="text-emerald-400/70 bg-emerald-900/15 border border-emerald-800/25 rounded px-1.5 py-0.5 font-mono">
              +{formatResourceAmount(amt * job.quantity, 0)} {RESOURCE_REGISTRY[r]?.name ?? r}
            </span>
          ))}
        </div>
        <span className="text-cyan-400/70 font-mono shrink-0 ml-2">{fmtSeconds(remaining)} left</span>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ManufacturingPanel() {
  const state                  = useGameStore(s => s.state);
  const cancelManufacturingJob = useGameStore(s => s.cancelManufacturingJob);
  const prioritize             = useGameStore(s => s.prioritizeManufacturingJob);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'component' | 'ship'>('all');

  const speedMult      = getManufacturingSpeedMultiplier(state);
  const effectiveSpeed = Math.max(speedMult, 0.001);

  const { queue } = state.systems.manufacturing;
  const hasManufacturing = state.unlocks['system-manufacturing'];

  // Cumulative start times for queue items
  const queueStartTimes: number[] = [];
  {
    let acc = 0;
    for (const job of queue) {
      queueStartTimes.push(acc);
      const r = MANUFACTURING_RECIPES[job.recipeId];
      acc += r ? Math.max(0, r.timeCost * job.quantity - job.progress) / effectiveSpeed : 0;
    }
  }

  const filteredRecipes = RECIPE_ORDER.filter(id => {
    const r = MANUFACTURING_RECIPES[id];
    return r && (categoryFilter === 'all' || r.category === categoryFilter);
  });

  if (!hasManufacturing) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-5xl">🏭</div>
        <div className="text-slate-500 text-sm text-center">
          Manufacturing complex locked.<br />
          Train the <span className="text-amber-400">Industry I</span> skill to unlock.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="panel-header">🏭 Manufacturing Complex</h2>
          <p className="text-slate-500 text-xs">
            Queue up to 50 manufacturing jobs. Jobs run sequentially.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="flex flex-col items-center px-2.5 py-1.5 rounded border border-slate-700/40 bg-slate-900/80">
            <StatTooltip modifierKey="manufacturing-speed">
              <span className="text-xs font-bold font-mono text-cyan-300">×{speedMult.toFixed(2)}</span>
            </StatTooltip>
            <span className="text-[10px] text-slate-600">Speed</span>
          </div>
          <div className="flex flex-col items-center px-2.5 py-1.5 rounded border border-slate-700/40 bg-slate-900/80">
            <span className="text-xs font-bold font-mono text-violet-300">{queue.length}/50</span>
            <span className="text-[10px] text-slate-600">Queued</span>
          </div>
        </div>
      </div>

      {/* Active job */}
      {queue.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Active Job</div>
          <ActiveJobCard effectiveSpeed={effectiveSpeed} cancelJob={() => cancelManufacturingJob(0)} />
        </div>
      )}

      {/* Queue list (jobs 1+) */}
      {queue.length > 1 && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Job Queue</div>
          <div className="flex flex-col gap-1">
            {queue.slice(1).map((job, i) => {
              const qi      = i + 1;
              const recipe  = MANUFACTURING_RECIPES[job.recipeId];
              const jobTime = recipe ? recipe.timeCost * job.quantity / effectiveSpeed : 0;
              const startsIn = queueStartTimes[qi] ?? 0;
              return (
                <div
                  key={qi}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <span className="text-slate-600 font-mono w-5 text-center">#{qi + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-slate-300 font-bold">{recipe?.name ?? job.recipeId}</span>
                    <span className="text-slate-600 font-mono ml-2">×{job.quantity}</span>
                    <span className="text-slate-600 ml-2">⏱ {fmtSeconds(jobTime)} · starts {fmtSeconds(startsIn)}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => prioritize(qi)}
                      className="px-1.5 py-0.5 rounded border border-slate-700/30 text-slate-500 hover:text-cyan-300 hover:border-cyan-700/40 transition-colors"
                      title="Move to top"
                    >▲</button>
                    <button
                      onClick={() => cancelManufacturingJob(qi)}
                      className="px-1.5 py-0.5 rounded border border-slate-700/30 text-slate-600 hover:text-red-400 hover:border-red-700/40 transition-colors"
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recipe browser */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Available Recipes</div>
          <div className="flex gap-1">
            {(['all', 'component', 'ship'] as const).map(f => (
              <button
                key={f}
                onClick={() => setCategoryFilter(f)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                  categoryFilter === f
                    ? 'bg-cyan-900/40 border-cyan-600/50 text-cyan-300'
                    : 'bg-slate-900/40 border-slate-700/40 text-slate-500 hover:text-slate-300'
                }`}
              >{f}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {filteredRecipes.map(id => <RecipeCard key={id} recipeId={id} />)}
        </div>
      </div>

      {/* Empty state */}
      {queue.length === 0 && (
        <div className="text-center py-8 text-slate-600 text-xs">
          <div className="text-2xl mb-2">🏭</div>
          Queue is empty. Select a recipe above and click <span className="text-cyan-500">Queue</span> to start production.
        </div>
      )}
    </div>
  );
}

