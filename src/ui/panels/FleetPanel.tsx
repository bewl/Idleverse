import { useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import type { PilotInstance, ShipInstance, PilotTrainingFocus } from '@/types/game.types';
import { HULL_DEFINITIONS, PILOT_SKILL_FOCUS_TREES } from '@/game/systems/fleet/fleet.config';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import {
  getPilotMiningBonus, getPilotCombatBonus, getPilotHaulingBonus,
  getPilotMoraleMultiplier, pilotTrainingEta, canPilotFlyShip, getPilotDisplayState,
} from '@/game/systems/fleet/pilot.logic';
import { formatTrainingEta } from '@/game/systems/skills/skills.logic';
import { getTotalFleetPayroll } from '@/game/systems/fleet/fleet.logic';
import { StarfieldBackground } from '@/ui/effects/StarfieldBackground';

// ─── Types ─────────────────────────────────────────────────────────────────

type Tab = 'pilots' | 'ships' | 'operations';

const FOCUS_LABEL: Record<PilotTrainingFocus, string> = {
  mining: 'Mining', combat: 'Combat', hauling: 'Hauling',
  exploration: 'Exploration', balanced: 'Balanced',
};
const FOCUS_COLOR: Record<PilotTrainingFocus, string> = {
  mining: 'text-cyan-400', combat: 'text-red-400', hauling: 'text-amber-400',
  exploration: 'text-emerald-400', balanced: 'text-violet-400',
};

// ─── Pilot portrait (seeded SVG avatar) ───────────────────────────────────

function PilotPortrait({ seed, size = 32 }: { seed: number; size?: number }) {
  const hue   = seed % 360;
  const hue2  = (seed * 137 + 90) % 360;
  const eyes  = (seed % 3) + 1; // 1–3 eye shapes
  const r     = size / 2;
  const eyeY  = r * 0.55;
  const eyeX  = r * 0.3;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 rounded-full">
      <circle cx={r} cy={r} r={r} fill={`hsl(${hue2}, 20%, 14%)`} />
      <circle cx={r} cy={r * 1.1} r={r * 0.62} fill={`hsl(${hue}, 40%, 28%)`} />
      {eyes >= 1 && <circle cx={r - eyeX} cy={eyeY} r={r * 0.10} fill={`hsl(${hue}, 70%, 70%)`} />}
      {eyes >= 1 && <circle cx={r + eyeX} cy={eyeY} r={r * 0.10} fill={`hsl(${hue}, 70%, 70%)`} />}
    </svg>
  );
}

// ─── Morale bar ────────────────────────────────────────────────────────────

function MoraleBar({ morale }: { morale: number }) {
  const color = morale >= 70 ? 'bg-emerald-500' : morale >= 30 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5" title={`Morale: ${Math.round(morale)}%`}>
      <span className="text-[9px] text-slate-500 uppercase tracking-widest w-10">Morale</span>
      <div className="flex-1 h-1 rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${morale}%` }} />
      </div>
      <span className="text-[9px] font-mono text-slate-400 w-7 text-right">{Math.round(morale)}%</span>
    </div>
  );
}

// ─── Pilot skill level row ─────────────────────────────────────────────────

function SkillPips({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <div
          key={i}
          className="h-1.5 w-1.5 rounded-sm"
          style={{
            background: i <= level ? '#22d3ee' : 'rgba(255,255,255,0.07)',
            boxShadow: i <= level ? '0 0 3px #22d3ee88' : 'none',
          }}
        />
      ))}
    </div>
  );
}

// ─── Pilot card ────────────────────────────────────────────────────────────

function PilotCard({
  pilot,
  expanded,
  onToggle,
  state,
}: {
  pilot: PilotInstance;
  expanded: boolean;
  onToggle: () => void;
  state: ReturnType<typeof useGameStore.getState>['state'];
}) {
  const setFocus = useGameStore(s => s.setPilotTrainingFocus);
  const assignShip = useGameStore(s => s.assignPilotToShip);
  const unassignShip = () => assignShip(pilot.id, null);

  const displayState = getPilotDisplayState(pilot, state);
  const eta = pilotTrainingEta(pilot.skills);
  const activeSkillName = pilot.skills.activeSkillId
    ? SKILL_DEFINITIONS[pilot.skills.activeSkillId]?.name
    : null;

  const isActive = pilot.status === 'active';
  const dotColor = isActive ? 'bg-cyan-400 animate-pulse' : pilot.status === 'docked' ? 'bg-emerald-400' : 'bg-slate-600';

  return (
    <div
      className="rounded border border-slate-700/30 bg-slate-900/40 overflow-hidden cursor-pointer"
      onClick={onToggle}
    >
      {/* Main row */}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        <PilotPortrait seed={pilot.portraitSeed} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-200 truncate">{pilot.name}</span>
            {pilot.isPlayerPilot && (
              <span className="text-[8px] uppercase tracking-widest text-amber-400/80 border border-amber-400/30 px-1 rounded">Dir.</span>
            )}
          </div>
          <span className="text-[9px] text-slate-500">{displayState}</span>
        </div>
        <div className="text-right">
          {activeSkillName && (
            <div className="text-[9px] text-cyan-400 truncate max-w-20">{activeSkillName}</div>
          )}
          {eta > 0 && (
            <div className="text-[9px] font-mono text-slate-500">{formatTrainingEta(eta)}</div>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="px-3 pb-3 border-t border-slate-700/30 pt-2 flex flex-col gap-2"
          onClick={e => e.stopPropagation()}
        >
          <MoraleBar morale={pilot.morale} />

          {/* Backstory */}
          <p className="text-[9px] text-slate-500 leading-relaxed">{pilot.backstory}</p>

          {/* Key skill bonuses */}
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: 'Mine', value: getPilotMiningBonus(pilot), color: 'text-cyan-400' },
              { label: 'Combat', value: getPilotCombatBonus(pilot), color: 'text-red-400' },
              { label: 'Haul', value: getPilotHaulingBonus(pilot), color: 'text-amber-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex flex-col items-center bg-slate-800/40 rounded py-1">
                <span className="text-[8px] text-slate-500 uppercase tracking-widest">{label}</span>
                <span className={`text-[11px] font-semibold ${color}`}>+{(value * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>

          {/* Pilot personal skills */}
          {Object.keys(pilot.skills.levels).length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[8px] uppercase tracking-widest text-slate-500">Personal Skills</span>
              {Object.entries(pilot.skills.levels)
                .filter(([, lv]) => lv > 0)
                .map(([skillId, level]) => (
                  <div key={skillId} className="flex items-center justify-between">
                    <span className="text-[9px] text-slate-400">{SKILL_DEFINITIONS[skillId]?.name ?? skillId}</span>
                    <SkillPips level={level} />
                  </div>
                ))}
            </div>
          )}

          {/* Training focus selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Idle Training Focus</span>
            <div className="flex flex-wrap gap-1">
              {(['mining', 'combat', 'hauling', 'exploration', 'balanced'] as PilotTrainingFocus[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFocus(pilot.id, pilot.skills.idleTrainingFocus === f ? null : f)}
                  className={`text-[9px] px-2 py-0.5 rounded border transition-all ${
                    pilot.skills.idleTrainingFocus === f
                      ? `${FOCUS_COLOR[f]} border-current bg-current/10`
                      : 'text-slate-500 border-slate-700/40 hover:border-slate-500'
                  }`}
                >
                  {FOCUS_LABEL[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-x-4 text-[9px]">
            <div className="flex justify-between text-slate-500">
              <span>Ore Mined</span>
              <span className="font-mono text-slate-400">{pilot.stats.oreMinedTotal.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Experience</span>
              <span className="font-mono text-slate-400">{Math.floor(pilot.experience)}</span>
            </div>
            {!pilot.isPlayerPilot && (
              <div className="flex justify-between text-slate-500">
                <span>Payroll/day</span>
                <span className="font-mono text-amber-400">{pilot.payrollPerDay.toLocaleString()} ISK</span>
              </div>
            )}
          </div>

          {/* Unassign button */}
          {pilot.assignedShipId && (
            <button
              onClick={unassignShip}
              className="mt-1 text-[9px] text-red-400/70 hover:text-red-300 border border-red-400/20 rounded px-2 py-0.5 self-start"
            >
              Unassign from ship
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Ship card ─────────────────────────────────────────────────────────────

function ShipCard({ ship, state, expanded, onToggle }: {
  ship: ShipInstance;
  state: ReturnType<typeof useGameStore.getState>['state'];
  expanded: boolean;
  onToggle: () => void;
}) {
  const assignPilot      = useGameStore(s => s.assignPilotToShip);
  const setActivity      = useGameStore(s => s.setShipActivity);
  const recallShipAction = useGameStore(s => s.recallShip);
  const addToFleet       = useGameStore(s => s.addShipToFleet);
  const removeFromFleet  = useGameStore(s => s.removeShipFromFleet);
  const createFleet      = useGameStore(s => s.createPlayerFleet);

  const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
  const assignedPilot = ship.assignedPilotId ? state.systems.fleet.pilots[ship.assignedPilotId] : null;
  const availablePilots = Object.values(state.systems.fleet.pilots).filter(
    p => !p.assignedShipId && canPilotFlyShip(p, hull?.requiredPilotSkill),
  );

  // Fleet helpers
  const FLEET_COLOURS = ['#a78bfa', '#fb923c', '#34d399', '#f472b6', '#60a5fa'];
  const allFleets = Object.values(state.systems.fleet.fleets);
  const assignedFleet = ship.fleetId ? state.systems.fleet.fleets[ship.fleetId] : null;
  const fleetColour = assignedFleet
    ? FLEET_COLOURS[allFleets.findIndex(f => f.id === assignedFleet.id) % FLEET_COLOURS.length]
    : null;
  const joinableFleets = allFleets.filter(
    f => f.currentSystemId === ship.systemId && f.fleetOrder === null && f.id !== ship.fleetId,
  );

  const isActive = ship.activity !== 'idle';
  const dotColor = isActive ? 'bg-cyan-400 animate-pulse' : assignedPilot ? 'bg-emerald-400' : 'bg-slate-600';

  return (
    <div
      className="rounded border border-slate-700/30 bg-slate-900/40 overflow-hidden cursor-pointer"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-200 truncate">
              {ship.customName ?? hull?.name ?? ship.shipDefinitionId}
            </span>
            <span
              className="text-[8px] uppercase tracking-widest px-1 rounded border"
              style={{ color: '#a78bfa', borderColor: '#a78bfa44' }}
            >
              {hull?.shipClass ?? '?'}
            </span>
            {assignedFleet && fleetColour && (
              <span
                className="text-[8px] px-1 rounded border truncate max-w-[64px]"
                style={{ color: fleetColour, borderColor: fleetColour + '44' }}
                title={`Fleet: ${assignedFleet.name}`}
              >
                ⬡ {assignedFleet.name}
              </span>
            )}
          </div>
          <span className="text-[9px] text-slate-500">
            {assignedPilot ? assignedPilot.name : 'No pilot'} · {ship.activity}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-slate-500">
            {ship.systemId}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-700/30 pt-2 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
          {/* Hull stats */}
          {hull && (
            <div className="grid grid-cols-3 gap-1">
              {[
                { label: 'Mine', value: hull.baseMiningBonus, color: 'text-cyan-400' },
                { label: 'Combat', value: hull.baseCombatRating, color: 'text-red-400' },
                { label: 'Cargo ×', value: hull.baseCargoMultiplier, color: 'text-amber-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex flex-col items-center bg-slate-800/40 rounded py-1">
                  <span className="text-[8px] text-slate-500 uppercase tracking-widest">{label}</span>
                  <span className={`text-[11px] font-semibold ${color}`}>{value.toFixed(1)}×</span>
                </div>
              ))}
            </div>
          )}

          {/* Fitted modules */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Fitted Modules</span>
            {(['high', 'mid', 'low'] as const).map(slot => {
              const slots = ship.fittedModules[slot];
              const maxSlots = hull?.moduleSlots[slot] ?? 0;
              return (
                <div key={slot} className="flex items-center gap-2">
                  <span className="text-[9px] text-slate-600 w-7 uppercase">{slot}</span>
                  <div className="flex gap-1">
                    {Array.from({ length: maxSlots }, (_, i) => (
                      <div
                        key={i}
                        className="text-[8px] px-1.5 py-0.5 rounded border border-slate-700/40 bg-slate-800/30"
                        style={slots[i] ? { color: '#a78bfa', borderColor: '#a78bfa44' } : {}}
                      >
                        {slots[i]?.replace(/-/g, ' ').replace(/\bi\b/, 'I') ?? '—'}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Activity selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Activity</span>
            <div className="flex flex-wrap gap-1">
              {(['idle', 'mining', 'hauling', 'patrol', 'exploration'] as const).map(act => (
                <button
                  key={act}
                  disabled={!assignedPilot}
                  onClick={() => setActivity(ship.id, act)}
                  className={`text-[9px] px-2 py-0.5 rounded border transition-all capitalize ${
                    ship.activity === act
                      ? 'text-cyan-400 border-cyan-400/40 bg-cyan-400/10'
                      : 'text-slate-500 border-slate-700/40 hover:border-slate-500 disabled:opacity-30'
                  }`}
                >
                  {act}
                </button>
              ))}
            </div>
            {!assignedPilot && (
              <span className="text-[9px] text-amber-400/60">Assign a pilot to activate</span>
            )}
          </div>

          {/* Pilot assignment */}
          {!assignedPilot && availablePilots.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[8px] uppercase tracking-widest text-slate-500">Assign Pilot</span>
              {availablePilots.map(p => (
                <button
                  key={p.id}
                  onClick={() => assignPilot(p.id, ship.id)}
                  className="flex items-center gap-2 text-[9px] text-slate-300 hover:text-cyan-300 px-2 py-0.5 rounded border border-slate-700/30 hover:border-cyan-400/30 bg-slate-800/30 text-left"
                >
                  <PilotPortrait seed={p.portraitSeed} size={16} />
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Fleet assignment */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Fleet</span>
            {assignedFleet ? (
              <div className="flex items-center gap-2">
                <span
                  className="text-[9px] px-2 py-0.5 rounded border"
                  style={{ color: fleetColour!, borderColor: fleetColour! + '44', background: fleetColour! + '11' }}
                >
                  ⬡ {assignedFleet.name}
                </span>
                {assignedFleet.fleetOrder === null && (
                  <button
                    onClick={() => removeFromFleet(assignedFleet.id, ship.id)}
                    className="text-[9px] text-slate-500 hover:text-red-400 border border-slate-700/30 rounded px-1.5 py-0.5"
                  >
                    Leave
                  </button>
                )}
              </div>
            ) : joinableFleets.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {joinableFleets.map(f => {
                  const col = FLEET_COLOURS[allFleets.findIndex(x => x.id === f.id) % FLEET_COLOURS.length];
                  return (
                    <button
                      key={f.id}
                      onClick={() => addToFleet(f.id, ship.id)}
                      className="text-[9px] px-2 py-0.5 rounded border transition-all"
                      style={{ color: col, borderColor: col + '44', background: col + '11' }}
                    >
                      + {f.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              state.systems.fleet.maxFleets > allFleets.length ? (
                <button
                  onClick={() => createFleet(`Fleet ${allFleets.length + 1}`, [ship.id])}
                  className="text-[9px] text-cyan-400/70 hover:text-cyan-300 border border-cyan-400/20 rounded px-2 py-0.5 self-start"
                >
                  + Form fleet
                </button>
              ) : (
                <span className="text-[9px] text-slate-600">No fleets in system</span>
              )
            )}
          </div>

          {/* Recall button */}
          {ship.activity === 'idle' && (
            <button
              onClick={() => recallShipAction(ship.id)}
              className="mt-1 text-[9px] text-red-400/70 hover:text-red-300 border border-red-400/20 rounded px-2 py-0.5 self-start"
            >
              Recall to hangar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Operations tab ────────────────────────────────────────────────────────

function OperationsTab({ state }: { state: ReturnType<typeof useGameStore.getState>['state'] }) {
  const deployShip = useGameStore(s => s.deployShip);
  const hirePilot  = useGameStore(s => s.hirePilot);
  const refreshOffers = useGameStore(s => s.refreshRecruitmentOffers);

  const deployableHulls = Object.values(HULL_DEFINITIONS).filter(hull => {
    const have = state.resources[hull.resourceId] ?? 0;
    return have >= 1;
  });

  const offers = state.systems.fleet.recruitmentOffers;
  const credits = state.resources['credits'] ?? 0;
  const payroll = getTotalFleetPayroll(state);

  return (
    <div className="flex flex-col gap-4">
      {/* Corp finances */}
      <div className="flex flex-col gap-1">
        <span className="text-[8px] uppercase tracking-widest text-slate-500">Corp Finances</span>
        <div className="flex gap-4 text-[10px]">
          <div className="flex gap-1">
            <span className="text-slate-500">Balance:</span>
            <span className="font-mono text-emerald-400">{credits.toLocaleString()} ISK</span>
          </div>
          <div className="flex gap-1">
            <span className="text-slate-500">Payroll/day:</span>
            <span className="font-mono text-amber-400">{payroll.toLocaleString()} ISK</span>
          </div>
        </div>
      </div>

      {/* Deploy ship */}
      {deployableHulls.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[8px] uppercase tracking-widest text-slate-500">Deploy from Hangar</span>
          {deployableHulls.map(hull => {
            const count = state.resources[hull.resourceId] ?? 0;
            return (
              <button
                key={hull.id}
                onClick={() => deployShip(hull.id)}
                className="flex items-center justify-between px-3 py-2 rounded border border-slate-700/30 bg-slate-900/40 hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-all text-left"
              >
                <div>
                  <div className="text-[10px] font-semibold text-slate-200">{hull.name}</div>
                  <div className="text-[9px] text-slate-500">{hull.description.slice(0, 60)}…</div>
                </div>
                <span className="text-[9px] font-mono text-slate-400 ml-2">×{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Recruitment */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] uppercase tracking-widest text-slate-500">Recruitment Office</span>
          {offers.length === 0 && (
            <button
              onClick={refreshOffers}
              className="text-[9px] text-cyan-400/70 hover:text-cyan-300 border border-cyan-400/20 rounded px-2 py-0.5"
            >
              Post contracts
            </button>
          )}
        </div>

        {offers.length === 0 && (
          <p className="text-[9px] text-slate-600">No candidates on file. Post recruitment contracts to find pilots.</p>
        )}

        {offers.map(offer => {
          const canAfford = credits >= offer.hiringCost;
          return (
            <div
              key={offer.id}
              className="rounded border border-slate-700/30 bg-slate-900/40 overflow-hidden"
            >
              <div className="flex items-start gap-2.5 px-3 py-2">
                <PilotPortrait seed={offer.pilotSeed} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-200">{offer.name}</span>
                    <span className={`text-[8px] px-1 rounded border ${FOCUS_COLOR[offer.trainingFocus]} border-current`}>
                      {FOCUS_LABEL[offer.trainingFocus]}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-0.5">{offer.backstory}</p>
                  {Object.keys(offer.previewSkills).length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {Object.entries(offer.previewSkills).map(([sid, lv]) => (
                        <div key={sid} className="flex items-center gap-1">
                          <span className="text-[8px] text-slate-500">{SKILL_DEFINITIONS[sid]?.name ?? sid}</span>
                          <SkillPips level={lv} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="px-3 py-1.5 border-t border-slate-700/30 flex items-center justify-between bg-slate-800/20">
                <div className="text-[9px] text-slate-500">
                  Hire: <span className={`font-mono ${canAfford ? 'text-emerald-400' : 'text-red-400/70'}`}>{offer.hiringCost.toLocaleString()} ISK</span>
                  <span className="ml-2">· Payroll: <span className="font-mono text-amber-400">{offer.payrollPerDay.toLocaleString()}/day</span></span>
                </div>
                <button
                  disabled={!canAfford}
                  onClick={() => hirePilot(offer.id)}
                  className={`text-[9px] px-3 py-0.5 rounded border transition-all ${
                    canAfford
                      ? 'text-cyan-400 border-cyan-400/40 hover:bg-cyan-400/10'
                      : 'text-slate-600 border-slate-700/30 cursor-not-allowed'
                  }`}
                >
                  Hire
                </button>
              </div>
            </div>
          );
        })}

        {offers.length > 0 && (
          <button
            onClick={refreshOffers}
            className="text-[9px] text-slate-500 hover:text-slate-300 border border-slate-700/30 rounded px-2 py-0.5 self-start"
          >
            Refresh candidates
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────

export function FleetPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('pilots');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const state = useGameStore(s => s.state);
  const fleet = state.systems.fleet;

  const pilots = Object.values(fleet.pilots);
  const ships  = Object.values(fleet.ships);

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const TABS: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'pilots',     label: 'Pilots',     count: pilots.length },
    { id: 'ships',      label: 'Ships',      count: ships.length },
    { id: 'operations', label: 'Operations' },
  ];

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      <StarfieldBackground />

      {/* Tab bar */}
      <div
        className="relative z-10 flex gap-0 border-b border-slate-700/30 shrink-0"
        style={{ background: 'rgba(3, 5, 14, 0.80)' }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === tab.id
                ? 'text-cyan-400 border-cyan-400'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`text-[8px] rounded-full px-1.5 py-0.5 ${
                  activeTab === tab.id ? 'bg-cyan-400/20 text-cyan-300' : 'bg-slate-700/60 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {activeTab === 'pilots' && (
          <>
            {pilots.length === 0 && (
              <p className="text-[10px] text-slate-600 text-center mt-8">No pilots in the roster.</p>
            )}
            {pilots.map(pilot => (
              <PilotCard
                key={pilot.id}
                pilot={pilot}
                state={state}
                expanded={expandedId === pilot.id}
                onToggle={() => toggleExpand(pilot.id)}
              />
            ))}
          </>
        )}

        {activeTab === 'ships' && (
          <>
            {ships.length === 0 && (
              <p className="text-[10px] text-slate-600 text-center mt-8">
                No ships deployed. Manufacture a hull and deploy it from Operations.
              </p>
            )}
            {ships.map(ship => (
              <ShipCard
                key={ship.id}
                ship={ship}
                state={state}
                expanded={expandedId === ship.id}
                onToggle={() => toggleExpand(ship.id)}
              />
            ))}
          </>
        )}

        {activeTab === 'operations' && (
          <OperationsTab state={state} />
        )}
      </div>
    </div>
  );
}
