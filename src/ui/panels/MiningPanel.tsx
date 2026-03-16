import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { ORE_BELTS } from '@/game/systems/mining/mining.config';
import { formatResourceAmount, RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { NavTag } from '@/ui/components/NavTag';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import type { PlayerFleet } from '@/types/game.types';
import { getFleetStorageCapacity, getFleetStoredCargo, getHaulingWings, getOperationalFleetShipIds, getWingByShipId } from '@/game/systems/fleet/wings.logic';
import { useUiStore } from '@/stores/uiStore';

// ─── Tier color helper ───────────────────────────────────────────────────────

function secColor(sec: string) {
  if (sec === 'highsec') return '#4ade80';
  if (sec === 'lowsec')  return '#fb923c';
  return '#f87171';
}

function secLabel(sec: string) {
  if (sec === 'highsec') return 'High-Sec';
  if (sec === 'lowsec')  return 'Low-Sec';
  return 'Null-Sec';
}

function getStorageTargetCopy(haulingWingCount: number) {
  if (haulingWingCount <= 0) {
    return {
      label: 'Shared Storage',
      detail: 'No hauling wing is configured, so this mining wing is currently routing ore into the fleet\'s shared storage pool.',
    };
  }
  if (haulingWingCount === 1) {
    return {
      label: 'Hauling Wing Storage',
      detail: 'This mining wing is routing ore into the fleet\'s single hauling wing cargo hold.',
    };
  }
  return {
    label: 'Hauling Network',
    detail: `This mining wing is routing ore across ${haulingWingCount} hauling wings in the fleet storage network.`,
  };
}

// ─── Fleet Mining Card ───────────────────────────────────────────────────────

function FleetMiningCard({ fleet, focused = false }: { fleet: PlayerFleet; focused?: boolean }) {
  const state = useGameStore(s => s.state);
  const issueHaul = useGameStore(s => s.issueFleetGroupOrder);
  const dispatchHaulingWingToHQ = useGameStore(s => s.dispatchHaulingWingToHQ);
  const ships = state.systems.fleet.ships;
  const galaxy = state.galaxy;
  const operationalShipIds = new Set(getOperationalFleetShipIds(fleet));
  const haulingWings = getHaulingWings(fleet);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!focused || !cardRef.current) return;
    cardRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focused]);

  // Mining ships in this fleet
  const miningShips = fleet.shipIds
    .filter(sid => operationalShipIds.has(sid))
    .map(sid => ships[sid])
    .filter(ship => ship && ship.assignedBeltId);

  if (miningShips.length === 0) return null;

  // Fleet system
  const system = galaxy ? getSystemById(galaxy.seed, fleet.currentSystemId) : null;

  const totalCargoUsed = getFleetStoredCargo(fleet);
  const sharedStorageCapacity = getFleetStorageCapacity(fleet, ships, state.systems.fleet.pilots);
  const sharedStorageFillPct = sharedStorageCapacity > 0 ? Math.min(100, (totalCargoUsed / sharedStorageCapacity) * 100) : 0;

  const activeMiningWings = (fleet.wings ?? [])
    .filter(wing => wing.type === 'mining')
    .map(wing => {
      const wingShips = miningShips.filter(ship => getWingByShipId(fleet, ship.id)?.id === wing.id);
      if (wingShips.length === 0) return null;

      const activeBeltIds = [...new Set(wingShips.map(ship => ship.assignedBeltId!).filter(Boolean))];
      const oreOutputs: Record<string, number> = {};
      for (const ship of wingShips) {
        const beltDef = ORE_BELTS[ship.assignedBeltId!];
        if (!beltDef) continue;
        for (const output of beltDef.outputs) {
          oreOutputs[output.resourceId] = (oreOutputs[output.resourceId] ?? 0) + output.baseRate;
        }
      }

      return {
        wing,
        wingShips,
        activeBeltIds,
        oreOutputs,
      };
    })
    .filter(Boolean) as Array<{
      wing: NonNullable<PlayerFleet['wings']>[number];
      wingShips: NonNullable<typeof miningShips[number]>[];
      activeBeltIds: string[];
      oreOutputs: Record<string, number>;
    }>;

  const storageTarget = getStorageTargetCopy(haulingWings.length);

  const canHaul = haulingWings.length === 1
    ? !haulingWings[0].isDispatched && state.systems.factions.homeStationSystemId !== null && state.systems.factions.homeStationSystemId !== fleet.currentSystemId && totalCargoUsed > 0
    : haulingWings.length === 0 && state.systems.factions.homeStationSystemId !== null && state.systems.factions.homeStationSystemId !== fleet.currentSystemId && totalCargoUsed > 0;

  return (
    <div
      ref={cardRef}
      className="rounded-xl border p-4 flex flex-col gap-3"
      style={{
        background: focused
          ? 'linear-gradient(135deg, rgba(3,8,20,0.96), rgba(34,211,238,0.12))'
          : 'linear-gradient(135deg, rgba(3,8,20,0.9), rgba(34,211,238,0.04))',
        borderColor: focused ? 'rgba(34,211,238,0.38)' : 'rgba(34,211,238,0.15)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <NavTag entityType="fleet" entityId={fleet.id} label={fleet.name} />
          {system && (
            <>
              <span className="text-slate-600">@</span>
              <NavTag entityType="system" entityId={system.id} label={system.name} />
              <span
                className="text-[9px] px-2 py-0.5 rounded border font-mono uppercase tracking-wider"
                style={{
                  color: secColor(system.security),
                  borderColor: `${secColor(system.security)}40`,
                  background: `${secColor(system.security)}15`,
                }}
              >
                {secLabel(system.security)}
              </span>
            </>
          )}
        </div>
        <div className="text-xs font-mono text-cyan-400">{miningShips.length} mining · {operationalShipIds.size}/{fleet.shipIds.length} operational</div>
      </div>

      {/* Active mining wings */}
      <div className="flex flex-col gap-2">
        {activeMiningWings.map(({ wing, wingShips, activeBeltIds, oreOutputs }) => (
          <div key={wing.id} className="rounded-lg border border-slate-700/30 bg-slate-950/35 px-3 py-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                <span className="text-xs font-semibold text-cyan-200 truncate">{wing.name}</span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 shrink-0">{wingShips.length} miners</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {activeBeltIds.map(beltId => {
                const beltDef = ORE_BELTS[beltId];
                if (!beltDef) return null;
                return (
                  <div key={beltId} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-cyan-500 shrink-0" />
                    <span className="text-xs text-slate-300 flex-1">{beltDef.name}</span>
                    <div className="flex gap-2 flex-wrap justify-end">
                      {beltDef.outputs.map(output => (
                        <span key={output.resourceId} className="text-xs font-mono text-cyan-300">
                          {RESOURCE_REGISTRY[output.resourceId]?.name ?? output.resourceId} +{(oreOutputs[output.resourceId] ?? 0).toFixed(2)}/s
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-slate-600">Storage Target</span>
                <span className="text-[9px] font-mono text-slate-500">
                  {storageTarget.label} · {formatResourceAmount(totalCargoUsed, 0)} / {formatResourceAmount(sharedStorageCapacity, 0)} m³
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    sharedStorageFillPct >= 95 ? 'bg-rose-500' : sharedStorageFillPct >= 70 ? 'bg-amber-500' : 'bg-cyan-600'
                  }`}
                  style={{ width: `${sharedStorageFillPct}%` }}
                />
              </div>
              <div className="text-[9px] text-slate-600 mt-1">{storageTarget.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Haul Now button */}
      {canHaul && (
        <button
          onClick={() => {
            if (state.systems.factions.homeStationSystemId) {
              if (haulingWings.length === 1) {
                dispatchHaulingWingToHQ(fleet.id, haulingWings[0].id);
              } else {
                issueHaul(fleet.id, state.systems.factions.homeStationSystemId);
              }
            }
          }}
          className="text-[10px] px-3 py-1.5 rounded border border-cyan-700/40 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-800/30 transition-all"
        >
          Haul to HQ
        </button>
      )}
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function MiningPanel() {
  const state = useGameStore(s => s.state);
  const focusTarget = useUiStore(s => s.focusTarget);
  const clearFocus = useUiStore(s => s.clearFocus);
  const [focusedFleetId, setFocusedFleetId] = useState<string | null>(null);
  const fleets = Object.values(state.systems.fleet.fleets);

  useEffect(() => {
    if (focusTarget?.entityType !== 'fleet') return;
    setFocusedFleetId(focusTarget.entityId);
    clearFocus();
  }, [focusTarget, clearFocus]);

  // Filter fleets that have ≥1 ship assigned to a belt
  const miningFleets = fleets.filter(fleet => {
    const operationalShipIds = new Set(getOperationalFleetShipIds(fleet));
    return fleet.shipIds.some(sid => {
      if (!operationalShipIds.has(sid)) return false;
      const ship = state.systems.fleet.ships[sid];
      return ship && ship.assignedBeltId;
    });
  });

  // Compute totals
  const totalOreRate = miningFleets.reduce((sum, fleet) => {
    const miningShips = fleet.shipIds
      .filter(sid => getOperationalFleetShipIds(fleet).includes(sid))
      .map(sid => state.systems.fleet.ships[sid])
      .filter(ship => ship && ship.assignedBeltId);
    return sum + miningShips.reduce((shipSum, ship) => {
      const beltDef = ORE_BELTS[ship!.assignedBeltId!];
      if (!beltDef) return shipSum;
      return shipSum + beltDef.outputs.reduce((oreSum, o) => oreSum + o.baseRate, 0);
    }, 0);
  }, 0);

  const avgCargoFill = miningFleets.length > 0
    ? miningFleets.reduce((sum, fleet) => {
        const used = getFleetStoredCargo(fleet);
        const cap = getFleetStorageCapacity(fleet, state.systems.fleet.ships, state.systems.fleet.pilots);
        return sum + (cap > 0 ? (used / cap) * 100 : 0);
      }, 0) / miningFleets.length
    : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="panel-header">⛏ Fleet Mining Operations</h2>
        <p className="text-slate-500 text-xs">
          {miningFleets.length === 0
            ? 'No fleets are currently mining. Open Fleet and assign ships to ore belts.'
            : 'Mining activity is grouped by active mining wing. Each wing shows the storage target currently backing its ore flow.'}
        </p>
      </div>

      {/* Fleet cards */}
      {miningFleets.length > 0 && (
        <div className="flex flex-col gap-3">
          {miningFleets.map(fleet => (
            <FleetMiningCard key={fleet.id} fleet={fleet} focused={focusedFleetId === fleet.id} />
          ))}
        </div>
      )}

      {/* Footer strip */}
      {miningFleets.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-slate-900/60 border border-slate-700/30">
          <span className="text-[10px] text-slate-500">
            <span className="font-mono text-cyan-400">{miningFleets.length}</span> mining fleet{miningFleets.length !== 1 ? 's' : ''}
          </span>
          <span className="text-[10px] text-slate-500">
            <span className="font-mono text-cyan-400">{totalOreRate.toFixed(2)}</span> ore/s total
          </span>
          <span className="text-[10px] text-slate-500">
            avg cargo <span className="font-mono text-cyan-400">{avgCargoFill.toFixed(0)}%</span>
          </span>
        </div>
      )}
    </div>
  );
}
