import type { GameState } from '@/types/game.types';
import { tickEnergy } from '@/game/systems/energy/energy.logic';
import { tickMining } from '@/game/systems/mining/mining.logic';
import { tickResearch } from '@/game/systems/research/research.logic';
import { tickManufacturing } from '@/game/systems/manufacturing/manufacturing.logic';
import { processUnlocks } from '@/game/progression/unlocks';
import { processMastery } from '@/game/progression/mastery';

export interface TickResult {
  newState: GameState;
  completedResearch: string[];
  completedManufacturing: Record<string, number>;
}

export function runTick(state: GameState, deltaSeconds: number): TickResult {
  const completedResearch: string[] = [];
  const completedManufacturing: Record<string, number> = {};

  // ── 1. Energy: recalculate supply / demand / powerFactor ────────────────
  const energyUpdate = tickEnergy(state);
  let s: GameState = {
    ...state,
    systems: {
      ...state.systems,
      energy: { ...state.systems.energy, ...energyUpdate },
    },
  };

  // ── 2. Mining: produce resources ────────────────────────────────────────
  const miningDeltas = tickMining(s, deltaSeconds);
  const newResources = { ...s.resources };
  let lifetimeDelta = 0;
  const newLifetimeProduced = { ...s.systems.mining.lifetimeProduced };
  for (const [id, amount] of Object.entries(miningDeltas)) {
    newResources[id] = (newResources[id] ?? 0) + amount;
    newLifetimeProduced[id] = (newLifetimeProduced[id] ?? 0) + amount;
    lifetimeDelta += amount;
  }
  s = {
    ...s,
    resources: newResources,
    systems: {
      ...s.systems,
      mining: { ...s.systems.mining, lifetimeProduced: newLifetimeProduced },
    },
    prestige: {
      ...s.prestige,
      totalLifetimeProduction: s.prestige.totalLifetimeProduction + lifetimeDelta,
    },
  };

  // ── 3. Research: advance active node ────────────────────────────────────
  const researchResult = tickResearch(s, deltaSeconds);
  if (researchResult.completed && researchResult.completedNodeId) {
    completedResearch.push(researchResult.completedNodeId);
    const newUnlockedNodes = {
      ...s.systems.research.unlockedNodes,
      [researchResult.completedNodeId]: true,
    };
    const newUnlocks = { ...s.unlocks };
    for (const unlockId of researchResult.newUnlocks) {
      newUnlocks[unlockId] = true;
    }
    s = {
      ...s,
      modifiers: { ...s.modifiers, ...researchResult.newModifiers },
      unlocks: newUnlocks,
      systems: {
        ...s.systems,
        research: {
          ...s.systems.research,
          unlockedNodes: newUnlockedNodes,
          activeNodeId: null,
          activeProgress: 0,
        },
      },
    };
  } else {
    s = {
      ...s,
      systems: {
        ...s.systems,
        research: {
          ...s.systems.research,
          activeProgress: s.systems.research.activeProgress + researchResult.progressIncrement,
        },
      },
    };
  }

  // ── 4. Manufacturing: advance queue ─────────────────────────────────────
  const mfgResult = tickManufacturing(s, deltaSeconds);
  if (mfgResult.completedJobs.length > 0) {
    const newQueue = s.systems.manufacturing.queue.slice(1);
    const newCompletedCount = { ...s.systems.manufacturing.completedCount };
    const newMfgResources = { ...s.resources };
    for (const job of mfgResult.completedJobs) {
      newCompletedCount[job.recipeId] = (newCompletedCount[job.recipeId] ?? 0) + job.qty;
      completedManufacturing[job.recipeId] = (completedManufacturing[job.recipeId] ?? 0) + job.qty;
    }
    for (const [id, amount] of Object.entries(mfgResult.resourceProduced)) {
      newMfgResources[id] = (newMfgResources[id] ?? 0) + amount;
    }
    s = {
      ...s,
      resources: newMfgResources,
      systems: {
        ...s.systems,
        manufacturing: {
          ...s.systems.manufacturing,
          queue: newQueue,
          completedCount: newCompletedCount,
        },
      },
    };
  } else if (s.systems.manufacturing.queue.length > 0) {
    const updatedQueue = [...s.systems.manufacturing.queue];
    updatedQueue[0] = {
      ...updatedQueue[0],
      progress: updatedQueue[0].progress + mfgResult.progressIncrement,
    };
    s = {
      ...s,
      systems: {
        ...s.systems,
        manufacturing: { ...s.systems.manufacturing, queue: updatedQueue },
      },
    };
  }

  // ── 5. Unlock checks ─────────────────────────────────────────────────────
  const newUnlocks = processUnlocks(s);
  if (Object.keys(newUnlocks).length > 0) {
    s = { ...s, unlocks: { ...s.unlocks, ...newUnlocks } };
  }

  // ── 6. Mastery XP ────────────────────────────────────────────────────────
  const masteryUpdates = processMastery(s, deltaSeconds);
  if (Object.keys(masteryUpdates).length > 0) {
    const newMastery = { ...s.mastery };
    for (const [systemId, update] of Object.entries(masteryUpdates)) {
      newMastery[systemId] = update;
    }
    s = { ...s, mastery: newMastery };
  }

  // ── 7. Advance timestamp ─────────────────────────────────────────────────
  s = { ...s, lastUpdatedAt: s.lastUpdatedAt + Math.round(deltaSeconds * 1000) };

  return { newState: s, completedResearch, completedManufacturing };
}
