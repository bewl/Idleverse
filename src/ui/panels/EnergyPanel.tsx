import { useGameStore } from '@/stores/gameStore';
import { ENERGY_SOURCES, ENERGY_SOURCE_ORDER } from '@/game/systems/energy/energy.config';
import { upgradeCost } from '@/game/balance/constants';
import { formatResourceAmount } from '@/game/resources/resourceRegistry';

export function EnergyPanel() {
  const state = useGameStore(s => s.state);
  const purchaseEnergySource = useGameStore(s => s.purchaseEnergySource);

  const { totalSupply, totalDemand, powerFactor, sources } = state.systems.energy;
  const isDeficit = totalDemand > totalSupply;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="panel-header">⚡ Energy Grid</h2>
        <p className="text-slate-500 text-xs">
          Energy powers all active systems. Insufficient supply reduces production across the board.
        </p>
      </div>

      {/* Status */}
      <div className="panel">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-emerald-400">{totalSupply.toFixed(1)}</div>
            <div className="text-xs text-slate-500">Supply / sec</div>
          </div>
          <div>
            <div className={`text-lg font-bold ${isDeficit ? 'text-red-400' : 'text-slate-300'}`}>
              {totalDemand.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500">Demand / sec</div>
          </div>
          <div>
            <div className={`text-lg font-bold ${isDeficit ? 'text-amber-400' : 'text-cyan-400'}`}>
              {Math.round(powerFactor * 100)}%
            </div>
            <div className="text-xs text-slate-500">Efficiency</div>
          </div>
        </div>
        {isDeficit && (
          <div className="mt-3 text-xs text-amber-400/80 bg-amber-900/20 border border-amber-700/40 rounded px-2 py-1 text-center">
            ⚡ Power deficit —  build more energy sources to restore full efficiency
          </div>
        )}
      </div>

      {/* Energy sources */}
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Energy Sources</div>
        <div className="flex flex-col gap-2">
          {ENERGY_SOURCE_ORDER.map(sourceId => {
            const def = ENERGY_SOURCES[sourceId];
            if (!def) return null;
            const level = sources[sourceId] ?? 0;
            const locked = def.unlockResearch
              ? !state.systems.research.unlockedNodes[def.unlockResearch]
              : false;
            const costParts: string[] = [];
            for (const [resourceId, baseAmount] of Object.entries(def.baseCost)) {
              const cost = upgradeCost(baseAmount, level);
              const have = state.resources[resourceId] ?? 0;
              costParts.push(`${formatResourceAmount(cost, 0)} ${resourceId} (${formatResourceAmount(have, 0)})`);
            }
            const canAfford = !locked && Object.entries(def.baseCost).every(
              ([r, base]) => (state.resources[r] ?? 0) >= upgradeCost(base, level)
            );
            const contributing = def.supplyPerLevel * level;

            return (
              <div key={sourceId} className={`panel p-3 ${locked ? 'opacity-40' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-200 text-xs font-bold">{def.name}</span>
                      <span className="text-xs text-slate-500">Lv {level}/{def.maxLevel}</span>
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5">{def.description}</p>
                    <div className="flex gap-3 mt-1.5 text-xs">
                      <span className="text-emerald-400">+{def.supplyPerLevel}/s per level</span>
                      {level > 0 && (
                        <span className="text-cyan-400">Total: +{contributing}/s</span>
                      )}
                    </div>
                    {!locked && level < def.maxLevel && (
                      <div className="text-xs text-slate-500 mt-1">{costParts.join(' • ')}</div>
                    )}
                    {locked && (
                      <div className="text-xs text-slate-600 mt-1">🔒 Requires: {def.unlockResearch}</div>
                    )}
                  </div>
                  {!locked && level < def.maxLevel && (
                    <button
                      className="btn-primary shrink-0"
                      disabled={!canAfford}
                      onClick={() => purchaseEnergySource(sourceId)}
                    >
                      Build
                    </button>
                  )}
                  {level >= def.maxLevel && (
                    <span className="text-xs text-emerald-400 font-bold shrink-0">MAX</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
