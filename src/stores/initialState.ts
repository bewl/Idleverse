import type { GameState } from '@/types/game.types';
import { RESOURCE_IDS } from '@/game/resources/resourceRegistry';
import { SAVE_VERSION } from '@/game/balance/constants';

export function createInitialState(): GameState {
  const resources: Record<string, number> = {};
  for (const id of RESOURCE_IDS) {
    resources[id] = 0;
  }

  return {
    version: SAVE_VERSION,
    lastUpdatedAt: Date.now(),
    resources,
    systems: {
      mining: {
        targets: {
          'rocky-asteroid-cluster': false,
          'metallic-asteroid-field': false,
          'carbon-asteroid-belt': false,
          'ice-asteroid-cluster': false,
        },
        upgrades: {},
        lifetimeProduced: {},
        masteryXp: 0,
      },
      energy: {
        sources: { 'solar-array': 1 },
        totalSupply: 5,
        totalDemand: 0,
        powerFactor: 1,
        masteryXp: 0,
      },
      research: {
        unlockedNodes: {},
        activeNodeId: null,
        activeProgress: 0,
        masteryXp: 0,
      },
      manufacturing: {
        queue: [],
        completedCount: {},
        masteryXp: 0,
      },
    },
    unlocks: {
      'system-mining': true,
      'system-energy': true,
      'system-research': true,
      'system-manufacturing': false,
      'system-prestige': false,
    },
    modifiers: {},
    mastery: {},
    prestige: {
      points: 0,
      totalLifetimeProduction: 0,
      runCount: 0,
      permanentBonuses: {},
    },
    automation: {
      tier: 0,
    },
    settings: {
      autoSave: true,
      autoSaveInterval: 30000,
    },
  };
}
