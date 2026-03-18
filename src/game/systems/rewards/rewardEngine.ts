import type { RewardHistoryEntry, RewardHistoryItemEntry, RewardsState } from '@/types/game.types';
import { randInt } from '@/game/utils/prng';
import { getRewardItemDefinition, getRewardSourceDefinition, REWARD_HISTORY_LIMIT } from './rewardRegistry';
import type { ItemRewardEntry, ResolvedRewardItem, ResolvedRewards, RewardResolutionContext } from './rewardTypes';

function clampChance(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildItemInstanceId(sourceId: string, nowMs: number, rollIndex: number, randomValue: number): string {
  return `reward-${sourceId}-${nowMs}-${rollIndex}-${Math.floor(randomValue * 1000000)}`;
}

function resolveItemEntries(context: RewardResolutionContext, entries: ItemRewardEntry[]): ResolvedRewardItem[] {
  const items: ResolvedRewardItem[] = [];
  let rollIndex = 0;

  for (const entry of entries) {
    const itemDefinition = getRewardItemDefinition(entry.definitionId);
    if (!itemDefinition) continue;

    const chance = clampChance(entry.chance * (context.itemChanceMultiplier ?? 1));
    const roll = context.nextRandom();
    if (roll >= chance) {
      continue;
    }

    const quantity = randInt(context.nextRandom, entry.minQty, entry.maxQty);
    if (itemDefinition.stackable) {
      items.push({
        id: buildItemInstanceId(context.sourceId, context.nowMs, rollIndex, roll),
        definitionId: itemDefinition.id,
        rarity: itemDefinition.rarity,
        quantity,
        stackable: true,
        source: {
          type: context.sourceType,
          id: context.sourceId,
          name: context.sourceName,
          acquiredAt: context.nowMs,
        },
        rolls: entry.rolls,
      });
      rollIndex += 1;
      continue;
    }

    for (let index = 0; index < quantity; index++) {
      const instanceRoll = context.nextRandom();
      items.push({
        id: buildItemInstanceId(context.sourceId, context.nowMs, rollIndex, instanceRoll),
        definitionId: itemDefinition.id,
        rarity: itemDefinition.rarity,
        quantity: 1,
        stackable: false,
        source: {
          type: context.sourceType,
          id: context.sourceId,
          name: context.sourceName,
          acquiredAt: context.nowMs,
        },
        rolls: entry.rolls,
      });
      rollIndex += 1;
    }
  }

  return items;
}

export function resolveRewards(context: RewardResolutionContext): ResolvedRewards {
  const resources: Record<string, number> = {};

  for (const entry of context.resourceEntries ?? []) {
    const chance = clampChance(entry.chance * (context.resourceChanceMultiplier ?? 1));
    if (context.nextRandom() >= chance) {
      continue;
    }

    const rolledQty = randInt(context.nextRandom, entry.minQty, entry.maxQty);
    const scaledQty = Math.max(1, Math.round(rolledQty * (context.resourceQuantityMultiplier ?? 1)));
    resources[entry.resourceId] = (resources[entry.resourceId] ?? 0) + scaledQty;
  }

  const sourceDefinition = getRewardSourceDefinition(context.sourceType, context.sourceId);
  const items = sourceDefinition ? resolveItemEntries(context, sourceDefinition.itemDrops) : [];

  return { resources, items };
}

function mergeInventoryItems(existingItems: RewardsState['inventory'], newItems: ResolvedRewardItem[]): RewardsState['inventory'] {
  const nextItems = [...existingItems];

  for (const item of newItems) {
    if (!item.stackable) {
      nextItems.push(item);
      continue;
    }

    const existingIndex = nextItems.findIndex(existing =>
      existing.stackable && existing.definitionId === item.definitionId && existing.rarity === item.rarity,
    );

    if (existingIndex === -1) {
      nextItems.push(item);
      continue;
    }

    const existing = nextItems[existingIndex];
    nextItems[existingIndex] = {
      ...existing,
      quantity: existing.quantity + item.quantity,
      source: item.source,
      rolls: item.rolls ?? existing.rolls,
    };
  }

  return nextItems;
}

export function recordResolvedRewards(
  rewardsState: RewardsState,
  context: Pick<RewardResolutionContext, 'sourceId' | 'sourceName' | 'sourceType' | 'nowMs'>,
  resolved: ResolvedRewards,
  creditsEarned = 0,
): RewardsState {
  if (creditsEarned <= 0 && Object.keys(resolved.resources).length === 0 && resolved.items.length === 0) {
    return rewardsState;
  }

  const inventory = mergeInventoryItems(rewardsState.inventory, resolved.items);
  const discoveredDefinitionIds = { ...rewardsState.discoveredDefinitionIds };
  const itemRewards: RewardHistoryItemEntry[] = resolved.items.map(item => {
    discoveredDefinitionIds[item.definitionId] = true;
    return {
      definitionId: item.definitionId,
      rarity: item.rarity,
      quantity: item.quantity,
    };
  });

  const historyEntry: RewardHistoryEntry = {
    id: `reward-log-${context.sourceId}-${context.nowMs}`,
    timestamp: context.nowMs,
    sourceType: context.sourceType,
    sourceId: context.sourceId,
    sourceName: context.sourceName,
    creditsEarned,
    resourceRewards: resolved.resources,
    itemRewards,
  };

  return {
    inventory,
    discoveredDefinitionIds,
    history: [historyEntry, ...rewardsState.history].slice(0, REWARD_HISTORY_LIMIT),
  };
}