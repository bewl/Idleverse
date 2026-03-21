import { useState, useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import { MANUFACTURING_RECIPES, RECIPE_ORDER, BLUEPRINT_DEFINITIONS } from '@/game/systems/manufacturing/manufacturing.config';
import { FlairProgressBar } from '@/ui/components/FlairProgressBar';
import { formatResourceAmount, RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import {
  getManufacturingSpeedMultiplier,
  getResearchSpeedMultiplier,
  getMaxResearchSlots,
} from '@/game/systems/manufacturing/manufacturing.logic';
import { CompactMetricCard as CommandMetric } from '@/ui/components/CompactMetricCard';
import { StatTooltip } from '@/ui/tooltip/StatTooltip';
import { NavTag } from '@/ui/components/NavTag';
import { GameDropdown, type DropdownOption } from '@/ui/components/GameDropdown';
import { PanelInfoSection } from '@/ui/components/PanelInfoSection';
import { SystemUnlockCard } from '@/ui/components/SystemUnlockCard';
import { useUiStore } from '@/stores/uiStore';
import type { Blueprint, ResearchJob, CopyJob, ManufacturingJob } from '@/types/game.types';

const QTY_PRESETS = [1, 5, 10, 25] as const;
type ManufacturingTab = 'jobs' | 'blueprints';

function ManufacturingHqBanner() {
  const state = useGameStore(s => s.state);
  const homeSystemId = state.systems.factions.homeStationSystemId;
  const homeOutpost = homeSystemId ? state.systems.factions.outposts[homeSystemId] ?? null : null;

  if (!homeSystemId) {
    return (
      <div className="rounded-xl border border-amber-700/30 bg-amber-950/15 px-3 py-2 text-xs text-amber-300">
        No Corp HQ registered. Dock at a station or deploy a POS core in the System panel to queue manufacturing, research, or copy jobs.
      </div>
    );
  }

  const homeSystem = getSystemById(state.galaxy.seed, homeSystemId);
  return (
    <div className="rounded-xl border border-cyan-700/20 bg-cyan-950/10 px-3 py-2 text-xs text-slate-400">
      Corp HQ anchored at <span className="text-cyan-300 font-semibold">{homeSystem.name}</span>. {homeOutpost ? 'Manufacturing and research jobs route through your outpost infrastructure.' : 'Manufacturing and research jobs route through this station network.'}
    </div>
  );
}

function manufacturingGrade(speedMult: number): { grade: string; color: string } {
  if (speedMult >= 1.35) return { grade: 'S', color: '#22d3ee' };
  if (speedMult >= 1.2) return { grade: 'A', color: '#34d399' };
  if (speedMult >= 1.05) return { grade: 'B', color: '#fbbf24' };
  if (speedMult >= 0.95) return { grade: 'C', color: '#fb923c' };
  return { grade: 'D', color: '#f87171' };
}

// --- Helpers ------------------------------------------------------------------

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

// --- Resource cost row --------------------------------------------------------

const TIER_FILL: Record<number, { dark: string; bright: string; rgb: string }> = {
  1: { dark: '#78350f', bright: '#fbbf24', rgb: '251,191,36'  },
  2: { dark: '#065976', bright: '#22d3ee', rgb: '34,211,238'  },
  3: { dark: '#4c1d95', bright: '#a78bfa', rgb: '167,139,250' },
  4: { dark: '#9f1239', bright: '#fb7185', rgb: '244,63,94'   },
  5: { dark: '#7c2d12', bright: '#f97316', rgb: '249,115,22'  },
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
        <NavTag entityType="resource" entityId={resourceId} label={RESOURCE_REGISTRY[resourceId]?.name ?? resourceId} />
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

// --- Quantity selector --------------------------------------------------------

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
        >�{p}</button>
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

// --- Recipe card --------------------------------------------------------------

function RecipeCard({ recipeId, onOpenBlueprints }: { recipeId: string; onOpenBlueprints: () => void }) {
  const state              = useGameStore(s => s.state);
  const queueMfg           = useGameStore(s => s.queueManufacturing);
  const queueMfgWithBpc    = useGameStore(s => s.queueManufacturingWithBpc);
  const [qty, setQty]      = useState(1);
  const [selectedBpc, setSelectedBpc] = useState<string>('');

  const recipe = MANUFACTURING_RECIPES[recipeId];
  if (!recipe) return null;
  const hasCorpHq = !!state.systems.factions.homeStationId && !!state.systems.factions.homeStationSystemId;

  const skillLevels = state.systems.skills.levels;
  const isLocked    = !!(recipe.requiredSkill && (skillLevels[recipe.requiredSkill.skillId] ?? 0) < recipe.requiredSkill.minLevel);
  const speedMult   = getManufacturingSpeedMultiplier(state);
  const batchTime   = (recipe.timeCost * qty) / Math.max(speedMult, 0.001);
  const queueLen    = state.systems.manufacturing.queue.length;
  const isShip      = recipe.category === 'ship';
  const isTech2     = !!recipe.isTech2;
  const mfg         = state.systems.manufacturing;

  // For T2 recipes find available BPCs
  const availableBpcs = isTech2
    ? mfg.blueprints.filter(
        b => b.type === 'copy' && b.tier === 2 && b.itemId === recipeId && !b.isLocked && (b.copiesRemaining === null || b.copiesRemaining > 0),
      )
    : [];

  const tech2Original = isTech2
    ? mfg.blueprints.find(b => b.type === 'original' && b.tier === 2 && b.itemId === recipeId)
    : null;
  const activeCopyJob = tech2Original
    ? mfg.copyJobs.find(job => job.blueprintId === tech2Original.id) ?? null
    : null;
  const totalBpcRunsReady = availableBpcs.reduce((sum, bpc) => sum + (bpc.copiesRemaining ?? 0), 0);

  const maxQty = isTech2 ? maxAffordable(recipeId, state.resources) : maxAffordable(recipeId, state.resources);
  const activeBpcId = isTech2 ? (selectedBpc || availableBpcs[0]?.id || '') : undefined;
  const bpcOptions: DropdownOption[] = availableBpcs.map(bpc => ({
    value: bpc.id,
    label: `${MANUFACTURING_RECIPES[bpc.itemId]?.name ?? bpc.itemId}`,
    description: bpc.copiesRemaining === null ? 'Unlimited runs' : `${bpc.copiesRemaining} runs remaining`,
    meta: `Research ${bpc.researchLevel}`,
    group: bpc.type === 'copy' ? 'Blueprint Copies' : 'Blueprint Originals',
    tone: 'amber',
    badges: [
      { label: `T${bpc.tier}`, color: bpc.tier === 2 ? '#fb923c' : '#34d399' },
      ...(bpc.isLocked ? [{ label: 'Locked', color: '#fb7185' }] : []),
    ],
    keywords: [bpc.itemId, String(bpc.researchLevel)],
  }));

  const canQueue = hasCorpHq && !isLocked && maxQty >= qty && (!isTech2 || !!activeBpcId);

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all duration-200 ${isLocked ? 'opacity-40' : ''}`}
      style={{
        background: 'rgba(3,8,20,0.8)',
        border: isTech2
          ? '1px solid rgba(251,115,22,0.25)'
          : isShip
            ? '1px solid rgba(167,139,250,0.2)'
            : '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 flex items-start justify-between gap-2"
        style={{ background: isTech2 ? 'rgba(249,115,22,0.05)' : isShip ? 'rgba(167,139,250,0.05)' : 'rgba(255,255,255,0.02)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            {isTech2 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider text-orange-400 bg-orange-900/20 border border-orange-700/30">T2</span>
            )}
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${
              isShip
                ? 'text-violet-400 bg-violet-900/25 border border-violet-700/30'
                : 'text-cyan-400 bg-cyan-900/20 border border-cyan-800/30'
            }`}>{recipe.category}</span>
            {recipe.requiredSkill && (
              <span className={`text-[9px] font-mono ${isLocked ? 'text-red-400' : 'text-emerald-400'}`}>
                {isLocked ? `?? ${recipe.requiredSkill.skillId} ${recipe.requiredSkill.minLevel}` : '? skill met'}
              </span>
            )}
            {isTech2 && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
                availableBpcs.length > 0
                  ? 'text-emerald-300 border-emerald-700/30 bg-emerald-950/15'
                  : activeCopyJob
                    ? 'text-amber-300 border-amber-700/30 bg-amber-950/15'
                    : tech2Original
                      ? 'text-slate-300 border-slate-700/30 bg-slate-900/50'
                      : 'text-rose-300 border-rose-700/30 bg-rose-950/15'
              }`}>
                {availableBpcs.length > 0
                  ? `${availableBpcs.length} BPC ready`
                  : activeCopyJob
                    ? 'copy in flight'
                    : tech2Original
                      ? 'copy required'
                      : 'unlock via research'}
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
          <span className="text-[10px] text-slate-600 font-mono">? {fmtSeconds(batchTime)}</span>
          <span className="block text-[9px] text-slate-600 font-mono mt-0.5">max {formatResourceAmount(maxQty, 0)}</span>
        </div>
      </div>

      {/* Cost bars */}
      <div className="px-3 py-2 flex flex-col gap-1" style={{ background: 'rgba(0,0,0,0.2)' }}>
        {Object.entries(recipe.inputs).map(([r, amt]) => (
          <CostBar key={r} resourceId={r} required={amt * qty} have={state.resources[r] ?? 0} />
        ))}
      </div>

      {/* T2 BPC selector */}
      {isTech2 && (
        <div className="px-3 py-2 border-t border-orange-900/20" style={{ background: 'rgba(249,115,22,0.03)' }}>
          {availableBpcs.length === 0 ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-orange-400/70">
                {activeCopyJob
                  ? `T2 copy in progress. Ready in about ${fmtSeconds(Math.max(0, activeCopyJob.totalTime - activeCopyJob.progress) / Math.max(getResearchSpeedMultiplier(state), 0.001))}.`
                  : tech2Original
                    ? 'No T2 BPC ready. Copy the blueprint in the Blueprints tab to start Tech II production.'
                    : 'No T2 original unlocked yet. Research the parent blueprint to level 5, then make a copy.'}
              </div>
              <button
                onClick={onOpenBlueprints}
                className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide border border-orange-700/30 bg-orange-950/20 text-orange-300 hover:bg-orange-900/30 transition-colors"
              >
                Open Blueprints
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-xs text-slate-500 shrink-0">T2 BPC:</span>
              <div className="flex-1 min-w-[220px]">
                <GameDropdown
                  value={activeBpcId ?? ''}
                  onChange={setSelectedBpc}
                  options={bpcOptions}
                  placeholder="Select T2 BPC"
                  searchPlaceholder="Find blueprint copy..."
                  triggerTone="amber"
                  menuWidth={430}
                  renderDetail={option => {
                    const blueprint = availableBpcs.find(bpc => bpc.id === option?.value) ?? null;
                    if (!blueprint) return null;
                    return (
                      <div className="flex flex-col gap-2 text-[10px]">
                        <div>
                          <div className="text-[11px] font-semibold text-orange-200">{MANUFACTURING_RECIPES[blueprint.itemId]?.name ?? blueprint.itemId}</div>
                          <div className="text-slate-500 mt-1">{blueprint.type === 'copy' ? 'Consumable blueprint copy for Tech II production.' : 'Reusable blueprint original.'}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-slate-400">
                          <div className="rounded border border-slate-800/70 bg-slate-950/60 px-2 py-1">
                            <div className="text-[8px] uppercase tracking-widest text-slate-600">Runs</div>
                            <div className="font-mono text-slate-200">{blueprint.copiesRemaining === null ? 'Unlimited' : blueprint.copiesRemaining}</div>
                          </div>
                          <div className="rounded border border-slate-800/70 bg-slate-950/60 px-2 py-1">
                            <div className="text-[8px] uppercase tracking-widest text-slate-600">Research</div>
                            <div className="font-mono text-slate-200">Lv {blueprint.researchLevel}</div>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                  detailTitle="Blueprint Intel"
                  detailEmpty={<div className="text-[10px] text-slate-600">Pick the copy you want to consume for this Tech II run.</div>}
                />
              </div>
              <div className="text-[9px] text-emerald-300 font-mono shrink-0 mt-1">
                {totalBpcRunsReady > 0 ? `${totalBpcRunsReady} runs ready` : 'copies ready'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2.5 flex items-center gap-3 flex-wrap" style={{ background: 'rgba(0,0,0,0.1)' }}>
        <QtySelector qty={qty} maxQty={maxQty} onChange={setQty} />
        <button
          disabled={!canQueue || queueLen >= 50}
          onClick={() => {
            if (isTech2 && activeBpcId) {
              queueMfgWithBpc(recipeId, qty, activeBpcId);
            } else {
              queueMfg(recipeId, qty);
            }
          }}
          className={`ml-auto px-4 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 shrink-0 ${
            canQueue && queueLen < 50
              ? isTech2
                ? 'bg-orange-900/50 hover:bg-orange-800/60 border-orange-600/60 text-orange-200 hover:scale-[1.02]'
                : 'bg-cyan-900/50 hover:bg-cyan-800/60 border-cyan-600/60 text-cyan-200 hover:scale-[1.02]'
              : 'bg-slate-800/40 border-slate-700/40 text-slate-600 cursor-not-allowed'
          }`}
        >
          {!hasCorpHq ? 'HQ Required' : isLocked ? 'Locked' : queueLen >= 50 ? 'Queue Full' : `Queue �${qty}`}
        </button>
      </div>
    </div>
  );
}

function QueueJobRow({
  job,
  queueIndex,
  startsIn,
  effectiveSpeed,
  longestWait,
  onPrioritize,
  onCancel,
}: {
  job: ManufacturingJob;
  queueIndex: number;
  startsIn: number;
  effectiveSpeed: number;
  longestWait: number;
  onPrioritize: () => void;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const recipe = MANUFACTURING_RECIPES[job.recipeId];
  if (!recipe) return null;

  const isTech2 = !!recipe.isTech2;
  const jobTime = (recipe.timeCost * job.quantity) / effectiveSpeed;
  const waitRatio = longestWait > 0 ? Math.max(0.1, 1 - startsIn / longestWait) : 1;

  return (
    <div className="rounded-md border overflow-hidden border-slate-700/20 bg-slate-950/25">
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none hover:bg-white/[0.03] transition-colors"
        onClick={() => setExpanded(value => !value)}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400/60" />
        {isTech2 && (
          <span className="text-[8px] px-1 py-0.5 rounded border border-orange-700/30 bg-orange-950/15 text-orange-300 font-mono uppercase tracking-widest shrink-0">
            T2
          </span>
        )}
        <span className="flex-1 min-w-0 truncate text-[11px] font-semibold text-slate-200">{recipe.name}</span>
        <span className="text-[9px] font-mono text-slate-500 shrink-0">x{job.quantity}</span>
        <span className="text-[9px] font-mono text-amber-300/80 shrink-0">starts {fmtSeconds(startsIn)}</span>
        <span className="text-[10px] text-slate-600 shrink-0">{expanded ? '▴' : '▾'}</span>
        <button
          onClick={event => { event.stopPropagation(); onCancel(); }}
          className="text-[10px] text-red-500/40 hover:text-red-300 transition-colors pl-1"
          title="Cancel queued job"
        >
          ✕
        </button>
      </div>

      {!expanded && (
        <div className="px-2 pb-1.5 flex items-center gap-2">
          <div className="flex-1 bg-slate-800/70 rounded-full h-1 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isTech2 ? 'bg-orange-500/70' : 'bg-amber-600/60'}`}
              style={{ width: `${waitRatio * 100}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-slate-600 shrink-0">run {fmtSeconds(jobTime)}</span>
        </div>
      )}

      {expanded && (
        <div className="flex flex-col gap-1.5 px-2 pb-2 pt-1" style={{ borderTop: '1px solid rgba(30,41,59,0.5)' }}>
          <div className="flex flex-wrap gap-1">
            <span className="text-[8px] px-1.5 py-0.5 rounded border border-slate-700/40 bg-slate-900/50 text-slate-400 font-mono uppercase tracking-widest">
              queue #{queueIndex + 1}
            </span>
            <span className="text-[8px] px-1.5 py-0.5 rounded border border-amber-700/30 bg-amber-950/15 text-amber-300 font-mono uppercase tracking-widest">
              starts {fmtSeconds(startsIn)}
            </span>
            <span className="text-[8px] px-1.5 py-0.5 rounded border border-slate-700/40 bg-slate-900/50 text-slate-400 font-mono uppercase tracking-widest">
              duration {fmtSeconds(jobTime)}
            </span>
            {job.blueprintId && (
              <span className="text-[8px] px-1.5 py-0.5 rounded border border-orange-700/30 bg-orange-950/15 text-orange-300 font-mono uppercase tracking-widest">
                consumes BPC
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 leading-relaxed">{recipe.description}</div>
          <div className="flex flex-col gap-1 text-[10px] text-slate-400">
            <div className="text-[9px] uppercase tracking-widest text-slate-600">Outputs</div>
            {Object.entries(recipe.outputs).map(([resourceId, amount]) => (
              <div key={resourceId} className="flex items-center justify-between gap-2">
                <span>{RESOURCE_REGISTRY[resourceId]?.name ?? resourceId}</span>
                <span className="font-mono text-emerald-300">+{formatResourceAmount(amount * job.quantity, 0)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onPrioritize}
              className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide border border-cyan-700/30 bg-cyan-950/15 text-cyan-300 hover:bg-cyan-900/25 transition-colors"
            >
              Prioritize
            </button>
            <button
              onClick={onCancel}
              className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide border border-red-700/30 bg-red-950/15 text-red-300 hover:bg-red-900/25 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Active job card ----------------------------------------------------------

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
  const recipe = MANUFACTURING_RECIPES[job.recipeId];
  if (!recipe) return null;

  const totalTime   = recipe.timeCost * job.quantity;
  const progressPct = totalTime > 0 ? job.progress / totalTime : 0;
  const remaining   = Math.max(0, totalTime - job.progress) / Math.max(effectiveSpeed, 0.001);
  const unitsDone   = Math.floor(job.progress / recipe.timeCost);
  const isTech2     = !!recipe.isTech2;

  const bpcName = job.blueprintId
    ? state.systems.manufacturing.blueprints.find(b => b.id === job.blueprintId)
    : null;

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: isTech2
          ? 'linear-gradient(135deg, rgba(3,8,20,0.95) 0%, rgba(249,115,22,0.04) 100%)'
          : 'linear-gradient(135deg, rgba(3,8,20,0.95) 0%, rgba(34,211,238,0.04) 100%)',
        border: isTech2 ? '1px solid rgba(249,115,22,0.25)' : '1px solid rgba(34,211,238,0.25)',
        boxShadow: isTech2 ? '0 0 16px rgba(249,115,22,0.06)' : '0 0 16px rgba(34,211,238,0.06)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${isTech2 ? 'bg-orange-400' : 'bg-cyan-400'}`} />
          {isTech2 && <span className="text-[9px] text-orange-400 bg-orange-900/20 border border-orange-700/30 px-1.5 py-0.5 rounded font-mono uppercase">T2</span>}
          <span className={`text-sm font-bold truncate ${isTech2 ? 'text-orange-200' : 'text-cyan-200'}`}>{recipe.name}</span>
          <span className="text-xs text-slate-600 font-mono shrink-0">�{job.quantity}</span>
          {job.quantity > 1 && (
            <span className="text-xs text-slate-500 font-mono">{unitsDone}/{job.quantity} done</span>
          )}
        </div>
        <button
          onClick={cancelJob}
          className="text-xs text-red-400/60 hover:text-red-400 px-2 py-0.5 rounded border border-transparent hover:border-red-800/40 transition-colors shrink-0"
        >? Cancel</button>
      </div>
      {bpcName && (
        <div className="text-xs text-orange-400/60 font-mono">
          BPC: {MANUFACTURING_RECIPES[bpcName.itemId]?.name ?? bpcName.itemId} ({bpcName.copiesRemaining === null ? '8' : bpcName.copiesRemaining} runs left)
        </div>
      )}
      <FlairProgressBar value={progressPct} color={isTech2 ? 'amber' : 'cyan'} label="Production progress" valueLabel={`${Math.round(progressPct * 100)}%`} />
      <div className="flex flex-wrap gap-1.5 text-[9px]">
        <span className={`rounded-full border px-2 py-0.5 font-mono ${isTech2 ? 'border-orange-700/30 bg-orange-950/20 text-orange-300' : 'border-cyan-700/30 bg-cyan-950/20 text-cyan-300'}`}>
          x{effectiveSpeed.toFixed(2)} speed
        </span>
        <span className="rounded-full border border-slate-700/30 bg-slate-950/30 px-2 py-0.5 font-mono text-slate-400">
          {unitsDone}/{job.quantity} units complete
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex flex-wrap gap-1">
          {Object.entries(recipe.outputs).map(([r, amt]) => (
            <span key={r} className="text-emerald-400/70 bg-emerald-900/15 border border-emerald-800/25 rounded px-1.5 py-0.5 font-mono">
              +{formatResourceAmount(amt * job.quantity, 0)} {RESOURCE_REGISTRY[r]?.name ?? r}
            </span>
          ))}
        </div>
        <span className={`font-mono shrink-0 ml-2 ${isTech2 ? 'text-orange-400/70' : 'text-cyan-400/70'}`}>{fmtSeconds(remaining)} left</span>
      </div>
    </div>
  );
}

// --- Research job card --------------------------------------------------------

function ResearchJobCard({ job, researchSpeed }: { job: ResearchJob; researchSpeed: number }) {
  const cancelResearchJob = useGameStore(s => s.cancelResearchJob);
  const blueprints        = useGameStore(s => s.state.systems.manufacturing.blueprints);

  const bp = blueprints.find(b => b.id === job.blueprintId);
  const recipeName = bp ? (MANUFACTURING_RECIPES[bp.itemId]?.name ?? bp.itemId) : job.blueprintId;
  const pct = job.totalTime > 0 ? job.progress / job.totalTime : 0;
  const remaining = Math.max(0, job.totalTime - job.progress) / Math.max(researchSpeed, 0.001);

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.9) 0%, rgba(139,92,246,0.04) 100%)',
        border: '1px solid rgba(139,92,246,0.2)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shrink-0" />
          <span className="text-xs font-bold text-violet-200 truncate">Researching: {recipeName}</span>
          <span className="text-[9px] text-slate-500 font-mono shrink-0">Lv {(bp?.researchLevel ?? 0)} ? {job.targetLevel}</span>
        </div>
        <button
          onClick={() => cancelResearchJob(job.id)}
          className="text-xs text-red-400/50 hover:text-red-400 px-1.5 py-0.5 rounded border border-transparent hover:border-red-800/40 transition-colors shrink-0"
        >?</button>
      </div>
      <FlairProgressBar value={pct} color="violet" label="Research progress" valueLabel={`${Math.round(pct * 100)}%`} />
      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
        <span>{Math.round(pct * 100)}%</span>
        <span>{fmtSeconds(remaining)} left</span>
      </div>
    </div>
  );
}

// --- Copy job card ------------------------------------------------------------

function CopyJobCard({ job, researchSpeed }: { job: CopyJob; researchSpeed: number }) {
  const cancelCopyJob = useGameStore(s => s.cancelCopyJob);
  const blueprints    = useGameStore(s => s.state.systems.manufacturing.blueprints);

  const bp = blueprints.find(b => b.id === job.blueprintId);
  const recipeName = bp ? (MANUFACTURING_RECIPES[bp.itemId]?.name ?? bp.itemId) : job.blueprintId;
  const pct = job.totalTime > 0 ? job.progress / job.totalTime : 0;
  const remaining = Math.max(0, job.totalTime - job.progress) / Math.max(researchSpeed, 0.001);

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.9) 0%, rgba(20,184,166,0.04) 100%)',
        border: '1px solid rgba(20,184,166,0.2)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse shrink-0" />
          <span className="text-xs font-bold text-teal-200 truncate">Copying: {recipeName}</span>
          <span className="text-[9px] text-slate-500 font-mono shrink-0">�{job.runs} runs BPC</span>
        </div>
        <button
          onClick={() => cancelCopyJob(job.id)}
          className="text-xs text-red-400/50 hover:text-red-400 px-1.5 py-0.5 rounded border border-transparent hover:border-red-800/40 transition-colors shrink-0"
        >?</button>
      </div>
      <FlairProgressBar value={pct} color="green" label="Copy progress" valueLabel={`${Math.round(pct * 100)}%`} />
      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
        <span>{Math.round(pct * 100)}%</span>
        <span>{fmtSeconds(remaining)} left</span>
      </div>
    </div>
  );
}

// --- Blueprint card -----------------------------------------------------------

function BlueprintCard({ blueprint }: { blueprint: Blueprint }) {
  const [expanded, setExpanded] = useState(false);
  const state           = useGameStore(s => s.state);
  const researchBp      = useGameStore(s => s.researchBlueprint);
  const copyBp          = useGameStore(s => s.copyBlueprint);
  const [copyRuns, setCopyRuns] = useState(5);
  const [showCopyPicker, setShowCopyPicker] = useState(false);

  const recipe      = MANUFACTURING_RECIPES[blueprint.itemId];
  const name        = recipe?.name ?? blueprint.itemId;
  const scienceLevel = state.systems.skills.levels['science'] ?? 0;
  const mfg         = state.systems.manufacturing;
  const usedSlots   = mfg.researchJobs.length + mfg.copyJobs.length;
  const maxSlots    = getMaxResearchSlots(state);
  const hasSlot     = usedSlots < maxSlots;

  const def            = BLUEPRINT_DEFINITIONS[blueprint.itemId];
  const datacoreId     = def?.datacoreId;
  const hasDatacore    = datacoreId ? (state.resources[datacoreId] ?? 0) >= 1 : false;
  const isOriginal     = blueprint.type === 'original';
  const isTech2        = blueprint.tier === 2;
  const atMaxLevel     = blueprint.researchLevel >= 10;
  const hasCorpHq      = !!state.systems.factions.homeStationId && !!state.systems.factions.homeStationSystemId;
  const canResearch    = hasCorpHq && isOriginal && !blueprint.isLocked && scienceLevel >= 1 && hasSlot && hasDatacore && !atMaxLevel;
  const canCopy        = hasCorpHq && isOriginal && !blueprint.isLocked && scienceLevel >= 1 && hasSlot;

  const researchingThis = mfg.researchJobs.find(j => j.blueprintId === blueprint.id);
  const copyingThis     = mfg.copyJobs.find(j => j.blueprintId === blueprint.id);

  const t2Unlocked = blueprint.researchLevel >= 5 && def?.t2RecipeId
    ? mfg.blueprints.some(b => b.itemId === def.t2RecipeId && b.tier === 2)
    : false;

  const hasActiveLabWork = !!researchingThis || !!copyingThis;
  const statusDotClass = hasActiveLabWork
    ? researchingThis
      ? 'bg-cyan-400 animate-pulse'
      : 'bg-amber-400/60 animate-pulse'
    : blueprint.isLocked
      ? 'bg-amber-400/60'
      : isOriginal
        ? 'bg-emerald-400'
        : 'bg-slate-600';

  const collapsedHint = researchingThis
    ? Math.round((researchingThis.progress / researchingThis.totalTime) * 100)
    : copyingThis
      ? Math.round((copyingThis.progress / copyingThis.totalTime) * 100)
      : Math.min(100, blueprint.researchLevel * 10);

  const collapsedHintColor = researchingThis
    ? 'bg-cyan-500/70'
    : copyingThis
      ? 'bg-amber-600/60'
      : isTech2
        ? 'bg-orange-500/70'
        : 'bg-violet-500/70';

  return (
    <div
      className="rounded-md border overflow-hidden border-slate-700/20 bg-slate-950/25"
      style={{
        borderColor: isTech2 ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.07)',
      }}
    >
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none hover:bg-white/[0.03] transition-colors"
        onClick={() => setExpanded(value => !value)}
        style={{ background: expanded ? (isTech2 ? 'rgba(249,115,22,0.04)' : 'rgba(255,255,255,0.02)') : undefined }}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass}`} />
        <span className={`text-[8px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider font-bold shrink-0 ${
          isTech2 ? 'text-orange-300 bg-orange-900/20 border-orange-700/30' : 'text-cyan-400 bg-cyan-900/20 border-cyan-800/30'
        }`}>{isTech2 ? 'T2' : 'T1'}</span>
        <span className={`text-[8px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider shrink-0 ${
          isOriginal ? 'text-violet-400 bg-violet-900/20 border-violet-800/30' : 'text-teal-400 bg-teal-900/20 border-teal-800/30'
        }`}>{isOriginal ? 'BPO' : 'BPC'}</span>
        <span className="flex-1 min-w-0 truncate text-[11px] font-semibold text-slate-200">{name}</span>
        {isOriginal ? (
          <span className="text-[9px] font-mono text-slate-500 shrink-0">Lv {blueprint.researchLevel}/10</span>
        ) : blueprint.copiesRemaining !== null ? (
          <span className="text-[9px] font-mono text-slate-500 shrink-0">{blueprint.copiesRemaining} runs</span>
        ) : null}
        <span className={`text-[9px] font-mono shrink-0 ${hasActiveLabWork ? 'text-cyan-300/80' : t2Unlocked ? 'text-emerald-300/80' : 'text-slate-500'}`}>
          {researchingThis
            ? 'researching'
            : copyingThis
              ? 'copying'
              : t2Unlocked
                ? 'ready'
                : blueprint.isLocked
                  ? 'in use'
                  : 'standby'}
        </span>
        <span className="text-[10px] text-slate-600 shrink-0">{expanded ? '▴' : '▾'}</span>
      </div>

      {!expanded && (
        <div className="px-2 pb-1.5 flex items-center gap-2">
          <div className="flex-1 bg-slate-800/70 rounded-full h-1 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${collapsedHintColor}`}
              style={{ width: `${collapsedHint}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-slate-600 shrink-0">
            {researchingThis
              ? `${collapsedHint}%`
              : copyingThis
                ? `${collapsedHint}%`
                : isOriginal
                  ? `${blueprint.researchLevel}/10`
                  : blueprint.copiesRemaining === null
                    ? '∞'
                    : `${blueprint.copiesRemaining}`}
          </span>
        </div>
      )}

      {expanded && (
        <div className="flex flex-col gap-2 px-3 pb-3 pt-2" style={{ borderTop: '1px solid rgba(30,41,59,0.5)' }}>
          <div className="flex flex-wrap items-center gap-2">
            {blueprint.isLocked && (
              <span className="text-[9px] text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded px-1.5 py-0.5 font-mono">In Use</span>
            )}
            {!isOriginal && blueprint.copiesRemaining !== null && (
              <span className="text-[9px] text-slate-400 font-mono">{blueprint.copiesRemaining} runs left</span>
            )}
            {def?.t2RecipeId && (
              <span className={`text-[9px] font-mono ${t2Unlocked ? 'text-emerald-400' : blueprint.researchLevel >= 5 ? 'text-amber-400' : 'text-slate-600'}`}>
                {t2Unlocked ? 'T2 unlocked' : blueprint.researchLevel >= 5 ? 'T2 ready to copy' : 'T2 at Lv5'}
              </span>
            )}
          </div>

          {isOriginal && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-slate-500">Research Level:</span>
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }, (_, i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{
                      background: i < blueprint.researchLevel
                        ? (isTech2 ? '#f97316' : '#7c3aed')
                        : 'rgba(255,255,255,0.05)',
                      border: i < blueprint.researchLevel
                        ? 'none'
                        : '1px solid rgba(255,255,255,0.1)',
                    }}
                  />
                ))}
              </div>
              <span className="text-[10px] font-mono text-slate-400">{blueprint.researchLevel}/10</span>
            </div>
          )}

          {(researchingThis || copyingThis) && (
            <div className="flex flex-col gap-1 rounded-lg border border-slate-800/50 bg-slate-950/25 px-2.5 py-2">
              {researchingThis && (
                <div className="flex items-center gap-2 text-xs text-violet-300/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shrink-0" />
                  <span className="font-mono">Research in progress · {Math.round((researchingThis.progress / researchingThis.totalTime) * 100)}%</span>
                </div>
              )}
              {copyingThis && (
                <div className="flex items-center gap-2 text-xs text-teal-300/70 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse shrink-0" />
                  <span className="font-mono">Copy in progress · {Math.round((copyingThis.progress / copyingThis.totalTime) * 100)}%</span>
                </div>
              )}
            </div>
          )}

          {isOriginal && (
            <div className="flex items-center gap-2 flex-wrap" style={{ background: 'rgba(0,0,0,0.1)' }}>
              <div className="flex flex-col items-start gap-0.5">
                <button
                  disabled={!canResearch}
                  onClick={() => researchBp(blueprint.id)}
                  title={
                    !hasCorpHq ? 'Corp HQ required' :
                    scienceLevel < 1 ? 'Science I required' :
                    !hasDatacore ? `Need 1 ${RESOURCE_REGISTRY[datacoreId ?? '']?.name ?? 'datacore'}` :
                    !hasSlot ? 'No research slot available' :
                    atMaxLevel ? 'Max research level reached' :
                    blueprint.isLocked ? 'Blueprint is locked' : ''
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 ${
                    canResearch
                      ? 'bg-violet-900/40 hover:bg-violet-800/50 border-violet-600/50 text-violet-200 hover:scale-[1.02]'
                      : 'bg-slate-800/40 border-slate-700/40 text-slate-600 cursor-not-allowed'
                  }`}
                >Research +1</button>
                {datacoreId && (
                  <span className={`text-[9px] font-mono ml-0.5 ${hasDatacore ? 'text-slate-500' : 'text-amber-500'}`}>
                    Uses: {RESOURCE_REGISTRY[datacoreId]?.name ?? datacoreId} (have {state.resources[datacoreId] ?? 0})
                  </span>
                )}
              </div>
              <button
                disabled={!canCopy}
                onClick={() => setShowCopyPicker(p => !p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 ${
                  canCopy
                    ? 'bg-teal-900/40 hover:bg-teal-800/50 border-teal-600/50 text-teal-200 hover:scale-[1.02]'
                    : 'bg-slate-800/40 border-slate-700/40 text-slate-600 cursor-not-allowed'
                }`}
              >Copy BPC</button>
              {showCopyPicker && canCopy && (
                <div className="flex items-center gap-2 w-full mt-1 flex-wrap">
                  <span className="text-xs text-slate-400 shrink-0">Runs:</span>
                  <div className="flex gap-1 flex-wrap">
                    {[1, 2, 5, 10].map(r => (
                      <button
                        key={r}
                        onClick={() => setCopyRuns(r)}
                        className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
                          copyRuns === r
                            ? 'bg-teal-800/60 border-teal-500/70 text-teal-200'
                            : 'bg-slate-800 border-slate-600/50 text-slate-400 hover:border-teal-700/50'
                        }`}
                      >{r}</button>
                    ))}
                  </div>
                  <button
                    onClick={() => { copyBp(blueprint.id, copyRuns); setShowCopyPicker(false); }}
                    className="px-3 py-1 rounded-lg text-xs font-bold border bg-teal-900/50 border-teal-600/60 text-teal-200 hover:bg-teal-800/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >Start Copy</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Jobs tab -----------------------------------------------------------------

function JobsTab({ onOpenBlueprints }: { onOpenBlueprints: () => void }) {
  const state                  = useGameStore(s => s.state);
  const cancelManufacturingJob = useGameStore(s => s.cancelManufacturingJob);
  const prioritize             = useGameStore(s => s.prioritizeManufacturingJob);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'component' | 'ship' | 't2'>('all');

  const speedMult      = getManufacturingSpeedMultiplier(state);
  const effectiveSpeed = Math.max(speedMult, 0.001);
  const { queue }      = state.systems.manufacturing;
  const { researchJobs, copyJobs, blueprints } = state.systems.manufacturing;
  const maxSlots = getMaxResearchSlots(state);
  const usedSlots = researchJobs.length + copyJobs.length;
  const readyT2Copies = blueprints.filter(
    blueprint => blueprint.type === 'copy' && blueprint.tier === 2 && !blueprint.isLocked && (blueprint.copiesRemaining === null || blueprint.copiesRemaining > 0),
  );
  const totalBpcCount = blueprints.filter(blueprint => blueprint.type === 'copy').length;
  const totalBpoCount = blueprints.filter(blueprint => blueprint.type === 'original').length;
  const activeSignal = queue.length > 0 || usedSlots > 0;
  const grade = manufacturingGrade(speedMult);

  const queueStartTimes: number[] = [];
  {
    let acc = 0;
    for (const job of queue) {
      queueStartTimes.push(acc);
      const r = MANUFACTURING_RECIPES[job.recipeId];
      acc += r ? Math.max(0, r.timeCost * job.quantity - job.progress) / effectiveSpeed : 0;
    }
  }
  const longestWait = queueStartTimes[queue.length - 1] ?? 0;

  const filteredRecipes = RECIPE_ORDER.filter(id => {
    const r = MANUFACTURING_RECIPES[id];
    if (!r) return false;
    if (categoryFilter === 't2') return !!r.isTech2;
    if (categoryFilter === 'all') return true;
    return r.category === categoryFilter && !r.isTech2;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-cyan-300">Production Command Deck</span>
              <span
                className="text-[10px] font-black px-2 py-0.5 rounded border font-mono"
                style={{ color: grade.color, background: `${grade.color}18`, border: `1px solid ${grade.color}44` }}
                title={`Manufacturing speed: x${speedMult.toFixed(2)}`}
              >
                {grade.grade}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
              Live production telemetry for queue pressure, lab activity, and Tech II readiness.
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[8px] uppercase tracking-widest text-slate-600">State</div>
            <div className={`text-[10px] font-mono mt-1 ${activeSignal ? 'text-cyan-300' : 'text-slate-500'}`}>
              {queue.length > 0 ? 'fabricating' : usedSlots > 0 ? 'lab active' : 'idle'}
            </div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <CommandMetric label="Production" value={`${queue.length}/50`} meta={queue.length > 0 ? `${Math.round((queue.length / 50) * 100)}% loaded` : 'No queued work'} tone={queue.length > 0 ? 'violet' : 'slate'} />
          <CommandMetric label="Lab Slots" value={`${usedSlots}/${maxSlots}`} meta={usedSlots > 0 ? `${researchJobs.length} research / ${copyJobs.length} copy` : 'No lab work'} tone={usedSlots > 0 ? 'amber' : 'slate'} />
          <CommandMetric label="T2 Copies" value={`${readyT2Copies.length}`} meta={readyT2Copies.length > 0 ? 'Tech II runs ready' : 'No T2 copies staged'} tone={readyT2Copies.length > 0 ? 'emerald' : 'slate'} />
          <CommandMetric label="Blueprints" value={`${totalBpoCount}/${totalBpcCount}`} meta="BPO / BPC library" tone="cyan" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-700/20 bg-slate-950/20 px-2.5 py-2 text-[10px] text-slate-400">
          <span>Facility state stays readable from queue, lab slots, and Tech II readiness above.</span>
          <span className="font-mono text-slate-500">x{speedMult.toFixed(2)} speed</span>
        </div>
      </div>

      <PanelInfoSection
        sectionId="manufacturing-flow"
        title="T2 Production Flow"
        subtitle="Collapse the reminder when you know the path from research to copy to queued Tech II runs."
        accentColor="#f59e0b"
        defaultCollapsed
      >
        <div className="flex flex-col gap-2 text-[10px] text-slate-400">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-700/30 bg-slate-950/30 px-2.5 py-2">
              <div className="text-[8px] uppercase tracking-widest text-slate-600">1. Research</div>
              <div className="mt-1 leading-relaxed">Push the source blueprint to level 5 to unlock the T2 original.</div>
            </div>
            <div className="rounded-lg border border-slate-700/30 bg-slate-950/30 px-2.5 py-2">
              <div className="text-[8px] uppercase tracking-widest text-slate-600">2. Copy</div>
              <div className="mt-1 leading-relaxed">Make BPC runs from the T2 original before queueing Tech II production.</div>
            </div>
            <div className="rounded-lg border border-slate-700/30 bg-slate-950/30 px-2.5 py-2">
              <div className="text-[8px] uppercase tracking-widest text-slate-600">3. Fabricate</div>
              <div className="mt-1 leading-relaxed">T2 recipe cards now show whether copies are ready, in flight, or still locked.</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-700/20 bg-amber-950/10 px-2.5 py-2">
            <span className="text-[10px] text-slate-400">Need the full blueprint library or active lab management view?</span>
            <button
              onClick={onOpenBlueprints}
              className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide border border-violet-700/30 bg-violet-950/15 text-violet-300 hover:bg-violet-900/25 transition-colors"
            >
              Open Blueprints
            </button>
          </div>
        </div>
      </PanelInfoSection>

      <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Research & Copies</div>
            <div className="text-[11px] text-slate-300 mt-1">Lab progress and T2 readiness without leaving the jobs view.</div>
          </div>
          <button
            onClick={onOpenBlueprints}
            className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide border border-violet-700/30 bg-violet-950/15 text-violet-300 hover:bg-violet-900/25 transition-colors shrink-0"
          >
            Blueprint Lab
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 mb-3">
          <CommandMetric label="Slots" value={`${usedSlots}/${maxSlots}`} meta={usedSlots > 0 ? 'lab running' : 'all slots open'} tone={usedSlots > 0 ? 'violet' : 'slate'} />
          <CommandMetric label="Ready T2 BPC" value={`${readyT2Copies.length}`} meta={readyT2Copies.length > 0 ? 'queue Tech II now' : 'none staged'} tone={readyT2Copies.length > 0 ? 'emerald' : 'slate'} />
          <CommandMetric label="Research Speed" value={`x${getResearchSpeedMultiplier(state).toFixed(2)}`} meta={`${researchJobs.length} research / ${copyJobs.length} copy`} tone={usedSlots > 0 ? 'amber' : 'slate'} />
        </div>
        {(researchJobs.length > 0 || copyJobs.length > 0) ? (
          <div className="grid gap-2 xl:grid-cols-2">
            {researchJobs.map(job => (
              <ResearchJobCard key={job.id} job={job} researchSpeed={getResearchSpeedMultiplier(state)} />
            ))}
            {copyJobs.map(job => (
              <CopyJobCard key={job.id} job={job} researchSpeed={getResearchSpeedMultiplier(state)} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-3 text-[10px] text-slate-500">
            No research or copy jobs are in flight. The blueprint lab is idle and ready for T2 prep work.
          </div>
        )}
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
              const startsIn = queueStartTimes[qi] ?? 0;
              return (
                <QueueJobRow
                  key={qi}
                  job={job}
                  queueIndex={qi}
                  startsIn={startsIn}
                  effectiveSpeed={effectiveSpeed}
                  longestWait={longestWait}
                  onPrioritize={() => prioritize(qi)}
                  onCancel={() => cancelManufacturingJob(qi)}
                />
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
            {(['all', 'component', 'ship', 't2'] as const).map(f => (
              <button
                key={f}
                onClick={() => setCategoryFilter(f)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                  categoryFilter === f
                    ? f === 't2'
                      ? 'bg-orange-900/40 border-orange-600/50 text-orange-300'
                      : 'bg-cyan-900/40 border-cyan-600/50 text-cyan-300'
                    : 'bg-slate-900/40 border-slate-700/40 text-slate-500 hover:text-slate-300'
                }`}
              >{f}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {filteredRecipes.map(id => <RecipeCard key={id} recipeId={id} onOpenBlueprints={onOpenBlueprints} />)}
        </div>
      </div>

      {queue.length === 0 && (
        <div className="text-center py-8 text-slate-600 text-xs">
          <div className="text-2xl mb-2">??</div>
          Queue is empty. Select a recipe above and click <span className="text-cyan-500">Queue</span> to start production.
        </div>
      )}
    </div>
  );
}

// --- Blueprints tab -----------------------------------------------------------

function BlueprintsTab() {
  const state       = useGameStore(s => s.state);
  const [bpFilter, setBpFilter] = useState<'all' | 'bpo' | 'bpc' | 't2'>('all');
  const mfg           = state.systems.manufacturing;
  const researchSpeed = getResearchSpeedMultiplier(state);
  const scienceLevel  = state.systems.skills.levels['science'] ?? 0;
  const maxSlots      = getMaxResearchSlots(state);
  const usedSlots     = mfg.researchJobs.length + mfg.copyJobs.length;
  const activeLab = mfg.researchJobs.length > 0 || mfg.copyJobs.length > 0;
  const originalCount = mfg.blueprints.filter(bp => bp.type === 'original').length;
  const copyCount = mfg.blueprints.filter(bp => bp.type === 'copy').length;
  const readyT2Copies = mfg.blueprints.filter(bp => bp.type === 'copy' && bp.tier === 2 && !bp.isLocked && (bp.copiesRemaining === null || bp.copiesRemaining > 0)).length;
  const lockedBlueprints = mfg.blueprints.filter(bp => bp.isLocked).length;

  const filteredBlueprints = mfg.blueprints.filter(bp => {
    if (bpFilter === 'bpo') return bp.type === 'original';
    if (bpFilter === 'bpc') return bp.type === 'copy';
    if (bpFilter === 't2')  return bp.tier === 2;
    return true;
  });

  if (scienceLevel < 1) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-5xl">??</div>
        <div className="text-slate-500 text-sm text-center">
          Research Lab locked.<br />
          Train <span className="text-amber-400">Science I</span> to unlock blueprint research.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-violet-300">Blueprint Lab</div>
            <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
              Research originals, generate copy runs, and track Tech II readiness from one compact library view.
            </div>
          </div>
          <StatTooltip modifierKey="blueprint-research-speed">
            <span className="text-xs font-bold font-mono text-violet-300 shrink-0">×{researchSpeed.toFixed(2)} speed</span>
          </StatTooltip>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 mb-3">
          <CommandMetric label="Lab Slots" value={`${usedSlots}/${maxSlots}`} meta={activeLab ? 'research network active' : 'all slots open'} tone={activeLab ? 'violet' : 'slate'} />
          <CommandMetric label="Originals" value={`${originalCount}`} meta="permanent library" tone="cyan" />
          <CommandMetric label="Copies" value={`${copyCount}`} meta={`${readyT2Copies} T2 ready`} tone={copyCount > 0 ? 'amber' : 'slate'} />
          <CommandMetric label="Locked" value={`${lockedBlueprints}`} meta={lockedBlueprints > 0 ? 'currently in use' : 'none locked'} tone={lockedBlueprints > 0 ? 'amber' : 'emerald'} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/20 bg-slate-950/20 px-2.5 py-2 text-[10px] text-slate-400">
          <span>Library scanability comes from counts, locked-state tags, and collapsed row hints.</span>
          <span className="font-mono text-slate-500">{filteredBlueprints.length} visible</span>
        </div>
      </div>

      <PanelInfoSection
        sectionId="manufacturing-blueprint-flow"
        title="Blueprint Operations"
        subtitle="Collapse the guidance once the research and copy loop is second nature."
        accentColor="#8b5cf6"
        defaultCollapsed
      >
        <div className="grid gap-2 sm:grid-cols-3 text-[10px] text-slate-400">
          <div className="rounded-lg border border-slate-700/30 bg-slate-950/20 px-2.5 py-2">
            <div className="text-[8px] uppercase tracking-widest text-slate-600">Research</div>
            <div className="mt-1 leading-relaxed">Spend datacores to raise blueprint levels and unlock downstream Tech II originals.</div>
          </div>
          <div className="rounded-lg border border-slate-700/30 bg-slate-950/20 px-2.5 py-2">
            <div className="text-[8px] uppercase tracking-widest text-slate-600">Copy</div>
            <div className="mt-1 leading-relaxed">Use originals to stage consumable BPC runs for Tech II or batched production work.</div>
          </div>
          <div className="rounded-lg border border-slate-700/30 bg-slate-950/20 px-2.5 py-2">
            <div className="text-[8px] uppercase tracking-widest text-slate-600">Library</div>
            <div className="mt-1 leading-relaxed">Whole-card rows now collapse into progress hints so large blueprint libraries stay scannable.</div>
          </div>
        </div>
      </PanelInfoSection>

      {/* Active research/copy jobs */}
      {(mfg.researchJobs.length > 0 || mfg.copyJobs.length > 0) && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Active Jobs</div>
          <div className="flex flex-col gap-2">
            {mfg.researchJobs.map(job => (
              <ResearchJobCard key={job.id} job={job} researchSpeed={researchSpeed} />
            ))}
            {mfg.copyJobs.map(job => (
              <CopyJobCard key={job.id} job={job} researchSpeed={researchSpeed} />
            ))}
          </div>
        </div>
      )}

      {/* Blueprint library */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Blueprint Library</div>
          <div className="flex gap-1">
            {(['all', 'bpo', 'bpc', 't2'] as const).map(f => (
              <button
                key={f}
                onClick={() => setBpFilter(f)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                  bpFilter === f
                    ? f === 't2'
                      ? 'bg-orange-900/40 border-orange-600/50 text-orange-300'
                      : 'bg-violet-900/40 border-violet-600/50 text-violet-300'
                    : 'bg-slate-900/40 border-slate-700/40 text-slate-500 hover:text-slate-300'
                }`}
              >{f}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {filteredBlueprints.map(bp => <BlueprintCard key={bp.id} blueprint={bp} />)}
        </div>
        {filteredBlueprints.length === 0 && (
          <div className="text-center py-8 text-slate-600 text-xs">
            No blueprints match this filter.
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main panel ---------------------------------------------------------------

export function ManufacturingPanel() {
  const state           = useGameStore(s => s.state);
  const savedPanelState = useUiStore(s => s.panelStates.manufacturing);
  const setPanelState = useUiStore(s => s.setPanelState);
  const [tab, setTab]   = useState<ManufacturingTab>(() => savedPanelState.tab ?? 'jobs');
  const hasManufacturing = state.unlocks['system-manufacturing'];
  const focusTarget = useUiStore(s => s.focusTarget);
  const clearFocus = useUiStore(s => s.clearFocus);
  const speedMult = getManufacturingSpeedMultiplier(state);
  const queueLength = state.systems.manufacturing.queue.length;
  const activeLabJobs = state.systems.manufacturing.researchJobs.length + state.systems.manufacturing.copyJobs.length;
  const grade = manufacturingGrade(speedMult);

  useEffect(() => {
    if (!focusTarget?.panelSection) return;
    if (focusTarget.panelSection !== 'jobs' && focusTarget.panelSection !== 'blueprints') return;
    setTab(focusTarget.panelSection);
    clearFocus();
  }, [focusTarget, clearFocus]);

  useEffect(() => {
    if (savedPanelState.tab && savedPanelState.tab !== tab) {
      setTab(savedPanelState.tab);
    }
  }, [savedPanelState.tab]);

  useEffect(() => {
    setPanelState('manufacturing', { tab });
  }, [tab, setPanelState]);

  if (!hasManufacturing) {
    return (
      <div className="py-10">
        <SystemUnlockCard
          icon="manufacturing"
          title="Manufacturing Complex"
          skillId="industry"
          summary="Turn minerals into components, ships, and later blueprint-driven T2 production. Industry is the first step into a focused industrial path, but it also pairs cleanly with mining and trade."
          benefits={[
            'Queue component and ship jobs instead of selling every raw input immediately.',
            'Convert mining output into fleet growth, market goods, and later research targets.',
            'Open the blueprint branch so Science can later unlock research, copying, and T2 progression.',
          ]}
          accentColor="#fbbf24"
          previewPanel="skills"
          previewLabel="Review Industry Skills"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="panel-header">Manufacturing Complex</h2>
          <span
            className="text-sm font-black px-2 py-0.5 rounded border font-mono"
            style={{ color: grade.color, background: `${grade.color}18`, border: `1px solid ${grade.color}44` }}
            title={`Manufacturing speed: x${speedMult.toFixed(2)}`}
          >
            {grade.grade}
          </span>
        </div>
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 px-2.5 py-2">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-[10px] text-slate-500 leading-relaxed">
              Dense production control for components, modules, hulls, research, and Tech II staging.
            </div>
            <div className="flex gap-2 shrink-0">
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-cyan-700/30 bg-cyan-950/15 text-cyan-300 font-mono">
                q {queueLength}/50
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-violet-700/30 bg-violet-950/15 text-violet-300 font-mono">
                lab {activeLabJobs}/{getMaxResearchSlots(state)}
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-2.5 py-2 text-[10px] text-slate-400">
            Queue depth, lab occupancy, and speed grade now carry the full facility readout without a separate activity strip.
          </div>
        </div>
      </div>

      <PanelInfoSection
        sectionId="manufacturing-context"
        title="Facility Context"
        subtitle="Hide static production notes when you want the queue and blueprint controls immediately visible."
        accentColor="#fbbf24"
        defaultCollapsed
      >
        <div className="flex flex-col gap-3">
          <p className="text-slate-500 text-xs">
            Queue production jobs, manage blueprints, and research T2 technology.
          </p>
          <ManufacturingHqBanner />
        </div>
      </PanelInfoSection>

      {/* Tab bar */}
      <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 px-2.5 py-2">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Control Focus</div>
            <div className="text-xs text-slate-400 mt-0.5">Switch between live fabrication control and blueprint-library management without losing the command-deck context above.</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-cyan-700/30 bg-cyan-950/15 text-cyan-300 font-mono">
              jobs {state.systems.manufacturing.queue.length}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-violet-700/30 bg-violet-950/15 text-violet-300 font-mono">
              lab {state.systems.manufacturing.researchJobs.length + state.systems.manufacturing.copyJobs.length}
            </span>
          </div>
        </div>
        <div className="flex gap-1 border-b border-slate-800/60 pb-1">
          {(['jobs', 'blueprints'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-t-lg text-xs font-bold uppercase tracking-wide transition-all duration-150 ${
                tab === t
                  ? t === 'blueprints'
                    ? 'bg-violet-900/30 border border-violet-600/40 border-b-transparent text-violet-300'
                    : 'bg-cyan-900/30 border border-cyan-600/40 border-b-transparent text-cyan-300'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span>{t === 'jobs' ? 'Jobs' : 'Blueprints'}</span>
                <span className="text-[9px] font-mono opacity-75">
                  {t === 'jobs'
                    ? `${state.systems.manufacturing.queue.length}`
                    : `${state.systems.manufacturing.researchJobs.length + state.systems.manufacturing.copyJobs.length}`}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-slate-800/50 bg-slate-950/35 px-3 py-2 mt-2">
          <div className="text-[10px] text-slate-400 leading-relaxed">
            {tab === 'jobs'
              ? 'Jobs keeps queue pressure, recipe staging, and lab activity close together for operational use.'
              : 'Blueprints prioritizes research posture, copy throughput, and library readiness for future production.'}
          </div>
        </div>
      </div>

      {tab === 'jobs' && <JobsTab onOpenBlueprints={() => setTab('blueprints')} />}
      {tab === 'blueprints' && <BlueprintsTab />}
    </div>
  );
}
