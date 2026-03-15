import { useGameStore } from '@/stores/gameStore';
import { ORE_BELTS, MINING_UPGRADES, UPGRADE_ORDER } from '@/game/systems/mining/mining.config';
import { upgradeCost } from '@/game/balance/constants';
import { UpgradeCard } from '@/ui/components/UpgradeCard';
import { formatResourceAmount, RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { ActivityBar } from '@/ui/effects/ActivityBar';
import { useResourceRates } from '@/game/hooks/useResourceRates';
import {
  getMiningSkillMultiplier,
  getOreHoldCapacity,
  getOreHoldUsed,
  getHaulIntervalSeconds,
  getCurrentSystemBeltIds,
} from '@/game/systems/mining/mining.logic';
import { StatTooltip } from '@/ui/tooltip/StatTooltip';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import type { OreSecurityTier } from '@/types/game.types';

// ─── Ore hold meter ───────────────────────────────────────────────────────────

function OreHoldMeter() {
  const state    = useGameStore(s => s.state);
  const haulNow  = useGameStore(s => s.haulOreHold);
  const capacity = getOreHoldCapacity(state);
  const used     = getOreHoldUsed(state);
  const fillPct  = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;
  const intervalSec = getHaulIntervalSeconds(state);
  const nextHaulMs  = state.systems.mining.lastHaulAt + intervalSec * 1000;
  const msRemaining = Math.max(0, nextHaulMs - state.lastUpdatedAt);
  const secRemaining = Math.ceil(msRemaining / 1000);

  // Ore content summary
  const holdEntries = Object.entries(state.systems.mining.oreHold).filter(([, v]) => v > 0);

  const fillClass =
    fillPct >= 95 ? 'bg-rose-500'
    : fillPct >= 70 ? 'bg-amber-500'
    : 'bg-cyan-500';

  return (
    <div className="rounded-xl border border-slate-700/30 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Ore Hold</span>
        <span className="text-xs font-mono text-slate-300">
          {formatResourceAmount(used, 0)} / {formatResourceAmount(capacity, 0)} units
        </span>
      </div>

      {/* Fill bar */}
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${fillClass}`}
          style={{ width: `${fillPct}%` }}
        />
      </div>

      {/* Hold contents */}
      {holdEntries.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {holdEntries.map(([id, amount]) => (
            <span key={id} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/30">
              {RESOURCE_REGISTRY[id]?.name ?? id}: {formatResourceAmount(amount, 0)}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          Auto-haul in <span className="text-slate-400 font-mono">{secRemaining}s</span>
        </span>
        <button
          onClick={haulNow}
          disabled={used === 0}
          className="text-[10px] px-2.5 py-1 rounded border border-cyan-700/40 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-800/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          Return to Station
        </button>
      </div>
    </div>
  );
}

// ─── Security tier styling ─────────────────────────────────────────────────

const TIER_CONFIG: Record<OreSecurityTier, { label: string; color: string; dotClass: string; borderClass: string; badgeClass: string }> = {
  highsec: {
    label: 'High-Sec', color: '#22d3ee',
    dotClass:    'bg-cyan-400',
    borderClass: 'border-cyan-700/30',
    badgeClass:  'text-cyan-400 bg-cyan-900/25 border-cyan-700/30',
  },
  lowsec: {
    label: 'Low-Sec', color: '#fbbf24',
    dotClass:    'bg-amber-400',
    borderClass: 'border-amber-700/30',
    badgeClass:  'text-amber-400 bg-amber-900/20 border-amber-700/30',
  },
  nullsec: {
    label: 'Null-Sec', color: '#f43f5e',
    dotClass:    'bg-rose-400',
    borderClass: 'border-rose-700/30',
    badgeClass:  'text-rose-400 bg-rose-900/20 border-rose-700/30',
  },
};

// ─── Belt card ─────────────────────────────────────────────────────────────

function BeltCard({ beltId }: { beltId: string }) {
  const state          = useGameStore(s => s.state);
  const toggleBelt     = useGameStore(s => s.toggleMiningBelt);
  const rates          = useResourceRates();

  const def        = ORE_BELTS[beltId];
  if (!def) return null;

  const isActive    = state.systems.mining.targets[beltId] ?? false;
  const cfg         = TIER_CONFIG[def.securityTier];
  const skillLevels = state.systems.skills.levels;

  // Belt accessibility
  const isAccessible = def.requiredSkill
    ? (skillLevels[def.requiredSkill.skillId] ?? 0) >= def.requiredSkill.minLevel
    : true;

  // Pool depletion
  const nowMs        = state.lastUpdatedAt;
  const respawnAt    = state.systems.mining.beltRespawnAt[beltId] ?? 0;
  const isDepleted   = respawnAt > 0 && nowMs < respawnAt;
  const msUntilRespawn = isDepleted ? Math.max(0, respawnAt - nowMs) : 0;
  const secUntilRespawn = Math.ceil(msUntilRespawn / 1000);

  // Pool level for bar
  const { poolSize } = def;
  const poolRemaining = state.systems.mining.beltPool[beltId] ?? (isDepleted ? 0 : poolSize);
  const poolPct = poolSize > 0 ? Math.min(100, (poolRemaining / poolSize) * 100) : 0;

  const yieldMult = getMiningSkillMultiplier(state);

  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        !isAccessible ? 'opacity-40' : ''
      } ${
        isDepleted
          ? 'border-slate-700/40 opacity-60'
          : isActive ? `border-${def.securityTier === 'highsec' ? 'cyan' : def.securityTier === 'lowsec' ? 'amber' : 'rose'}-600/50 shadow-[0_0_12px_rgba(34,211,238,0.05)]` : 'border-slate-700/30'
      }`}
      style={{ background: isDepleted ? 'rgba(3,8,20,0.4)' : isActive ? `${cfg.color}06` : 'rgba(3,8,20,0.6)' }}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Active indicator */}
        <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${
          isDepleted ? 'bg-slate-600' : isActive ? `${cfg.dotClass} animate-pulse` : 'bg-slate-700'
        }`} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-bold text-slate-100">{def.name}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${cfg.badgeClass}`}>
              {cfg.label}
            </span>
            {isDepleted && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider text-slate-500 bg-slate-800/40 border-slate-700/30">
                DEPLETED
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-2">{def.description}</p>

          {/* Resource outputs */}
          <div className="flex flex-wrap gap-1 mb-2">
            {def.outputs.map(o => {
              const actual = isActive && !isDepleted ? (rates[o.resourceId] ?? o.baseRate * yieldMult) : o.baseRate * yieldMult;
              const resName = RESOURCE_REGISTRY[o.resourceId]?.name ?? o.resourceId;
              return (
                <span
                  key={o.resourceId}
                  className="text-xs font-mono rounded px-1.5 py-0.5"
                  style={{ background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}33` }}
                >
                  +{actual.toFixed(2)}/s {resName}
                </span>
              );
            })}
          </div>

          {/* Pool depletion bar */}
          {!isDepleted && (
            <div className="mb-1">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] text-slate-600">Belt pool</span>
                <span className="text-[9px] font-mono text-slate-500">{Math.round(poolPct)}%</span>
              </div>
              <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    poolPct > 50 ? 'bg-cyan-600' : poolPct > 20 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${poolPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Respawn countdown */}
          {isDepleted && (
            <div className="text-xs text-slate-500 mb-1">
              Respawns in{' '}
              <span className="font-mono text-amber-400">
                {secUntilRespawn >= 3600
                  ? `${Math.floor(secUntilRespawn / 3600)}h ${Math.floor((secUntilRespawn % 3600) / 60)}m`
                  : secUntilRespawn >= 60
                  ? `${Math.floor(secUntilRespawn / 60)}m ${secUntilRespawn % 60}s`
                  : `${secUntilRespawn}s`}
              </span>
            </div>
          )}

          {/* Activity bar when active */}
          {isActive && !isDepleted && (
            <ActivityBar active rate={0.7} color={def.securityTier === 'highsec' ? 'cyan' : def.securityTier === 'lowsec' ? 'amber' : 'rose'} className="mt-1" />
          )}

          {/* Lock reason */}
          {!isAccessible && def.requiredSkill && (
            <div className="text-xs text-slate-600 mt-1">
              🔒 Requires {def.requiredSkill.skillId} Lv{def.requiredSkill.minLevel}
            </div>
          )}
        </div>

        {/* Toggle button */}
        <button
          disabled={!isAccessible || isDepleted}
          onClick={() => toggleBelt(beltId)}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 ${
            isDepleted
              ? 'bg-slate-800/40 border-slate-700/40 text-slate-600 cursor-not-allowed'
              : isActive
              ? 'bg-rose-900/40 border-rose-600/50 text-rose-300 hover:bg-rose-800/50'
              : isAccessible
              ? 'bg-cyan-900/30 border-cyan-700/40 text-cyan-300 hover:bg-cyan-800/40 hover:scale-[1.02]'
              : 'bg-slate-800/40 border-slate-700/40 text-slate-600 cursor-not-allowed'
          }`}
        >
          {isDepleted ? 'Wait' : isActive ? 'Stop' : 'Mine'}
        </button>
      </div>
    </div>
  );
}

// ─── Mining upgrade row ────────────────────────────────────────────────────

function MiningUpgradeRow({ upgradeId }: { upgradeId: string }) {
  const state             = useGameStore(s => s.state);
  const purchaseUpgrade   = useGameStore(s => s.purchaseMiningUpgrade);
  const def               = MINING_UPGRADES[upgradeId];
  if (!def) return null;

  const level      = state.systems.mining.upgrades[upgradeId] ?? 0;
  const skillLevels = state.systems.skills.levels;
  const locked     = !!(def.prerequisiteSkill && (skillLevels[def.prerequisiteSkill.skillId] ?? 0) < def.prerequisiteSkill.minLevel);

  const costs: Record<string, number> = {};
  const costParts: string[] = [];
  for (const [r, base] of Object.entries(def.baseCost)) {
    const c = upgradeCost(base, level);
    costs[r] = c;
    const rName = RESOURCE_REGISTRY[r]?.name ?? r;
    costParts.push(`${formatResourceAmount(c, 0)} ${rName} (have ${formatResourceAmount(state.resources[r] ?? 0, 0)})`);
  }

  const canAfford = !locked && Object.entries(costs).every(([r, c]) => (state.resources[r] ?? 0) >= c);

  return (
    <UpgradeCard
      name={def.name}
      description={def.description}
      level={level}
      maxLevel={def.maxLevel}
      costLabel={costParts.join(' + ')}
      canAfford={canAfford}
      onPurchase={() => purchaseUpgrade(upgradeId)}
      locked={locked}
      lockReason={def.prerequisiteSkill ? `Requires ${def.prerequisiteSkill.skillId} Lv${def.prerequisiteSkill.minLevel}` : undefined}
    />
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────

export function MiningPanel() {
  const state       = useGameStore(s => s.state);
  const yieldMult   = getMiningSkillMultiplier(state);
  const activeBelts = Object.entries(state.systems.mining.targets).filter(([, v]) => v).map(([id]) => id);

  // Current system + warp state
  const galaxy     = state.galaxy;
  const inWarp     = !!(galaxy?.warp);
  const currentSystem = galaxy ? getSystemById(galaxy.seed, galaxy.currentSystemId) : null;

  // Belts available in current system (filters by location + skill in mining.logic)
  const systemBeltIds = getCurrentSystemBeltIds(state);

  // Group available belts by security tier
  const highsecBelts  = systemBeltIds.filter(id => ORE_BELTS[id]?.securityTier === 'highsec');
  const lowsecBelts   = systemBeltIds.filter(id => ORE_BELTS[id]?.securityTier === 'lowsec');
  const nullsecBelts  = systemBeltIds.filter(id => ORE_BELTS[id]?.securityTier === 'nullsec');

  function secColor(sec: string) {
    if (sec === 'highsec') return '#4ade80';
    if (sec === 'lowsec')  return '#fb923c';
    return '#f87171';
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="panel-header">⛏ Asteroid Mining</h2>

        {/* Current system indicator */}
        {currentSystem && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-slate-500">Location:</span>
            <span className="text-[10px] text-slate-300 font-semibold">{currentSystem.name}</span>
            <span
              className="text-[8px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider"
              style={{
                color: secColor(currentSystem.security),
                borderColor: `${secColor(currentSystem.security)}40`,
                background: `${secColor(currentSystem.security)}15`,
              }}
            >
              {currentSystem.security === 'highsec' ? 'High-Sec' : currentSystem.security === 'lowsec' ? 'Low-Sec' : 'Null-Sec'}
            </span>
          </div>
        )}

        <p className="text-slate-500 text-xs">
          {inWarp
            ? 'Mining suspended during warp transit.'
            : systemBeltIds.length === 0
            ? 'No asteroid belts in this system. Travel to another system.'
            : 'Activate ore belts to begin extraction. Skill bonuses apply automatically.'}
        </p>

        {/* Warp banner */}
        {inWarp && (
          <div className="mt-2 px-3 py-2 rounded border border-violet-700/25 bg-violet-900/10 text-[10px] text-violet-400 font-mono">
            ⊛ In warp — all mining suspended until arrival
          </div>
        )}

        {!inWarp && (
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-cyan-700/25 bg-cyan-900/10">
              <StatTooltip modifierKey="mining-yield">
                <span className="text-xs text-cyan-400 font-mono">×{yieldMult.toFixed(2)}</span>
              </StatTooltip>
              <span className="text-[10px] text-slate-600">yield bonus</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-slate-700/25 bg-slate-900/40">
              <span className="text-xs text-slate-300 font-mono">{activeBelts.length}</span>
              <span className="text-[10px] text-slate-600">active belt{activeBelts.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
      </div>

      {/* Ore hold meter */}
      <OreHoldMeter />

      {/* HighSec belts */}
      {highsecBelts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">High-Sec Belts</span>
            <span className="h-px flex-1 bg-cyan-700/20 rounded-full" />
          </div>
          <div className="flex flex-col gap-2">
            {highsecBelts.map(id => <BeltCard key={id} beltId={id} />)}
          </div>
        </div>
      )}

      {/* LowSec belts */}
      {lowsecBelts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Low-Sec Belts</span>
            <span className="h-px flex-1 bg-amber-700/20 rounded-full" />
            <span className="text-[9px] text-amber-600/60">Requires Advanced Mining I</span>
          </div>
          <div className="flex flex-col gap-2">
            {lowsecBelts.map(id => <BeltCard key={id} beltId={id} />)}
          </div>
        </div>
      )}

      {/* NullSec belts */}
      {nullsecBelts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Null-Sec Belts</span>
            <span className="h-px flex-1 bg-rose-700/20 rounded-full" />
            <span className="text-[9px] text-rose-600/60">Requires Mining Barge I</span>
          </div>
          <div className="flex flex-col gap-2">
            {nullsecBelts.map(id => <BeltCard key={id} beltId={id} />)}
          </div>
        </div>
      )}

      {/* No belts message */}
      {!inWarp && systemBeltIds.length === 0 && (
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/30 p-4 text-center">
          <div className="text-slate-500 text-xs mb-1">No asteroid belts in this system</div>
          <div className="text-slate-600 text-[10px]">Open the Galaxy Map to travel to another system</div>
        </div>
      )}

      {/* Upgrades */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-widest">Mining Upgrades</span>
          <span className="h-px flex-1 bg-slate-700/20 rounded-full" />
        </div>
        <div className="flex flex-col gap-2">
          {UPGRADE_ORDER.map(id => <MiningUpgradeRow key={id} upgradeId={id} />)}
        </div>
      </div>
    </div>
  );
}
