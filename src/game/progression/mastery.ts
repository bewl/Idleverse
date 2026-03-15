import type { GameState } from '@/types/game.types';

// Mastery is superseded by the Skill Queue system.
// This stub exists so any stale imports compile cleanly.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function processMastery(_state: GameState, _deltaSeconds: number): Record<string, never> {
  return {};
}

