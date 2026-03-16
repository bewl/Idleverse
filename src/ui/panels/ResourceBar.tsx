import { type ReactNode, type CSSProperties } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { RESOURCES_BY_TIER, RESOURCE_REGISTRY, formatResourceAmount, formatCredits } from '@/game/resources/resourceRegistry';
import { useResourceRates } from '@/game/hooks/useResourceRates';
import { MANUFACTURING_RECIPES } from '@/game/systems/manufacturing/manufacturing.config';
import { getManufacturingSpeedMultiplier } from '@/game/systems/manufacturing/manufacturing.logic';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { activeTrainingEta, formatTrainingEta } from '@/game/systems/skills/skills.logic';
import { skillTrainingSeconds } from '@/game/balance/constants';
import { GameTooltip } from '@/ui/components/GameTooltip';

// ─── Design tokens ─────────────────────────────────────────────────────────

const TIER_COLOR: Record<number, string> = {
  1: '#fbbf24', // amber for tier 1 (ores + currency)
  2: '#22d3ee', // cyan for minerals
  3: '#a78bfa', // violet for components
  4: '#fb7185', // rose for ships
  5: '#f43f5e',
};

const TIER_DOT: Record<number, string> = {
  1: 'bg-amber-400', 2: 'bg-cyan-400', 3: 'bg-violet-400', 4: 'bg-rose-400', 5: 'bg-rose-400',
};

const TIER_LABEL: Record<number, string> = {
  1: 'Ore', 2: 'Mineral', 3: 'Component', 4: 'Ship', 5: 'Exotic',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRate(r: number): { str: string; pos: boolean } | null {
  const abs = Math.abs(r);
  if (abs < 0.001) return null;
  const arrow = r > 0 ? '↑' : '↓';
  let n: string;
  if (abs >= 1000)    n = `${(abs / 1000).toFixed(1)}k`;
  else if (abs >= 10) n = abs.toFixed(1);
  else                n = abs.toFixed(2);
  return { str: `${arrow}${n}/s`, pos: r > 0 };
}

function fmtSec(s: number): string {
  if (s < 0) s = 0;
  if (s < 60)   return `${Math.ceil(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ─── Inline mini-bar ─────────────────────────────────────────────────────────

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="hud-minibar-track">
      <div className="hud-minibar-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── DataRow ─────────────────────────────────────────────────────────────────

function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-mono tabular-nums">{children}</span>
    </>
  );
}

// ─── Resource chip ────────────────────────────────────────────────────────────

interface ResChipProps { name: string; amount: number; rate: number; tier: number; precision: number; description: string; }

function ResChip({ name, amount, rate, tier, precision, description }: ResChipProps) {
  const r  = fmtRate(rate);
  const tc = TIER_COLOR[tier] ?? TIER_COLOR[1];

  return (
    <GameTooltip content={
      <div className="flex flex-col gap-0">
        <div
          className="flex items-center gap-2 -mx-2.5 -mt-2 mb-2.5 px-3 py-2 rounded-t"
          style={{ background: `${tc}14`, borderBottom: `1px solid ${tc}2a` }}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${TIER_DOT[tier] ?? TIER_DOT[1]}`} />
          <span className="text-slate-100 font-bold text-[11px]">{name}</span>
          <span className="ml-auto text-[9px] uppercase tracking-widest" style={{ color: `${tc}cc` }}>
            {TIER_LABEL[tier]}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-[11px] mb-2">
          <DataRow label="Amount">
            <span className="text-slate-200">{formatResourceAmount(amount, precision)}</span>
          </DataRow>
          {r && (
            <DataRow label="Rate">
              <span className={r.pos ? 'text-emerald-400' : 'text-red-400'}>{r.str}</span>
            </DataRow>
          )}
        </div>
        <div className="text-[10px] text-slate-600 leading-relaxed pt-1.5" style={{ borderTop: `1px solid ${tc}1e` }}>
          {description}
        </div>
      </div>
    }>
      <div className="hud-chip" style={{ '--tier-color': tc } as CSSProperties}>
        <span className="text-[9px] text-slate-500/80 uppercase tracking-[0.07em] leading-none select-none">
          {name}
        </span>
        <span className="text-[11px] font-bold text-slate-100 font-mono tabular-nums leading-none">
          {formatResourceAmount(amount, precision)}
        </span>
        {r && (
          <span className={`text-[9px] font-mono tabular-nums leading-none ${r.pos ? 'text-emerald-400/90' : 'text-red-400/80'}`}>
            {r.str}
          </span>
        )}
      </div>
    </GameTooltip>
  );
}

// ─── ISK Chip ─────────────────────────────────────────────────────────────────

function IskChip() {
  const credits = useGameStore(s => s.state.resources['credits'] ?? 0);
  const rate    = useResourceRates()['credits'] ?? 0;
  const r       = fmtRate(rate);

  return (
    <div
      className="hud-chip"
      style={{ '--tier-color': '#fbbf24' } as CSSProperties}
    >
      <span className="text-[9px] text-amber-500/80 uppercase tracking-[0.07em] leading-none select-none font-bold">
        ISK
      </span>
      <span className="text-[11px] font-bold font-mono tabular-nums leading-none"
        style={{ color: '#fbbf24' }}>
        {formatCredits(credits)}
      </span>
      {r && (
        <span className={`text-[9px] font-mono tabular-nums leading-none ${r.pos ? 'text-emerald-400/90' : 'text-red-400/80'}`}>
          {r.str}
        </span>
      )}
    </div>
  );
}

// ─── Active Skill Pill ────────────────────────────────────────────────────────

function ActiveSkillPill() {
  const skillsState = useGameStore(s => s.state.systems.skills);
  if (!skillsState.activeSkillId) return null;

  const def   = SKILL_DEFINITIONS[skillsState.activeSkillId];
  const level = (skillsState.levels[skillsState.activeSkillId] ?? 0) + 1;
  const total = def ? skillTrainingSeconds(def.rank, level) : 1;
  const pct   = Math.min(100, Math.round((skillsState.activeProgress / total) * 100));
  const eta   = activeTrainingEta(skillsState);

  return (
    <GameTooltip pinnable width={270} content={
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid rgba(30,41,59,0.6)' }}>
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-slate-100 font-bold text-[11px] uppercase tracking-wider">Skill Training</span>
          <span className="ml-auto text-cyan-300/60 font-mono text-[10px]">{skillsState.queue.length + 1} skill{(skillsState.queue.length + 1) !== 1 ? 's' : ''}</span>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-500">Skill</span>
            <span className="text-cyan-200 font-medium">{def?.name ?? skillsState.activeSkillId} Lv{level}</span>
          </div>
          <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full bg-cyan-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] mt-1">
            <span className="text-cyan-300 font-mono">{pct}%</span>
            <span className="text-slate-500">{formatTrainingEta(eta)} remaining</span>
          </div>
        </div>
        {skillsState.queue.length > 0 && (
          <div className="pt-1" style={{ borderTop: '1px solid rgba(30,41,59,0.5)' }}>
            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1.5">Up Next</div>
            {skillsState.queue.slice(0, 4).map((entry, i) => {
              const d = SKILL_DEFINITIONS[entry.skillId];
              return (
                <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                  <span className="text-slate-600 font-mono w-4 text-center">{i + 2}.</span>
                  <span className="text-slate-400 flex-1 truncate">{d?.name ?? entry.skillId}</span>
                  <span className="text-cyan-400/60 font-mono shrink-0">→{entry.targetLevel}</span>
                </div>
              );
            })}
            {skillsState.queue.length > 4 && (
              <div className="text-slate-600 text-[10px] text-center mt-1">+{skillsState.queue.length - 4} more</div>
            )}
          </div>
        )}
      </div>
    }>
      <div className="hud-pill" style={{ '--pill-accent': 'rgba(34,211,238,0.6)' } as CSSProperties}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-cyan-400 animate-pulse" />
        <span className="text-[8px] text-slate-500 uppercase tracking-[0.14em] select-none">Training</span>
        <span className="text-slate-700/50 text-[8px] mx-0.5 select-none">·</span>
        <span className="font-mono text-[10px] text-cyan-200 truncate max-w-[72px]">{def?.name ?? skillsState.activeSkillId}</span>
        <MiniBar pct={pct} color="#06b6d4" />
        <span className="font-mono text-[10px] tabular-nums text-cyan-300">{pct}%</span>
        <span className="text-slate-700 text-[8px] ml-0.5 select-none">▾</span>
      </div>
    </GameTooltip>
  );
}

// ─── Manufacturing Pill ───────────────────────────────────────────────────────

function ManufacturingPill() {
  const gameState = useGameStore(s => s.state);
  const mfg       = gameState.systems.manufacturing;
  const job       = mfg.queue[0];
  if (!job) return null;
  const recipe    = MANUFACTURING_RECIPES[job.recipeId];
  if (!recipe) return null;

  const speedMult = getManufacturingSpeedMultiplier(gameState);
  const total     = (recipe.timeCost * job.quantity) / speedMult;
  const pct       = Math.min(100, Math.round((job.progress / total) * 100));
  const remaining = Math.max(0, total - job.progress);
  const queueRest = mfg.queue.slice(1, 5);

  return (
    <GameTooltip pinnable width={300} content={
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid rgba(30,41,59,0.6)' }}>
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          <span className="text-slate-100 font-bold text-[11px] uppercase tracking-wider">Manufacturing</span>
          <span className="ml-auto text-violet-300/60 font-mono text-[10px]">{mfg.queue.length} job{mfg.queue.length !== 1 ? 's' : ''}</span>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-500">Producing</span>
            <span className="text-violet-200">{recipe.name} <span className="text-slate-500">×{job.quantity}</span></span>
          </div>
          <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] mt-1">
            <span className="text-violet-300 font-mono">{pct}%</span>
            <span className="text-slate-500">{fmtSec(remaining)} left</span>
          </div>
        </div>
        {queueRest.length > 0 && (
          <div className="pt-1" style={{ borderTop: '1px solid rgba(30,41,59,0.5)' }}>
            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1.5">Up Next</div>
            {queueRest.map((qj, i) => {
              const qr = MANUFACTURING_RECIPES[qj.recipeId];
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600 font-mono w-4">{i + 2}.</span>
                  <span className="text-slate-400 flex-1 truncate">{qr?.name ?? qj.recipeId}</span>
                  <span className="text-slate-600 shrink-0 font-mono">×{qj.quantity}</span>
                </div>
              );
            })}
            {mfg.queue.length > 5 && (
              <div className="text-slate-600 text-[10px] text-center mt-1">+{mfg.queue.length - 5} more</div>
            )}
          </div>
        )}
      </div>
    }>
      <div className="hud-pill" style={{ '--pill-accent': 'rgba(167,139,250,0.5)' } as CSSProperties}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-violet-400" />
        <span className="text-[8px] text-slate-500 uppercase tracking-[0.14em] select-none">Manuf</span>
        <span className="text-slate-700/50 text-[8px] mx-0.5 select-none">·</span>
        <span className="font-mono text-[10px] text-violet-200 truncate max-w-[68px]">{recipe.name}</span>
        <span className="text-slate-600 text-[9px] shrink-0">×{job.quantity}</span>
        <MiniBar pct={pct} color="#8b5cf6" />
        <span className="font-mono text-[10px] tabular-nums text-violet-300">{pct}%</span>
        <span className="text-slate-700 text-[8px] ml-0.5 select-none">▾</span>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid rgba(30,41,59,0.6)' }}>
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          <span className="text-slate-100 font-bold text-[11px] uppercase tracking-wider">Manufacturing</span>
          <span className="ml-auto text-violet-300/60 font-mono text-[10px]">{mfg.queue.length} job{mfg.queue.length !== 1 ? 's' : ''}</span>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-500">Producing</span>
            <span className="text-violet-200">{recipe.name} <span className="text-slate-500">×{job.quantity}</span></span>
          </div>
          <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] mt-1">
            <span className="text-violet-300 font-mono">{pct}%</span>
            <span className="text-slate-500">{fmtSec(remaining)} left</span>
          </div>
        </div>
        {queueRest.length > 0 && (
          <div className="pt-1" style={{ borderTop: '1px solid rgba(30,41,59,0.5)' }}>
            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1.5">Up Next</div>
            {queueRest.map((qj, i) => {
              const qr = MANUFACTURING_RECIPES[qj.recipeId];
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600 font-mono w-4">{i + 2}.</span>
                  <span className="text-slate-400 flex-1 truncate">{qr?.name ?? qj.recipeId}</span>
                  <span className="text-slate-600 shrink-0 font-mono">×{qj.quantity}</span>
                </div>
              );
            })}
            {mfg.queue.length > 5 && (
              <div className="text-slate-600 text-[10px] text-center mt-1">+{mfg.queue.length - 5} more</div>
            )}
          </div>
        )}
      </div>
    </GameTooltip>
  );
}

// ─── Main ResourceBar ──────────────────────────────────────────────────────────

export function ResourceBar() {
  const resources = useGameStore(s => s.state.resources);
  const rates     = useResourceRates();

  // Tier 1
  const oreIds    = Object.keys(resources).filter(id => {
    const def = RESOURCE_REGISTRY[id];
    return def && def.tier === 1 && def.category !== 'currency' && (resources[id] ?? 0) > 0;
  });
  // Tier 2 — show all minerals
  const mineralIds = (RESOURCES_BY_TIER[2] ?? []).map(d => d.id);
  // Tier 3+ — only show if owned
  const higherTierIds = [3, 4, 5].flatMap(t =>
    (RESOURCES_BY_TIER[t] ?? []).filter(d => (resources[d.id] ?? 0) > 0).map(d => d.id),
  );

  const hasPills = useGameStore(s =>
    !!(s.state.systems.skills.activeSkillId || s.state.systems.manufacturing.queue[0])
  );

  return (
    <div className="hud-bar px-4 flex flex-col shrink-0" style={{ zIndex: 50 }}>
      {/* ── Row 1 — Resources ── */}
      <div
        className="flex flex-nowrap items-center gap-0.5 py-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' } as CSSProperties}
      >
        {/* ISK always first */}
        <IskChip />

        {/* Ore separator */}
        {oreIds.length > 0 && (
          <>
            <span className="w-px h-3.5 mx-2 rounded-full block shrink-0" style={{ background: 'linear-gradient(to bottom, transparent, rgba(251,191,36,0.4), transparent)' }} />
            {oreIds.map(id => {
              const def = RESOURCE_REGISTRY[id];
              if (!def) return null;
              return (
                <ResChip key={id} name={def.name} amount={resources[id] ?? 0} rate={rates[id] ?? 0}
                  tier={1} precision={def.precision} description={def.description} />
              );
            })}
          </>
        )}

        {/* Mineral separator */}
        <span className="w-px h-3.5 mx-2 rounded-full block shrink-0" style={{ background: 'linear-gradient(to bottom, transparent, rgba(34,211,238,0.4), transparent)' }} />
        {mineralIds.map(id => {
          const def = RESOURCE_REGISTRY[id];
          if (!def) return null;
          return (
            <ResChip key={id} name={def.name} amount={resources[id] ?? 0} rate={rates[id] ?? 0}
              tier={2} precision={def.precision} description={def.description} />
          );
        })}

        {/* Higher tier separator + chips */}
        {higherTierIds.length > 0 && (
          <>
            <span className="w-px h-3.5 mx-2 rounded-full block shrink-0" style={{ background: 'linear-gradient(to bottom, transparent, rgba(167,139,250,0.4), transparent)' }} />
            {higherTierIds.map(id => {
              const def = RESOURCE_REGISTRY[id];
              if (!def) return null;
              return (
                <ResChip key={id} name={def.name} amount={resources[id] ?? 0} rate={rates[id] ?? 0}
                  tier={def.tier} precision={def.precision} description={def.description} />
              );
            })}
          </>
        )}
      </div>

      {/* ── Row 2 — Active system pills ── */}
      {hasPills && (
        <div
          className="flex flex-nowrap items-center gap-1.5 py-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ borderTop: '1px solid rgba(20,30,50,0.7)', msOverflowStyle: 'none', scrollbarWidth: 'none' } as CSSProperties}
        >
          <ActiveSkillPill />
          <ManufacturingPill />
        </div>
      )}
    </div>
  );
}

