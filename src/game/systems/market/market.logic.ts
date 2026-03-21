import type { GameState, TradeRoute } from '@/types/game.types';
import type { GalaxyState } from '@/types/galaxy.types';
import type { RouteSecurityFilter } from '@/types/faction.types';
import { generateGalaxy } from '@/game/galaxy/galaxy.gen';
import { findRoute, type RouteResult } from '@/game/galaxy/route.logic';
import { FLEET_ORDER_JUMP_RANGE_LY, issueFleetGroupOrder } from '@/game/systems/fleet/fleet.orders';
import { getCorpHqBonusFromState } from '@/game/systems/factions/faction.logic';

// ─── Result type ────────────────────────────────────────────────────────────

export interface MarketTickResult {
  /** ISK credits to add from auto-sells. */
  iskGained: number;
  /** Resources sold (quantities consumed from inventory). */
  resourcesSold: Record<string, number>;
  /** Updated lifetime-sold totals. */
  newLifetimeSold: Record<string, number>;
}

export interface RemotePurchaseQuote {
  unitPrice: number;
  baseCost: number;
  deliveryRate: number;
  deliverySurcharge: number;
  totalCost: number;
  route: RouteResult | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Effective NPC sell price for one unit of a resource, after all trade skill bonuses.
 * Formula: base × (1 + sell-price-bonus + broker-fee-reduction + sales-tax-reduction)
 * All three trade skills contribute additively to the "total price multiplier."
 */
export function getEffectiveSellPrice(state: GameState, resourceId: string): number {
  return getEffectiveSellPriceAtSystem(state, resourceId, state.galaxy.currentSystemId);
}

export function getEffectiveSellPriceAtSystem(
  state: GameState,
  resourceId: string,
  systemId: string,
): number {
  const base = getLocalPrice(state, resourceId, systemId);
  if (base === 0) return 0;

  const tradeBonus =
    (state.modifiers['sell-price-bonus']     ?? 0) +
    (state.modifiers['broker-fee-reduction'] ?? 0) +
    (state.modifiers['sales-tax-reduction']  ?? 0);

  const hqSellBonus = getCorpHqBonusFromState(state)?.marketSellPriceBonus ?? 0;

  return Math.floor(base * (1 + tradeBonus + hqSellBonus));
}

/** Total ISK gained from selling `amount` units of `resourceId`. */
export function calculateSellValue(
  state: GameState,
  resourceId: string,
  amount: number,
  systemId = state.galaxy.currentSystemId,
): number {
  return Math.floor(getEffectiveSellPriceAtSystem(state, resourceId, systemId) * amount);
}

/** Returns the combined trade modifier multiplier for display (the ×N factor on top of base price). */
export function getTradeBonusMultiplier(state: GameState): number {
  const tradeBonus =
    (state.modifiers['sell-price-bonus']     ?? 0) +
    (state.modifiers['broker-fee-reduction'] ?? 0) +
    (state.modifiers['sales-tax-reduction']  ?? 0);
  return 1 + tradeBonus;
}

// ─── Main tick ───────────────────────────────────────────────────────────────

export function tickMarket(state: GameState, _deltaSeconds: number): MarketTickResult {
  let iskGained = 0;
  const resourcesSold:   Record<string, number> = {};
  const newLifetimeSold: Record<string, number> = { ...(state.systems.market.lifetimeSold ?? {}) };

  const autoSell = state.systems.market.autoSell ?? {};

  for (const [resourceId, settings] of Object.entries(autoSell)) {
    if (!settings.enabled) continue;
    const have      = state.resources[resourceId] ?? 0;
    const threshold = settings.threshold ?? 0;
    const surplus   = have - threshold;
    if (surplus <= 0) continue;

    const price    = getEffectiveSellPrice(state, resourceId);
    if (price === 0) continue;

    const amountToSell = Math.floor(surplus);
    const iskFromThis  = price * amountToSell;

    iskGained += iskFromThis;
    resourcesSold[resourceId] = (resourcesSold[resourceId] ?? 0) + amountToSell;
    newLifetimeSold[resourceId] = (newLifetimeSold[resourceId] ?? 0) + iskFromThis;
  }

  return { iskGained, resourcesSold, newLifetimeSold };
}

// ─── Dynamic local market pricing ────────────────────────────────────────────

const PRICE_FLOOR_FACTOR  = 0.6;  // local price never drops below 60% of base
const PRICE_CAP_FACTOR    = 1.4;  // local price never exceeds 140% of base
const PRESSURE_DECAY_RATE = 0.05 / 3600; // 5% toward neutral per hour

/**
 * Deterministic per-system demand multiplier (0.5–2.0), seeded from the
 * galaxy seed + system ID + resource ID.  Stable across sessions — changes
 * only if the galaxy seed changes.
 */
export function getDemandMultiplier(
  galaxySeed: number,
  systemId:   string,
  resourceId: string,
): number {
  let h = galaxySeed >>> 0;
  for (let i = 0; i < systemId.length;   i++) h = Math.imul(h ^ systemId.charCodeAt(i),   0x9e3779b9) >>> 0;
  for (let i = 0; i < resourceId.length; i++) h = Math.imul(h ^ resourceId.charCodeAt(i), 0xbf58476d) >>> 0;
  h = ((h ^ (h >>> 31)) * 0x94d049bb) >>> 0;
  return 0.5 + (h / 0x100000000) * 1.5; // [0.5, 2.0]
}

/**
 * Market depth: how many units can be traded before local pressure shifts by
 * 100% (i.e., to floor or cap).  Calibrated so ~500k ISK of trading fully
 * saturates any market.
 */
export function getDemandVolume(basePrice: number): number {
  return Math.max(5, Math.round(500_000 / Math.max(1, basePrice)));
}

/** Current pressure for a system/resource (default 1.0 when absent). */
export function getSystemPressure(
  galaxy:     GalaxyState,
  systemId:   string,
  resourceId: string,
): number {
  return galaxy.systemPressure?.[systemId]?.[resourceId] ?? 1.0;
}

/**
 * Local market price at a specific system.
 * Formula: base × demandMultiplier × currentPressure, clamped to [base×0.6, base×1.4].
 */
export function getLocalPrice(
  state:      GameState,
  resourceId: string,
  systemId:   string,
): number {
  const base = state.systems.market.prices[resourceId] ?? 0;
  if (base === 0) return 0;
  const demandMult = getDemandMultiplier(state.galaxy.seed, systemId, resourceId);
  const pressure   = getSystemPressure(state.galaxy, systemId, resourceId);
  const raw        = base * demandMult * pressure;
  return Math.floor(
    Math.max(base * PRICE_FLOOR_FACTOR, Math.min(base * PRICE_CAP_FACTOR, raw)),
  );
}

/**
 * Apply a buy or sell pressure delta to a system's resource price.
 * Selling depresses pressure; buying raises it.
 */
export function applyPricePressure(
  galaxy:     GalaxyState,
  resourceId: string,
  systemId:   string,
  amount:     number,
  direction:  'buy' | 'sell',
  basePrice:  number,
): GalaxyState {
  const vol     = getDemandVolume(basePrice);
  const delta   = amount / vol;
  const current = getSystemPressure(galaxy, systemId, resourceId);
  const adjustment = direction === 'sell' ? -delta : delta;
  const newPressure = Math.max(
    PRICE_FLOOR_FACTOR,
    Math.min(PRICE_CAP_FACTOR, current + adjustment),
  );
  return {
    ...galaxy,
    systemPressure: {
      ...galaxy.systemPressure,
      [systemId]: {
        ...(galaxy.systemPressure?.[systemId] ?? {}),
        [resourceId]: newPressure,
      },
    },
  };
}

export function calculateDeliverySurcharge(basePurchaseCost: number, route: RouteResult | null): {
  deliveryRate: number;
  deliverySurcharge: number;
} {
  if (!route || route.hops === 0) {
    return { deliveryRate: 0, deliverySurcharge: 0 };
  }

  const lowsecHops = route.legSecurity.filter(security => security === 'lowsec').length;
  const nullsecHops = route.legSecurity.filter(security => security === 'nullsec').length;
  const deliveryRate = Math.max(
    0.04,
    Math.min(1.25, 0.04 + route.totalLy * 0.003 + lowsecHops * 0.025 + nullsecHops * 0.06),
  );

  return {
    deliveryRate,
    deliverySurcharge: Math.round(basePurchaseCost * deliveryRate),
  };
}

export function getRemotePurchaseQuote(
  state: GameState,
  resourceId: string,
  sellerSystemId: string,
  amount: number,
  securityFilter: RouteSecurityFilter = 'shortest',
): RemotePurchaseQuote | null {
  if (amount <= 0) return null;

  const unitPrice = getLocalPrice(state, resourceId, sellerSystemId);
  if (unitPrice <= 0) return null;

  const baseCost = unitPrice * amount;
  const galaxySystems = generateGalaxy(state.galaxy.seed);
  const route = findRoute(
    galaxySystems,
    sellerSystemId,
    state.galaxy.currentSystemId,
    FLEET_ORDER_JUMP_RANGE_LY,
    securityFilter,
  );
  const { deliveryRate, deliverySurcharge } = calculateDeliverySurcharge(baseCost, route);

  return {
    unitPrice,
    baseCost,
    deliveryRate,
    deliverySurcharge,
    totalCost: baseCost + deliverySurcharge,
    route,
  };
}

/**
 * Decay all active price pressures toward 1.0 at 5%/hour.
 * Entries that have fully returned to 1.0 within floating-point tolerance are
 * kept until they snap exactly to 1.0, then left alone (no entry deletion, to
 * avoid re-allocating pressure on the next sell/buy).
 */
export function tickPricePressure(state: GameState, deltaSeconds: number): GameState {
  const pressure = state.galaxy.systemPressure;
  if (!pressure || Object.keys(pressure).length === 0) return state;

  let changed = false;
  const newPressure: Record<string, Record<string, number>> = {};

  for (const [systemId, resources] of Object.entries(pressure)) {
    const newRes: Record<string, number> = {};
    for (const [resourceId, p] of Object.entries(resources)) {
      const decayed = p + (1.0 - p) * PRESSURE_DECAY_RATE * deltaSeconds;
      const snapped = Math.abs(decayed - 1.0) < 0.0005 ? 1.0 : decayed;
      if (snapped !== p) changed = true;
      newRes[resourceId] = snapped;
    }
    newPressure[systemId] = newRes;
  }

  if (!changed) return state;
  return { ...state, galaxy: { ...state.galaxy, systemPressure: newPressure } };
}

// ─── Trade route automation tick ─────────────────────────────────────────────

/**
 * For each enabled trade route, trigger the appropriate phase:
 * - Fleet idle at fromSystem with inTransit=0 → buy cargo, dispatch to toSystem.
 * - Fleet idle at toSystem with inTransit>0    → sell cargo, dispatch back.
 *
 * Called once per game tick (after fleet order advancement).
 */
export function tickTradeRoutes(state: GameState): GameState {
  const routes = state.systems.fleet.tradeRoutes ?? [];
  if (routes.length === 0) return state;

  let s = state;
  const newRoutes = [...routes] as TradeRoute[];
  let routesChanged = false;

  for (let i = 0; i < newRoutes.length; i++) {
    const route = newRoutes[i];
    if (!route.enabled) continue;

    const fleet = s.systems.fleet.fleets[route.fleetId];
    if (!fleet) continue;

    // Don't interrupt an in-flight order or active combat
    if (fleet.fleetOrder || fleet.combatOrder) continue;

    const fleetSystem = fleet.currentSystemId;

    // ── Buy phase ────────────────────────────────────────────────────────────
    if (fleetSystem === route.fromSystemId && route.inTransit === 0) {
      const buyPricePerUnit = getLocalPrice(s, route.resourceId, route.fromSystemId);
      if (buyPricePerUnit === 0) continue;

      const totalCost = buyPricePerUnit * route.amountPerRun;
      if ((s.resources['credits'] ?? 0) < totalCost) continue;

      const basePrice = s.systems.market.prices[route.resourceId] ?? buyPricePerUnit;

      // Issue fleet movement order first — bail if no route exists
      const afterOrder = issueFleetGroupOrder(s, route.fleetId, route.toSystemId);
      if (!afterOrder) continue;

      // Apply buy: deduct credits, add resource, apply pressure
      s = {
        ...afterOrder,
        resources: {
          ...afterOrder.resources,
          credits: (afterOrder.resources['credits'] ?? 0) - totalCost,
          [route.resourceId]:
            (afterOrder.resources[route.resourceId] ?? 0) + route.amountPerRun,
        },
        galaxy: applyPricePressure(
          afterOrder.galaxy, route.resourceId, route.fromSystemId,
          route.amountPerRun, 'buy', basePrice,
        ),
      };

      newRoutes[i] = { ...route, inTransit: route.amountPerRun, buyCostForTransit: totalCost };
      routesChanged = true;
      continue;
    }

    // ── Sell phase ───────────────────────────────────────────────────────────
    if (fleetSystem === route.toSystemId && route.inTransit > 0) {
      const available = s.resources[route.resourceId] ?? 0;
      const toSell    = Math.min(route.inTransit, available);
      const basePrice = s.systems.market.prices[route.resourceId] ?? 0;

      // Cargo may have been auto-sold while in transit — send fleet back anyway
      if (toSell > 0) {
        const sellPricePerUnit = getLocalPrice(s, route.resourceId, route.toSystemId);
        const grossRevenue     = sellPricePerUnit * toSell;
        const proportionSold   = toSell / route.inTransit;
        const costBasis        = route.buyCostForTransit * proportionSold;
        const runProfit        = grossRevenue - costBasis;

        s = {
          ...s,
          resources: {
            ...s.resources,
            credits: (s.resources['credits'] ?? 0) + grossRevenue,
            [route.resourceId]: Math.max(0, available - toSell),
          },
          galaxy: applyPricePressure(
            s.galaxy, route.resourceId, route.toSystemId,
            toSell, 'sell', basePrice,
          ),
        };

        newRoutes[i] = {
          ...route,
          inTransit: 0,
          buyCostForTransit: 0,
          lastRunProfit: runProfit,
          totalRunsCompleted: route.totalRunsCompleted + 1,
        };
      } else {
        newRoutes[i] = { ...route, inTransit: 0, buyCostForTransit: 0 };
      }

      routesChanged = true;

      // Dispatch back to fromSystem
      const afterReturn = issueFleetGroupOrder(s, route.fleetId, route.fromSystemId);
      if (afterReturn) s = afterReturn;
    }
  }

  if (!routesChanged) return state;

  return {
    ...s,
    systems: {
      ...s.systems,
      fleet: { ...s.systems.fleet, tradeRoutes: newRoutes },
    },
  };
}
