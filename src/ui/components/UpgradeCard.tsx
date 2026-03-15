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
  /** Show "Auto-Build" button when the player can't directly afford. */
  onAutoBuild?: () => void;
  onCancelAutoBuild?: () => void;
  isPendingAutoBuild?: boolean;
  pendingCount?: number;
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
  onAutoBuild,
  onCancelAutoBuild,
  isPendingAutoBuild,
  pendingCount = 0,
}: UpgradeCardProps) {
  const maxed = level >= maxLevel;
  const projectedLevel = Math.min(maxLevel, level + pendingCount);
  const autoCapReached = level + pendingCount >= maxLevel;

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
              {pendingCount > 0 && (
                <span className="text-violet-400/80 ml-1">
                  → {projectedLevel >= maxLevel ? <span className="text-emerald-400/80">MAX</span> : `Lv ${projectedLevel}`}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {locked && lockReason && (
        <div className="text-xs text-amber-500/80">{lockReason}</div>
      )}

      {!locked && !maxed && (
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-xs text-slate-500 flex-1 min-w-0 truncate">{costLabel}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {isPendingAutoBuild && (
              <button className="btn-secondary text-xs py-1" onClick={onCancelAutoBuild} title="Cancel one queued auto-build project">
                ⚙ {pendingCount > 1 ? `×${pendingCount}` : 'Queued'}
              </button>
            )}
            {!canAfford && onAutoBuild && !autoCapReached && (
              <button className="btn-violet text-xs py-1" onClick={onAutoBuild} title="Auto-queue manufacturing to build this">
                ⚡ Auto
              </button>
            )}
            <button
              className="btn-primary"
              disabled={!canAfford}
              onClick={onPurchase}
            >
              Upgrade
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
