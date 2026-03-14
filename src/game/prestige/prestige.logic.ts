import type { GameState } from '@/types/game.types';
import { calcPrestigePoints, prestigeBonus } from '@/game/balance/constants';
import { PRESTIGE_MIN_LIFETIME_PRODUCTION } from './prestige.config';
import { createInitialState } from '@/stores/initialState';

export function canPrestige(state: GameState): boolean {
  return state.prestige.totalLifetimeProduction >= PRESTIGE_MIN_LIFETIME_PRODUCTION;
}

export function getPrestigePointsPreview(state: GameState): number {
  return calcPrestigePoints(state.prestige.totalLifetimeProduction);
}

export function getPrestigeProductionBonus(state: GameState): number {
  return prestigeBonus(state.prestige.points);
}

export function performPrestige(state: GameState): GameState {
  const newPoints = calcPrestigePoints(state.prestige.totalLifetimeProduction);
  const totalPoints = state.prestige.points + newPoints;
  const freshState = createInitialState();
  return {
    ...freshState,
    prestige: {
      points: totalPoints,
      totalLifetimeProduction: state.prestige.totalLifetimeProduction,
      runCount: state.prestige.runCount + 1,
      permanentBonuses: { ...state.prestige.permanentBonuses },
    },
    version: state.version,
    settings: { ...state.settings },
  };
}
