interface UpgradeCardProps {
  name: string;
  description: string;
  level: number;
  maxLevel: number;
  costLabel: string;
  canAfford: boolean;
  onPurchase: () => void;
  locked?: boolean;
  lockReason?: string;
}

export function UpgradeCard({
  name,
  description,
  level,
  maxLevel,
  costLabel,
  canAfford,
  onPurchase,
  locked = false,
  lockReason,
}: UpgradeCardProps) {
  const maxed = level >= maxLevel;

  return (
    <div className={`panel p-3 flex flex-col gap-2 ${locked ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-slate-200 text-xs font-bold">{name}</div>
          <div className="text-slate-500 text-xs mt-0.5">{description}</div>
        </div>
        <div className="shrink-0 text-right">
          {maxed ? (
            <span className="text-xs text-emerald-400 font-bold">MAX</span>
          ) : (
            <span className="text-xs text-slate-400">
              Lv {level}/{maxLevel}
            </span>
          )}
        </div>
      </div>

      {locked && lockReason && (
        <div className="text-xs text-amber-500/80">{lockReason}</div>
      )}

      {!locked && !maxed && (
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-xs text-slate-500">{costLabel}</span>
          <button
            className="btn-primary"
            disabled={!canAfford}
            onClick={onPurchase}
          >
            Upgrade
          </button>
        </div>
      )}
    </div>
  );
}
