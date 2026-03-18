import type { FactionId } from '@/types/faction.types';
import type { RewardItemDefinition, RewardSourceDefinition } from './rewardTypes';

export const REWARD_HISTORY_LIMIT = 50;

export const REWARD_ITEM_DEFINITIONS: Record<string, RewardItemDefinition> = {
  'syndicate-signal-fragment': {
    id: 'syndicate-signal-fragment',
    name: 'Syndicate Signal Fragment',
    category: 'collectible',
    rarity: 'uncommon',
    stackable: true,
    description: 'Encrypted pirate telemetry salvaged from Syndicate command relays.',
    baseValue: 65000,
  },
  'ghost-signal-array': {
    id: 'ghost-signal-array',
    name: 'Ghost Signal Array',
    category: 'module',
    rarity: 'epic',
    stackable: false,
    description: 'A prototype guidance lattice stripped from elite Syndicate ships.',
    baseValue: 540000,
    effectPreview: { 'combat-loot-quality': 0.08, 'scan-strength': 0.05 },
  },
  'veldris-blood-seal': {
    id: 'veldris-blood-seal',
    name: 'Veldris Blood Seal',
    category: 'collectible',
    rarity: 'uncommon',
    stackable: true,
    description: 'Faction-marked kill seal prized by Veldris raider crews.',
    baseValue: 72000,
  },
  'marauder-overdrive-injector': {
    id: 'marauder-overdrive-injector',
    name: 'Marauder Overdrive Injector',
    category: 'module',
    rarity: 'epic',
    stackable: false,
    description: 'A brutal overclocking module recovered from apex raider engines.',
    baseValue: 620000,
    effectPreview: { 'warp-speed': 0.06, 'combat-dps': 0.04 },
  },
  'encrypted-doctrine-shard': {
    id: 'encrypted-doctrine-shard',
    name: 'Encrypted Doctrine Shard',
    category: 'research',
    rarity: 'rare',
    stackable: true,
    description: 'Partial tactical archives that point toward future blueprint and doctrine content.',
    baseValue: 180000,
  },
};

const COMBAT_REWARD_SOURCES: Record<string, RewardSourceDefinition> = {
  'combat:lowsec:syndicate': {
    id: 'combat:lowsec:syndicate',
    sourceType: 'combat',
    itemDrops: [
      { definitionId: 'syndicate-signal-fragment', chance: 0.18, minQty: 1, maxQty: 2 },
      { definitionId: 'encrypted-doctrine-shard', chance: 0.045, minQty: 1, maxQty: 1 },
      { definitionId: 'ghost-signal-array', chance: 0.012, minQty: 1, maxQty: 1, rolls: { effects: { 'scan-strength': 0.05 } } },
    ],
  },
  'combat:nullsec:syndicate': {
    id: 'combat:nullsec:syndicate',
    sourceType: 'combat',
    itemDrops: [
      { definitionId: 'syndicate-signal-fragment', chance: 0.24, minQty: 1, maxQty: 3 },
      { definitionId: 'encrypted-doctrine-shard', chance: 0.075, minQty: 1, maxQty: 2 },
      { definitionId: 'ghost-signal-array', chance: 0.02, minQty: 1, maxQty: 1, rolls: { effects: { 'scan-strength': 0.06, 'combat-loot-quality': 0.08 } } },
    ],
  },
  'combat:lowsec:veldris': {
    id: 'combat:lowsec:veldris',
    sourceType: 'combat',
    itemDrops: [
      { definitionId: 'veldris-blood-seal', chance: 0.18, minQty: 1, maxQty: 2 },
      { definitionId: 'encrypted-doctrine-shard', chance: 0.04, minQty: 1, maxQty: 1 },
      { definitionId: 'marauder-overdrive-injector', chance: 0.012, minQty: 1, maxQty: 1, rolls: { effects: { 'warp-speed': 0.05 } } },
    ],
  },
  'combat:nullsec:veldris': {
    id: 'combat:nullsec:veldris',
    sourceType: 'combat',
    itemDrops: [
      { definitionId: 'veldris-blood-seal', chance: 0.24, minQty: 1, maxQty: 3 },
      { definitionId: 'encrypted-doctrine-shard', chance: 0.075, minQty: 1, maxQty: 2 },
      { definitionId: 'marauder-overdrive-injector', chance: 0.02, minQty: 1, maxQty: 1, rolls: { effects: { 'warp-speed': 0.06, 'combat-dps': 0.04 } } },
    ],
  },
};

export function buildCombatRewardSourceId(security: 'lowsec' | 'nullsec', factionId: FactionId): string {
  return `combat:${security}:${factionId}`;
}

export function getRewardItemDefinition(definitionId: string): RewardItemDefinition | null {
  return REWARD_ITEM_DEFINITIONS[definitionId] ?? null;
}

export function getRewardSourceDefinition(sourceType: RewardSourceDefinition['sourceType'], sourceId: string): RewardSourceDefinition | null {
  if (sourceType === 'combat') {
    return COMBAT_REWARD_SOURCES[sourceId] ?? null;
  }
  return null;
}