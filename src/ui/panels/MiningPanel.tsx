import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { ORE_BELTS } from '@/game/systems/mining/mining.config';
import { formatResourceAmount, RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { NavTag } from '@/ui/components/NavTag';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import type { PlayerFleet } from '@/types/game.types';
import { getFleetStorageCapacity, getFleetStoredCargo, getHaulingWings, getOperationalFleetShipIds, getWingByShipId } from '@/game/systems/fleet/wings.logic';
import { useUiStore } from '@/stores/uiStore';
import { ActivityBar } from '@/ui/effects/ActivityBar';
import { describeFleetActivity, describeWingActivity } from '@/ui/utils/fleetActivity';
import { ThemedIcon } from '@/ui/components/ThemedIcon';

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

// ─── Fleet Mining Card ───────────────────────────────────────────────────────

function FleetMiningCard({ fleet, focused = false }: { fleet: PlayerFleet; focused?: boolean }) {
  const state = useGameStore(s => s.state);
  const haulFleetToHQ = useGameStore(s => s.haulFleetToHQ);
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
  const haulingActive = haulingWings.some(wing => wing.isDispatched);

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

  const totalOreRate = Object.values(activeMiningWings.reduce<Record<string, number>>((acc, entry) => {
    for (const [resourceId, rate] of Object.entries(entry.oreOutputs)) {
      acc[resourceId] = (acc[resourceId] ?? 0) + rate;
    }
    return acc;
  }, {})).reduce((sum, rate) => sum + rate, 0);
  const activeBeltCount = activeMiningWings.reduce((sum, wing) => sum + wing.activeBeltIds.length, 0);
  const cargoTone = sharedStorageFillPct >= 80 ? 'amber' : sharedStorageFillPct > 0 ? 'cyan' : 'slate';
  const activityRate = Math.min(1, Math.max(totalOreRate / 8, sharedStorageFillPct / 100, haulingActive ? 0.65 : 0));

  const storageTarget = getStorageTargetCopy(haulingWings.length);
  const getSystemName = (systemId: string) => galaxy ? getSystemById(galaxy.seed, systemId)?.name ?? systemId : systemId;
  const fleetActivity = describeFleetActivity(state, fleet, getSystemName);

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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${totalOreRate > 0 ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
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
              <span className={`text-[8px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-widest ${
                haulingActive
                  ? 'text-amber-300 border-amber-700/30 bg-amber-950/15'
                  : 'text-slate-500 border-slate-700/30 bg-slate-900/40'
              }`}>
                {haulingActive ? 'hauling' : 'staged'}
              </span>
            </>
          )}
        </div>
        <div className="text-xs font-mono text-cyan-400">{miningShips.length} mining · {operationalShipIds.size}/{fleet.shipIds.length} operational</div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <CommandMetric label="Ore Flow" value={`${totalOreRate.toFixed(2)}/s`} meta={`${activeBeltCount} belts active`} tone="cyan" />
        <CommandMetric label="Storage" value={`${sharedStorageFillPct.toFixed(0)}%`} meta={`${formatResourceAmount(totalCargoUsed, 0)} / ${formatResourceAmount(sharedStorageCapacity, 0)} m3`} tone={cargoTone} />
        <CommandMetric label="Mining Wings" value={`${activeMiningWings.length}`} meta={`${miningShips.length} miners online`} tone={activeMiningWings.length > 0 ? 'violet' : 'slate'} />
        <CommandMetric label="Hauling" value={`${haulingWings.length}`} meta={haulingActive ? 'cargo in motion' : storageTarget.label} tone={haulingActive ? 'amber' : haulingWings.length > 0 ? 'emerald' : 'slate'} />
      </div>

      <ActivityBar active={totalOreRate > 0 || haulingActive} rate={activityRate} color={haulingActive ? 'amber' : 'cyan'} label="Extraction rate" valueLabel={haulingActive ? 'haul in motion' : `${totalOreRate.toFixed(2)}/s`} />

      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-700/30 bg-slate-950/35 px-3 py-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${fleetActivity.dotClass}`} />
        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
          fleetActivity.tone === 'cyan' ? 'border-cyan-400/25 bg-cyan-950/25 text-cyan-300/80' :
          fleetActivity.tone === 'amber' ? 'border-amber-400/25 bg-amber-950/25 text-amber-300/80' :
          fleetActivity.tone === 'emerald' ? 'border-emerald-400/25 bg-emerald-950/25 text-emerald-300/80' :
          fleetActivity.tone === 'violet' ? 'border-violet-400/25 bg-violet-950/25 text-violet-300/80' :
          fleetActivity.tone === 'rose' ? 'border-rose-400/25 bg-rose-950/25 text-rose-300/80' :
          'border-slate-700/30 bg-slate-900/40 text-slate-400'
        }`}>
          {fleetActivity.shortLabel}
        </span>
        <span className="text-[10px] text-slate-400">{fleetActivity.detail}</span>
      </div>

      {/* Active mining wings */}
      <div className="flex flex-col gap-2">
        {activeMiningWings.map(({ wing, wingShips, activeBeltIds, oreOutputs }) => {
          const wingActivity = describeWingActivity(state, fleet, wing, getSystemName);
          return (
          <div key={wing.id} className="rounded-lg border border-slate-700/30 bg-slate-950/35 px-3 py-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${wingActivity.dotClass}`} />
                <span className="text-xs font-semibold text-cyan-200 truncate">{wing.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[8px] px-1.5 py-0.5 rounded border ${
                  wingActivity.tone === 'cyan' ? 'border-cyan-400/25 bg-cyan-950/25 text-cyan-300/80' :
                  wingActivity.tone === 'amber' ? 'border-amber-400/25 bg-amber-950/25 text-amber-300/80' :
                  wingActivity.tone === 'emerald' ? 'border-emerald-400/25 bg-emerald-950/25 text-emerald-300/80' :
                  wingActivity.tone === 'violet' ? 'border-violet-400/25 bg-violet-950/25 text-violet-300/80' :
                  wingActivity.tone === 'rose' ? 'border-rose-400/25 bg-rose-950/25 text-rose-300/80' :
                  'border-slate-700/30 bg-slate-900/40 text-slate-400'
                }`}>
                  {wingActivity.shortLabel}
                </span>
                <span className="text-[10px] font-mono text-cyan-400">{wingShips.length} miners</span>
              </div>
            </div>

            <div className="text-[9px] text-slate-500">{wingActivity.detail}</div>

            <div className="flex flex-col gap-1.5">
              {activeBeltIds.map(beltId => {
                const beltDef = ORE_BELTS[beltId];
                if (!beltDef) return null;
                return (
                  <div key={beltId} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-cyan-500 shrink-0" />
                    <span className="text-xs text-slate-300 flex-1">{beltDef.name}</span>
                    <span
                      className="text-[8px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-widest"
                      style={{
                        color: secColor(beltDef.securityTier),
                        borderColor: `${secColor(beltDef.securityTier)}40`,
                        background: `${secColor(beltDef.securityTier)}15`,
                      }}
                    >
                      {secLabel(beltDef.securityTier)}
                    </span>
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
        );})}
      </div>

      {/* Haul Now button */}
      {canHaul && (
        <button
          onClick={() => {
            if (!state.systems.factions.homeStationSystemId) return;
            if (haulingWings.length === 1) {
              dispatchHaulingWingToHQ(fleet.id, haulingWings[0].id);
            } else {
              haulFleetToHQ(fleet.id);
            }
          }}
          className="text-[10px] px-3 py-1.5 rounded border border-cyan-700/40 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-800/30 transition-all"
        >
          Dispatch Haul to HQ
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
  const totalMiningWings = miningFleets.reduce((sum, fleet) => sum + (fleet.wings ?? []).filter(wing => wing.type === 'mining' && wing.shipIds.length > 0).length, 0);
  const haulingLines = miningFleets.reduce((sum, fleet) => sum + getHaulingWings(fleet).length, 0);
  const haulingActive = miningFleets.filter(fleet => getHaulingWings(fleet).some(wing => wing.isDispatched)).length;
  const highPressureFleets = miningFleets.filter(fleet => {
    const used = getFleetStoredCargo(fleet);
    const cap = getFleetStorageCapacity(fleet, state.systems.fleet.ships, state.systems.fleet.pilots);
    return cap > 0 && (used / cap) * 100 >= 80;
  }).length;
  const activityRate = Math.min(1, Math.max(totalOreRate / 12, avgCargoFill / 100, haulingActive / Math.max(1, miningFleets.length)));

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="panel-header"><ThemedIcon icon="mining" size={18} tone="#22d3ee" interactive />Fleet Mining Operations</h2>
        <p className="text-slate-500 text-xs">
          {miningFleets.length === 0
            ? 'No fleets are currently mining. Open Fleet and assign ships to ore belts.'
            : 'Mining activity is grouped by active mining wing. Each wing shows the storage target currently backing its ore flow.'}
        </p>
      </div>

      {miningFleets.length > 0 && (
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 px-3 py-2.5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 mb-3">
            <CommandMetric label="Mining Fleets" value={`${miningFleets.length}`} meta={`${totalMiningWings} wings extracting`} tone="cyan" />
            <CommandMetric label="Ore Flow" value={`${totalOreRate.toFixed(2)}/s`} meta="aggregate extraction" tone="cyan" />
            <CommandMetric label="Cargo Pressure" value={`${avgCargoFill.toFixed(0)}%`} meta={highPressureFleets > 0 ? `${highPressureFleets} fleets near full` : 'storage stable'} tone={highPressureFleets > 0 ? 'amber' : 'slate'} />
            <CommandMetric label="Hauling Lines" value={`${haulingLines}`} meta={haulingActive > 0 ? `${haulingActive} hauling now` : 'all staged'} tone={haulingActive > 0 ? 'amber' : haulingLines > 0 ? 'emerald' : 'slate'} />
          </div>
          <ActivityBar active={totalOreRate > 0 || haulingActive > 0} rate={activityRate} color={haulingActive > 0 ? 'amber' : 'cyan'} label="Mining load" valueLabel={haulingActive > 0 ? `${haulingActive} hauling` : `${totalMiningWings} wings`} />
        </div>
      )}

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
            avg cargo <span className={`font-mono ${avgCargoFill >= 80 ? 'text-amber-300' : 'text-cyan-400'}`}>{avgCargoFill.toFixed(0)}%</span>
          </span>
        </div>
      )}
    </div>
  );
}
