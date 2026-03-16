import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { MANUFACTURING_RECIPES } from '@/game/systems/manufacturing/manufacturing.config';
import { ORE_BELTS } from '@/game/systems/mining/mining.config';
import { getMiningSkillMultiplier, getOreHoldCapacity, getOreHoldUsed, getHaulIntervalSeconds } from '@/game/systems/mining/mining.logic';
import { getManufacturingSpeedMultiplier } from '@/game/systems/manufacturing/manufacturing.logic';
import { FlairProgressBar } from '@/ui/components/FlairProgressBar';
import { useResourceRates } from '@/game/hooks/useResourceRates';
import { formatCredits, formatResourceAmount, RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { activeTrainingEta, formatTrainingEta } from '@/game/systems/skills/skills.logic';
import { skillTrainingSeconds } from '@/game/balance/constants';
import type { AnomalyType } from '@/types/game.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d}d ${h}h`;
}

function fmtSec(s: number): string {
  if (s < 60)   return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ─── Pilot card ───────────────────────────────────────────────────────────────

function PilotCard() {
  const state  = useGameStore(s => s.state);
  const rename = useGameStore(s => s.renamePilot);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const age      = Date.now() - state.pilot.birthdate;
  const credits  = state.resources['credits'] ?? 0;
  const totalSkillLevels = Object.values(state.systems.skills.levels).reduce((a, b) => a + b, 0);

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== state.pilot.name) rename(trimmed);
    setEditing(false);
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.95) 0%, rgba(34,211,238,0.04) 100%)',
        border: '1px solid rgba(34,211,238,0.15)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar placeholder */}
          <div
            className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-lg font-bold"
            style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee' }}
          >
            {state.pilot.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            {editing ? (
              <input
                autoFocus
                className="bg-transparent border-b border-cyan-500 text-white text-sm font-bold focus:outline-none w-40"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
                maxLength={40}
              />
            ) : (
              <button
                className="text-white font-bold text-base leading-tight hover:text-cyan-300 transition-colors text-left"
                onClick={() => { setDraftName(state.pilot.name); setEditing(true); }}
                title="Click to rename"
              >
                {state.pilot.name}
              </button>
            )}
            <div className="text-slate-500 text-xs mt-0.5">
              Capsuleer · {fmtDuration(age)} in space
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-amber-400 font-bold font-mono text-sm">{formatCredits(credits)}</div>
          <div className="text-slate-600 text-[10px] mt-0.5">{totalSkillLevels} skill points</div>
        </div>
      </div>
    </div>
  );
}

// ─── Active skill card ────────────────────────────────────────────────────────

function ActiveSkillCard() {
  const skillsState = useGameStore(s => s.state.systems.skills);
  const [, forceUpdate] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    timerRef.current = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  if (!skillsState.activeSkillId) {
    return (
      <div
        className="rounded-xl p-4 text-center"
        style={{ background: 'rgba(3,8,20,0.6)', border: '1px dashed rgba(255,255,255,0.08)' }}
      >
        <p className="text-slate-600 text-xs">No skill training active. Open Skills to add skills to queue.</p>
      </div>
    );
  }

  const def   = SKILL_DEFINITIONS[skillsState.activeSkillId];
  const level = (skillsState.levels[skillsState.activeSkillId] ?? 0) + 1;
  const total = def ? skillTrainingSeconds(def.rank, level) : 1;
  const pct   = Math.min(1, skillsState.activeProgress / total);
  const eta   = activeTrainingEta(skillsState);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2.5"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.95), rgba(34,211,238,0.04))',
        border: '1px solid rgba(34,211,238,0.18)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] text-cyan-400 uppercase tracking-widest mb-0.5 font-bold">⚡ Training</div>
          <div className="text-white font-bold text-sm">{def?.name ?? skillsState.activeSkillId}</div>
          <div className="text-slate-400 text-xs">Level {level - 1} → {level}</div>
        </div>
        <div className="text-right">
          <div className="text-cyan-400 font-bold font-mono text-sm">{formatTrainingEta(eta)}</div>
          <div className="text-slate-600 text-[10px]">{(pct * 100).toFixed(1)}%</div>
        </div>
      </div>
      <FlairProgressBar value={pct} color="cyan" />
      {skillsState.queue.length > 0 && (
        <div className="text-slate-600 text-xs">
          +{skillsState.queue.length} skill{skillsState.queue.length !== 1 ? 's' : ''} queued
        </div>
      )}
    </div>
  );
}

// ─── Mining card ──────────────────────────────────────────────────────────────

function MiningCard() {
  const state  = useGameStore(s => s.state);
  const rates  = useResourceRates();
  const mult   = getMiningSkillMultiplier(state);

  const activeBelts = Object.entries(state.systems.mining.targets)
    .filter(([, v]) => v)
    .map(([id]) => id);

  // Ore hold stats
  const holdCapacity = getOreHoldCapacity(state);
  const holdUsed     = getOreHoldUsed(state);
  const holdPct      = holdCapacity > 0 ? Math.min(100, (holdUsed / holdCapacity) * 100) : 0;
  const haulInterval = getHaulIntervalSeconds(state);
  const nextHaulMs   = state.systems.mining.lastHaulAt + haulInterval * 1000;
  const secToHaul    = Math.max(0, Math.ceil((nextHaulMs - state.lastUpdatedAt) / 1000));

  // Collect ore output rates
  const oreRates: Record<string, number> = {};
  for (const [beltId, isActive] of Object.entries(state.systems.mining.targets)) {
    if (!isActive) continue;
    const def = ORE_BELTS[beltId];
    if (!def) continue;
    for (const o of def.outputs) {
      oreRates[o.resourceId] = (oreRates[o.resourceId] ?? 0) + (rates[o.resourceId] ?? o.baseRate * mult);
    }
  }

  // Lifetime totals
  const topLifetime = Object.entries(state.systems.mining.lifetimeProduced)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: 'rgba(3,8,20,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">⛏ Mining</div>
        <span className="text-xs font-mono text-cyan-400">×{mult.toFixed(2)} yield</span>
      </div>

      {/* Ore hold summary */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-slate-600">Ore Hold</span>
          <span className="text-[9px] font-mono text-slate-500">
            {formatResourceAmount(holdUsed, 0)} / {formatResourceAmount(holdCapacity, 0)} · haul in {secToHaul}s
          </span>
        </div>
        <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              holdPct >= 95 ? 'bg-rose-500' : holdPct >= 70 ? 'bg-amber-500' : 'bg-cyan-600'
            }`}
            style={{ width: `${holdPct}%` }}
          />
        </div>
      </div>

      {activeBelts.length === 0 ? (
        <p className="text-slate-600 text-xs italic">No belts active. Open Mining to start extraction.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {activeBelts.map(beltId => {
            const def = ORE_BELTS[beltId];
            if (!def) return null;
            return (
              <div key={beltId} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                <span className="text-slate-300 flex-1 truncate">{def.name}</span>
                <div className="flex gap-1">
                  {def.outputs.map(o => (
                    <span key={o.resourceId} className="text-cyan-300 font-mono">
                      +{(oreRates[o.resourceId] ?? 0).toFixed(2)}/s
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {topLifetime.length > 0 && (
        <div className="pt-2 flex flex-col gap-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Lifetime extracted</div>
          {topLifetime.map(([id, amount]) => (
            <div key={id} className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 flex-1">{RESOURCE_REGISTRY[id]?.name ?? id}</span>
              <span className="text-slate-400 font-mono">{formatResourceAmount(amount, 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Manufacturing card ────────────────────────────────────────────────────────

function ManufacturingCard() {
  const state      = useGameStore(s => s.state);
  const slowMult   = getManufacturingSpeedMultiplier(state);
  const { queue }  = state.systems.manufacturing;
  const job        = queue[0];
  const recipe     = job ? MANUFACTURING_RECIPES[job.recipeId] : null;

  const totalCompleted = Object.values(state.systems.manufacturing.completedCount).reduce((a, b) => a + b, 0);

  if (!state.unlocks['system-manufacturing']) {
    return (
      <div
        className="rounded-xl p-4 flex flex-col gap-2"
        style={{ background: 'rgba(3,8,20,0.7)', border: '1px solid rgba(255,255,255,0.07)', opacity: 0.5 }}
      >
        <div className="text-[10px] text-slate-500 uppercase tracking-widest">🏭 Manufacturing</div>
        <p className="text-slate-600 text-xs italic">Locked — train Industry I to unlock.</p>
      </div>
    );
  }

  if (!job || !recipe) {
    return (
      <div
        className="rounded-xl p-4 flex flex-col gap-2"
        style={{ background: 'rgba(3,8,20,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">🏭 Manufacturing</div>
          <span className="text-xs font-mono text-violet-400">×{slowMult.toFixed(2)} speed</span>
        </div>
        <p className="text-slate-600 text-xs italic">Queue is empty.</p>
        {totalCompleted > 0 && (
          <div className="text-[10px] text-slate-600">{totalCompleted} items produced all time</div>
        )}
      </div>
    );
  }

  const totalTime   = recipe.timeCost * job.quantity;
  const progressPct = totalTime > 0 ? job.progress / totalTime : 0;
  const remaining   = Math.max(0, totalTime - job.progress) / Math.max(slowMult, 0.001);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: 'rgba(3,8,20,0.7)', border: '1px solid rgba(167,139,250,0.15)' }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest">🏭 Manufacturing</div>
        <span className="text-xs font-mono text-violet-400">{queue.length} job{queue.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex items-center justify-between text-xs gap-2">
        <div>
          <div className="text-white font-bold">{recipe.name}</div>
          <div className="text-slate-500">×{job.quantity} batch</div>
        </div>
        <span className="text-violet-300 font-mono">{fmtSec(remaining)}</span>
      </div>
      <FlairProgressBar value={progressPct} color="violet" />
      {totalCompleted > 0 && (
        <div className="text-[10px] text-slate-600">{totalCompleted} items produced all time</div>
      )}
    </div>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow() {
  const state = useGameStore(s => s.state);

  const skillsLearned   = Object.values(state.systems.skills.levels).filter(l => l > 0).length;
  const maxSkillLevel   = Math.max(0, ...Object.values(state.systems.skills.levels));
  const totalMined      = Object.values(state.systems.mining.lifetimeProduced).reduce((a, b) => a + b, 0);
  const activeBelts     = Object.values(state.systems.mining.targets).filter(Boolean).length;

  const stats = [
    { label: 'Skills Known',    value: skillsLearned.toString(),          color: '#22d3ee' },
    { label: 'Highest Level',   value: maxSkillLevel > 0 ? `Lv ${maxSkillLevel}` : '—', color: '#22d3ee' },
    { label: 'Ore Mined',       value: formatResourceAmount(totalMined, 0), color: '#fbbf24' },
    { label: 'Active Belts',    value: activeBelts.toString(),            color: '#fbbf24' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {stats.map(s => (
        <div
          key={s.label}
          className="rounded-lg px-3 py-2.5 flex flex-col"
          style={{ background: 'rgba(3,8,20,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Discoveries card ────────────────────────────────────────────────────────

function anomalyIcon(type: AnomalyType): string {
  switch (type) {
    case 'ore-pocket':  return '◆';
    case 'data-site':   return '⬡';
    case 'relic-site':  return '⧖';
    case 'combat-site': return '☩';
    case 'wormhole':    return '⊕';
  }
}

function anomalyColor(type: AnomalyType): string {
  switch (type) {
    case 'ore-pocket':  return 'text-cyan-400';
    case 'data-site':   return 'text-violet-400';
    case 'relic-site':  return 'text-amber-400';
    case 'combat-site': return 'text-red-400';
    case 'wormhole':    return 'text-purple-400';
  }
}

function DiscoveriesCard() {
  const discoveries = useGameStore(s => s.state.systems.fleet.discoveries ?? []);
  if (discoveries.length === 0) return null;

  const recent = discoveries.slice(0, 8);

  function timeAgo(ms: number): string {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  return (
    <div className="panel-card">
      <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">⊕ Recent Discoveries</h3>
      <div className="flex flex-col gap-1.5">
        {recent.map(entry => (
          <div key={entry.id} className="flex items-center gap-2 py-1 border-b border-slate-800/50 last:border-0">
            <span className={`text-[10px] shrink-0 ${anomalyColor(entry.anomalyType)}`}>
              {anomalyIcon(entry.anomalyType)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[9px] text-slate-300 truncate">{entry.anomalyName}</span>
                <span className="text-[8px] text-slate-600 shrink-0">{timeAgo(entry.timestamp)}</span>
              </div>
              <span className="text-[8px] text-slate-500">{entry.systemName}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Combat log card ─────────────────────────────────────────────────────────

function CombatLogCard() {
  const combatLog = useGameStore(s => s.state.systems.fleet.combatLog ?? []);
  if (combatLog.length === 0) return null;

  const recent = combatLog.slice(0, 10);

  function timeAgo(ms: number): string {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  return (
    <div className="panel-card">
      <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">⚔ Recent Combat</h3>
      <div className="flex flex-col gap-1.5">
        {recent.map(entry => (
          <div key={entry.id} className="flex items-start gap-2 py-1 border-b border-slate-800/50 last:border-0">
            <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 font-semibold ${
              entry.victory ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'
            }`}>
              {entry.victory ? 'WIN' : 'LOSS'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[9px] text-slate-300 truncate">{entry.npcName}</span>
                <span className="text-[8px] text-slate-600 shrink-0">{timeAgo(entry.timestamp)}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-[8px] text-slate-500">{entry.systemName}</span>
                {entry.victory && entry.bountyEarned > 0 && (
                  <span className="text-[8px] text-amber-300/80">+{entry.bountyEarned.toLocaleString()} ISK</span>
                )}
                {entry.victory && Object.keys(entry.lootGained).length > 0 && (
                  <span className="text-[8px] text-cyan-300/70" title={Object.entries(entry.lootGained).map(([r, q]) => `${r}: ${q}`).join(', ')}>
                    +{Object.keys(entry.lootGained).length} loot
                  </span>
                )}
                <span className={`text-[8px] ${entry.avgHullDamage > 30 ? 'text-rose-400/70' : 'text-slate-600'}`}>
                  {Math.round(entry.avgHullDamage)}% hull dmg
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function OverviewPanel() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="panel-header">📊 Pilot Overview</h2>

      <PilotCard />
      <ActiveSkillCard />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MiningCard />
        <ManufacturingCard />
      </div>

      <StatsRow />
      <DiscoveriesCard />
      <CombatLogCard />
    </div>
  );
}

