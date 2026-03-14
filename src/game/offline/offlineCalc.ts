import type { GameState, OfflineSummary } from '@/types/game.types';
import { OFFLINE_CAP_SECONDS } from '@/game/balance/constants';
import { runTick } from '@/game/core/tickRunner';

/** Simulate offline progress in discrete chunks using the live tick logic. */
export function processOfflineProgress(
  state: GameState,
  nowMs: number
): { newState: GameState; summary: OfflineSummary } {
  const elapsedRaw = (nowMs - state.lastUpdatedAt) / 1000;
  const wasCapped = elapsedRaw > OFFLINE_CAP_SECONDS;
  const elapsed = Math.min(elapsedRaw, OFFLINE_CAP_SECONDS);

  if (elapsed < 1) {
    return {
      newState: state,
      summary: {
        elapsedSeconds: 0,
        resourcesGained: {},
        completedResearch: [],
        completedManufacturing: {},
        wasCapped: false,
      },
    };
  }

  const resourcesBefore = { ...state.resources };
  let currentState = { ...state };
  const completedResearch: string[] = [];
  const completedManufacturing: Record<string, number> = {};

  // Simulate in 60-second chunks to preserve queue/unlock logic
  let remaining = elapsed;
  const CHUNK = 60;
  while (remaining > 0) {
    const chunk = Math.min(remaining, CHUNK);
    const result = runTick(currentState, chunk);
    completedResearch.push(...result.completedResearch);
    for (const [id, qty] of Object.entries(result.completedManufacturing)) {
      completedManufacturing[id] = (completedManufacturing[id] ?? 0) + qty;
    }
    currentState = result.newState;
    remaining -= chunk;
  }

  const resourcesGained: Record<string, number> = {};
  for (const id of Object.keys(currentState.resources)) {
    const gained = (currentState.resources[id] ?? 0) - (resourcesBefore[id] ?? 0);
    if (gained > 0) resourcesGained[id] = gained;
  }

  return {
    newState: { ...currentState, lastUpdatedAt: nowMs },
    summary: {
      elapsedSeconds: elapsed,
      resourcesGained,
      completedResearch,
      completedManufacturing,
      wasCapped,
    },
  };
}
