import { create } from 'zustand';
import type { GameState, OfflineSummary, ManufacturingJob } from '@/types/game.types';
import { createInitialState } from './initialState';
import { runTick } from '@/game/core/tickRunner';
import { MANUFACTURING_RECIPES } from '@/game/systems/manufacturing/manufacturing.config';
import { RESEARCH_NODES } from '@/game/systems/research/research.config';
import { MINING_TARGETS, MINING_UPGRADES } from '@/game/systems/mining/mining.config';
import { ENERGY_SOURCES } from '@/game/systems/energy/energy.config';
import { upgradeCost } from '@/game/balance/constants';
import { saveGame, loadGame } from '@/game/persistence/saveLoad';
import { processOfflineProgress } from '@/game/offline/offlineCalc';
import { canPrestige, performPrestige } from '@/game/prestige/prestige.logic';

interface GameStore {
  state: GameState;
  offlineSummary: OfflineSummary | null;

  tick: (deltaSeconds: number) => void;
  toggleMiningTarget: (targetId: string) => void;
  purchaseMiningUpgrade: (upgradeId: string) => void;
  purchaseEnergySource: (sourceId: string) => void;
  startResearch: (nodeId: string) => void;
  cancelResearch: () => void;
  queueManufacturing: (recipeId: string, quantity: number) => void;
  cancelManufacturingJob: (index: number) => void;
  triggerPrestige: () => void;
  saveToStorage: () => void;
  loadFromStorage: () => void;
  dismissOfflineSummary: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: createInitialState(),
  offlineSummary: null,

  tick: (deltaSeconds) => {
    const { newState } = runTick(get().state, deltaSeconds);
    set({ state: newState });
  },

  toggleMiningTarget: (targetId) => {
    const { state } = get();
    const def = MINING_TARGETS[targetId];
    if (!def) return;
    if (def.unlockResearch && !state.systems.research.unlockedNodes[def.unlockResearch]) return;
    const current = state.systems.mining.targets[targetId] ?? false;
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          mining: {
            ...state.systems.mining,
            targets: { ...state.systems.mining.targets, [targetId]: !current },
          },
        },
      },
    });
  },

  purchaseMiningUpgrade: (upgradeId) => {
    const { state } = get();
    const def = MINING_UPGRADES[upgradeId];
    if (!def) return;
    const currentLevel = state.systems.mining.upgrades[upgradeId] ?? 0;
    if (currentLevel >= def.maxLevel) return;
    if (def.prerequisiteResearch && !state.systems.research.unlockedNodes[def.prerequisiteResearch]) return;
    const newResources = { ...state.resources };
    for (const [resourceId, baseAmount] of Object.entries(def.baseCost)) {
      const cost = upgradeCost(baseAmount, currentLevel);
      if ((newResources[resourceId] ?? 0) < cost) return;
      newResources[resourceId] = (newResources[resourceId] ?? 0) - cost;
    }
    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          mining: {
            ...state.systems.mining,
            upgrades: { ...state.systems.mining.upgrades, [upgradeId]: currentLevel + 1 },
          },
        },
      },
    });
  },

  purchaseEnergySource: (sourceId) => {
    const { state } = get();
    const def = ENERGY_SOURCES[sourceId];
    if (!def) return;
    const currentLevel = state.systems.energy.sources[sourceId] ?? 0;
    if (currentLevel >= def.maxLevel) return;
    if (def.unlockResearch && !state.systems.research.unlockedNodes[def.unlockResearch]) return;
    const newResources = { ...state.resources };
    for (const [resourceId, baseAmount] of Object.entries(def.baseCost)) {
      const cost = upgradeCost(baseAmount, currentLevel);
      if ((newResources[resourceId] ?? 0) < cost) return;
      newResources[resourceId] = (newResources[resourceId] ?? 0) - cost;
    }
    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          energy: {
            ...state.systems.energy,
            sources: { ...state.systems.energy.sources, [sourceId]: currentLevel + 1 },
          },
        },
      },
    });
  },

  startResearch: (nodeId) => {
    const { state } = get();
    const def = RESEARCH_NODES[nodeId];
    if (!def) return;
    if (state.systems.research.unlockedNodes[nodeId]) return;
    if (state.systems.research.activeNodeId) return;
    if (!def.prerequisites.every(p => state.systems.research.unlockedNodes[p])) return;
    const newResources = { ...state.resources };
    for (const [resourceId, amount] of Object.entries(def.baseCost)) {
      if ((newResources[resourceId] ?? 0) < amount) return;
      newResources[resourceId] = (newResources[resourceId] ?? 0) - amount;
    }
    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          research: { ...state.systems.research, activeNodeId: nodeId, activeProgress: 0 },
        },
      },
    });
  },

  cancelResearch: () => {
    const { state } = get();
    if (!state.systems.research.activeNodeId) return;
    const def = RESEARCH_NODES[state.systems.research.activeNodeId];
    const newResources = { ...state.resources };
    if (def) {
      for (const [resourceId, amount] of Object.entries(def.baseCost)) {
        newResources[resourceId] = (newResources[resourceId] ?? 0) + Math.floor(amount * 0.5);
      }
    }
    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          research: { ...state.systems.research, activeNodeId: null, activeProgress: 0 },
        },
      },
    });
  },

  queueManufacturing: (recipeId, quantity) => {
    const { state } = get();
    if (!state.unlocks['system-manufacturing']) return;
    const recipe = MANUFACTURING_RECIPES[recipeId];
    if (!recipe) return;
    if (recipe.prerequisiteResearch && !state.systems.research.unlockedNodes[recipe.prerequisiteResearch]) return;
    const newResources = { ...state.resources };
    for (const [resourceId, amount] of Object.entries(recipe.inputs)) {
      const total = amount * quantity;
      if ((newResources[resourceId] ?? 0) < total) return;
      newResources[resourceId] = (newResources[resourceId] ?? 0) - total;
    }
    const newJob: ManufacturingJob = { recipeId, progress: 0, quantity };
    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          manufacturing: {
            ...state.systems.manufacturing,
            queue: [...state.systems.manufacturing.queue, newJob],
          },
        },
      },
    });
  },

  cancelManufacturingJob: (index) => {
    const { state } = get();
    const job = state.systems.manufacturing.queue[index];
    if (!job) return;
    const recipe = MANUFACTURING_RECIPES[job.recipeId];
    const newResources = { ...state.resources };
    if (recipe) {
      for (const [resourceId, amount] of Object.entries(recipe.inputs)) {
        newResources[resourceId] =
          (newResources[resourceId] ?? 0) + Math.floor(amount * job.quantity * 0.5);
      }
    }
    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          manufacturing: {
            ...state.systems.manufacturing,
            queue: state.systems.manufacturing.queue.filter((_, i) => i !== index),
          },
        },
      },
    });
  },

  triggerPrestige: () => {
    const { state } = get();
    if (!canPrestige(state)) return;
    const newState = performPrestige(state);
    set({ state: newState });
    saveGame(newState);
  },

  saveToStorage: () => {
    saveGame(get().state);
  },

  loadFromStorage: () => {
    const save = loadGame();
    if (!save) return;
    const { newState, summary } = processOfflineProgress(save.state, Date.now());
    set({
      state: newState,
      offlineSummary: summary.elapsedSeconds > 60 ? summary : null,
    });
  },

  dismissOfflineSummary: () => set({ offlineSummary: null }),
}));
