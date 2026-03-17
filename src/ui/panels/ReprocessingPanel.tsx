import { useMemo, useState, type ReactNode } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { ORE_BELTS, BELT_ORDER } from '@/game/systems/mining/mining.config';
import { RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { formatCredits, formatResourceAmount } from '@/game/resources/resourceRegistry';
import { FlairProgressBar } from '@/ui/components/FlairProgressBar';
import { ActivityBar } from '@/ui/effects/ActivityBar';
import { StatTooltip } from '@/ui/tooltip/StatTooltip';
import { NavTag } from '@/ui/components/NavTag';
import { GameDropdown, type DropdownOption } from '@/ui/components/GameDropdown';
import { PanelInfoSection } from '@/ui/components/PanelInfoSection';
import { SystemUnlockCard } from '@/ui/components/SystemUnlockCard';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import { getBatchYieldPreview, getReprocessingEfficiency, getReprocessingYield } from '@/game/systems/reprocessing/reprocessing.logic';
import { BATCH_SIZE_BASE, BATCH_TIME_SECONDS, ORE_YIELD_TABLE } from '@/game/systems/reprocessing/reprocessing.config';
import type { OreSecurityTier, ReprocessingJob } from '@/types/game.types';

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

function CommandMetric({
  label,
  value,
  meta,
  tone = 'slate',
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: 'cyan' | 'violet' | 'amber' | 'emerald' | 'slate';
}) {
  const toneClass =
    tone === 'cyan'
      ? 'text-cyan-300 border-cyan-700/30 bg-cyan-950/15'
      : tone === 'violet'
        ? 'text-violet-300 border-violet-700/30 bg-violet-950/15'
        : tone === 'amber'
          ? 'text-amber-300 border-amber-700/30 bg-amber-950/15'
          : tone === 'emerald'
            ? 'text-emerald-300 border-emerald-700/30 bg-emerald-950/15'
            : 'text-slate-300 border-slate-700/30 bg-slate-900/50';

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${toneClass}`}>
      <div className="text-[8px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-[12px] font-semibold font-mono mt-1">{value}</div>
      {meta && <div className="text-[9px] text-slate-500 mt-0.5">{meta}</div>}
    </div>
  );
}

type ForecastMineralEntry = {
  mineralId: string;
  amount: number;
  value: number;
};

type SecurityMixEntry = {
  tier: OreSecurityTier;
  label: string;
  stock: number;
  readyBatches: number;
  queuedBatches: number;
};

type RefineryLaneEntry = {
  oreId: string;
  tier: OreSecurityTier;
  stock: number;
  surplus: number;
  readyBatches: number;
  queuedAuto: number;
  queuedManual: number;
  totalQueued: number;
  enabled: boolean;
  forecastValue: number;
};

function ReprocessingAnalyticsCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 p-4">
      <div className="mb-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function ReprocessingZoneShell({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  accent: 'cyan' | 'violet';
  children: ReactNode;
}) {
  const shellClass = accent === 'cyan'
    ? 'border-cyan-800/20 bg-cyan-950/10'
    : 'border-violet-800/20 bg-violet-950/10';
  const badgeClass = accent === 'cyan'
    ? 'border-cyan-700/30 bg-cyan-950/20 text-cyan-300'
    : 'border-violet-700/30 bg-violet-950/20 text-violet-300';

  return (
    <div className={`rounded-2xl border p-4 ${shellClass}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{title}</div>
          <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{subtitle}</div>
        </div>
        <span className={`text-[8px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-widest shrink-0 ${badgeClass}`}>
          {accent === 'cyan' ? 'refinery floor' : 'throughput intel'}
        </span>
      </div>
      {children}
    </div>
  );
}

function MineralForecastCard({
  minerals,
  queuedBatches,
  readyBufferBatches,
  forecastValue,
}: {
  minerals: ForecastMineralEntry[];
  queuedBatches: number;
  readyBufferBatches: number;
  forecastValue: number;
}) {
  const maxAmount = Math.max(...minerals.map(entry => entry.amount), 1);

  return (
    <ReprocessingAnalyticsCard
      title="Mineral Forecast"
      subtitle="Projected mineral output from the live queue plus auto-refinery surplus that is ready to convert. This turns idle width into actual intake planning."
    >
      <div className="grid gap-2 sm:grid-cols-3 mb-3">
        <CommandMetric label="Queued" value={`${queuedBatches}`} meta="batches already staged" tone={queuedBatches > 0 ? 'violet' : 'slate'} />
        <CommandMetric label="Ready Buffer" value={`${readyBufferBatches}`} meta="auto batches available" tone={readyBufferBatches > 0 ? 'cyan' : 'slate'} />
        <CommandMetric label="Forecast Value" value={formatCredits(forecastValue)} meta="market-priced mineral output" tone={forecastValue > 0 ? 'emerald' : 'slate'} />
      </div>

      {minerals.length === 0 ? (
        <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-4 text-[10px] text-slate-600">
          No queued or auto-ready mineral flow yet.
        </div>
      ) : (
        <div className="space-y-2">
          {minerals.map(entry => (
            <div key={entry.mineralId} className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="text-slate-200 truncate min-w-0">{RESOURCE_REGISTRY[entry.mineralId]?.name ?? entry.mineralId}</span>
                <span className="font-mono text-cyan-300 shrink-0">{formatResourceAmount(entry.amount, 0)}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800/70">
                <div className="h-full rounded-full bg-cyan-500/70" style={{ width: `${Math.max(10, (entry.amount / maxAmount) * 100)}%` }} />
              </div>
              <div className="mt-1 text-[8px] font-mono text-slate-500">{formatCredits(entry.value)} equivalent</div>
            </div>
          ))}
        </div>
      )}
    </ReprocessingAnalyticsCard>
  );
}

function SecurityMixCard({ entries }: { entries: SecurityMixEntry[] }) {
  const maxStock = Math.max(...entries.map(entry => entry.stock), 1);

  return (
    <ReprocessingAnalyticsCard
      title="Ore Security Mix"
      subtitle="How much refinery mass currently sits in each security band, plus how much of that band is immediately convertible into queued throughput."
    >
      <div className="space-y-2">
        {entries.map(entry => {
          const cfg = TIER_CONFIG[entry.tier];
          return (
            <div key={entry.tier} className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${entry.readyBatches > 0 ? 'bg-cyan-400 animate-pulse' : entry.stock > 0 ? 'bg-amber-400/60' : 'bg-slate-600'}`} />
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-widest ${cfg.badgeClass}`}>
                    {entry.label}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-300 shrink-0">{formatResourceAmount(entry.stock, 0)} ore</div>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800/70">
                <div className="h-full rounded-full" style={{ width: `${Math.max(10, (entry.stock / maxStock) * 100)}%`, backgroundColor: `${cfg.color}bb` }} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[8px] font-mono text-slate-500">
                <span>{entry.readyBatches} ready</span>
                <span>{entry.queuedBatches} queued</span>
              </div>
            </div>
          );
        })}
      </div>
    </ReprocessingAnalyticsCard>
  );
}

function LaneReadinessCard({ lanes }: { lanes: RefineryLaneEntry[] }) {
  const maxValue = Math.max(...lanes.map(entry => entry.forecastValue), 1);

  return (
    <ReprocessingAnalyticsCard
      title="Lane Readiness"
      subtitle="The hottest refinery lanes by immediate batch depth and projected mineral value, so you can see where the next throughput pressure is coming from."
    >
      {lanes.length === 0 ? (
        <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-4 text-[10px] text-slate-600">
          No ore lanes are stocked, armed, or queued yet.
        </div>
      ) : (
        <div className="space-y-2">
          {lanes.map(entry => {
            const cfg = TIER_CONFIG[entry.tier];
            const isActive = entry.readyBatches > 0 || entry.totalQueued > 0;
            return (
              <div key={entry.oreId} className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-cyan-400 animate-pulse' : entry.enabled ? 'bg-amber-400/60' : 'bg-slate-600'}`} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-200 truncate">{RESOURCE_REGISTRY[entry.oreId]?.name ?? entry.oreId}</div>
                      <div className="text-[8px] text-slate-500 mt-0.5">{cfg.label} lane</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[8px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-widest ${cfg.badgeClass}`}>{entry.readyBatches} ready</span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded border border-violet-700/30 bg-violet-950/15 text-violet-300 font-mono uppercase tracking-widest">{entry.totalQueued} queued</span>
                  </div>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800/70">
                  <div className="h-full rounded-full bg-cyan-500/70" style={{ width: `${Math.max(10, (entry.forecastValue / maxValue) * 100)}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[8px] font-mono text-slate-500">
                  <span>surplus {formatResourceAmount(entry.surplus, 0)}</span>
                  <span>{formatCredits(entry.forecastValue)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ReprocessingAnalyticsCard>
  );
}

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
  const hasCorpHq = !!state.systems.factions.homeStationId && !!state.systems.factions.homeStationSystemId;
  const surplus = Math.max(0, have - threshold);
  const readyBatches = Math.floor(surplus / BATCH_SIZE_BASE);
  const queuedAutoBatches = state.systems.reprocessing.queue.filter(job => job.oreId === oreId && job.isAuto).length;
  const active = enabled && (queuedAutoBatches > 0 || readyBatches > 0);

  if (!hasYield) return null;

  return (
    <div
      className={`group rounded-xl border transition-all duration-200 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${
        enabled
          ? 'border-cyan-700/40 bg-cyan-950/20 hover:border-cyan-600/50 hover:bg-cyan-950/25'
          : 'border-slate-700/30 bg-slate-900/40 hover:border-slate-600/40 hover:bg-slate-900/55'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-cyan-400 animate-pulse' : enabled ? 'bg-amber-400/60' : 'bg-slate-600'}`} />
          <span className="text-sm font-bold text-slate-100 truncate">{resName}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${cfg.badgeClass}`}>
            {cfg.label}
          </span>
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-widest ${
          active ? 'text-cyan-300 border-cyan-700/30 bg-cyan-950/15' : enabled ? 'text-amber-300 border-amber-700/30 bg-amber-950/15' : 'text-slate-500 border-slate-700/30 bg-slate-900/40'
        }`}>
          {active ? 'active' : enabled ? 'armed' : 'idle'}
        </span>
      </div>

      <div className={`mb-3 rounded-lg border px-2.5 py-2 ${
        enabled
          ? 'border-cyan-700/25 bg-slate-950/35'
          : 'border-slate-700/20 bg-slate-950/25'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[8px] uppercase tracking-widest text-slate-600">Control Posture</div>
            <div className="text-[10px] text-slate-300 mt-1">
              {enabled
                ? 'Threshold armed for automatic surplus conversion.'
                : 'Manual only until this lane is armed.'}
            </div>
          </div>
          <div className={`text-[8px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-widest shrink-0 transition-colors ${
            enabled
              ? 'border-cyan-700/30 bg-cyan-950/20 text-cyan-300 group-hover:border-cyan-600/40'
              : 'border-slate-700/30 bg-slate-900/35 text-slate-500 group-hover:text-slate-400'
          }`}>
            {enabled ? 'automation live' : 'awaiting arm'}
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="grid gap-1 sm:grid-cols-2 mb-2 text-[9px]">
            <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-slate-500">
              Stock <span className="text-slate-300 font-mono ml-1">{formatResourceAmount(have, 0)}</span>
            </div>
            <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-slate-500">
              Surplus <span className="text-cyan-300 font-mono ml-1">{formatResourceAmount(surplus, 0)}</span>
            </div>
            <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-slate-500">
              Ready <span className="text-amber-300 font-mono ml-1">{readyBatches}</span>
            </div>
            <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-slate-500">
              Queued <span className="text-violet-300 font-mono ml-1">{queuedAutoBatches}</span>
            </div>
          </div>
          <YieldPreview oreId={oreId} />

          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] uppercase tracking-widest text-slate-600">Refinery Activity</span>
              <span className="text-[9px] font-mono text-slate-500">{readyBatches} staged</span>
            </div>
            <ActivityBar active={active} rate={Math.min(1, readyBatches / 5)} color={enabled ? 'cyan' : 'amber'} label="Line status" valueLabel={enabled ? `${readyBatches} staged` : 'line idle'} />
          </div>

          {/* Threshold slider */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[9px] text-slate-600 shrink-0">Keep</span>
            <input
              type="number"
              min={0}
              step={100}
              value={threshold}
              disabled={!hasCorpHq}
              onChange={e => setThreshold(oreId, Number(e.target.value))}
              className="w-20 text-[10px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-1.5 py-0.5 text-slate-300 focus:outline-none focus:border-cyan-700/50"
            />
            <span className="text-[9px] text-slate-600">units min</span>
          </div>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => toggleAuto(oreId)}
          disabled={!hasCorpHq}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed self-start min-w-[74px] ${
            enabled
              ? 'bg-rose-900/40 border-rose-600/50 text-rose-300 hover:bg-rose-800/50 hover:border-rose-500/60'
              : 'bg-cyan-900/30 border-cyan-700/40 text-cyan-300 hover:bg-cyan-800/40 hover:border-cyan-600/50'
          }`}
        >
          {enabled ? 'Stop' : 'Auto'}
        </button>
      </div>
    </div>
  );
}

function ReprocessingQueueRow({
  job,
  queueIndex,
  startsIn,
  longestWait,
  onCancel,
}: {
  job: ReprocessingJob;
  queueIndex: number;
  startsIn: number;
  longestWait: number;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const waitRatio = longestWait > 0 ? Math.max(0.1, 1 - startsIn / longestWait) : 1;
  const preview = useGameStore(s => getBatchYieldPreview(s.state, job.oreId));

  return (
    <div className="rounded-md border overflow-hidden border-slate-700/20 bg-slate-950/25">
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none hover:bg-white/[0.03] transition-colors"
        onClick={() => setExpanded(value => !value)}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400/60" />
        <span className="flex-1 min-w-0 truncate text-[11px] font-semibold text-slate-200">
          {RESOURCE_REGISTRY[job.oreId]?.name ?? job.oreId}
        </span>
        <span className="text-[9px] font-mono text-slate-500 shrink-0">x{Math.floor(job.amount / BATCH_SIZE_BASE)}</span>
        <span className="text-[9px] font-mono text-amber-300/80 shrink-0">starts {Math.round(startsIn)}s</span>
        <span className="text-[10px] text-slate-600 shrink-0">{expanded ? '▴' : '▾'}</span>
        <button
          onClick={event => { event.stopPropagation(); onCancel(); }}
          className="text-[10px] text-red-500/40 hover:text-red-300 transition-colors pl-1"
          title="Cancel queued batch"
        >
          ✕
        </button>
      </div>

      {!expanded && (
        <div className="px-2 pb-1.5 flex items-center gap-2">
          <div className="flex-1 bg-slate-800/70 rounded-full h-1 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500 bg-amber-600/60" style={{ width: `${waitRatio * 100}%` }} />
          </div>
          <span className="text-[9px] font-mono text-slate-600 shrink-0">{Math.round(job.amount / BATCH_SIZE_BASE)} batch</span>
        </div>
      )}

      {expanded && (
        <div className="flex flex-col gap-1.5 px-2 pb-2 pt-1" style={{ borderTop: '1px solid rgba(30,41,59,0.5)' }}>
          <div className="flex flex-wrap gap-1">
            <span className="text-[8px] px-1.5 py-0.5 rounded border border-slate-700/40 bg-slate-900/50 text-slate-400 font-mono uppercase tracking-widest">
              queue #{queueIndex + 1}
            </span>
            <span className="text-[8px] px-1.5 py-0.5 rounded border border-amber-700/30 bg-amber-950/15 text-amber-300 font-mono uppercase tracking-widest">
              starts {Math.round(startsIn)}s
            </span>
            {job.isAuto && (
              <span className="text-[8px] px-1.5 py-0.5 rounded border border-cyan-700/30 bg-cyan-950/15 text-cyan-300 font-mono uppercase tracking-widest">
                auto
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 leading-relaxed">
            {formatResourceAmount(job.amount, 0)} {RESOURCE_REGISTRY[job.oreId]?.name ?? job.oreId} queued for mineral conversion.
          </div>
          <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-[10px] text-slate-400">
            <span className="text-[8px] uppercase tracking-widest text-slate-600 block mb-1">Yield Preview</span>
            {preview}
          </div>
        </div>
      )}
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
  const hasCorpHq = !!state.systems.factions.homeStationId && !!state.systems.factions.homeStationSystemId;

  const queue = state.systems.reprocessing.queue;
  const activeJob = queue[0] ?? null;
  const progressPct = activeJob ? (activeJob.progress / BATCH_TIME_SECONDS) * 100 : 0;
  const longestWait = Math.max(0, (queue.length - 1) * BATCH_TIME_SECONDS);

  // Available ores with yield tables
  const availableOres = BELT_ORDER
    .map(bId => ORE_BELTS[bId]?.outputs[0]?.resourceId)
    .filter((id): id is string => !!id && !!ORE_YIELD_TABLE[id]);
  const oreOptions: DropdownOption[] = availableOres.map(id => {
    const beltDef = Object.values(ORE_BELTS).find(belt => belt.outputs.some(output => output.resourceId === id));
    const tier = (beltDef?.securityTier ?? 'highsec') as OreSecurityTier;
    const tone: DropdownOption['tone'] = tier === 'highsec' ? 'cyan' : tier === 'lowsec' ? 'amber' : 'rose';
    return {
      value: id,
      label: RESOURCE_REGISTRY[id]?.name ?? id,
      description: `${TIER_CONFIG[tier].label} ore`,
      meta: `Have ${formatResourceAmount(state.resources[id] ?? 0, 0)}`,
      group: TIER_CONFIG[tier].label,
      tone,
      badges: [{ label: `Yield ${getBatchYieldPreview(state, id)}`, color: TIER_CONFIG[tier].color }],
      keywords: [id, tier],
    };
  });

  const handleQueue = () => {
    queueRepr(selectedOre, amount);
  };

  return (
    <div className="space-y-3">
      {/* Add to queue controls */}
      <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Add Batch</div>
            <div className="text-xs text-slate-500 mt-0.5">Stage exact ore input when you want deterministic mineral timing instead of surplus-driven automation.</div>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-slate-700/30 bg-slate-950/35 text-slate-400 font-mono shrink-0">
            queue {queue.length}
          </span>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-slate-600">Ore type</label>
            <div className="min-w-[220px]">
              <GameDropdown
                value={selectedOre}
                onChange={setSelectedOre}
                options={oreOptions}
                placeholder="Select ore"
                searchPlaceholder="Find ore..."
                size="compact"
                triggerTone="cyan"
                buttonStyle={{ minHeight: 30 }}
              />
            </div>
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
            disabled={!hasCorpHq || (state.resources[selectedOre] ?? 0) < BATCH_SIZE_BASE}
            className="px-3 py-1 rounded-lg text-xs font-bold border border-cyan-700/40 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-800/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {hasCorpHq ? 'Queue' : 'HQ Required'}
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
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Processing</div>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              {Math.ceil(BATCH_TIME_SECONDS - activeJob.progress)}s left
            </span>
          </div>
          <div className="text-xs text-slate-300 mb-2">
            {formatResourceAmount(activeJob.amount, 0)} {RESOURCE_REGISTRY[activeJob.oreId]?.name ?? activeJob.oreId}
            {activeJob.isAuto && <span className="ml-1.5 text-[9px] text-slate-600">[auto]</span>}
          </div>
          <FlairProgressBar value={progressPct / 100} color="violet" label="Batch progress" valueLabel={`${Math.round(progressPct)}%`} />
          <div className="mt-2">
            <ActivityBar active rate={Math.min(1, progressPct / 100)} color="violet" label="Batch status" valueLabel={`${Math.ceil(BATCH_TIME_SECONDS - activeJob.progress)}s left`} />
          </div>
          <div className="mt-2 rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-[10px] text-slate-400">
            <span className="text-[8px] uppercase tracking-widest text-slate-600 block mb-1">Yield Preview</span>
            {getBatchYieldPreview(state, activeJob.oreId)}
          </div>
        </div>
      )}

      {/* Queue list */}
      {queue.length > 1 && (
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Queue</div>
              <div className="text-xs text-slate-500 mt-0.5">Pending batches stay compressed until you need yield and start-time detail.</div>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-violet-700/30 bg-violet-950/15 text-violet-300 font-mono shrink-0">
              {queue.length - 1} pending
            </span>
          </div>
          <div className="space-y-1">
            {queue.slice(1).map((job, idx) => (
              <ReprocessingQueueRow
                key={idx}
                job={job}
                queueIndex={idx + 1}
                startsIn={(idx + 1) * BATCH_TIME_SECONDS}
                longestWait={longestWait}
                onCancel={() => cancelJob(idx + 1)}
              />
            ))}
          </div>
        </div>
      )}

      {queue.length === 0 && (
        <div className="rounded-xl border border-slate-800/50 bg-slate-950/25 px-3 py-4 text-center text-[10px] text-slate-600">
          No batches queued. Add ore above or arm an auto-refinery lane to keep minerals flowing.
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function ReprocessingPanel() {
  const state = useGameStore(s => s.state);
  const unlocked = state.unlocks['system-reprocessing'];

  if (!unlocked) {
    return (
      <div className="py-10">
        <SystemUnlockCard
          icon="reprocessing"
          title="Reprocessing Facility"
          skillId="reprocessing"
          summary="Convert ore into minerals for higher-value sales or for manufacturing inputs. Reprocessing is the bridge between a raw mining loop and a more deliberate industrial economy."
          benefits={[
            'Refine hauled ore into minerals instead of dumping everything straight to market.',
            'Improve mineral yield over time, making the same mining volume worth more.',
            'Feed manufacturing chains directly when you want a hybrid mine-to-build playstyle.',
          ]}
          accentColor="#a78bfa"
          previewPanel="skills"
          previewLabel="Review Reprocessing Skills"
        />
      </div>
    );
  }

  // All ore IDs that have a yield table
  const oreIds = BELT_ORDER
    .map(bId => ORE_BELTS[bId]?.outputs[0]?.resourceId)
    .filter((id): id is string => !!id && !!ORE_YIELD_TABLE[id]);
  const homeSystemId = state.systems.factions.homeStationSystemId;
  const homeSystem = homeSystemId ? getSystemById(state.galaxy.seed, homeSystemId) : null;
  const homeOutpost = homeSystemId ? state.systems.factions.outposts[homeSystemId] ?? null : null;
  const queue = state.systems.reprocessing.queue;
  const activeJob = queue[0] ?? null;
  const efficiency = getReprocessingEfficiency(state);
  const { grade, color } = efficiencyGrade(efficiency);
  const autoEnabledCount = oreIds.filter(id => state.systems.reprocessing.autoTargets?.[id]).length;
  const readyAutoCount = oreIds.filter(id => {
    const threshold = state.systems.reprocessing.autoThreshold?.[id] ?? 0;
    const have = state.resources[id] ?? 0;
    return (state.systems.reprocessing.autoTargets?.[id] ?? false) && have - threshold >= BATCH_SIZE_BASE;
  }).length;
  const activeRate = Math.min(1, Math.max(queue.length / 6, readyAutoCount / Math.max(1, oreIds.length), Math.max(0, efficiency - 1)));
  const laneEntries = useMemo<RefineryLaneEntry[]>(() => {
    return oreIds
      .map(oreId => {
        const beltDef = Object.values(ORE_BELTS).find(belt => belt.outputs.some(output => output.resourceId === oreId));
        const tier = (beltDef?.securityTier ?? 'highsec') as OreSecurityTier;
        const stock = state.resources[oreId] ?? 0;
        const threshold = state.systems.reprocessing.autoThreshold?.[oreId] ?? 0;
        const enabled = state.systems.reprocessing.autoTargets?.[oreId] ?? false;
        const surplus = Math.max(0, stock - threshold);
        const readyBatches = enabled ? Math.floor(surplus / BATCH_SIZE_BASE) : 0;
        const queuedAuto = queue.filter(job => job.oreId === oreId && job.isAuto).length;
        const queuedManual = queue.filter(job => job.oreId === oreId && !job.isAuto).length;
        const totalQueued = queuedAuto + queuedManual;
        const forecastYield = getReprocessingYield(state, oreId, (readyBatches + totalQueued) * BATCH_SIZE_BASE);
        const forecastValue = Object.entries(forecastYield).reduce((sum, [mineralId, amount]) => {
          return sum + amount * (state.systems.market.prices[mineralId] ?? 0);
        }, 0);

        return {
          oreId,
          tier,
          stock,
          surplus,
          readyBatches,
          queuedAuto,
          queuedManual,
          totalQueued,
          enabled,
          forecastValue,
        };
      })
      .filter(entry => entry.stock > 0 || entry.enabled || entry.totalQueued > 0)
      .sort((left, right) => (right.readyBatches + right.totalQueued * 0.75 + right.forecastValue / 1000) - (left.readyBatches + left.totalQueued * 0.75 + left.forecastValue / 1000));
  }, [oreIds, queue, state]);
  const mineralForecast = useMemo<ForecastMineralEntry[]>(() => {
    const totals: Record<string, number> = {};

    for (const job of queue) {
      const yieldMap = getReprocessingYield(state, job.oreId, job.amount);
      for (const [mineralId, amount] of Object.entries(yieldMap)) {
        totals[mineralId] = (totals[mineralId] ?? 0) + amount;
      }
    }

    for (const entry of laneEntries) {
      if (entry.readyBatches <= 0) continue;
      const yieldMap = getReprocessingYield(state, entry.oreId, entry.readyBatches * BATCH_SIZE_BASE);
      for (const [mineralId, amount] of Object.entries(yieldMap)) {
        totals[mineralId] = (totals[mineralId] ?? 0) + amount;
      }
    }

    return Object.entries(totals)
      .map(([mineralId, amount]) => ({
        mineralId,
        amount,
        value: amount * (state.systems.market.prices[mineralId] ?? 0),
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 8);
  }, [laneEntries, queue, state]);
  const securityMix = useMemo<SecurityMixEntry[]>(() => {
    const mix: Record<OreSecurityTier, SecurityMixEntry> = {
      highsec: { tier: 'highsec', label: TIER_CONFIG.highsec.label, stock: 0, readyBatches: 0, queuedBatches: 0 },
      lowsec: { tier: 'lowsec', label: TIER_CONFIG.lowsec.label, stock: 0, readyBatches: 0, queuedBatches: 0 },
      nullsec: { tier: 'nullsec', label: TIER_CONFIG.nullsec.label, stock: 0, readyBatches: 0, queuedBatches: 0 },
    };

    for (const entry of laneEntries) {
      mix[entry.tier].stock += entry.stock;
      mix[entry.tier].readyBatches += entry.readyBatches;
      mix[entry.tier].queuedBatches += entry.totalQueued;
    }

    return Object.values(mix);
  }, [laneEntries]);
  const queuedBatches = queue.reduce((sum, job) => sum + Math.max(1, Math.floor(job.amount / BATCH_SIZE_BASE)), 0);
  const readyBufferBatches = laneEntries.reduce((sum, entry) => sum + entry.readyBatches, 0);
  const forecastValue = mineralForecast.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-lg font-bold text-slate-100 tracking-tight">Reprocessing Facility</h2>
          <span
            className="text-sm font-black px-2 py-0.5 rounded border font-mono"
            style={{ color, background: `${color}18`, border: `1px solid ${color}44` }}
            title={`Efficiency: ${(efficiency * 100).toFixed(1)}%`}
          >
            {grade}
          </span>
        </div>
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-[10px] text-slate-500 leading-relaxed">
              Live refinery control for ore intake, staged auto-batches, and mineral throughput.
            </div>
            <div className="flex gap-2 shrink-0">
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-violet-700/30 bg-violet-950/15 text-violet-300 font-mono">
                q {queue.length}/3+
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-cyan-700/30 bg-cyan-950/15 text-cyan-300 font-mono">
                auto {autoEnabledCount}
              </span>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 mb-3">
            <CommandMetric label="Efficiency" value={`x${efficiency.toFixed(2)}`} meta={`${Math.round((efficiency - 1) * 100)}% bonus`} tone="cyan" />
            <CommandMetric label="Queue" value={`${queue.length}`} meta={activeJob ? 'processing live' : 'idle'} tone={queue.length > 0 ? 'violet' : 'slate'} />
            <CommandMetric label="Auto Lines" value={`${autoEnabledCount}`} meta={readyAutoCount > 0 ? `${readyAutoCount} ready to fire` : 'none staged'} tone={autoEnabledCount > 0 ? 'amber' : 'slate'} />
            <CommandMetric label="Ore Types" value={`${oreIds.length}`} meta="processable today" tone="emerald" />
          </div>
          <ActivityBar active={queue.length > 0 || readyAutoCount > 0} rate={activeRate} color={queue.length > 0 ? 'violet' : 'cyan'} label="Refinery load" valueLabel={queue.length > 0 ? `${queue.length} staged` : `${readyAutoCount} auto-ready`} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.58fr)_minmax(340px,0.98fr)] 2xl:grid-cols-[minmax(0,1.7fr)_minmax(380px,1fr)] items-start">
        <div className="min-w-0">
          <ReprocessingZoneShell
            title="Refinery Control Surface"
            subtitle="Interactive ore lanes and batch controls live here. These cards are the actionable refinery floor, separate from the forecasting and analytics rail."
            accent="cyan"
          >
            <div className="flex flex-col gap-5 min-w-0">
              {/* ── Auto-Refinery ── */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Auto-Refinery</div>
                    <div className="text-xs text-slate-500 mt-0.5">Arm keep thresholds by ore family so surplus converts into minerals without constant manual staging.</div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-cyan-700/30 bg-cyan-950/15 text-cyan-300 font-mono shrink-0">
                    armed {autoEnabledCount}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {oreIds.map(id => (
                    <AutoRefineryCard key={id} oreId={id} />
                  ))}
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-cyan-700/20 via-slate-700/50 to-transparent" />

              {/* ── Manual Queue ── */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Manual Queue</div>
                    <div className="text-xs text-slate-500 mt-0.5">Use direct batch control when you want predictable mineral timing or to front-load a specific ore family.</div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-violet-700/30 bg-violet-950/15 text-violet-300 font-mono shrink-0">
                    staged {queue.length}
                  </span>
                </div>
                <ManualQueue />
              </div>
            </div>
          </ReprocessingZoneShell>
        </div>

        <div className="min-w-0">
          <ReprocessingZoneShell
            title="Refinery Data Stack"
            subtitle="Forecasting, ore mix, and lane-intel live here. This side is read-heavy by design so it stays visually distinct from the actionable refinery cards."
            accent="violet"
          >
            <div className="flex flex-col gap-4 min-w-0">
              <MineralForecastCard
                minerals={mineralForecast}
                queuedBatches={queuedBatches}
                readyBufferBatches={readyBufferBatches}
                forecastValue={forecastValue}
              />
              <SecurityMixCard entries={securityMix} />
              <LaneReadinessCard lanes={laneEntries.slice(0, 5)} />

              <div className="h-px bg-gradient-to-r from-violet-700/20 via-slate-700/50 to-transparent" />

              <PanelInfoSection
                sectionId="reprocessing-context"
                title="Facility Context"
                subtitle="Hide static refinery notes when you want the auto-refinery and manual queue controls near the top."
                accentColor="#a78bfa"
                defaultCollapsed
              >
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-slate-500 mt-0.5">
                    Convert raw ores into refined minerals. Efficiency scales with the{' '}
                    <StatTooltip modifierKey="reprocessing-efficiency">
                      <span className="text-cyan-500 border-b border-dotted border-cyan-800 cursor-help">
                        Reprocessing Efficiency
                      </span>
                    </StatTooltip>{' '}
                    modifier. Train <NavTag entityType="skill" entityId="reprocessing" label="Reprocessing" /> to improve yield.
                  </p>

                  <div className={`rounded-xl border px-3 py-2 text-xs ${homeSystem ? 'border-cyan-700/20 bg-cyan-950/10 text-slate-400' : 'border-amber-700/30 bg-amber-950/15 text-amber-300'}`}>
                    {homeSystem
                      ? <>Corp HQ anchored at <span className="text-cyan-300 font-semibold">{homeSystem.name}</span>. {homeOutpost ? 'Reprocessing jobs route through your outpost refinery network.' : 'Reprocessing jobs route through this station network.'}</>
                      : <>No Corp HQ registered. Dock at a station or deploy a POS core in the System panel to enable reprocessing jobs and auto-refinery controls.</>}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3 text-[10px] text-slate-400">
                    <div className="rounded-lg border border-slate-700/30 bg-slate-950/20 px-2.5 py-2">
                      <div className="text-[8px] uppercase tracking-widest text-slate-600">1. Stage</div>
                      <div className="mt-1 leading-relaxed">Queue exact ore batches manually when you need deterministic mineral output.</div>
                    </div>
                    <div className="rounded-lg border border-slate-700/30 bg-slate-950/20 px-2.5 py-2">
                      <div className="text-[8px] uppercase tracking-widest text-slate-600">2. Arm</div>
                      <div className="mt-1 leading-relaxed">Enable auto-refinery lines to consume surplus above your keep threshold.</div>
                    </div>
                    <div className="rounded-lg border border-slate-700/30 bg-slate-950/20 px-2.5 py-2">
                      <div className="text-[8px] uppercase tracking-widest text-slate-600">3. Feed</div>
                      <div className="mt-1 leading-relaxed">Reprocessing output becomes the mineral substrate for manufacturing and market sale timing.</div>
                    </div>
                  </div>
                </div>
              </PanelInfoSection>
            </div>
          </ReprocessingZoneShell>
        </div>
      </div>
    </div>
  );
}
