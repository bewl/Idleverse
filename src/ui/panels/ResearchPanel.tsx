import { useGameStore } from '@/stores/gameStore';
import { RESEARCH_NODES, RESEARCH_CATEGORY_LABELS } from '@/game/systems/research/research.config';
import { isResearchAvailable } from '@/game/systems/research/research.logic';
import { calcResearchTime } from '@/game/balance/constants';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { formatResourceAmount } from '@/game/resources/resourceRegistry';

const CATEGORY_ORDER = ['industrial', 'energy', 'ai', 'exploration'] as const;

export function ResearchPanel() {
  const state = useGameStore(s => s.state);
  const startResearch = useGameStore(s => s.startResearch);
  const cancelResearch = useGameStore(s => s.cancelResearch);

  const { unlockedNodes, activeNodeId, activeProgress } = state.systems.research;
  const activeNode = activeNodeId ? RESEARCH_NODES[activeNodeId] : null;
  const activeTotalTime = activeNode
    ? calcResearchTime(activeNode.baseTime, activeNode.tier, activeNode.depth)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="panel-header">🔬 Research Laboratory</h2>
        <p className="text-slate-500 text-xs">
          Research unlocks new systems, technologies, and efficiency improvements.
        </p>
      </div>

      {/* Active research */}
      {activeNode && (
        <div className="panel border-violet-600/50">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="text-xs text-violet-400 uppercase tracking-wider mb-0.5">Researching…</div>
              <div className="text-slate-200 text-sm font-bold">{activeNode.name}</div>
            </div>
            <button className="btn-danger text-xs" onClick={cancelResearch}>Cancel (50% refund)</button>
          </div>
          <ProgressBar value={activeTotalTime > 0 ? activeProgress / activeTotalTime : 0} color="violet" />
          <div className="flex justify-between mt-1 text-xs text-slate-500">
            <span>{activeProgress.toFixed(0)}s elapsed</span>
            <span>{activeTotalTime.toFixed(0)}s total</span>
          </div>
        </div>
      )}

      {/* Research tree by category */}
      {CATEGORY_ORDER.map(category => {
        const nodes = Object.values(RESEARCH_NODES).filter(n => n.category === category);
        if (nodes.length === 0) return null;
        return (
          <div key={category}>
            <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">
              {RESEARCH_CATEGORY_LABELS[category]}
            </div>
            <div className="flex flex-col gap-2">
              {nodes.map(def => {
                const done = unlockedNodes[def.id] === true;
                const available = isResearchAvailable(def.id, state);
                const isActive = activeNodeId === def.id;
                const canAfford = available && Object.entries(def.baseCost).every(
                  ([r, amt]) => (state.resources[r] ?? 0) >= amt
                );
                const costParts = Object.entries(def.baseCost).map(([r, amt]) =>
                  `${formatResourceAmount(amt, 0)} ${r}`
                );

                return (
                  <div
                    key={def.id}
                    className={`panel p-3 ${done ? 'border-emerald-700/40 opacity-60' : ''} ${isActive ? 'border-violet-600/50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {done && <span className="text-emerald-400 text-xs">✓</span>}
                          <span className={`text-xs font-bold ${done ? 'text-slate-500' : 'text-slate-200'}`}>
                            {def.name}
                          </span>
                          <span className="text-xs text-slate-600">T{def.tier}</span>
                        </div>
                        <p className="text-slate-500 text-xs mt-0.5">{def.description}</p>
                        {!done && def.prerequisites.length > 0 && (
                          <div className="mt-1 text-xs text-slate-600">
                            Requires: {def.prerequisites.join(', ')}
                          </div>
                        )}
                        {!done && (
                          <div className="mt-1 text-xs text-slate-500">
                            ⏱ {calcResearchTime(def.baseTime, def.tier, def.depth).toFixed(0)}s
                            {costParts.length > 0 && ` • ${costParts.join(' + ')}`}
                          </div>
                        )}
                      </div>
                      {!done && !isActive && available && (
                        <button
                          className="btn-primary shrink-0"
                          disabled={!!activeNodeId || !canAfford}
                          onClick={() => startResearch(def.id)}
                        >
                          Research
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
