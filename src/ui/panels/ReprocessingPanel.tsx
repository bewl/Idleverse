import { useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { ORE_BELTS, BELT_ORDER } from '@/game/systems/mining/mining.config';
import { RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { formatResourceAmount } from '@/game/resources/resourceRegistry';
import { FlairProgressBar } from '@/ui/components/FlairProgressBar';
import { StatTooltip } from '@/ui/tooltip/StatTooltip';
import { NavTag } from '@/ui/components/NavTag';
import { getBatchYieldPreview, getReprocessingEfficiency } from '@/game/systems/reprocessing/reprocessing.logic';
import { BATCH_SIZE_BASE, BATCH_TIME_SECONDS, ORE_YIELD_TABLE } from '@/game/systems/reprocessing/reprocessing.config';
import type { OreSecurityTier } from '@/types/game.types';

// ─── Efficiency grade badge ────────────────────────────────────────────────

function efficiencyGrade(eff: number): { grade: string; color: string } {
  if (eff >= 1.00) return { grade: 'S', color: '#22d3ee' };
  if (eff >= 0.85) return { grade: 'A', color: '#34d399' };
  if (eff >= 0.70) return { grade: 'B', color: '#fbbf24' };
  if (eff >= 0.55) return { grade: 'C', color: '#fb923c' };
  return                  { grade: 'D', color: '#f87171' };
}

// ─── Tier styling ──────────────────────────────────────────────────────────

const TIER_CONFIG: Record<OreSecurityTier, { label: string; badgeClass: string; color: string }> = {
  highsec: { label: 'High-Sec', badgeClass: 'text-cyan-400 bg-cyan-900/25 border-cyan-700/30',   color: '#22d3ee' },
  lowsec:  { label: 'Low-Sec',  badgeClass: 'text-amber-400 bg-amber-900/20 border-amber-700/30', color: '#fbbf24' },
  nullsec: { label: 'Null-Sec', badgeClass: 'text-rose-400 bg-rose-900/20 border-rose-700/30',   color: '#f43f5e' },
};

// ─── Yield preview row ─────────────────────────────────────────────────────

function YieldPreview({ oreId }: { oreId: string }) {
  const state = useGameStore(s => s.state);
  const preview = getBatchYieldPreview(state, oreId);
  const efficiency = getReprocessingEfficiency(state);

  return (
    <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
      100 {RESOURCE_REGISTRY[oreId]?.name ?? oreId} →{' '}
      <span className="text-slate-400">{preview}</span>
      {' '}
      <StatTooltip modifierKey="reprocessing-efficiency">
        <span className="text-cyan-600 cursor-help border-b border-dotted border-cyan-800">
          ×{efficiency.toFixed(2)} eff
        </span>
      </StatTooltip>
    </div>
  );
}

// ─── Auto-Refinery card ────────────────────────────────────────────────────

function AutoRefineryCard({ oreId }: { oreId: string }) {
  const state            = useGameStore(s => s.state);
  const toggleAuto       = useGameStore(s => s.toggleAutoReprocess);
  const setThreshold     = useGameStore(s => s.setAutoThreshold);

  const beltDef  = Object.values(ORE_BELTS).find(b => b.outputs.some(o => o.resourceId === oreId));
  const tier     = (beltDef?.securityTier ?? 'highsec') as OreSecurityTier;
  const cfg      = TIER_CONFIG[tier];
  const resName  = RESOURCE_REGISTRY[oreId]?.name ?? oreId;
  const enabled  = state.systems.reprocessing.autoTargets?.[oreId] ?? false;
  const threshold = state.systems.reprocessing.autoThreshold?.[oreId] ?? 0;
  const have     = state.resources[oreId] ?? 0;
  const hasYield = !!ORE_YIELD_TABLE[oreId];

  if (!hasYield) return null;

  return (
    <div
      className={`rounded-xl border transition-all p-3 ${
        enabled
          ? 'border-cyan-700/40 bg-cyan-950/20'
          : 'border-slate-700/30 bg-slate-900/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-bold text-slate-100">{resName}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${cfg.badgeClass}`}>
              {cfg.label}
            </span>
          </div>
          <div className="text-[10px] text-slate-500">
            In inventory: <span className="text-slate-300 font-mono">{formatResourceAmount(have, 0)}</span>
          </div>
          <YieldPreview oreId={oreId} />

          {/* Threshold slider */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[9px] text-slate-600 shrink-0">Keep</span>
            <input
              type="number"
              min={0}
              step={100}
              value={threshold}
              onChange={e => setThreshold(oreId, Number(e.target.value))}
              className="w-20 text-[10px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-1.5 py-0.5 text-slate-300 focus:outline-none focus:border-cyan-700/50"
            />
            <span className="text-[9px] text-slate-600">units min</span>
          </div>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => toggleAuto(oreId)}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
            enabled
              ? 'bg-rose-900/40 border-rose-600/50 text-rose-300 hover:bg-rose-800/50'
              : 'bg-cyan-900/30 border-cyan-700/40 text-cyan-300 hover:bg-cyan-800/40'
          }`}
        >
          {enabled ? 'Stop' : 'Auto'}
        </button>
      </div>
    </div>
  );
}

// ─── Manual queue ──────────────────────────────────────────────────────────

function ManualQueue() {
  const state        = useGameStore(s => s.state);
  const queueRepr    = useGameStore(s => s.queueReprocessing);
  const cancelJob    = useGameStore(s => s.cancelReprocessingJob);
  const [selectedOre, setSelectedOre] = useState('ferrock');
  const [amount, setAmount]           = useState(100);

  const queue = state.systems.reprocessing.queue;
  const activeJob = queue[0] ?? null;
  const progressPct = activeJob ? (activeJob.progress / BATCH_TIME_SECONDS) * 100 : 0;

  // Available ores with yield tables
  const availableOres = BELT_ORDER
    .map(bId => ORE_BELTS[bId]?.outputs[0]?.resourceId)
    .filter((id): id is string => !!id && !!ORE_YIELD_TABLE[id]);

  const handleQueue = () => {
    queueRepr(selectedOre, amount);
  };

  return (
    <div className="space-y-3">
      {/* Add to queue controls */}
      <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Add Batch</div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-slate-600">Ore type</label>
            <select
              value={selectedOre}
              onChange={e => setSelectedOre(e.target.value)}
              className="text-[10px] bg-slate-800/60 border border-slate-700/40 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-cyan-700/50"
            >
              {availableOres.map(id => (
                <option key={id} value={id}>{RESOURCE_REGISTRY[id]?.name ?? id}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-slate-600">Amount (min {BATCH_SIZE_BASE})</label>
            <input
              type="number"
              min={BATCH_SIZE_BASE}
              step={BATCH_SIZE_BASE}
              value={amount}
              onChange={e => setAmount(Math.max(BATCH_SIZE_BASE, Number(e.target.value)))}
              className="w-24 text-[10px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-1.5 py-1 text-slate-300 focus:outline-none focus:border-cyan-700/50"
            />
          </div>
          <button
            onClick={handleQueue}
            disabled={(state.resources[selectedOre] ?? 0) < BATCH_SIZE_BASE}
            className="px-3 py-1 rounded-lg text-xs font-bold border border-cyan-700/40 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-800/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Queue
          </button>
        </div>
        {selectedOre && (
          <div className="mt-2 text-[10px] text-slate-600">
            Have: <span className="text-slate-400 font-mono">{formatResourceAmount(state.resources[selectedOre] ?? 0, 0)}</span>
            {' · '}
            <YieldPreview oreId={selectedOre} />
          </div>
        )}
      </div>

      {/* Active job */}
      {activeJob && (
        <div className="rounded-xl border border-violet-700/30 bg-violet-950/15 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Processing</div>
            <span className="text-[10px] font-mono text-slate-400">
              {Math.ceil(BATCH_TIME_SECONDS - activeJob.progress)}s left
            </span>
          </div>
          <div className="text-xs text-slate-300 mb-2">
            {formatResourceAmount(activeJob.amount, 0)} {RESOURCE_REGISTRY[activeJob.oreId]?.name ?? activeJob.oreId}
            {activeJob.isAuto && <span className="ml-1.5 text-[9px] text-slate-600">[auto]</span>}
          </div>
          <FlairProgressBar value={progressPct / 100} color="violet" />
        </div>
      )}

      {/* Queue list */}
      {queue.length > 1 && (
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">
            Queue ({queue.length - 1} pending)
          </div>
          <div className="space-y-1">
            {queue.slice(1).map((job, idx) => (
              <div key={idx} className="flex items-center justify-between py-1 border-t border-slate-800/60 first:border-t-0">
                <span className="text-[10px] text-slate-400">
                  {formatResourceAmount(job.amount, 0)} {RESOURCE_REGISTRY[job.oreId]?.name ?? job.oreId}
                  {job.isAuto && <span className="ml-1 text-[9px] text-slate-600">[auto]</span>}
                </span>
                <button
                  onClick={() => cancelJob(idx + 1)}
                  className="text-[10px] text-slate-600 hover:text-rose-400 transition-colors px-1.5"
                  title="Cancel (50% ore refund)"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {queue.length === 0 && (
        <div className="text-center text-[10px] text-slate-700 py-4">
          No batches queued. Add ore above or enable auto-refinery.
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function ReprocessingPanel() {
  const unlocked = useGameStore(s => s.state.unlocks['system-reprocessing']);

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-2xl mb-3">⚗️</div>
        <div className="text-slate-400 text-sm font-bold mb-1">Reprocessing Locked</div>
        <div className="text-slate-600 text-xs max-w-xs">
          Train the <span className="text-violet-400">Reprocessing</span> skill to unlock ore-to-mineral conversion.
        </div>
      </div>
    );
  }

  // All ore IDs that have a yield table
  const oreIds = BELT_ORDER
    .map(bId => ORE_BELTS[bId]?.outputs[0]?.resourceId)
    .filter((id): id is string => !!id && !!ORE_YIELD_TABLE[id]);

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-lg font-bold text-slate-100 tracking-tight">Reprocessing Facility</h2>
          {(() => {
            const state = useGameStore.getState().state;
            const eff = getReprocessingEfficiency(state);
            const { grade, color } = efficiencyGrade(eff);
            return (
              <span
                className="text-sm font-black px-2 py-0.5 rounded border font-mono"
                style={{ color, background: `${color}18`, border: `1px solid ${color}44` }}
                title={`Efficiency: ${(eff * 100).toFixed(1)}%`}
              >
                {grade}
              </span>
            );
          })()}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Convert raw ores into refined minerals. Efficiency scales with the{' '}
          <StatTooltip modifierKey="reprocessing-efficiency">
            <span className="text-cyan-500 border-b border-dotted border-cyan-800 cursor-help">
              Reprocessing Efficiency
            </span>
          </StatTooltip>{' '}
          modifier. Train <NavTag entityType="skill" entityId="reprocessing" label="Reprocessing" /> to improve yield.
        </p>
      </div>

      {/* ── Auto-Refinery ── */}
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3">
          Auto-Refinery
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {oreIds.map(id => (
            <AutoRefineryCard key={id} oreId={id} />
          ))}
        </div>
      </div>

      {/* ── Manual Queue ── */}
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3">
          Manual Queue
        </div>
        <ManualQueue />
      </div>
    </div>
  );
}
