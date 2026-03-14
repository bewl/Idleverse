import { useGameStore } from '@/stores/gameStore';
import { RESOURCES_BY_TIER, RESOURCE_REGISTRY, formatResourceAmount } from '@/game/resources/resourceRegistry';

export function ResourceBar() {
  const resources = useGameStore(s => s.state.resources);

  // Show tiers 1 and 2 always; higher tiers only when player has any
  const visibleTiers = [1, 2, 3, 4, 5].filter(tier => {
    if (tier <= 2) return true;
    const defs = RESOURCES_BY_TIER[tier] ?? [];
    return defs.some(d => (resources[d.id] ?? 0) > 0);
  });

  return (
    <div className="bg-space-800 border-b border-slate-700/60 px-4 py-2 flex flex-wrap gap-3 items-center min-h-[44px]">
      <span className="text-xs text-slate-500 uppercase tracking-widest shrink-0">Resources</span>
      {visibleTiers.map(tier => {
        const defs = RESOURCES_BY_TIER[tier] ?? [];
        return defs.map(def => {
          const amount = resources[def.id] ?? 0;
          if (tier >= 3 && amount <= 0) return null;
          return (
            <div
              key={def.id}
              title={def.description}
              className="resource-chip"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TIER_DOT[tier]}`} />
              <span className="text-slate-400">{def.name}</span>
              <span className="text-slate-200 font-bold">
                {formatResourceAmount(amount, def.precision)}
              </span>
            </div>
          );
        });
      })}
    </div>
  );
}

const TIER_DOT: Record<number, string> = {
  1: 'bg-slate-400',
  2: 'bg-cyan-400',
  3: 'bg-violet-400',
  4: 'bg-amber-400',
  5: 'bg-rose-400',
};
