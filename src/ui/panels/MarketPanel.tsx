import { useState, useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { formatResourceAmount } from '@/game/resources/resourceRegistry';
import { getEffectiveSellPrice, getTradeBonusMultiplier } from '@/game/systems/market/market.logic';
import { StatTooltip } from '@/ui/tooltip/StatTooltip';
import { generateGalaxy } from '@/game/galaxy/galaxy.gen';
import { NavTag } from '@/ui/components/NavTag';

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
  const priceRatio = basePrice > 0 ? effectPrice / basePrice : 1;
  const trendArrow = priceRatio >= 1.05 ? '▲' : priceRatio <= 0.95 ? '▼' : '─';
  const trendColor = priceRatio >= 1.05 ? 'text-emerald-400' : priceRatio <= 0.95 ? 'text-red-400' : 'text-slate-600';

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 items-center py-2 border-t border-slate-800/50 first:border-t-0">
      {/* Resource name + stock */}
      <div className="min-w-0">
        <div className="text-xs font-bold text-slate-200 truncate">
          <NavTag entityType="resource" entityId={resourceId} label={resName} />
        </div>
        <div className="text-[10px] font-mono text-slate-500">
          {formatResourceAmount(have, 0)} units
          {have > 0 && (
            <span className="text-slate-600"> · {formatResourceAmount(totalValue, 0)} ISK total</span>
          )}
        </div>
      </div>

      {/* Price + trend */}
      <div className="text-right shrink-0">
        <div className="flex items-center gap-1 justify-end">
          <span className={`text-[10px] font-mono ${trendColor}`} title={`${(priceRatio * 100 - 100).toFixed(1)}% vs base`}>{trendArrow}</span>
          <StatTooltip modifierKey="sell-price-bonus">
            <span className="text-[10px] font-mono text-slate-300 cursor-help border-b border-dotted border-slate-700">
              {formatResourceAmount(effectPrice, 0)} ISK
            </span>
          </StatTooltip>
        </div>
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

// ─── Tradeable resources (exclude ships for trade route picker) ────────────

const TRADEABLE_RESOURCE_IDS = [
  'ferrite','silite','vexirite','isorium','noxium','zyridium','megacite','voidsteel',
  'ferrock','corite','silisite','platonite','darkstone','hematite','voidite','arkonite','crokitite',
  'hull-plate','thruster-node','condenser-coil','sensor-cluster','mining-laser','shield-emitter',
];

// ─── Trade Routes tab ──────────────────────────────────────────────────────

function TradeRoutesTab() {
  const state            = useGameStore(s => s.state);
  const createTradeRoute = useGameStore(s => s.createTradeRoute);
  const deleteTradeRoute = useGameStore(s => s.deleteTradeRoute);
  const toggleTradeRoute = useGameStore(s => s.toggleTradeRoute);

  const tradeLevel = state.systems.skills.levels['trade'] ?? 0;
  const routes     = state.systems.fleet.tradeRoutes ?? [];
  const maxRoutes  = Math.max(0, tradeLevel - 2);

  const systems = useMemo(() => generateGalaxy(state.galaxy.seed), [state.galaxy.seed]);
  const visitedSystems = useMemo(
    () => systems.filter(sys => state.galaxy.visitedSystems?.[sys.id]),
    [systems, state.galaxy.visitedSystems],
  );
  const fleets = Object.values(state.systems.fleet.fleets ?? {});

  const [form, setForm] = useState({
    name: '',
    fleetId: '',
    resourceId: '',
    fromSystemId: '',
    toSystemId: '',
    amountPerRun: 100,
  });
  const [showForm, setShowForm]   = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function handleCreate() {
    setCreateError(null);
    const ok = createTradeRoute({
      name:         form.name || `Route ${routes.length + 1}`,
      fleetId:      form.fleetId,
      fromSystemId: form.fromSystemId,
      toSystemId:   form.toSystemId,
      resourceId:   form.resourceId,
      amountPerRun: form.amountPerRun,
    });
    if (ok) {
      setShowForm(false);
      setForm({ name: '', fleetId: '', resourceId: '', fromSystemId: '', toSystemId: '', amountPerRun: 100 });
    } else {
      setCreateError('Failed to create route. Check Trade skill level, fleet selection, and that all fields are filled.');
    }
  }

  if (tradeLevel < 3) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-2xl mb-3">🚢</div>
        <div className="text-slate-400 text-sm font-bold mb-1">Trade Routes Locked</div>
        <div className="text-slate-600 text-xs max-w-xs">
          Reach <NavTag entityType="skill" entityId="trade" label="Trade III" /> to unlock automated trade routes.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quota bar */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400">
          <span className="font-bold text-slate-200">{routes.length}</span>
          <span className="text-slate-600"> / </span>
          <span className="font-bold text-slate-200">{maxRoutes}</span>
          <span className="text-slate-500"> routes active</span>
          <span className="text-slate-700 ml-2">(Trade {['I','II','III','IV','V'][tradeLevel - 1] ?? tradeLevel})</span>
        </div>
        {routes.length < maxRoutes && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="text-[10px] px-3 py-1 rounded border border-cyan-700/50 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-800/30 transition-all"
          >
            {showForm ? 'Cancel' : '+ New Route'}
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border border-cyan-800/30 bg-slate-900/60 p-4 space-y-3">
          <div className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold">New Trade Route</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] text-slate-500 mb-1">Name (optional)</div>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={`Route ${routes.length + 1}`}
                className="w-full text-[10px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-cyan-700/50"
              />
            </div>
            <div>
              <div className="text-[9px] text-slate-500 mb-1">Fleet</div>
              <select
                value={form.fleetId}
                onChange={e => setForm(f => ({ ...f, fleetId: e.target.value }))}
                className="w-full text-[10px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-cyan-700/50"
              >
                <option value="">Select fleet…</option>
                {fleets.map(fleet => (
                  <option key={fleet.id} value={fleet.id}>{fleet.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[9px] text-slate-500 mb-1">Resource</div>
              <select
                value={form.resourceId}
                onChange={e => setForm(f => ({ ...f, resourceId: e.target.value }))}
                className="w-full text-[10px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-cyan-700/50"
              >
                <option value="">Select resource…</option>
                {TRADEABLE_RESOURCE_IDS
                  .filter(id => (state.systems.market.prices[id] ?? 0) > 0)
                  .map(id => (
                    <option key={id} value={id}>{RESOURCE_REGISTRY[id]?.name ?? id}</option>
                  ))}
              </select>
            </div>
            <div>
              <div className="text-[9px] text-slate-500 mb-1">Amount per run</div>
              <input
                type="number"
                min={1}
                value={form.amountPerRun}
                onChange={e => setForm(f => ({ ...f, amountPerRun: Math.max(1, Number(e.target.value)) }))}
                className="w-full text-[10px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-cyan-700/50"
              />
            </div>
            <div>
              <div className="text-[9px] text-slate-500 mb-1">Buy from system</div>
              <select
                value={form.fromSystemId}
                onChange={e => setForm(f => ({ ...f, fromSystemId: e.target.value }))}
                className="w-full text-[10px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-cyan-700/50"
              >
                <option value="">Select system…</option>
                {visitedSystems.map(sys => (
                  <option key={sys.id} value={sys.id}>{sys.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[9px] text-slate-500 mb-1">Sell to system</div>
              <select
                value={form.toSystemId}
                onChange={e => setForm(f => ({ ...f, toSystemId: e.target.value }))}
                className="w-full text-[10px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-cyan-700/50"
              >
                <option value="">Select system…</option>
                {visitedSystems
                  .filter(sys => sys.id !== form.fromSystemId)
                  .map(sys => (
                    <option key={sys.id} value={sys.id}>{sys.name}</option>
                  ))}
              </select>
            </div>
          </div>
          {createError && (
            <div className="text-[9px] text-red-400 bg-red-900/20 border border-red-700/30 rounded px-2 py-1">
              {createError}
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={!form.fleetId || !form.resourceId || !form.fromSystemId || !form.toSystemId}
              className="text-[10px] px-4 py-1.5 rounded border border-emerald-700/50 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-800/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Create Route
            </button>
          </div>
        </div>
      )}

      {/* Route list */}
      {routes.length === 0 ? (
        <div className="text-center py-8 text-slate-600 text-xs">No trade routes configured.</div>
      ) : (
        <div className="space-y-2">
          {routes.map(route => {
            const fromSys = systems.find(s => s.id === route.fromSystemId);
            const toSys   = systems.find(s => s.id === route.toSystemId);
            const resName = RESOURCE_REGISTRY[route.resourceId]?.name ?? route.resourceId;
            const fleet   = state.systems.fleet.fleets?.[route.fleetId];
            const isTransit = route.inTransit > 0;
            return (
              <div key={route.id} className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-200">{route.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {resName} · {fromSys?.name ?? route.fromSystemId} → {toSys?.name ?? route.toSystemId}
                    </div>
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      Fleet: {fleet?.name ?? route.fleetId} · {route.amountPerRun} units/run
                    </div>
                    <div className="flex gap-3 mt-1 text-[9px]">
                      <span className={isTransit ? 'text-amber-400' : 'text-slate-500'}>
                        {isTransit ? `▶ In transit (${route.inTransit} units)` : '◎ Waiting'}
                      </span>
                      {route.lastRunProfit !== null && (
                        <span className={route.lastRunProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          Last: {route.lastRunProfit >= 0 ? '+' : ''}{formatResourceAmount(route.lastRunProfit, 0)} ISK
                        </span>
                      )}
                      <span className="text-slate-600">{route.totalRunsCompleted} runs</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleTradeRoute(route.id)}
                      className={`text-[9px] px-2 py-0.5 rounded border font-mono transition-all ${
                        route.enabled
                          ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400'
                          : 'bg-slate-800/40 border-slate-700/30 text-slate-600'
                      }`}
                    >
                      {route.enabled ? '● ON' : '○ OFF'}
                    </button>
                    <button
                      onClick={() => deleteTradeRoute(route.id)}
                      className="text-[9px] px-2 py-0.5 rounded border border-red-700/30 text-red-500 hover:bg-red-900/20 transition-all"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function MarketPanel() {
  const state     = useGameStore(s => s.state);
  const unlocked  = state.unlocks['system-market'];

  const [activeTab, setActiveTab] = useState<'listings' | 'routes'>('listings');

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-2xl mb-3">📊</div>
        <div className="text-slate-400 text-sm font-bold mb-1">Market Locked</div>
        <div className="text-slate-600 text-xs max-w-xs">
          Train the <NavTag entityType="skill" entityId="trade" label="Trade" /> skill to access the NPC market.
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

      {/* ── Tabs ── */}
      <div className="flex border-b border-slate-800/60">
        {(['listings', 'routes'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-600 hover:text-slate-400'
            }`}
          >
            {tab === 'listings' ? 'Market Listings' : 'Trade Routes'}
          </button>
        ))}
      </div>

      {/* ── Listings tab ── */}
      {activeTab === 'listings' && (
        <>
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4">
            <div className="text-[9px] text-slate-700 uppercase tracking-widest">Resource</div>
            <div className="text-[9px] text-slate-700 uppercase tracking-widest text-right">Price/unit</div>
            <div className="text-[9px] text-slate-700 uppercase tracking-widest text-right">Auto-sell</div>
            <div className="text-[9px] text-slate-700 uppercase tracking-widest text-right">Sell</div>
          </div>

          {/* Categories */}
          {MARKET_CATEGORIES.map(cat => (
            <MarketCategory key={cat.label} label={cat.label} ids={cat.ids} />
          ))}
        </>
      )}

      {/* ── Trade Routes tab ── */}
      {activeTab === 'routes' && <TradeRoutesTab />}
    </div>
  );
}
