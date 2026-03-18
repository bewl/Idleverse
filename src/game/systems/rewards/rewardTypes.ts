import type { RewardInventoryItem, RewardSourceType } from '@/types/game.types';

export interface RewardItemDefinition {
  id: string;
  name: string;
  category: 'collectible' | 'module' | 'research';
  rarity: RewardInventoryItem['rarity'];
  stackable: boolean;
  description: string;
  baseValue: number;
  effectPreview?: Record<string, number>;
}

export interface ResourceRewardEntry {
  resourceId: string;
  chance: number;
  minQty: number;
  maxQty: number;
}

export interface ItemRewardEntry {
  definitionId: string;
  chance: number;
  minQty: number;
  maxQty: number;
  rolls?: RewardInventoryItem['rolls'];
}

export interface RewardSourceDefinition {
  id: string;
  sourceType: RewardSourceType;
  itemDrops: ItemRewardEntry[];
}

export interface ResolvedRewardItem extends RewardInventoryItem {}

export interface ResolvedRewards {
  resources: Record<string, number>;
  items: ResolvedRewardItem[];
}

export interface RewardResolutionContext {
  sourceType: RewardSourceType;
  sourceId: string;
  sourceName: string;
  nowMs: number;
  resourceEntries?: ResourceRewardEntry[];
  resourceChanceMultiplier?: number;
  resourceQuantityMultiplier?: number;
  itemChanceMultiplier?: number;
  nextRandom: () => number;
}