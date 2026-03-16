import { useState, useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';
import type { PilotInstance, ShipInstance, PilotTrainingFocus, ShipRole, FleetDoctrine } from '@/types/game.types';
import { HULL_DEFINITIONS, PILOT_SKILL_FOCUS_TREES, DOCTRINE_DEFINITIONS, MODULE_DEFINITIONS } from '@/game/systems/fleet/fleet.config';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import {
  getPilotMiningBonus, getPilotCombatBonus, getPilotHaulingBonus,
  getPilotMoraleMultiplier, pilotTrainingEta, canPilotFlyShip, getPilotDisplayState,
} from '@/game/systems/fleet/pilot.logic';
import { formatTrainingEta } from '@/game/systems/skills/skills.logic';
import { getTotalFleetPayroll, suggestDoctrine, getDoctrineRequirementsMet } from '@/game/systems/fleet/fleet.logic';
import { getAliveNpcGroupsInSystem } from '@/game/systems/combat/combat.logic';
import { StarfieldBackground } from '@/ui/effects/StarfieldBackground';
import { generateGalaxy } from '@/game/galaxy/galaxy.gen';
import type { RouteSecurityFilter } from '@/types/faction.types';
import { NavTag } from '@/ui/components/NavTag';

// ─── Types ─────────────────────────────────────────────────────────────────

type Tab = 'fleets' | 'pilots' | 'ships' | 'operations';

const FOCUS_LABEL: Record<PilotTrainingFocus, string> = {
  mining: 'Mining', combat: 'Combat', hauling: 'Hauling',
  exploration: 'Exploration', balanced: 'Balanced',
};
const FOCUS_COLOR: Record<PilotTrainingFocus, string> = {
  mining: 'text-cyan-400', combat: 'text-red-400', hauling: 'text-amber-400',
  exploration: 'text-emerald-400', balanced: 'text-violet-400',
};

const FLEET_ROLE_LABELS: Record<ShipRole, string> = {
  tank: 'T', dps: 'D', support: 'S', scout: 'SC', unassigned: '?',
};
const FLEET_ROLE_FULL: Record<ShipRole, string> = {
  tank: 'Tank', dps: 'DPS', support: 'Support', scout: 'Scout', unassigned: 'Unassigned',
};
const FLEET_ROLE_COLOR: Record<ShipRole, string> = {
  tank: '#4ade80', dps: '#f87171', support: '#60a5fa', scout: '#a78bfa', unassigned: '#475569',
};
const FLEET_COLOURS = ['#a78bfa', '#fb923c', '#34d399', '#f472b6', '#60a5fa'];

// ─── Role minibar ──────────────────────────────────────────────────────────

function RoleMinibar({ ships }: { ships: ShipInstance[] }) {
  const roles: ShipRole[] = ['tank', 'dps', 'support', 'scout'];
  return (
    <div className="flex items-center gap-0.5">
      {roles.map(role => {
        const count = ships.filter(s => s.role === role).length;
        if (count === 0) return null;
        return (
          <span
            key={role}
            className="text-[8px] font-mono px-1 rounded"
            style={{ color: FLEET_ROLE_COLOR[role], background: FLEET_ROLE_COLOR[role] + '22' }}
            title={`${FLEET_ROLE_FULL[role]}: ${count}`}
          >
            {FLEET_ROLE_LABELS[role]}{count}
          </span>
        );
      })}
      {ships.filter(s => s.role === 'unassigned').length > 0 && (
        <span className="text-[8px] font-mono px-1 rounded text-slate-500" title="Unassigned">
          ?{ships.filter(s => s.role === 'unassigned').length}
        </span>
      )}
    </div>
  );
}

// ─── Fleet card ────────────────────────────────────────────────────────────

function FleetCard({
  fleetId,
  expanded,
  isFirst,
  isLast,
  onToggle,
  state,
}: {
  fleetId: string;
  expanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  state: ReturnType<typeof useGameStore.getState>['state'];
}) {
  const setShipRole     = useGameStore(s => s.setShipRole);
  const setDoctrine     = useGameStore(s => s.setFleetDoctrine);
  const addShip         = useGameStore(s => s.addShipToFleet);
  const removeShip      = useGameStore(s => s.removeShipFromFleet);
  const disband         = useGameStore(s => s.disbandPlayerFleet);
  const renameFleet     = useGameStore(s => s.renamePlayerFleet);
  const moveFleet       = useGameStore(s => s.movePlayerFleet);
  const issuePatrol     = useGameStore(s => s.issuePatrolOrder);
  const issueRaid       = useGameStore(s => s.issueCombatRaidOrder);
  const cancelCombat     = useGameStore(s => s.cancelCombatOrder);
  const issueGroupOrder  = useGameStore(s => s.issueFleetGroupOrder);
  const cancelGroupOrder = useGameStore(s => s.cancelFleetGroupOrder);

  const [editingName,  setEditingName]  = useState(false);
  const [nameInput,    setNameInput]    = useState('');
  const [destSystemId, setDestSystemId] = useState('');
  const [secFilter,    setSecFilter]    = useState<RouteSecurityFilter>('shortest');

  const galaxy = useMemo(() => generateGalaxy(state.galaxy.seed), [state.galaxy.seed]);

  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;

  const allShips   = state.systems.fleet.ships;
  const fleetShips = fleet.shipIds.map(id => allShips[id]).filter(Boolean) as ShipInstance[];
  const doctrine   = fleet.doctrine ?? 'balanced'; // guard stale persisted state
  const docDef     = DOCTRINE_DEFINITIONS[doctrine] ?? DOCTRINE_DEFINITIONS['balanced'];
  const docMet     = getDoctrineRequirementsMet(doctrine, fleetShips);
  const suggested  = suggestDoctrine(fleetShips);

  const fleetIdx   = Object.keys(state.systems.fleet.fleets).indexOf(fleetId);
  const fleetColor = FLEET_COLOURS[fleetIdx % FLEET_COLOURS.length];

  const isMoving   = fleet.fleetOrder !== null;
  const dotColor   = isMoving ? 'bg-cyan-400 animate-pulse' : (fleet.combatOrder ? 'bg-red-400 animate-pulse' : 'bg-emerald-400');

  // Ships in same system that can join
  const joinableShips = Object.values(allShips).filter(
    s => s.fleetId === null && s.systemId === fleet.currentSystemId,
  );

  return (
    <div
      className="rounded border bg-slate-900/40 overflow-hidden"
      style={{ borderColor: fleetColor + '44' }}
    >
      {/* Collapsed header */}
      <div
        className="flex items-center gap-2.5 px-3 py-2 cursor-pointer"
        onClick={onToggle}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={() => { renameFleet(fleetId, nameInput); setEditingName(false); }}
              onKeyDown={e => {
                if (e.key === 'Enter') { renameFleet(fleetId, nameInput); setEditingName(false); }
                if (e.key === 'Escape') { setEditingName(false); setNameInput(fleet.name); }
              }}
              onClick={e => e.stopPropagation()}
              className="w-full text-[11px] font-semibold bg-transparent border-b border-slate-600 focus:outline-none focus:border-cyan-500"
              style={{ color: fleetColor }}
              maxLength={32}
            />
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="text-[11px] font-semibold truncate hover:opacity-80"
                style={{ color: fleetColor }}
                onClick={e => { e.stopPropagation(); setEditingName(true); setNameInput(fleet.name); }}
                title="Click to rename"
              >
                {fleet.name}
              </span>
              <span
                className="text-[8px] px-1.5 py-0.5 rounded border"
                style={{ color: docDef.color, borderColor: docDef.color + '44', background: docDef.color + '11' }}
                title={docMet ? docDef.description : `Requires ${DOCTRINE_DEFINITIONS[fleet.doctrine].requires} ship`}
              >
                {docDef.label}{!docMet && ' ⚠'}
              </span>
              <RoleMinibar ships={fleetShips} />
            </div>
          )}
          <div className="flex gap-2 mt-0.5">
            <NavTag entityType="system" entityId={fleet.currentSystemId} label={galaxy.find(s => s.id === fleet.currentSystemId)?.name ?? fleet.currentSystemId} />
            <span className="text-[9px] text-slate-600">·</span>
            <span className="text-[9px] text-slate-500">{fleetShips.length} ship{fleetShips.length !== 1 ? 's' : ''}</span>
            {isMoving && <span className="text-[9px] text-cyan-400/70">· In transit</span>}
            {!isMoving && fleet.combatOrder && (
              <span className={`text-[9px] ${fleet.combatOrder.type === 'patrol' ? 'text-amber-400/70' : 'text-red-400/70'}`}>
                · {fleet.combatOrder.type === 'patrol' ? '⚔ Patrol' : '🎯 Raid'}
              </span>
            )}
          </div>
        </div>
        {/* Reorder buttons */}
        <div className="flex flex-col shrink-0" onClick={e => e.stopPropagation()}>
          <button
            disabled={isFirst}
            onClick={() => moveFleet(fleetId, 'up')}
            className="px-1 py-0.5 text-[9px] leading-none text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-default transition-colors"
            title="Move up"
          >▲</button>
          <button
            disabled={isLast}
            onClick={() => moveFleet(fleetId, 'down')}
            className="px-1 py-0.5 text-[9px] leading-none text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-default transition-colors"
            title="Move down"
          >▼</button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="px-3 pb-3 border-t pt-2 flex flex-col gap-3"
          style={{ borderColor: fleetColor + '22' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Doctrine selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Doctrine</span>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(DOCTRINE_DEFINITIONS) as FleetDoctrine[]).map(doc => {
                const def = DOCTRINE_DEFINITIONS[doc];
                const isCurrent = doctrine === doc;
                const isSuggested = suggested === doc;
                const reqMet = getDoctrineRequirementsMet(doc, fleetShips);
                return (
                  <button
                    key={doc}
                    onClick={() => setDoctrine(fleetId, doc)}
                    disabled={isMoving}
                    className="text-[9px] px-2 py-0.5 rounded border transition-all relative"
                    style={isCurrent ? {
                      color: def.color,
                      borderColor: def.color + '88',
                      background: def.color + '22',
                    } : {
                      color: reqMet ? '#64748b' : '#374151',
                      borderColor: '#1e293b',
                    }}
                    title={`${def.description}${!reqMet ? ` (needs ${def.requires} ship)` : ''}`}
                  >
                    {def.label}
                    {isSuggested && !isCurrent && (
                      <span className="absolute -top-1 -right-1 text-[6px] text-amber-400">★</span>
                    )}
                  </button>
                );
              })}
            </div>
            {!docMet && (
              <span className="text-[9px] text-amber-400/70">
                ⚠ Doctrine needs a {docDef.requires} ship
              </span>
            )}
          </div>

          {/* Ship roles */}
          {fleetShips.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[8px] uppercase tracking-widest text-slate-500">Ship Roles</span>
              {fleetShips.map(ship => {
                const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
                return (
                  <div key={ship.id} className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-400 truncate flex-1 min-w-0">
                      {ship.customName ?? hull?.name ?? ship.shipDefinitionId}
                    </span>
                    {/* Hull damage bar */}
                    {ship.hullDamage > 0 && (
                      <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden shrink-0" title={`Hull damage: ${Math.round(ship.hullDamage)}%`}>
                        <div
                          className={`h-full rounded-full transition-all ${ship.hullDamage >= 80 ? 'bg-red-500' : ship.hullDamage >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`}
                          style={{ width: `${ship.hullDamage}%` }}
                        />
                      </div>
                    )}
                    <div className="flex gap-0.5 shrink-0">
                      {(['tank', 'dps', 'support', 'scout', 'unassigned'] as ShipRole[]).map(role => (
                        <button
                          key={role}
                          onClick={() => setShipRole(ship.id, role)}
                          className="text-[8px] px-1 py-0.5 rounded border transition-all"
                          style={ship.role === role ? {
                            color: FLEET_ROLE_COLOR[role],
                            borderColor: FLEET_ROLE_COLOR[role] + '88',
                            background: FLEET_ROLE_COLOR[role] + '22',
                          } : {
                            color: '#475569',
                            borderColor: '#1e293b',
                          }}
                          title={FLEET_ROLE_FULL[role]}
                        >
                          {FLEET_ROLE_LABELS[role]}
                        </button>
                      ))}
                    </div>
                    {fleet.fleetOrder === null && (
                      <button
                        onClick={() => removeShip(fleetId, ship.id)}
                        className="text-[8px] text-slate-600 hover:text-red-400 border border-slate-800 rounded px-1 py-0.5"
                        title="Remove from fleet"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Combat orders */}
          {(() => {
            const aliveGroups = getAliveNpcGroupsInSystem(state, fleet.currentSystemId);
            const combatOrder = fleet.combatOrder;
            const fleetPilots = fleet.shipIds
              .map(id => state.systems.fleet.ships[id]?.assignedPilotId)
              .filter(Boolean)
              .map(pid => state.systems.fleet.pilots[pid!])
              .filter(Boolean);
            const hasPatrolReq = fleetPilots.some(p => (p.skills.levels['spaceship-command'] ?? 0) >= 2);
            const hasRaidReq   = fleetPilots.some(p => (p.skills.levels['military-operations'] ?? 0) >= 1);
            const systemSecurity = (() => {
              // Determine if current system is non-highsec
              const gs = getAliveNpcGroupsInSystem(state, fleet.currentSystemId);
              return gs.length > 0 || combatOrder;
            })();

            if (!systemSecurity && aliveGroups.length === 0) return null;

            return (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] uppercase tracking-widest text-slate-500">Combat</span>
                  {combatOrder && (
                    <span className={`text-[8px] px-1.5 py-0.5 rounded ${
                      combatOrder.type === 'patrol' ? 'bg-amber-900/40 text-amber-300' : 'bg-red-900/40 text-red-300'
                    }`}>
                      {combatOrder.type === 'patrol' ? '⚔ Patrolling' : '🎯 Raiding'}
                    </span>
                  )}
                </div>

                {/* Threat list */}
                {aliveGroups.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {aliveGroups.map(group => (
                      <div key={group.id} className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-[9px] text-rose-300/80 truncate block">{group.name}</span>
                          <span className="text-[8px] text-slate-500">STR {group.strength} · {group.bounty.toLocaleString()} ISK</span>
                        </div>
                        {hasRaidReq && !combatOrder && !isMoving && (
                          <button
                            onClick={() => issueRaid(fleetId, group.id)}
                            className="text-[8px] px-1.5 py-0.5 rounded border border-red-400/30 text-red-300/70 hover:border-red-300 hover:text-red-200 shrink-0"
                          >
                            Raid
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  combatOrder && <span className="text-[9px] text-slate-500">No threats in current system</span>
                )}

                {/* Patrol / cancel buttons */}
                <div className="flex gap-1.5">
                  {!combatOrder && !isMoving && (
                    <button
                      onClick={() => issuePatrol(fleetId)}
                      disabled={!hasPatrolReq}
                      className="text-[9px] px-2 py-0.5 rounded border border-amber-400/30 text-amber-300/70 hover:border-amber-300 hover:text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={hasPatrolReq ? 'Continuously engage weakest NPC group' : 'Requires Spaceship Command II'}
                    >
                      ⚔ Patrol
                    </button>
                  )}
                  {combatOrder && (
                    <button
                      onClick={() => cancelCombat(fleetId)}
                      className="text-[9px] px-2 py-0.5 rounded border border-slate-600 text-slate-400 hover:text-slate-200"
                    >
                      Cancel order
                    </button>
                  )}
                </div>

                {!hasPatrolReq && !combatOrder && (
                  <span className="text-[8px] text-slate-600">Patrol: requires <NavTag entityType="skill" entityId="spaceship-command" label="Spaceship Command II" /> · Raid: requires <NavTag entityType="skill" entityId="military-operations" label="Military Operations I" /></span>
                )}
              </div>
            );
          })()}

          {/* Navigation */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[8px] uppercase tracking-widest text-slate-500">Navigation</span>
              {isMoving && (
                <span className="text-[8px] font-mono text-cyan-400/70">
                  → <NavTag entityType="system" entityId={fleet.fleetOrder?.destinationSystemId ?? ''} label={galaxy.find(s => s.id === fleet.fleetOrder?.destinationSystemId)?.name ?? fleet.fleetOrder?.destinationSystemId ?? ''} />
                </span>
              )}
            </div>
            {isMoving ? (
              <button
                onClick={() => cancelGroupOrder(fleetId)}
                className="text-[9px] px-2 py-0.5 rounded border border-red-400/30 text-red-300/70 hover:border-red-300 hover:text-red-200 self-start"
              >
                ✕ Cancel movement
              </button>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex gap-1">
                  <select
                    value={destSystemId}
                    onChange={e => setDestSystemId(e.target.value)}
                    className="flex-1 text-[9px] bg-slate-900/60 border border-slate-700/40 rounded px-1.5 py-0.5 text-slate-400"
                  >
                    <option value="">— destination —</option>
                    {galaxy.filter(s => s.id !== fleet.currentSystemId).map(sys => (
                      <option key={sys.id} value={sys.id}>{sys.name} [{sys.security}]</option>
                    ))}
                  </select>
                  <select
                    value={secFilter}
                    onChange={e => setSecFilter(e.target.value as RouteSecurityFilter)}
                    className="text-[9px] bg-slate-900/60 border border-slate-700/40 rounded px-1.5 py-0.5 text-slate-400"
                  >
                    <option value="shortest">Shortest</option>
                    <option value="safest">Safest</option>
                    <option value="avoid-null">Avoid null</option>
                    <option value="avoid-low">Avoid low</option>
                  </select>
                </div>
                <button
                  disabled={!destSystemId}
                  onClick={() => { issueGroupOrder(fleetId, destSystemId, secFilter); setDestSystemId(''); }}
                  className="text-[9px] px-2 py-0.5 rounded border border-cyan-400/30 text-cyan-300/70 hover:border-cyan-300 hover:text-cyan-200 disabled:opacity-30 disabled:cursor-not-allowed self-start"
                >
                  ▶ Move Fleet
                </button>
              </div>
            )}
          </div>

          {/* Add ship */}
          {joinableShips.length > 0 && fleet.fleetOrder === null && (
            <div className="flex flex-col gap-1">
              <span className="text-[8px] uppercase tracking-widest text-slate-500">Add Ship</span>
              <div className="flex flex-wrap gap-1">
                {joinableShips.map(ship => {
                  const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
                  return (
                    <button
                      key={ship.id}
                      onClick={() => addShip(fleetId, ship.id)}
                      className="text-[9px] px-2 py-0.5 rounded border border-slate-700/40 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-300"
                    >
                      + {ship.customName ?? hull?.name ?? ship.shipDefinitionId}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Disband */}
          {fleet.fleetOrder === null && (
            <button
              onClick={() => disband(fleetId)}
              className="text-[9px] text-red-400/60 hover:text-red-300 border border-red-400/20 rounded px-2 py-0.5 self-start"
            >
              Disband fleet
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Fleets tab ─────────────────────────────────────────────────────────────

function FleetsTab({ state }: { state: ReturnType<typeof useGameStore.getState>['state'] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const createFleet = useGameStore(s => s.createPlayerFleet);

  const allShips  = state.systems.fleet.ships;
  const fleetIds  = Object.keys(state.systems.fleet.fleets);
  const maxFleets = state.systems.fleet.maxFleets;

  const unassignedShips = Object.values(allShips).filter(s => s.fleetId === null);

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="flex flex-col gap-3">
      {/* Fleet cards */}
      {fleetIds.length === 0 ? (
        <p className="text-[9px] text-slate-600">No fleets formed. Select ships below to create one.</p>
      ) : (
      fleetIds.map((id, idx) => (
          <FleetCard
            key={id}
            fleetId={id}
            expanded={expandedId === id}
            isFirst={idx === 0}
            isLast={idx === fleetIds.length - 1}
            onToggle={() => toggleExpand(id)}
            state={state}
          />
        ))
      )}

      {/* Unassigned ships pool */}
      {unassignedShips.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-700/20">
          <span className="text-[8px] uppercase tracking-widest text-slate-500">
            Unassigned Ships ({unassignedShips.length})
          </span>
          <div className="flex flex-wrap gap-1">
            {unassignedShips.map(ship => {
              const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
              const canForm = fleetIds.length < maxFleets;
              return (
                <button
                  key={ship.id}
                  disabled={!canForm}
                  onClick={() => canForm && createFleet(`Fleet ${fleetIds.length + 1}`, [ship.id])}
                  className="text-[9px] px-2 py-1 rounded border border-slate-700/40 text-slate-400 hover:border-violet-400/40 hover:text-violet-300 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={canForm ? 'Form new fleet' : `Max ${maxFleets} fleets`}
                >
                  ⬡ {ship.customName ?? hull?.name ?? ship.shipDefinitionId}
                </button>
              );
            })}
          </div>
          {fleetIds.length >= maxFleets && (
            <span className="text-[9px] text-amber-400/60">Max fleet cap ({maxFleets}) reached</span>
          )}
        </div>
      )}
    </div>
  );
}

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
  const setFocus             = useGameStore(s => s.setPilotTrainingFocus);
  const assignShip           = useGameStore(s => s.assignPilotToShip);
  const renamePilot          = useGameStore(s => s.renamePilotCharacter);
  const removeSkillFromQueue = useGameStore(s => s.removePilotSkillFromQueue);
  const unassignShip = () => assignShip(pilot.id, null);

  const [editingPilotName, setEditingPilotName] = useState(false);
  const [pilotNameInput,   setPilotNameInput]   = useState('');

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
          {pilot.skills.activeSkillId && (
            <div className="text-[9px] text-cyan-400 truncate max-w-20">
              <NavTag entityType="skill" entityId={pilot.skills.activeSkillId} label={SKILL_DEFINITIONS[pilot.skills.activeSkillId]?.name ?? pilot.skills.activeSkillId} />
            </div>
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
          {/* Rename pilot */}
          <div className="flex items-center gap-2">
            {editingPilotName ? (
              <input
                autoFocus
                value={pilotNameInput}
                onChange={e => setPilotNameInput(e.target.value)}
                onBlur={() => { renamePilot(pilot.id, pilotNameInput.trim() || pilot.name); setEditingPilotName(false); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { renamePilot(pilot.id, pilotNameInput.trim() || pilot.name); setEditingPilotName(false); }
                  if (e.key === 'Escape') setEditingPilotName(false);
                }}
                className="flex-1 text-[11px] font-semibold bg-transparent border-b border-slate-600 focus:outline-none focus:border-cyan-500 text-slate-200"
                maxLength={32}
              />
            ) : (
              <span
                className="text-[11px] font-semibold text-slate-200 flex-1 cursor-text hover:text-cyan-300 transition-colors"
                title="Click to rename"
                onClick={() => { setPilotNameInput(pilot.name); setEditingPilotName(true); }}
              >
                {pilot.name}
              </span>
            )}
            {pilot.isPlayerPilot && (
              <span className="text-[8px] uppercase tracking-widest text-amber-400/80 border border-amber-400/30 px-1 rounded shrink-0">Dir.</span>
            )}
          </div>

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

          {/* Training queue */}
          {(pilot.skills.activeSkillId || pilot.skills.queue.length > 0) && (
            <div className="flex flex-col gap-1">
              <span className="text-[8px] uppercase tracking-widest text-slate-500">Training Queue</span>
              {pilot.skills.activeSkillId && (
                <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-800/40 border border-cyan-400/20">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                    <span className="text-[9px] text-cyan-400">
                      {SKILL_DEFINITIONS[pilot.skills.activeSkillId]?.name ?? pilot.skills.activeSkillId}
                    </span>
                  </div>
                  <span className="text-[8px] font-mono text-cyan-300/60">{formatTrainingEta(pilotTrainingEta(pilot.skills))}</span>
                </div>
              )}
              {pilot.skills.queue.map((entry, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-slate-800/30 border border-violet-400/10">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] text-violet-400/60 w-4 font-mono">{i + 1}.</span>
                    <span className="text-[9px] text-slate-400">
                      {SKILL_DEFINITIONS[entry.skillId]?.name ?? entry.skillId}
                    </span>
                    <span className="text-[8px] text-slate-600 font-mono">→ {entry.targetLevel}</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); removeSkillFromQueue(pilot.id, i); }}
                    className="text-[10px] text-red-500/40 hover:text-red-300 pl-2 transition-colors"
                    title="Remove from queue"
                  >✕</button>
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
  const repairShip       = useGameStore(s => s.repairShip);
  const addToFleet       = useGameStore(s => s.addShipToFleet);
  const removeFromFleet  = useGameStore(s => s.removeShipFromFleet);
  const createFleet      = useGameStore(s => s.createPlayerFleet);
  const fitMod           = useGameStore(s => s.fitModule);
  const removeMod        = useGameStore(s => s.removeModule);

  const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
  const assignedPilot = ship.assignedPilotId ? state.systems.fleet.pilots[ship.assignedPilotId] : null;
  const availablePilots = Object.values(state.systems.fleet.pilots).filter(
    p => !p.assignedShipId && canPilotFlyShip(p, hull?.requiredPilotSkill),
  );

  // Fleet helpers
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
              const filled = ship.fittedModules[slot];
              const maxSlots = hull?.moduleSlots[slot] ?? 0;
              const availableForSlot = Object.values(MODULE_DEFINITIONS).filter(
                m => m.slotType === slot && (state.resources[m.id] ?? 0) > 0,
              );
              return (
                <div key={slot} className="flex items-start gap-2">
                  <span className="text-[9px] text-slate-600 w-7 uppercase shrink-0 pt-0.5">{slot}</span>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: maxSlots }, (_, i) => {
                      const modId = filled[i];
                      return modId ? (
                        <div
                          key={i}
                          className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded border border-violet-400/20 bg-slate-800/30"
                        >
                          <span className="text-violet-300">
                            {MODULE_DEFINITIONS[modId]?.name ?? modId.replace(/-/g, ' ')}
                          </span>
                          <button
                            onClick={() => removeMod(ship.id, slot, i)}
                            className="text-red-500/40 hover:text-red-300 pl-0.5 transition-colors"
                            title="Remove module"
                          >✕</button>
                        </div>
                      ) : (
                        <select
                          key={i}
                          defaultValue=""
                          onChange={e => { if (e.target.value) { fitMod(ship.id, slot, e.target.value); e.currentTarget.value = ''; } }}
                          className="text-[8px] px-1 py-0.5 rounded border border-slate-700/30 bg-slate-800/40 text-slate-500 cursor-pointer"
                          title="Fit module"
                        >
                          <option value="">+ fit…</option>
                          {availableForSlot.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ×{Math.floor(state.resources[m.id] ?? 0)}
                            </option>
                          ))}
                        </select>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Activity selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Activity</span>
            <div className="flex flex-wrap gap-1">
              {(['idle', 'mining', 'hauling'] as const).map(act => (
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

          {/* Hull damage & repair */}
          {ship.hullDamage > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[8px] uppercase tracking-widest text-slate-500">Hull Integrity</span>
                <span className={`text-[9px] font-mono ${
                  ship.hullDamage >= 80 ? 'text-red-400' : ship.hullDamage >= 50 ? 'text-amber-400' : 'text-rose-300'
                }`}>{Math.round(100 - ship.hullDamage)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    ship.hullDamage >= 80 ? 'bg-red-500' : ship.hullDamage >= 50 ? 'bg-amber-400' : 'bg-rose-400'
                  }`}
                  style={{ width: `${100 - ship.hullDamage}%` }}
                />
              </div>
              {ship.hullDamage >= 80 && (
                <span className="text-[8px] text-red-400/70">⚠ Ship offline — hull damage critical</span>
              )}
              <div className="flex items-center gap-2">
                {(state.resources['hull-plate'] ?? 0) >= 1 ? (
                  <button
                    onClick={() => repairShip(ship.id)}
                    className="text-[9px] px-2 py-0.5 rounded border border-emerald-400/30 text-emerald-300/80 hover:border-emerald-300 hover:text-emerald-200"
                  >
                    🔧 Repair (1× hull-plate)
                  </button>
                ) : (
                  <span className="text-[8px] text-slate-600">No hull-plates — idle to repair slowly</span>
                )}
              </div>
            </div>
          )}

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
  const [activeTab, setActiveTab] = useState<Tab>('fleets');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const state = useGameStore(s => s.state);
  const fleet = state.systems.fleet;

  const pilots = Object.values(fleet.pilots);
  const ships  = Object.values(fleet.ships);
  const fleets = Object.values(fleet.fleets);

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const TABS: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'fleets',     label: 'Fleets',     count: fleets.length },
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
        {activeTab === 'fleets' && <FleetsTab state={state} />}

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
