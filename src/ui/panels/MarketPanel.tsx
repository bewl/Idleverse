import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useGameStore } from '@/stores/gameStore';
import {
  RESOURCE_REGISTRY,
  ORE_IDS,
  MINERAL_IDS,
  COMPONENT_RESOURCE_IDS,
  MODULE_RESOURCE_IDS,
  SHIP_RESOURCE_IDS,
  formatCredits,
  formatResourceAmount,
} from '@/game/resources/resourceRegistry';
import { getEffectiveSellPrice, getLocalPrice, getSystemPressure, getTradeBonusMultiplier } from '@/game/systems/market/market.logic';
import { StatTooltip } from '@/ui/tooltip/StatTooltip';
import { generateGalaxy } from '@/game/galaxy/galaxy.gen';
import { NavTag } from '@/ui/components/NavTag';
import { GameDropdown, type DropdownOption } from '@/ui/components/GameDropdown';
import { SystemUnlockCard } from '@/ui/components/SystemUnlockCard';
import { useUiStore } from '@/stores/uiStore';
import { isTutorialStepCurrent } from '@/game/progression/tutorialSequence';
import { ActivityBar } from '@/ui/effects/ActivityBar';

// ─── Resource categories to display in market ─────────────────────────────

const MARKET_CATEGORIES: Array<{ label: string; ids: string[] }> = [
  {
    label: 'Minerals',
    ids:   MINERAL_IDS,
  },
  {
    label: 'Ores',
    ids:   ORE_IDS,
  },
  {
    label: 'Components',
    ids:   COMPONENT_RESOURCE_IDS,
  },
  {
    label: 'Modules',
    ids:   MODULE_RESOURCE_IDS,
  },
  {
    label: 'Ships',
    ids:   SHIP_RESOURCE_IDS,
  },
];

function CommandMetric({
  label,
  value,
  meta,
  tone = 'slate',
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: 'cyan' | 'violet' | 'amber' | 'emerald' | 'slate';
}) {
  const toneClass =
    tone === 'cyan'
      ? 'text-cyan-300 border-cyan-700/30 bg-cyan-950/15'
      : tone === 'violet'
        ? 'text-violet-300 border-violet-700/30 bg-violet-950/15'
        : tone === 'amber'
          ? 'text-amber-300 border-amber-700/30 bg-amber-950/15'
          : tone === 'emerald'
            ? 'text-emerald-300 border-emerald-700/30 bg-emerald-950/15'
            : 'text-slate-300 border-slate-700/30 bg-slate-900/50';

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${toneClass}`}>
      <div className="text-[8px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-[12px] font-semibold font-mono mt-1">{value}</div>
      {meta && <div className="text-[9px] text-slate-500 mt-0.5">{meta}</div>}
    </div>
  );
}

type RegionalPriceEntry = {
  systemId: string;
  name: string;
  shortName: string;
  price: number;
  deltaPct: number;
  pressure: number;
  isCurrent: boolean;
};

type MarketOpportunity = {
  resourceId: string;
  systemId: string;
  systemName: string;
  buyPrice: number;
  sellPrice: number;
  spreadPct: number;
  spreadValue: number;
};

type SalesMixEntry = {
  resourceId: string;
  value: number;
  share: number;
};

type AutoSellWatchEntry = {
  resourceId: string;
  threshold: number;
  surplus: number;
  liquidationValue: number;
};

type RouteAnalyticsEntry = {
  routeId: string;
  routeName: string;
  resourceId: string;
  resourceName: string;
  fromSystemName: string;
  toSystemName: string;
  estimatedUnitMargin: number;
  estimatedRunMargin: number;
  lastRunProfit: number | null;
  totalRunsCompleted: number;
  enabled: boolean;
  inTransit: number;
};

function MarketAnalyticsCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 p-4">
      <div className="mb-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function RegionalPriceTape({
  resourceId,
  candidates,
  focusResourceId,
  onFocusResource,
  entries,
  currentPrice,
}: {
  resourceId: string;
  candidates: string[];
  focusResourceId: string;
  onFocusResource: (resourceId: string) => void;
  entries: RegionalPriceEntry[];
  currentPrice: number;
}) {
  const resourceName = RESOURCE_REGISTRY[resourceId]?.name ?? resourceId;
  const sortedEntries = [...entries].sort((left, right) => right.price - left.price);
  const maxPrice = Math.max(...sortedEntries.map(entry => entry.price), currentPrice, 1);
  const bestEntry = sortedEntries[0] ?? null;
  const worstEntry = sortedEntries[sortedEntries.length - 1] ?? null;
  const currentEntry = sortedEntries.find(entry => entry.isCurrent) ?? null;

  return (
    <MarketAnalyticsCard
      title="Regional Price Tape"
      subtitle="Live local-price ladder across visited systems for one focus commodity. This uses real market pressure and demand, so the spread reflects your current galaxy state."
    >
      <div className="flex flex-wrap gap-1.5 mb-3">
        {candidates.map(candidateId => {
          const active = candidateId === focusResourceId;
          return (
            <button
              key={candidateId}
              onClick={() => onFocusResource(candidateId)}
              className={`px-2 py-1 rounded-md border text-[9px] font-mono uppercase tracking-widest transition-all ${
                active
                  ? 'border-cyan-700/40 bg-cyan-950/20 text-cyan-300'
                  : 'border-slate-700/30 bg-slate-950/25 text-slate-500 hover:border-slate-600/40 hover:text-slate-300'
              }`}
            >
              {RESOURCE_REGISTRY[candidateId]?.name ?? candidateId}
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-3 mb-3">
        <CommandMetric label="Focus" value={resourceName} meta="current regional board" tone="cyan" />
        <CommandMetric label="Current Bid" value={`${formatResourceAmount(currentPrice, 0)} ISK`} meta={currentEntry ? `${currentEntry.name} local quote` : 'home quote unavailable'} tone="amber" />
        <CommandMetric label="Best Spread" value={bestEntry ? `${bestEntry.deltaPct >= 0 ? '+' : ''}${bestEntry.deltaPct.toFixed(1)}%` : '0.0%'} meta={bestEntry ? `${bestEntry.name} vs current system` : 'no visited systems'} tone={bestEntry && bestEntry.deltaPct > 0 ? 'emerald' : 'slate'} />
      </div>

      {sortedEntries.length === 0 ? (
        <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-4 text-[10px] text-slate-600">
          Visit more systems to populate the regional price tape.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-2 min-w-max">
              {sortedEntries.map(entry => {
                const height = Math.max(18, Math.round((entry.price / maxPrice) * 100));
                const toneClass = entry.isCurrent
                  ? 'border-cyan-700/40 bg-cyan-950/25 text-cyan-300'
                  : entry.deltaPct >= 5
                    ? 'border-emerald-700/30 bg-emerald-950/15 text-emerald-300'
                    : entry.deltaPct <= -5
                      ? 'border-red-700/30 bg-red-950/10 text-red-300'
                      : 'border-slate-700/30 bg-slate-950/30 text-slate-400';

                return (
                  <div key={entry.systemId} className="w-14 shrink-0">
                    <div className={`rounded-lg border px-1.5 py-1 ${toneClass}`}>
                      <div className="text-[8px] uppercase tracking-widest truncate">{entry.shortName}</div>
                      <div className="mt-2 h-24 flex items-end rounded bg-slate-950/50 px-1 pb-1">
                        <div
                          className={`w-full rounded-sm ${entry.isCurrent ? 'bg-cyan-400/80' : entry.deltaPct >= 5 ? 'bg-emerald-400/70' : entry.deltaPct <= -5 ? 'bg-red-400/60' : 'bg-slate-500/60'}`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[9px] font-mono">{formatResourceAmount(entry.price, 0)}</div>
                      <div className="text-[8px] font-mono text-slate-500">
                        {entry.deltaPct >= 0 ? '+' : ''}{entry.deltaPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 mt-3 text-[10px] text-slate-400">
            <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-2.5 py-2">
              <div className="text-[8px] uppercase tracking-widest text-slate-600">Best Local</div>
              <div className="mt-1 text-slate-200">{bestEntry?.name ?? 'Unavailable'}</div>
              <div className="text-[9px] font-mono text-emerald-300 mt-0.5">{bestEntry ? `${formatResourceAmount(bestEntry.price, 0)} ISK · ${bestEntry.deltaPct >= 0 ? '+' : ''}${bestEntry.deltaPct.toFixed(1)}%` : 'No spread'}</div>
            </div>
            <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-2.5 py-2">
              <div className="text-[8px] uppercase tracking-widest text-slate-600">Pressure Floor</div>
              <div className="mt-1 text-slate-200">{worstEntry?.name ?? 'Unavailable'}</div>
              <div className="text-[9px] font-mono text-slate-400 mt-0.5">{worstEntry ? `P ${worstEntry.pressure.toFixed(2)} · ${formatResourceAmount(worstEntry.price, 0)} ISK` : 'No pressure data'}</div>
            </div>
          </div>
        </>
      )}
    </MarketAnalyticsCard>
  );
}

function MarketOpportunityBoard({ opportunities }: { opportunities: MarketOpportunity[] }) {
  const maxSpread = Math.max(...opportunities.map(entry => entry.spreadPct), 1);

  return (
    <MarketAnalyticsCard
      title="Spread Board"
      subtitle="Best live trade deltas from your current system. This surfaces the strongest current sell destinations using actual local-price comparisons."
    >
      {opportunities.length === 0 ? (
        <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-4 text-[10px] text-slate-600">
          No profitable regional spreads detected from your current system.
        </div>
      ) : (
        <div className="space-y-2">
          {opportunities.map(entry => (
            <div key={`${entry.resourceId}-${entry.systemId}`} className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-200 truncate">
                    <NavTag entityType="resource" entityId={entry.resourceId} label={RESOURCE_REGISTRY[entry.resourceId]?.name ?? entry.resourceId} />
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5 truncate">Sell into {entry.systemName}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] font-mono text-emerald-300">+{entry.spreadPct.toFixed(1)}%</div>
                  <div className="text-[8px] text-slate-600">+{formatCredits(entry.spreadValue)}</div>
                </div>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800/70">
                <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${Math.max(10, (entry.spreadPct / maxSpread) * 100)}%` }} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[8px] font-mono text-slate-500">
                <span>buy {formatResourceAmount(entry.buyPrice, 0)}</span>
                <span>sell {formatResourceAmount(entry.sellPrice, 0)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </MarketAnalyticsCard>
  );
}

function MarketSalesMix({ salesMix, autoWatch }: { salesMix: SalesMixEntry[]; autoWatch: AutoSellWatchEntry[] }) {
  const maxShare = Math.max(...salesMix.map(entry => entry.share), 0.01);
  const maxLiquidation = Math.max(...autoWatch.map(entry => entry.liquidationValue), 1);

  return (
    <div className="space-y-4">
      <MarketAnalyticsCard
        title="Sales Mix"
        subtitle="Which commodities have actually carried your market income so far. This keeps the sidebar grounded in realized revenue rather than just current stock."
      >
        {salesMix.length === 0 ? (
          <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-4 text-[10px] text-slate-600">
            No completed sales yet.
          </div>
        ) : (
          <div className="space-y-2">
            {salesMix.map(entry => (
              <div key={entry.resourceId} className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-slate-200 truncate min-w-0">{RESOURCE_REGISTRY[entry.resourceId]?.name ?? entry.resourceId}</span>
                  <span className="font-mono text-amber-300 shrink-0">{formatCredits(entry.value)}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800/70">
                  <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${Math.max(12, (entry.share / maxShare) * 100)}%` }} />
                </div>
                <div className="mt-1 text-[8px] font-mono text-slate-500">{(entry.share * 100).toFixed(1)}% of lifetime sales</div>
              </div>
            ))}
          </div>
        )}
      </MarketAnalyticsCard>

      <MarketAnalyticsCard
        title="Auto-Sell Watch"
        subtitle="Armed liquidation lines sorted by immediate surplus value, so the wide space shows what inventory is closest to cash conversion."
      >
        {autoWatch.length === 0 ? (
          <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-4 text-[10px] text-slate-600">
            No auto-sell lines are armed above threshold.
          </div>
        ) : (
          <div className="space-y-2">
            {autoWatch.map(entry => (
              <div key={entry.resourceId} className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-slate-200 truncate min-w-0">{RESOURCE_REGISTRY[entry.resourceId]?.name ?? entry.resourceId}</span>
                  <span className="font-mono text-emerald-300 shrink-0">{formatCredits(entry.liquidationValue)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800/70">
                  <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${Math.max(10, (entry.liquidationValue / maxLiquidation) * 100)}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[8px] font-mono text-slate-500">
                  <span>surplus {formatResourceAmount(entry.surplus, 0)}</span>
                  <span>keep {formatResourceAmount(entry.threshold, 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </MarketAnalyticsCard>
    </div>
  );
}

function TradeRouteAnalyticsRail({
  routeAnalytics,
  maxRoutes,
  routesConfigured,
  activeRoutes,
  transitRoutes,
  profitableRoutes,
  readyFleets,
  visitedSystemsCount,
}: {
  routeAnalytics: RouteAnalyticsEntry[];
  maxRoutes: number;
  routesConfigured: number;
  activeRoutes: number;
  transitRoutes: number;
  profitableRoutes: number;
  readyFleets: number;
  visitedSystemsCount: number;
}) {
  const hottestRoutes = routeAnalytics.slice(0, 5);
  const maxEstimatedMargin = Math.max(...hottestRoutes.map(route => Math.max(0, route.estimatedRunMargin)), 1);
  const topRealizedRoute = routeAnalytics
    .filter(route => route.lastRunProfit !== null)
    .sort((left, right) => (right.lastRunProfit ?? Number.NEGATIVE_INFINITY) - (left.lastRunProfit ?? Number.NEGATIVE_INFINITY))[0] ?? null;

  return (
    <div className="space-y-4">
      <MarketAnalyticsCard
        title="Route Command"
        subtitle="High-level route posture for the current logistics network, including unused capacity and fleet readiness to take new lines."
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 mb-3">
          <CommandMetric label="Configured" value={`${routesConfigured}/${maxRoutes}`} meta="route slot usage" tone={routesConfigured > 0 ? 'violet' : 'slate'} />
          <CommandMetric label="Hauling" value={`${transitRoutes}`} meta={activeRoutes > 0 ? `${activeRoutes} active routes` : 'no live routes'} tone={transitRoutes > 0 ? 'cyan' : activeRoutes > 0 ? 'amber' : 'slate'} />
          <CommandMetric label="Ready Fleets" value={`${readyFleets}`} meta={`${visitedSystemsCount} visited markets`} tone={readyFleets > 0 ? 'emerald' : 'slate'} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 text-[10px] text-slate-400">
          <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-2.5 py-2">
            <div className="text-[8px] uppercase tracking-widest text-slate-600">Live Edge</div>
            <div className="mt-1 text-slate-200">{profitableRoutes} route{profitableRoutes === 1 ? '' : 's'} have a positive last run</div>
          </div>
          <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-2.5 py-2">
            <div className="text-[8px] uppercase tracking-widest text-slate-600">Capacity</div>
            <div className="mt-1 text-slate-200">{Math.max(0, maxRoutes - routesConfigured)} slot{Math.max(0, maxRoutes - routesConfigured) === 1 ? '' : 's'} open for new lines</div>
          </div>
        </div>
      </MarketAnalyticsCard>

      <MarketAnalyticsCard
        title="Margin Ladder"
        subtitle="Estimated live run margin based on current local prices for each configured route, so the wide rail shows where hauling time is best spent right now."
      >
        {hottestRoutes.length === 0 ? (
          <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-4 text-[10px] text-slate-600">
            Configure a route to populate the margin ladder.
          </div>
        ) : (
          <div className="space-y-2">
            {hottestRoutes.map(route => (
              <div key={route.routeId} className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-200 truncate">{route.routeName}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5 truncate">{route.resourceName} · {route.fromSystemName} → {route.toSystemName}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-[10px] font-mono ${route.estimatedRunMargin >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                      {route.estimatedRunMargin >= 0 ? '+' : ''}{formatCredits(route.estimatedRunMargin)}
                    </div>
                    <div className="text-[8px] text-slate-600">live estimate</div>
                  </div>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800/70">
                  <div
                    className={`h-full rounded-full ${route.estimatedRunMargin >= 0 ? 'bg-emerald-500/70' : 'bg-red-500/60'}`}
                    style={{ width: `${Math.max(8, (Math.abs(route.estimatedRunMargin) / maxEstimatedMargin) * 100)}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[8px] font-mono text-slate-500">
                  <span>{route.estimatedUnitMargin >= 0 ? '+' : ''}{formatResourceAmount(route.estimatedUnitMargin, 0)} / unit</span>
                  <span>{route.inTransit > 0 ? `${route.inTransit} in transit` : route.enabled ? 'staged' : 'paused'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </MarketAnalyticsCard>

      <MarketAnalyticsCard
        title="Realized Leader"
        subtitle="Best completed route result so far, alongside the delta between live estimates and what has actually been realized."
      >
        {topRealizedRoute ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-200 truncate">{topRealizedRoute.routeName}</div>
                  <div className="text-[9px] text-slate-500 mt-0.5 truncate">{topRealizedRoute.resourceName} · {topRealizedRoute.totalRunsCompleted} completed run{topRealizedRoute.totalRunsCompleted === 1 ? '' : 's'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[10px] font-mono ${(topRealizedRoute.lastRunProfit ?? 0) >= 0 ? 'text-amber-300' : 'text-red-400'}`}>
                    {(topRealizedRoute.lastRunProfit ?? 0) >= 0 ? '+' : ''}{formatCredits(topRealizedRoute.lastRunProfit ?? 0)}
                  </div>
                  <div className="text-[8px] text-slate-600">last realized</div>
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 text-[10px] text-slate-400">
              <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-2.5 py-2">
                <div className="text-[8px] uppercase tracking-widest text-slate-600">Live Estimate</div>
                <div className={`mt-1 font-mono ${topRealizedRoute.estimatedRunMargin >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>{topRealizedRoute.estimatedRunMargin >= 0 ? '+' : ''}{formatCredits(topRealizedRoute.estimatedRunMargin)}</div>
              </div>
              <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-2.5 py-2">
                <div className="text-[8px] uppercase tracking-widest text-slate-600">Current State</div>
                <div className="mt-1 text-slate-200">{topRealizedRoute.inTransit > 0 ? 'cargo moving' : topRealizedRoute.enabled ? 'ready to cycle' : 'route paused'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-4 text-[10px] text-slate-600">
            No completed route runs yet. The ladder above still shows live route economics.
          </div>
        )}
      </MarketAnalyticsCard>
    </div>
  );
}

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
  const surplus = Math.max(0, Math.floor(have - autoThreshold));
  const autoReady = autoEnabled && surplus > 0;
  const statusDot = autoReady ? 'bg-emerald-400' : have > 0 ? 'bg-amber-400/60' : 'bg-slate-600';
  const highlightSellControls = isTutorialStepCurrent(state, 'first-sale') && have > 0;

  return (
    <div className="grid grid-cols-[minmax(0,1.35fr)_auto_auto_auto] gap-x-3 gap-y-1 items-center py-2 border-t border-slate-800/50 first:border-t-0">
      {/* Resource name + stock */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
          <div className="text-xs font-bold text-slate-200 truncate min-w-0">
            <NavTag entityType="resource" entityId={resourceId} label={resName} />
          </div>
          {autoEnabled && (
            <span className={`text-[8px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-widest shrink-0 ${
              autoReady
                ? 'text-emerald-300 border-emerald-700/30 bg-emerald-950/15'
                : 'text-amber-300 border-amber-700/30 bg-amber-950/15'
            }`}>
              {autoReady ? 'armed' : 'watch'}
            </span>
          )}
        </div>
        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
          {formatResourceAmount(have, 0)} units
          {have > 0 && (
            <span className="text-slate-600"> · {formatResourceAmount(totalValue, 0)} ISK total</span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap mt-1 text-[8px] font-mono">
          <span className="text-slate-600">keep {formatResourceAmount(autoThreshold, 0)}</span>
          {autoEnabled && (
            <span className={autoReady ? 'text-emerald-300' : 'text-slate-600'}>
              surplus {formatResourceAmount(surplus, 0)}
            </span>
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
        {autoEnabled ? (
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
        ) : (
          <div className="text-[8px] text-slate-700">manual only</div>
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
            data-tutorial-anchor={highlightSellControls ? 'market-sell-input' : undefined}
            className={`w-16 text-[9px] font-mono bg-slate-800/60 border border-slate-700/40 rounded px-1.5 py-0.5 text-slate-400 focus:outline-none focus:border-cyan-700/50 ${highlightSellControls ? 'tutorial-breathe relative z-[74]' : ''}`}
          />
          <button
            onClick={() => { sellResource(resourceId, sellAmount); setSellAmount(0); }}
            disabled={sellAmount <= 0 || have <= 0}
            data-tutorial-anchor={highlightSellControls ? 'market-sell-button' : undefined}
            className={`text-[9px] px-2 py-0.5 rounded border border-cyan-700/40 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-800/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap ${highlightSellControls ? 'tutorial-breathe relative z-[74]' : ''}`}
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

  const visibleIds = ids.filter(id => (state.systems.market.prices[id] ?? 0) > 0);
  const stocked = visibleIds.filter(id => (state.resources[id] ?? 0) > 0).length;
  const autoLines = visibleIds.filter(id => state.systems.market.autoSell?.[id]?.enabled).length;

  return (
    <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{label}</div>
        <div className="flex gap-2 text-[8px] font-mono text-slate-600">
          <span>{visibleIds.length} listed</span>
          <span>{stocked} stocked</span>
          <span>{autoLines} auto</span>
        </div>
      </div>
      {ids.map(id => <MarketRow key={id} resourceId={id} />)}
    </div>
  );
}

// ─── Tradeable resources (exclude ships for trade route picker) ────────────

const TRADEABLE_RESOURCE_IDS = [
  ...MINERAL_IDS,
  ...ORE_IDS,
  ...COMPONENT_RESOURCE_IDS,
  ...MODULE_RESOURCE_IDS,
];

function TradeRouteRow({
  route,
  systemNameById,
}: {
  route: NonNullable<ReturnType<typeof useGameStore.getState>['state']['systems']['fleet']['tradeRoutes']>[number];
  systemNameById: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(route.inTransit > 0);
  const state = useGameStore(s => s.state);
  const deleteTradeRoute = useGameStore(s => s.deleteTradeRoute);
  const toggleTradeRoute = useGameStore(s => s.toggleTradeRoute);

  const resName = RESOURCE_REGISTRY[route.resourceId]?.name ?? route.resourceId;
  const fleet = state.systems.fleet.fleets?.[route.fleetId];
  const isTransit = route.inTransit > 0;
  const statusDot = isTransit ? 'bg-cyan-400 animate-pulse' : route.enabled ? 'bg-amber-400/60' : 'bg-slate-600';
  const statusLabel = isTransit ? 'In transit' : route.enabled ? 'Staged' : 'Paused';
  const runProfit = route.lastRunProfit;

  return (
    <div className="rounded-md border overflow-hidden border-slate-700/20 bg-slate-950/25">
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none hover:bg-white/[0.03] transition-colors"
        onClick={() => setExpanded(value => !value)}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
        <span className="flex-1 min-w-0 truncate text-[11px] font-semibold text-slate-200">{route.name}</span>
        <span className={`text-[8px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-widest shrink-0 ${
          isTransit
            ? 'text-cyan-300 border-cyan-700/30 bg-cyan-950/15'
            : route.enabled
              ? 'text-amber-300 border-amber-700/30 bg-amber-950/15'
              : 'text-slate-500 border-slate-700/30 bg-slate-900/40'
        }`}>
          {statusLabel}
        </span>
        <span className="text-[9px] font-mono text-slate-500 shrink-0">{route.totalRunsCompleted} runs</span>
        <span className="text-[9px] font-mono text-slate-400 shrink-0">{expanded ? '▴' : '▾'}</span>
        <button
          onClick={event => { event.stopPropagation(); toggleTradeRoute(route.id); }}
          className={`text-[9px] px-2 py-0.5 rounded border font-mono transition-all shrink-0 ${
            route.enabled
              ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400'
              : 'bg-slate-800/40 border-slate-700/30 text-slate-600'
          }`}
        >
          {route.enabled ? '● ON' : '○ OFF'}
        </button>
        <button
          onClick={event => { event.stopPropagation(); deleteTradeRoute(route.id); }}
          className="text-[10px] text-red-500/40 hover:text-red-300 transition-colors pl-1 shrink-0"
          title="Delete route"
        >
          ✕
        </button>
      </div>

      {!expanded && (
        <div className="px-2 pb-1.5 flex items-center gap-2 text-[9px]">
          <span className="text-slate-500 truncate flex-1 min-w-0">{resName} · {systemNameById[route.fromSystemId] ?? route.fromSystemId} → {systemNameById[route.toSystemId] ?? route.toSystemId}</span>
          {runProfit !== null && (
            <span className={`font-mono shrink-0 ${runProfit >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
              {runProfit >= 0 ? '+' : ''}{formatCredits(runProfit)}
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div className="flex flex-col gap-1.5 px-2 pb-2 pt-1" style={{ borderTop: '1px solid rgba(30,41,59,0.5)' }}>
          <div className="flex flex-wrap gap-1">
            <span className="text-[8px] px-1.5 py-0.5 rounded border border-slate-700/40 bg-slate-900/50 text-slate-400 font-mono uppercase tracking-widest">
              {resName}
            </span>
            <span className="text-[8px] px-1.5 py-0.5 rounded border border-violet-700/30 bg-violet-950/15 text-violet-300 font-mono uppercase tracking-widest">
              {route.amountPerRun} / run
            </span>
            {isTransit && (
              <span className="text-[8px] px-1.5 py-0.5 rounded border border-cyan-700/30 bg-cyan-950/15 text-cyan-300 font-mono uppercase tracking-widest">
                {route.inTransit} in cargo
              </span>
            )}
          </div>
          <div className="grid gap-1 sm:grid-cols-2 text-[10px] text-slate-400">
            <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5">
              <span className="text-[8px] uppercase tracking-widest text-slate-600 block mb-1">Route</span>
              {systemNameById[route.fromSystemId] ?? route.fromSystemId} → {systemNameById[route.toSystemId] ?? route.toSystemId}
            </div>
            <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5">
              <span className="text-[8px] uppercase tracking-widest text-slate-600 block mb-1">Assigned Fleet</span>
              {fleet?.name ?? route.fleetId}
            </div>
            <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5">
              <span className="text-[8px] uppercase tracking-widest text-slate-600 block mb-1">Last Profit</span>
              {runProfit === null ? 'No completed run yet' : `${runProfit >= 0 ? '+' : ''}${formatCredits(runProfit)}`}
            </div>
            <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5">
              <span className="text-[8px] uppercase tracking-widest text-slate-600 block mb-1">Transit Cost Basis</span>
              {route.buyCostForTransit > 0 ? formatCredits(route.buyCostForTransit) : 'None staged'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trade Routes tab ──────────────────────────────────────────────────────

function TradeRoutesTab({
  state,
  systems,
  visitedSystems,
}: {
  state: ReturnType<typeof useGameStore.getState>['state'];
  systems: ReturnType<typeof generateGalaxy>;
  visitedSystems: ReturnType<typeof generateGalaxy>;
}) {
  const createTradeRoute = useGameStore(s => s.createTradeRoute);
  const tradeLevel = state.systems.skills.levels['trade'] ?? 0;
  const routes     = state.systems.fleet.tradeRoutes ?? [];
  const maxRoutes  = Math.max(0, tradeLevel - 2);
  const systemNameById = useMemo(
    () => Object.fromEntries(systems.map(system => [system.id, system.name])),
    [systems],
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
  const activeRoutes = routes.filter(route => route.enabled).length;
  const transitRoutes = routes.filter(route => route.inTransit > 0).length;
  const profitableRoutes = routes.filter(route => (route.lastRunProfit ?? 0) > 0).length;
  const readyFleets = fleets.filter(fleet => !fleet.fleetOrder && !fleet.combatOrder).length;
  const activityRate = Math.min(1, Math.max(
    routes.length > 0 ? activeRoutes / Math.max(1, maxRoutes || routes.length) : 0,
    transitRoutes / Math.max(1, routes.length),
  ));
  const routeAnalytics = useMemo<RouteAnalyticsEntry[]>(() => {
    return routes
      .map(route => {
        const buyPrice = getLocalPrice(state, route.resourceId, route.fromSystemId);
        const sellPrice = getLocalPrice(state, route.resourceId, route.toSystemId);
        const estimatedUnitMargin = sellPrice - buyPrice;
        const estimatedRunMargin = estimatedUnitMargin * route.amountPerRun;

        return {
          routeId: route.id,
          routeName: route.name,
          resourceId: route.resourceId,
          resourceName: RESOURCE_REGISTRY[route.resourceId]?.name ?? route.resourceId,
          fromSystemName: systemNameById[route.fromSystemId] ?? route.fromSystemId,
          toSystemName: systemNameById[route.toSystemId] ?? route.toSystemId,
          estimatedUnitMargin,
          estimatedRunMargin,
          lastRunProfit: route.lastRunProfit,
          totalRunsCompleted: route.totalRunsCompleted,
          enabled: route.enabled,
          inTransit: route.inTransit,
        };
      })
      .sort((left, right) => right.estimatedRunMargin - left.estimatedRunMargin);
  }, [routes, state, systemNameById]);
  const fleetOptions = useMemo<DropdownOption[]>(() => (
    fleets.map(fleet => {
      const system = systems.find(sys => sys.id === fleet.currentSystemId);
      const inTransit = !!fleet.fleetOrder;
      return {
        value: fleet.id,
        label: fleet.name,
        description: system ? `Operating from ${system.name}` : 'Unknown staging system',
        meta: inTransit ? 'IN TRANSIT' : 'READY',
        group: inTransit ? 'In Transit' : 'Ready',
        tone: inTransit ? 'amber' : 'cyan',
        badges: system ? [{ label: system.security, color: system.security === 'highsec' ? '#4ade80' : system.security === 'lowsec' ? '#fb923c' : '#f87171' }] : undefined,
        keywords: [fleet.name, system?.name ?? '', system?.security ?? ''],
      };
    })
  ), [fleets, systems]);
  const resourceOptions = useMemo<DropdownOption[]>(() => (
    TRADEABLE_RESOURCE_IDS
      .filter(id => (state.systems.market.prices[id] ?? 0) > 0)
      .map(id => {
        const resource = RESOURCE_REGISTRY[id];
        const category = resource?.category ?? 'misc';
        return {
          value: id,
          label: resource?.name ?? id,
          description: `${category} · Tier ${resource?.tier ?? '?'}`,
          group: category,
          tone: category === 'mineral'
            ? 'cyan'
            : category.startsWith('ore')
              ? 'amber'
              : category === 'component'
                ? 'violet'
                : category === 'module'
                  ? 'emerald'
                  : 'slate',
          badges: resource ? [{ label: `T${resource.tier}`, color: '#94a3b8' }] : undefined,
          keywords: [resource?.name ?? id, category, `${resource?.tier ?? ''}`],
        };
      })
  ), [state.systems.market.prices]);
  const buySystemOptions = useMemo<DropdownOption[]>(() => (
    visitedSystems.map(system => ({
      value: system.id,
      label: system.name,
      description: `Buy source · ${system.security}`,
      group: system.security,
      tone: system.security === 'highsec' ? 'emerald' : system.security === 'lowsec' ? 'amber' : 'rose',
      badges: [{ label: system.starType, color: '#94a3b8' }],
      keywords: [system.name, system.security, system.starType],
    }))
  ), [visitedSystems]);
  const sellSystemOptions = useMemo<DropdownOption[]>(() => (
    visitedSystems
      .filter(system => system.id !== form.fromSystemId)
      .map(system => ({
        value: system.id,
        label: system.name,
        description: `Sell target · ${system.security}`,
        group: system.security,
        tone: system.security === 'highsec' ? 'emerald' : system.security === 'lowsec' ? 'amber' : 'rose',
        badges: [{ label: system.starType, color: '#94a3b8' }],
        keywords: [system.name, system.security, system.starType],
      }))
  ), [form.fromSystemId, visitedSystems]);

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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.62fr)_minmax(340px,1fr)] 2xl:grid-cols-[minmax(0,1.7fr)_minmax(380px,1fr)] items-start">
      <div className="space-y-4 min-w-0">
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 px-3 py-2.5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 mb-3">
            <CommandMetric label="Active Routes" value={`${activeRoutes}`} meta={`${routes.length}/${maxRoutes} configured`} tone={activeRoutes > 0 ? 'emerald' : 'slate'} />
            <CommandMetric label="Transit" value={`${transitRoutes}`} meta={transitRoutes > 0 ? 'cargo in motion' : 'no active haul'} tone={transitRoutes > 0 ? 'cyan' : 'slate'} />
            <CommandMetric label="Profitful" value={`${profitableRoutes}`} meta="positive last run" tone={profitableRoutes > 0 ? 'amber' : 'slate'} />
            <CommandMetric label="Trade Level" value={`T${tradeLevel}`} meta="route capacity gate" tone="violet" />
          </div>
          <ActivityBar active={activeRoutes > 0 || transitRoutes > 0} rate={activityRate} color={transitRoutes > 0 ? 'cyan' : 'green'} label="Route load" valueLabel={transitRoutes > 0 ? `${transitRoutes} in transit` : `${activeRoutes} active`} />
        </div>

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
              <GameDropdown
                value={form.fleetId}
                onChange={value => setForm(f => ({ ...f, fleetId: value }))}
                options={fleetOptions}
                placeholder="Select fleet..."
                searchPlaceholder="Search fleets or staging systems..."
                size="compact"
                menuWidth={320}
              />
            </div>
            <div>
              <div className="text-[9px] text-slate-500 mb-1">Resource</div>
              <GameDropdown
                value={form.resourceId}
                onChange={value => setForm(f => ({ ...f, resourceId: value }))}
                options={resourceOptions}
                placeholder="Select resource..."
                searchPlaceholder="Search tradeable resources..."
                size="compact"
                menuWidth={340}
              />
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
              <GameDropdown
                value={form.fromSystemId}
                onChange={value => setForm(f => ({ ...f, fromSystemId: value }))}
                options={buySystemOptions}
                placeholder="Select source system..."
                searchPlaceholder="Search visited source systems..."
                size="compact"
                menuWidth={320}
              />
            </div>
            <div>
              <div className="text-[9px] text-slate-500 mb-1">Sell to system</div>
              <GameDropdown
                value={form.toSystemId}
                onChange={value => setForm(f => ({ ...f, toSystemId: value }))}
                options={sellSystemOptions}
                placeholder="Select destination system..."
                searchPlaceholder="Search visited destination systems..."
                size="compact"
                menuWidth={320}
              />
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

        {routes.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-xs">No trade routes configured.</div>
        ) : (
          <div className="space-y-2">
            {routes.map(route => <TradeRouteRow key={route.id} route={route} systemNameById={systemNameById} />)}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <TradeRouteAnalyticsRail
          routeAnalytics={routeAnalytics}
          maxRoutes={maxRoutes}
          routesConfigured={routes.length}
          activeRoutes={activeRoutes}
          transitRoutes={transitRoutes}
          profitableRoutes={profitableRoutes}
          readyFleets={readyFleets}
          visitedSystemsCount={visitedSystems.length}
        />
      </div>
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function MarketPanel() {
  const state     = useGameStore(s => s.state);
  const unlocked  = state.unlocks['system-market'];

  const savedPanelState = useUiStore(s => s.panelStates.market);
  const setPanelState = useUiStore(s => s.setPanelState);
  const [activeTab, setActiveTab] = useState<'listings' | 'routes'>(() => savedPanelState.activeTab ?? 'listings');
  const focusTarget = useUiStore(s => s.focusTarget);
  const clearFocus = useUiStore(s => s.clearFocus);
  const systems = useMemo(() => generateGalaxy(state.galaxy.seed), [state.galaxy.seed]);
  const visitedSystems = useMemo(
    () => systems.filter(system => state.galaxy.visitedSystems?.[system.id]),
    [systems, state.galaxy.visitedSystems],
  );

  useEffect(() => {
    if (!focusTarget?.panelSection) return;
    if (focusTarget.panelSection !== 'listings' && focusTarget.panelSection !== 'routes') return;
    setActiveTab(focusTarget.panelSection);
    clearFocus();
  }, [focusTarget, clearFocus]);

  useEffect(() => {
    if (savedPanelState.activeTab && savedPanelState.activeTab !== activeTab) {
      setActiveTab(savedPanelState.activeTab);
    }
  }, [savedPanelState.activeTab]);

  useEffect(() => {
    setPanelState('market', { activeTab });
  }, [activeTab, setPanelState]);

  if (!unlocked) {
    return (
      <div className="py-10">
        <SystemUnlockCard
          icon="market"
          title="Regional Market"
          skillId="trade"
          summary="Sell ore, components, and hulls for credits, then grow into route-based hauling and price-driven trade. Trade is the cleanest early branch for players who want liquidity and logistics instead of pure production."
          benefits={[
            'Turn mining and manufacturing output into credits instead of sitting on stockpiles.',
            'Improve sale value immediately, then unlock automated trade routes at Trade III.',
            'Pair with hauling wings and route choices when you want a logistics-heavy playstyle.',
          ]}
          accentColor="#fb7185"
          previewPanel="skills"
          previewLabel="Review Trade Skills"
        />
      </div>
    );
  }

  const tradeMultiplier = getTradeBonusMultiplier(state);
  const lifetimeSold    = state.systems.market.lifetimeSold ?? {};
  const lifetimeTotal   = Object.values(lifetimeSold).reduce((s, v) => s + v, 0);
  const autoSellEntries = Object.entries(state.systems.market.autoSell ?? {});
  const autoEnabledCount = autoSellEntries.filter(([, settings]) => settings.enabled).length;
  const autoReadyCount = autoSellEntries.filter(([resourceId, settings]) => settings.enabled && (state.resources[resourceId] ?? 0) > (settings.threshold ?? 0)).length;
  const routes = state.systems.fleet.tradeRoutes ?? [];
  const listedResourceIds = useMemo(
    () => MARKET_CATEGORIES.flatMap(category => category.ids).filter((resourceId, index, ids) => ids.indexOf(resourceId) === index && (state.systems.market.prices[resourceId] ?? 0) > 0),
    [state.systems.market.prices],
  );
  const focusCandidates = useMemo(() => {
    const scored = listedResourceIds
      .map(resourceId => {
        const stock = state.resources[resourceId] ?? 0;
        const lifetimeValue = lifetimeSold[resourceId] ?? 0;
        const autoSettings = state.systems.market.autoSell?.[resourceId];
        const enabled = autoSettings?.enabled ?? false;
        const threshold = autoSettings?.threshold ?? 0;
        const surplus = Math.max(0, stock - threshold);

        return {
          resourceId,
          score: lifetimeValue + surplus * 10 + stock * 2 + (enabled ? 2_500 : 0),
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
      .map(entry => entry.resourceId);

    return scored.length > 0 ? scored : listedResourceIds.slice(0, 6);
  }, [listedResourceIds, lifetimeSold, state.resources, state.systems.market.autoSell]);
  const [focusResourceId, setFocusResourceId] = useState(() => focusCandidates[0] ?? listedResourceIds[0] ?? 'ferrite');
  const activeRoutes = routes.filter(route => route.enabled).length;
  const transitRoutes = routes.filter(route => route.inTransit > 0).length;
  const activityRate = Math.min(1, Math.max(
    Math.min(1, activeRoutes / Math.max(1, routes.length || 1)),
    Math.min(1, autoReadyCount / Math.max(1, autoEnabledCount || 1)),
    Math.min(1, (tradeMultiplier - 1) / 0.5),
  ));

  useEffect(() => {
    const nextFocus = focusCandidates[0] ?? listedResourceIds[0] ?? 'ferrite';
    if (!focusCandidates.includes(focusResourceId) && listedResourceIds.includes(nextFocus)) {
      setFocusResourceId(nextFocus);
    }
  }, [focusCandidates, focusResourceId, listedResourceIds]);

  const currentSystemId = state.galaxy.currentSystemId;
  const focusTapeEntries = useMemo<RegionalPriceEntry[]>(() => {
    if (activeTab !== 'listings' || !focusResourceId) return [];

    const currentPrice = getLocalPrice(state, focusResourceId, currentSystemId);
    return visitedSystems
      .map(system => {
        const localPrice = getLocalPrice(state, focusResourceId, system.id);
        if (localPrice <= 0) return null;
        const deltaPct = currentPrice > 0 ? ((localPrice / currentPrice) - 1) * 100 : 0;
        return {
          systemId: system.id,
          name: system.name,
          shortName: system.name.slice(0, 4).toUpperCase(),
          price: localPrice,
          deltaPct,
          pressure: getSystemPressure(state.galaxy, system.id, focusResourceId),
          isCurrent: system.id === currentSystemId,
        };
      })
      .filter((entry): entry is RegionalPriceEntry => entry !== null);
  }, [activeTab, currentSystemId, focusResourceId, state, visitedSystems]);
  const topOpportunities = useMemo<MarketOpportunity[]>(() => {
    if (activeTab !== 'listings' || !currentSystemId) return [];

    const opportunities = TRADEABLE_RESOURCE_IDS.flatMap(resourceId => {
      const buyPrice = getLocalPrice(state, resourceId, currentSystemId);
      if (buyPrice <= 0) return [];

      return visitedSystems
        .filter(system => system.id !== currentSystemId)
        .map(system => {
          const sellPrice = getLocalPrice(state, resourceId, system.id);
          if (sellPrice <= buyPrice * 1.05) return null;
          return {
            resourceId,
            systemId: system.id,
            systemName: system.name,
            buyPrice,
            sellPrice,
            spreadPct: ((sellPrice / buyPrice) - 1) * 100,
            spreadValue: sellPrice - buyPrice,
          };
        })
        .filter((entry): entry is MarketOpportunity => entry !== null);
    });

    return opportunities
      .sort((left, right) => right.spreadPct - left.spreadPct)
      .slice(0, 6);
  }, [activeTab, currentSystemId, state, visitedSystems]);
  const salesMix = useMemo<SalesMixEntry[]>(() => {
    if (lifetimeTotal <= 0) return [];

    return Object.entries(lifetimeSold)
      .filter(([, value]) => value > 0)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([resourceId, value]) => ({
        resourceId,
        value,
        share: value / lifetimeTotal,
      }));
  }, [lifetimeSold, lifetimeTotal]);
  const autoWatch = useMemo<AutoSellWatchEntry[]>(() => {
    return autoSellEntries
      .filter(([, settings]) => settings.enabled)
      .map(([resourceId, settings]) => {
        const surplus = Math.max(0, (state.resources[resourceId] ?? 0) - (settings.threshold ?? 0));
        return {
          resourceId,
          threshold: settings.threshold ?? 0,
          surplus,
          liquidationValue: surplus * getEffectiveSellPrice(state, resourceId),
        };
      })
      .filter(entry => entry.surplus > 0)
      .sort((left, right) => right.liquidationValue - left.liquidationValue)
      .slice(0, 5);
  }, [autoSellEntries, state]);
  const focusCurrentPrice = focusResourceId ? getLocalPrice(state, focusResourceId, currentSystemId) : 0;

  return (
    <div className="space-y-6 w-full">

      {/* ── Header ── */}
      <div className="space-y-3">
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
                {formatCredits(lifetimeTotal)}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 px-3 py-2.5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 mb-3">
            <CommandMetric label="Price Bonus" value={`x${tradeMultiplier.toFixed(3)}`} meta="skill-scaled sell value" tone="emerald" />
            <CommandMetric label="Lifetime Sales" value={formatCredits(lifetimeTotal)} meta="all completed market value" tone="amber" />
            <CommandMetric label="Auto-Sell" value={`${autoEnabledCount}`} meta={autoReadyCount > 0 ? `${autoReadyCount} ready to liquidate` : 'no armed surplus'} tone={autoReadyCount > 0 ? 'emerald' : autoEnabledCount > 0 ? 'amber' : 'slate'} />
            <CommandMetric label="Trade Routes" value={`${activeRoutes}`} meta={transitRoutes > 0 ? `${transitRoutes} hauling now` : routes.length > 0 ? `${routes.length} configured` : 'no logistics lines'} tone={transitRoutes > 0 ? 'cyan' : activeRoutes > 0 ? 'violet' : 'slate'} />
          </div>
          <ActivityBar active={autoReadyCount > 0 || transitRoutes > 0 || activeRoutes > 0} rate={activityRate} color={transitRoutes > 0 ? 'cyan' : autoReadyCount > 0 ? 'green' : 'amber'} label="Market load" valueLabel={transitRoutes > 0 ? `${transitRoutes} hauling` : autoReadyCount > 0 ? `${autoReadyCount} ready` : `${activeRoutes} routes`} />
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
            {tab === 'listings' ? `Market Listings (${autoEnabledCount})` : `Trade Routes (${routes.length})`}
          </button>
        ))}
      </div>

      {/* ── Listings tab ── */}
      {activeTab === 'listings' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.96fr)] 2xl:grid-cols-[minmax(0,1.72fr)_minmax(380px,1fr)] items-start">
          <div className="space-y-4 min-w-0">
            <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 px-3 py-2.5">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 mb-3">
                <CommandMetric label="Listed Goods" value={`${listedResourceIds.length}`} meta="resources with market prices" tone="slate" />
                <CommandMetric label="Stocked" value={`${listedResourceIds.filter(id => (state.resources[id] ?? 0) > 0).length}`} meta="resources ready for sale" tone="amber" />
                <CommandMetric label="Auto Ready" value={`${autoReadyCount}`} meta={autoEnabledCount > 0 ? `${autoEnabledCount} auto lines armed` : 'no automation armed'} tone={autoReadyCount > 0 ? 'emerald' : 'slate'} />
                <CommandMetric label="Routes Online" value={`${activeRoutes}`} meta={transitRoutes > 0 ? `${transitRoutes} in motion` : 'listings only'} tone={activeRoutes > 0 ? 'cyan' : 'slate'} />
              </div>
              <ActivityBar active={autoReadyCount > 0} rate={Math.min(1, autoReadyCount / Math.max(1, autoEnabledCount || 1))} color={autoReadyCount > 0 ? 'green' : 'amber'} label="Auto-sell load" valueLabel={autoEnabledCount > 0 ? `${autoReadyCount}/${autoEnabledCount} ready` : 'none armed'} />
            </div>

            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4">
              <div className="text-[9px] text-slate-700 uppercase tracking-widest">Resource</div>
              <div className="text-[9px] text-slate-700 uppercase tracking-widest text-right">Price/unit</div>
              <div className="text-[9px] text-slate-700 uppercase tracking-widest text-right">Auto-sell</div>
              <div className="text-[9px] text-slate-700 uppercase tracking-widest text-right">Sell</div>
            </div>

            {MARKET_CATEGORIES.map(cat => (
              <MarketCategory key={cat.label} label={cat.label} ids={cat.ids} />
            ))}
          </div>

          <div className="space-y-4 min-w-0">
            <RegionalPriceTape
              resourceId={focusResourceId}
              candidates={focusCandidates}
              focusResourceId={focusResourceId}
              onFocusResource={setFocusResourceId}
              entries={focusTapeEntries}
              currentPrice={focusCurrentPrice}
            />
            <MarketOpportunityBoard opportunities={topOpportunities} />
            <MarketSalesMix salesMix={salesMix} autoWatch={autoWatch} />
          </div>
        </div>
      )}

      {/* ── Trade Routes tab ── */}
      {activeTab === 'routes' && <TradeRoutesTab state={state} systems={systems} visitedSystems={visitedSystems} />}
    </div>
  );
}
