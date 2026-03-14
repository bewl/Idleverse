import { useGameStore } from '@/stores/gameStore';
import { MINING_TARGETS, MINING_UPGRADES, MINING_UPGRADE_ORDER } from '@/game/systems/mining/mining.config';
import { upgradeCost } from '@/game/balance/constants';
import { UpgradeCard } from '@/ui/components/UpgradeCard';
import { formatResourceAmount } from '@/game/resources/resourceRegistry';

export function MiningPanel() {
  const state = useGameStore(s => s.state);
  const toggleMiningTarget = useGameStore(s => s.toggleMiningTarget);
  const purchaseMiningUpgrade = useGameStore(s => s.purchaseMiningUpgrade);

  const { targets, upgrades } = state.systems.mining;
  const { totalSupply, totalDemand, powerFactor } = state.systems.energy;
  const powerShortfall = powerFactor < 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="panel-header">⛏ Asteroid Mining</h2>
        <p className="text-slate-500 text-xs">
          Activate asteroid targets to begin resource extraction. Energy efficiency: {Math.round(powerFactor * 100)}%
        </p>
        {powerShortfall && (
          <div className="mt-2 text-xs text-amber-400/80 bg-amber-900/20 border border-amber-700/40 rounded px-2 py-1">
            ⚡ Low power mode — demand ({totalDemand.toFixed(0)}) exceeds supply ({totalSupply.toFixed(0)}). Production slowed.
          </div>
        )}
      </div>

      {/* Asteroid targets */}
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Asteroid Targets</div>
        <div className="flex flex-col gap-2">
          {Object.values(MINING_TARGETS).map(def => {
            const isUnlocked = !def.unlockResearch || state.systems.research.unlockedNodes[def.unlockResearch];
            const isActive = targets[def.id] ?? false;

            return (
              <div
                key={def.id}
                className={`panel p-3 transition-colors ${isActive ? 'border-cyan-600/60' : ''} ${!isUnlocked ? 'opacity-40' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
                      <span className="text-slate-200 text-xs font-bold">{def.name}</span>
                      <span className="text-slate-500 text-xs">⚡ {def.energyCost}/s</span>
                    </div>
                    <p className="text-slate-500 text-xs mt-1 ml-4">{def.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2 ml-4">
                      {def.outputs.map(o => (
                        <span key={o.resourceId} className="text-xs text-cyan-400/80 bg-cyan-900/20 border border-cyan-800/40 rounded px-1.5 py-0.5">
                          +{o.baseRate}/s {o.resourceId}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    className={isActive ? 'btn-danger' : 'btn-primary'}
                    disabled={!isUnlocked}
                    onClick={() => toggleMiningTarget(def.id)}
                  >
                    {isActive ? 'Stop' : 'Mine'}
                  </button>
                </div>
                {!isUnlocked && (
                  <div className="mt-2 text-xs text-slate-600">
                    🔒 Requires research: {def.unlockResearch}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upgrades */}
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Upgrades</div>
        <div className="flex flex-col gap-2">
          {MINING_UPGRADE_ORDER.map(upgradeId => {
            const def = MINING_UPGRADES[upgradeId];
            if (!def) return null;
            const level = upgrades[upgradeId] ?? 0;
            const locked =
              (def.prerequisiteResearch && !state.systems.research.unlockedNodes[def.prerequisiteResearch]) ??
              (def.prerequisiteUpgrade && (upgrades[def.prerequisiteUpgrade] ?? 0) < 1) ??
              false;
            const costParts: string[] = [];
            for (const [resourceId, baseAmount] of Object.entries(def.baseCost)) {
              const cost = upgradeCost(baseAmount, level);
              const have = state.resources[resourceId] ?? 0;
              costParts.push(`${formatResourceAmount(cost, 0)} ${resourceId} (have ${formatResourceAmount(have, 0)})`);
            }
            const canAfford = !locked && Object.entries(def.baseCost).every(([r, base]) => {
              return (state.resources[r] ?? 0) >= upgradeCost(base, level);
            });

            return (
              <UpgradeCard
                key={upgradeId}
                name={def.name}
                description={def.description}
                level={level}
                maxLevel={def.maxLevel}
                costLabel={costParts.join(' + ')}
                canAfford={canAfford}
                onPurchase={() => purchaseMiningUpgrade(upgradeId)}
                locked={!!locked}
                lockReason={def.prerequisiteResearch ? `Research: ${def.prerequisiteResearch}` : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
