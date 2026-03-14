import { useGameStore } from '@/stores/gameStore';
import { canPrestige, getPrestigePointsPreview, getPrestigeProductionBonus } from '@/game/prestige/prestige.logic';
import { formatResourceAmount } from '@/game/resources/resourceRegistry';

export function PrestigePanel() {
  const state = useGameStore(s => s.state);
  const triggerPrestige = useGameStore(s => s.triggerPrestige);

  const { points, totalLifetimeProduction, runCount } = state.prestige;
  const previewPoints = getPrestigePointsPreview(state);
  const currentBonus = getPrestigeProductionBonus(state);
  const newBonus = (1 + (points + previewPoints) * 0.02);
  const eligible = canPrestige(state);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="panel-header">♾ Timeline Prestige</h2>
        <p className="text-slate-500 text-xs">
          Reset your current timeline in exchange for permanent production bonuses.
          Infrastructure resets, but prestige points, discoveries, and bonuses are retained.
        </p>
      </div>

      {/* Stats */}
      <div className="panel">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Timeline</div>
            <div className="text-2xl font-bold text-violet-400">#{runCount + 1}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Prestige Points</div>
            <div className="text-2xl font-bold text-amber-400">{points}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Lifetime Production</div>
            <div className="text-lg font-bold text-slate-300">
              {formatResourceAmount(totalLifetimeProduction, 1)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Production Bonus</div>
            <div className="text-lg font-bold text-cyan-400">×{currentBonus.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Prestige preview */}
      <div className="panel border-violet-700/40">
        <div className="text-xs text-violet-400 uppercase tracking-wider mb-3">Prestige Preview</div>
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Points earned this reset</span>
            <span className={`font-bold ${eligible ? 'text-amber-400' : 'text-slate-600'}`}>
              +{previewPoints}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Total points after</span>
            <span className="text-amber-400 font-bold">{points + previewPoints}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">New production bonus</span>
            <span className="text-cyan-400 font-bold">×{newBonus.toFixed(2)}</span>
          </div>
        </div>

        {!eligible && (
          <div className="mt-3 text-xs text-slate-600 bg-space-700 rounded p-2">
            Prestige requires at least 1,000 lifetime resource production.
            Current: {formatResourceAmount(totalLifetimeProduction, 1)}
          </div>
        )}

        <button
          className="btn-violet w-full mt-4"
          disabled={!eligible}
          onClick={triggerPrestige}
        >
          ♾ Collapse Timeline
        </button>
      </div>

      {/* What resets / what persists */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="panel p-3">
          <div className="text-red-400 font-bold mb-2 uppercase tracking-wider text-xs">Resets</div>
          <ul className="flex flex-col gap-1 text-slate-400">
            <li>• All resources</li>
            <li>• Mining progress</li>
            <li>• Research unlocks</li>
            <li>• Manufacturing queue</li>
            <li>• Energy sources</li>
          </ul>
        </div>
        <div className="panel p-3">
          <div className="text-emerald-400 font-bold mb-2 uppercase tracking-wider text-xs">Preserved</div>
          <ul className="flex flex-col gap-1 text-slate-400">
            <li>• Prestige points</li>
            <li>• Production bonus</li>
            <li>• Run count</li>
            <li>• Lifetime production</li>
            <li>• Settings</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
