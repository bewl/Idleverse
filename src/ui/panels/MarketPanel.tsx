import { useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { formatResourceAmount } from '@/game/resources/resourceRegistry';
import { getEffectiveSellPrice, getTradeBonusMultiplier } from '@/game/systems/market/market.logic';
import { StatTooltip } from '@/ui/tooltip/StatTooltip';

// ─── Resource categories to display in market ─────────────────────────────

const MARKET_CATEGORIES: Array<{ label: string; ids: string[] }> = [
  {
    label: 'Minerals',
    ids:   ['ferrite', 'silite', 'vexirite', 'isorium', 'noxium', 'zyridium', 'megacite', 'voidsteel'],
  },
  {
    label: 'Ores',
    ids:   ['ferrock', 'corite', 'silisite', 'platonite', 'darkstone', 'hematite', 'voidite', 'arkonite', 'crokitite'],
  },
  {
    label: 'Components',
    ids:   ['hull-plate', 'thruster-node', 'condenser-coil', 'sensor-cluster', 'mining-laser', 'shield-emitter'],
  },
  {
    label: 'Ships',
    ids:   ['ship-shuttle', 'ship-frigate', 'ship-mining-frigate', 'ship-hauler', 'ship-destroyer', 'ship-exhumer'],
  },
];

// ─── Single resource row ───────────────────────────────────────────────────

function MarketRow({ resourceId }: { resourceId: string }) {
  const state            = useGameStore(s => s.state);
  const sellResource     = useGameStore(s => s.sellResource);
  const sellAll          = useGameStore(s => s.sellAll);
  const toggleAutoSell   = useGameStore(s => s.toggleAutoSell);
  const setThreshold     = useGameStore(s => s.setAutoSellThreshold);

  const [sellAmount, setSellAmount] = useState(0);

  const have         = state.resources[resourceId] ?? 0;
  const basePrice    = state.systems.market.prices[resourceId] ?? 0;
  const effectPrice  = getEffectiveSellPrice(state, resourceId);
  const autoSettings = state.systems.market.autoSell?.[resourceId];
  const autoEnabled  = autoSettings?.enabled ?? false;
  const autoThreshold = autoSettings?.threshold ?? 0;
  const resName      = RESOURCE_REGISTRY[resourceId]?.name ?? resourceId;

  if (basePrice === 0) return null;

  const totalValue = effectPrice * Math.floor(have);

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 items-center py-2 border-t border-slate-800/50 first:border-t-0">
      {/* Resource name + stock */}
      <div className="min-w-0">
        <div className="text-xs font-bold text-slate-200 truncate">{resName}</div>
        <div className="text-[10px] font-mono text-slate-500">
          {formatResourceAmount(have, 0)} units
          {have > 0 && (
            <span className="text-slate-600"> · {formatResourceAmount(totalValue, 0)} ISK total</span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="text-right shrink-0">
        <StatTooltip modifierKey="sell-price-bonus">
          <span className="text-[10px] font-mono text-slate-300 cursor-help border-b border-dotted border-slate-700">
            {formatResourceAmount(effectPrice, 0)} ISK
          </span>
        </StatTooltip>
        {effectPrice !== basePrice && (
          <div className="text-[9px] text-slate-600">base {formatResourceAmount(basePrice, 0)}</div>
        )}
      </div>

      {/* Auto-sell toggle + threshold */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <button
          onClick={() => toggleAutoSell(resourceId)}
          className={`text-[9px] px-2 py-0.5 rounded border font-mono transition-all ${
            autoEnabled
              ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400'
              : 'bg-slate-800/40 border-slate-700/30 text-slate-600 hover:border-slate-600/50 hover:text-slate-500'
          }`}
        >
          {autoEnabled ? '● AUTO' : '○ auto'}
        </button>
        {autoEnabled && (
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-slate-600">keep</span>
            <input
              type="number"
              min={0}
              value={autoThreshold}
              onChange={e => setThreshold(resourceId, Number(e.target.value))}
              className="w-16 text-[9px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-1 py-0.5 text-slate-400 focus:outline-none focus:border-cyan-700/50"
            />
          </div>
        )}
      </div>

      {/* Sell buttons */}
      <div className="shrink-0 flex gap-1">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={have}
            value={sellAmount}
            onChange={e => setSellAmount(Math.max(0, Math.min(have, Number(e.target.value))))}
            placeholder="Qty"
            className="w-16 text-[9px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-1.5 py-0.5 text-slate-400 focus:outline-none focus:border-cyan-700/50"
          />
          <button
            onClick={() => { sellResource(resourceId, sellAmount); setSellAmount(0); }}
            disabled={sellAmount <= 0 || have <= 0}
            className="text-[9px] px-2 py-0.5 rounded border border-cyan-700/40 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-800/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap"
          >
            Sell
          </button>
        </div>
        <button
          onClick={() => sellAll(resourceId)}
          disabled={have <= 0}
          className="text-[9px] px-2 py-0.5 rounded border border-slate-700/30 bg-slate-800/30 text-slate-400 hover:border-cyan-700/40 hover:text-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap"
        >
          All
        </button>
      </div>
    </div>
  );
}

// ─── Category section ──────────────────────────────────────────────────────

function MarketCategory({ label, ids }: { label: string; ids: string[] }) {
  const state = useGameStore(s => s.state);
  // Only show category if at least one item has a price defined
  const hasAny = ids.some(id => (state.systems.market.prices[id] ?? 0) > 0);
  if (!hasAny) return null;

  return (
    <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-4">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3">{label}</div>
      {ids.map(id => <MarketRow key={id} resourceId={id} />)}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function MarketPanel() {
  const state     = useGameStore(s => s.state);
  const unlocked  = state.unlocks['system-market'];

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-2xl mb-3">📊</div>
        <div className="text-slate-400 text-sm font-bold mb-1">Market Locked</div>
        <div className="text-slate-600 text-xs max-w-xs">
          Train the <span className="text-cyan-400">Trade</span> skill to access the NPC market.
        </div>
      </div>
    );
  }

  const tradeMultiplier = getTradeBonusMultiplier(state);
  const lifetimeSold    = state.systems.market.lifetimeSold ?? {};
  const lifetimeTotal   = Object.values(lifetimeSold).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight">Market</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sell to NPC buyers. Effective sell price scales with{' '}
            <StatTooltip modifierKey="sell-price-bonus">
              <span className="text-emerald-500 border-b border-dotted border-emerald-800 cursor-help">
                Trade skills
              </span>
            </StatTooltip>.
          </p>
        </div>

        {/* Stat summary */}
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-[9px] text-slate-600 uppercase tracking-widest">Price bonus</div>
            <StatTooltip modifierKey="sell-price-bonus">
              <span className="text-sm font-bold text-emerald-400 cursor-help">
                ×{tradeMultiplier.toFixed(3)}
              </span>
            </StatTooltip>
          </div>
          <div>
            <div className="text-[9px] text-slate-600 uppercase tracking-widest">Lifetime sold</div>
            <div className="text-sm font-bold text-amber-400">
              {formatResourceAmount(lifetimeTotal, 0)} ISK
            </div>
          </div>
        </div>
      </div>

      {/* ── Column headers ── */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4">
        <div className="text-[9px] text-slate-700 uppercase tracking-widest">Resource</div>
        <div className="text-[9px] text-slate-700 uppercase tracking-widest text-right">Price/unit</div>
        <div className="text-[9px] text-slate-700 uppercase tracking-widest text-right">Auto-sell</div>
        <div className="text-[9px] text-slate-700 uppercase tracking-widest text-right">Sell</div>
      </div>

      {/* ── Categories ── */}
      {MARKET_CATEGORIES.map(cat => (
        <MarketCategory key={cat.label} label={cat.label} ids={cat.ids} />
      ))}
    </div>
  );
}
