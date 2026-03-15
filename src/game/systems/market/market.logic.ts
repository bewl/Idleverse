import type { GameState } from '@/types/game.types';

// ─── Result type ────────────────────────────────────────────────────────────

export interface MarketTickResult {
  /** ISK credits to add from auto-sells. */
  iskGained: number;
  /** Resources sold (quantities consumed from inventory). */
  resourcesSold: Record<string, number>;
  /** Updated lifetime-sold totals. */
  newLifetimeSold: Record<string, number>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Effective NPC sell price for one unit of a resource, after all trade skill bonuses.
 * Formula: base × (1 + sell-price-bonus + broker-fee-reduction + sales-tax-reduction)
 * All three trade skills contribute additively to the "total price multiplier."
 */
export function getEffectiveSellPrice(state: GameState, resourceId: string): number {
  const base = state.systems.market.prices[resourceId] ?? 0;
  if (base === 0) return 0;

  const tradeBonus =
    (state.modifiers['sell-price-bonus']     ?? 0) +
    (state.modifiers['broker-fee-reduction'] ?? 0) +
    (state.modifiers['sales-tax-reduction']  ?? 0);

  return Math.floor(base * (1 + tradeBonus));
}

/** Total ISK gained from selling `amount` units of `resourceId`. */
export function calculateSellValue(state: GameState, resourceId: string, amount: number): number {
  return Math.floor(getEffectiveSellPrice(state, resourceId) * amount);
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
