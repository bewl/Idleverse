import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { MANUFACTURING_RECIPES } from '@/game/systems/manufacturing/manufacturing.config';
import { getManufacturingSpeedMultiplier } from '@/game/systems/manufacturing/manufacturing.logic';
import { FlairProgressBar } from '@/ui/components/FlairProgressBar';
import { useResourceRates } from '@/game/hooks/useResourceRates';
import { formatCredits, formatResourceAmount, RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { activeTrainingEta, formatTrainingEta } from '@/game/systems/skills/skills.logic';
import { skillTrainingSeconds } from '@/game/balance/constants';
import { NavTag } from '@/ui/components/NavTag';
import { getStationInSystem } from '@/game/systems/factions/faction.logic';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import { computeFleetCargoCapacity } from '@/game/systems/fleet/fleet.logic';

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

// ─── Corp card ────────────────────────────────────────────────────────────────

function CorpCard() {
  const state  = useGameStore(s => s.state);
  const rename = useGameStore(s => s.renameCorpName);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const age      = Date.now() - state.corp.foundedAt;
  const credits  = state.resources['credits'] ?? 0;
  const totalSkillLevels = Object.values(state.systems.skills.levels).reduce((a, b) => a + b, 0);
  const fleetCount = Object.keys(state.systems.fleet.fleets).length;

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== state.corp.name) rename(trimmed);
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
          {/* Corp logo placeholder */}
          <div
            className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-lg font-bold"
            style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee' }}
          >
            {state.corp.name.charAt(0).toUpperCase()}
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
                onClick={() => { setDraftName(state.corp.name); setEditing(true); }}
                title="Click to rename"
              >
                {state.corp.name}
              </button>
            )}
            <div className="text-slate-500 text-xs mt-0.5">
              Corporation · Founded {fmtDuration(age)} ago
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-amber-400 font-bold font-mono text-sm">{formatCredits(credits)}</div>
          <div className="text-slate-600 text-[10px] mt-0.5">{fleetCount} fleet{fleetCount !== 1 ? 's' : ''} · {totalSkillLevels} SP</div>
        </div>
      </div>
    </div>
  );
}

// ─── Corp HQ card ─────────────────────────────────────────────────────────────

function CorpHQCard() {
  const state = useGameStore(s => s.state);
  const hqSystemId = state.systems.factions.homeStationSystemId;

  if (!hqSystemId) {
    return (
      <div
        className="rounded-xl p-4 text-center"
        style={{ background: 'rgba(3,8,20,0.6)', border: '1px dashed rgba(255,255,255,0.08)' }}
      >
        <p className="text-slate-600 text-xs">No Corp HQ. Open System panel and set a station as headquarters.</p>
      </div>
    );
  }

  const systemObj   = hqSystemId ? getSystemById(state.galaxy.seed, hqSystemId) : null;
  const systemIndex  = hqSystemId ? parseInt(hqSystemId.replace('sys-', ''), 10) : 0;
  const station      = hqSystemId && systemObj
    ? getStationInSystem(systemObj, state.galaxy.seed, systemIndex)
    : null;

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.95), rgba(34,211,238,0.04))',
        border: '1px solid rgba(34,211,238,0.18)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[9px] text-cyan-400 uppercase tracking-widest mb-0.5 font-bold">🏢 Corp HQ</div>
      </div>
      <div className="flex items-center gap-2">
        <NavTag entityType="system" entityId={hqSystemId} label={systemObj?.name ?? hqSystemId} />
        {station && <span className="text-xs text-slate-400">• {station.name}</span>}
      </div>
      <div className="text-slate-500 text-xs">
        {station ? (
          <div className="flex flex-col gap-0.5">
            {station.services.map((svc: string) => (
              <div key={svc} className="text-[10px]">• {svc}</div>
            ))}
            {station.marketPriceModifier !== 1 && (
              <div className="text-[10px]">• Market {station.marketPriceModifier > 1 ? '+' : ''}{Math.round((station.marketPriceModifier - 1) * 100)}% prices</div>
            )}
            {station.manufacturingSpeedBonus > 0 && (
              <div className="text-[10px]">• +{Math.round(station.manufacturingSpeedBonus * 100)}% manufacturing speed</div>
            )}
          </div>
        ) : 'Standard station services'}
      </div>
    </div>
  );
}

// ─── Alerts card ─────────────────────────────────────────────────────────────

function AlertsCard() {
  const state = useGameStore(s => s.state);
  const fleets = Object.values(state.systems.fleet.fleets);
  const ships = state.systems.fleet.ships;

  const alerts: Array<{ type: 'cargo' | 'hull' | 'idle'; fleetId: string; fleetName: string; detail: string }> = [];

  for (const fleet of fleets) {
    // Cargo ≥80% with no haul order
    const cargoUsed = Object.values(fleet.cargoHold).reduce((sum, amt) => sum + amt, 0);
    const cargoCap = computeFleetCargoCapacity(fleet, ships);
    const cargoFill = cargoCap > 0 ? (cargoUsed / cargoCap) * 100 : 0;

    if (cargoFill >= 80 && fleet.fleetOrder === null) {
      alerts.push({ type: 'cargo', fleetId: fleet.id, fleetName: fleet.name, detail: `${Math.round(cargoFill)}% full` });
    }

    // Hull damage >30%
    const avgHull = fleet.shipIds.length > 0
      ? fleet.shipIds.reduce((sum, sid) => sum + (ships[sid]?.hullDamage ?? 0), 0) / fleet.shipIds.length
      : 0;
    if (avgHull > 30) {
      alerts.push({ type: 'hull', fleetId: fleet.id, fleetName: fleet.name, detail: `${Math.round(avgHull)}% damaged` });
    }

    // Idle with ships
    if (fleet.shipIds.length > 0 && fleet.fleetOrder === null && !fleet.combatOrder) {
      const anyMining = fleet.shipIds.some(sid => ships[sid]?.assignedBeltId);
      if (!anyMining) {
        alerts.push({ type: 'idle', fleetId: fleet.id, fleetName: fleet.name, detail: 'No orders' });
      }
    }
  }

  if (alerts.length === 0) return null;

  const iconMap = { cargo: '📦', hull: '🛡️', idle: '💤' };
  const colorMap = { cargo: 'text-amber-400', hull: 'text-rose-400', idle: 'text-slate-500' };

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: 'rgba(3,8,20,0.7)', border: '1px solid rgba(251,146,60,0.2)' }}
    >
      <div className="text-[10px] text-amber-400 uppercase tracking-widest font-bold">⚠️ Alerts</div>
      {alerts.slice(0, 6).map((alert, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className={colorMap[alert.type]}>{iconMap[alert.type]}</span>
          <NavTag entityType="fleet" entityId={alert.fleetId} label={alert.fleetName} />
          <span className="text-slate-400">— {alert.detail}</span>
        </div>
      ))}
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
          <div className="text-[9px] text-cyan-400 uppercase tracking-widest mb-0.5 font-bold">⚡ Corp Research</div>
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
  const fleetCount      = Object.keys(state.systems.fleet.fleets).length;
  const totalShips      = Object.keys(state.systems.fleet.ships).length;

  const stats = [
    { label: 'Skills Known',    value: skillsLearned.toString(),          color: '#22d3ee' },
    { label: 'Highest Level',   value: maxSkillLevel > 0 ? `Lv ${maxSkillLevel}` : '—', color: '#22d3ee' },
    { label: 'Fleets',          value: fleetCount.toString(),             color: '#fbbf24' },
    { label: 'Total Ships',     value: totalShips.toString(),            color: '#fbbf24' },
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

// ─── Fleet status card ────────────────────────────────────────────────────────

function FleetStatusCard() {
  const state  = useGameStore(s => s.state);
  const fleets = Object.values(state.systems.fleet.fleets ?? {});
  if (fleets.length === 0) return null;

  const galaxy = state.galaxy;
  const ships = state.systems.fleet.ships;

  function activityLabel(fleet: typeof fleets[0]) {
    if (fleet.fleetOrder !== null)                         return { text: 'In Transit', color: '#22d3ee', dot: 'bg-cyan-400 animate-pulse' };
    if (fleet.combatOrder?.type === 'patrol')              return { text: 'Patrol',    color: '#f43f5e', dot: 'bg-rose-400 animate-pulse' };
    if (fleet.combatOrder?.type === 'raid')                return { text: 'Raid',      color: '#f43f5e', dot: 'bg-rose-400 animate-pulse' };
    return                                                        { text: 'Idle',      color: '#475569', dot: 'bg-slate-600' };
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: 'rgba(3,8,20,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">🚀 Fleets</div>
        <span className="text-[9px] font-mono text-slate-600">{fleets.length} fleet{fleets.length !== 1 ? 's' : ''}</span>
      </div>
      {fleets.map(fleet => {
        const sysName = galaxy ? (() => {
          try { return getSystemById(galaxy.seed, fleet.currentSystemId).name; } catch { return fleet.currentSystemId; }
        })() : fleet.currentSystemId;
        const status = activityLabel(fleet);
        const hullPct = fleet.shipIds.length > 0
          ? fleet.shipIds.reduce((sum, sid) => {
              const ship = ships[sid];
              return sum + (ship ? (ship.hullDamage ?? 0) : 0);
            }, 0) / fleet.shipIds.length
          : 0;

        // Cargo fill %
        const cargoUsed = Object.values(fleet.cargoHold).reduce((sum, amt) => sum + amt, 0);
        const cargoCap = computeFleetCargoCapacity(fleet, ships);
        const cargoFillPct = cargoCap > 0 ? Math.round((cargoUsed / cargoCap) * 100) : 0;

        return (
          <div key={fleet.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
            <NavTag entityType="fleet" entityId={fleet.id} label={fleet.name} />
            <span className="text-[9px] font-mono shrink-0" style={{ color: status.color }}>{status.text}</span>
            {cargoFillPct > 0 && (
              <span className={`text-[8px] font-mono shrink-0 ${cargoFillPct >= 80 ? 'text-amber-400' : 'text-slate-600'}`}>
                cargo {cargoFillPct}%
              </span>
            )}
            <span className="flex-1" />
            {hullPct > 0 && (
              <span className={`text-[8px] font-mono shrink-0 ${hullPct > 50 ? 'text-rose-400' : hullPct > 20 ? 'text-amber-400' : 'text-slate-600'}`}>
                {Math.round(hullPct)}% hull dmg
              </span>
            )}
            <span className="text-[9px] text-slate-600 shrink-0">
              <NavTag entityType="system" entityId={fleet.currentSystemId} label={sysName} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Resource income card ─────────────────────────────────────────────────────

function ResourceIncomeCard() {
  const rates  = useResourceRates();
  const creditsRate = rates['credits'] ?? 0;

  // Gather all positive resource rates
  const resourceRates: Array<{ id: string; rate: number }> = [];
  for (const [id, rate] of Object.entries(rates)) {
    if (rate > 0 && id !== 'credits') {
      resourceRates.push({ id, rate });
    }
  }

  if (resourceRates.length === 0 && creditsRate === 0) return null;

  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-wrap gap-3"
      style={{ background: 'rgba(3,8,20,0.55)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <span className="text-[9px] text-slate-600 uppercase tracking-widest self-center w-full sm:w-auto">Income / sec</span>
      {resourceRates.slice(0, 5).map(({ id, rate }) => (
        <div key={id} className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
          <span className="text-[10px] text-slate-400">{RESOURCE_REGISTRY[id]?.name ?? id}</span>
          <span className="text-[10px] font-mono text-cyan-300">+{rate.toFixed(2)}/s</span>
        </div>
      ))}
      {creditsRate > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          <span className="text-[10px] text-slate-400">Credits</span>
          <span className="text-[10px] font-mono text-amber-300">+{formatCredits(creditsRate)}/s</span>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function OverviewPanel() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="panel-header">📊 Corp Command Center</h2>

      <CorpCard />
      <CorpHQCard />
      <AlertsCard />
      <ActiveSkillCard />
      <ResourceIncomeCard />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FleetStatusCard />
        <ManufacturingCard />
      </div>

      <StatsRow />
      <DiscoveriesCard />
      <CombatLogCard />
    </div>
  );
}
