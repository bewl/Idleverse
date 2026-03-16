import { useGameStore } from '@/stores/gameStore';
import { ORE_BELTS } from '@/game/systems/mining/mining.config';
import { formatResourceAmount, RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { NavTag } from '@/ui/components/NavTag';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import { computeFleetCargoCapacity } from '@/game/systems/fleet/fleet.logic';
import type { PlayerFleet } from '@/types/game.types';

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

// ─── Fleet Mining Card ───────────────────────────────────────────────────────

function FleetMiningCard({ fleet }: { fleet: PlayerFleet }) {
  const state = useGameStore(s => s.state);
  const issueHaul = useGameStore(s => s.issueFleetGroupOrder);
  const ships = state.systems.fleet.ships;
  const galaxy = state.galaxy;

  // Mining ships in this fleet
  const miningShips = fleet.shipIds
    .map(sid => ships[sid])
    .filter(ship => ship && ship.assignedBeltId);

  if (miningShips.length === 0) return null;

  // Fleet system
  const system = galaxy ? getSystemById(galaxy.seed, fleet.currentSystemId) : null;

  // Cargo stats
  const totalCargoUsed = Object.values(fleet.cargoHold).reduce((sum, amt) => sum + amt, 0);
  const capacity = computeFleetCargoCapacity(fleet, ships);
  const fillPct = capacity > 0 ? Math.min(100, (totalCargoUsed / capacity) * 100) : 0;

  // Belts active in this fleet
  const activeBeltIds = [...new Set(miningShips.map(s => s.assignedBeltId!))];

  // Ore rates (sum outputs from each mining ship's belt)
  const oreOutputs: Record<string, number> = {};
  for (const ship of miningShips) {
    const beltDef = ORE_BELTS[ship.assignedBeltId!];
    if (!beltDef) continue;
    for (const output of beltDef.outputs) {
      // baseRate × skill multiplier — approximate; real logic is in fleet.tick.ts
      oreOutputs[output.resourceId] = (oreOutputs[output.resourceId] ?? 0) + output.baseRate;
    }
  }

  const canHaul = state.systems.factions.homeStationSystemId !== null && totalCargoUsed > 0;

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.9), rgba(34,211,238,0.04))',
        borderColor: 'rgba(34,211,238,0.15)',
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
        <div className="text-xs font-mono text-cyan-400">{miningShips.length} mining</div>
      </div>

      {/* Active belts */}
      <div className="flex flex-col gap-1.5">
        {activeBeltIds.map(beltId => {
          const beltDef = ORE_BELTS[beltId];
          if (!beltDef) return null;
          return (
            <div key={beltId} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
              <span className="text-xs text-slate-300 flex-1">{beltDef.name}</span>
              <div className="flex gap-2">
                {beltDef.outputs.map(o => (
                  <span key={o.resourceId} className="text-xs font-mono text-cyan-300">
                    {RESOURCE_REGISTRY[o.resourceId]?.name ?? o.resourceId} +{(oreOutputs[o.resourceId] ?? 0).toFixed(2)}/s
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cargo hold fill bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-slate-600">Cargo Hold</span>
          <span className="text-[9px] font-mono text-slate-500">
            {formatResourceAmount(totalCargoUsed, 0)} / {formatResourceAmount(capacity, 0)} m³
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              fillPct >= 95 ? 'bg-rose-500' : fillPct >= 70 ? 'bg-amber-500' : 'bg-cyan-600'
            }`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      {/* Haul Now button */}
      {canHaul && (
        <button
          onClick={() => {
            if (state.systems.factions.homeStationSystemId) {
              issueHaul(fleet.id, state.systems.factions.homeStationSystemId);
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
  const fleets = Object.values(state.systems.fleet.fleets);

  // Filter fleets that have ≥1 ship assigned to a belt
  const miningFleets = fleets.filter(fleet => {
    return fleet.shipIds.some(sid => {
      const ship = state.systems.fleet.ships[sid];
      return ship && ship.assignedBeltId;
    });
  });

  // Compute totals
  const totalOreRate = miningFleets.reduce((sum, fleet) => {
    const miningShips = fleet.shipIds
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
        const used = Object.values(fleet.cargoHold).reduce((a, b) => a + b, 0);
        const cap = computeFleetCargoCapacity(fleet, state.systems.fleet.ships);
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
            : 'Ore mined by fleets fills their cargo holds. Fleets auto-haul to Corp HQ when full.'}
        </p>
      </div>

      {/* Fleet cards */}
      {miningFleets.length > 0 && (
        <div className="flex flex-col gap-3">
          {miningFleets.map(fleet => (
            <FleetMiningCard key={fleet.id} fleet={fleet} />
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
