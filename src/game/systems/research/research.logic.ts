import type { GameState } from '@/types/game.types';
import { RESEARCH_NODES } from './research.config';
import { calcResearchTime } from '@/game/balance/constants';

export function isResearchAvailable(nodeId: string, state: GameState): boolean {
  const def = RESEARCH_NODES[nodeId];
  if (!def) return false;
  if (state.systems.research.unlockedNodes[nodeId]) return false;
  return def.prerequisites.every(p => state.systems.research.unlockedNodes[p] === true);
}

export interface ResearchTickResult {
  completed: boolean;
  completedNodeId: string | null;
  newModifiers: Record<string, number>;
  newUnlocks: string[];
  progressIncrement: number;
}

export function tickResearch(state: GameState, deltaSeconds: number): ResearchTickResult {
  const result: ResearchTickResult = {
    completed: false,
    completedNodeId: null,
    newModifiers: {},
    newUnlocks: [],
    progressIncrement: 0,
  };

  const { activeNodeId, activeProgress } = state.systems.research;
  if (!activeNodeId) return result;

  const def = RESEARCH_NODES[activeNodeId];
  if (!def) return result;

  const totalTime = calcResearchTime(def.baseTime, def.tier, def.depth);
  const newProgress = activeProgress + deltaSeconds;
  result.progressIncrement = deltaSeconds;

  if (newProgress >= totalTime) {
    result.completed = true;
    result.completedNodeId = activeNodeId;
    for (const effect of def.effects) {
      result.newModifiers[effect.modifier] =
        (state.modifiers[effect.modifier] ?? 0) + effect.value;
    }
    result.newUnlocks = def.unlocks;
  }

  return result;
}
