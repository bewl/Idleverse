import { getFleetStoredCargo, getFleetStorageCapacity } from '@/game/systems/fleet/wings.logic';

import type { GameState, PilotTrainingFocus } from '@/types/game.types';

export type RecruitmentMilestoneId = 'first-sale' | 'storage-pressure' | 'combat-ready' | 'exploration-open';

export interface RecruitmentOfferDirective {
  milestoneId: RecruitmentMilestoneId;
  sourceLabel: string;
  recommendationReason: string;
  focusSequence: PilotTrainingFocus[];
  hiringCostRange: [number, number];
}

function totalLifetimeCreditsSold(state: GameState): number {
  return Object.values(state.systems.market.lifetimeSold).reduce((sum, value) => sum + value, 0);
}

function maxStorageFill(state: GameState): number {
  const fleets = Object.values(state.systems.fleet.fleets);
  let maxFill = 0;

  for (const fleet of fleets) {
    const used = getFleetStoredCargo(fleet);
    const capacity = getFleetStorageCapacity(fleet, state.systems.fleet.ships, state.systems.fleet.pilots);
    if (capacity <= 0) continue;
    maxFill = Math.max(maxFill, used / capacity);
  }

  return maxFill;
}

export function getTriggeredRecruitmentDirectives(previousState: GameState, nextState: GameState): RecruitmentOfferDirective[] {
  const directives: RecruitmentOfferDirective[] = [];
  const fired = nextState.systems.fleet.recruitmentMilestones ?? {};

  const prevSoldCredits = totalLifetimeCreditsSold(previousState);
  const nextSoldCredits = totalLifetimeCreditsSold(nextState);
  if (!fired['first-sale'] && prevSoldCredits <= 0 && nextSoldCredits > 0) {
    directives.push({
      milestoneId: 'first-sale',
      sourceLabel: 'Expansion Contracts',
      recommendationReason: 'Your first sale proves the corp can sustain payroll. These pilots are weighted toward the early growth jobs that split mining, hauling, and general expansion.',
      focusSequence: ['hauling', 'mining', 'balanced'],
      hiringCostRange: [25_000, 90_000],
    });
  }

  const prevStorageFill = maxStorageFill(previousState);
  const nextStorageFill = maxStorageFill(nextState);
  if (!fired['storage-pressure'] && prevStorageFill < 0.75 && nextStorageFill >= 0.75) {
    directives.push({
      milestoneId: 'storage-pressure',
      sourceLabel: 'Hauling Contracts',
      recommendationReason: 'Storage pressure is building in an active fleet. These contracts lean toward hauling and balanced pilots to keep extraction from stalling.',
      focusSequence: ['hauling', 'hauling', 'balanced'],
      hiringCostRange: [20_000, 110_000],
    });
  }

  const prevSpaceshipCommand = previousState.systems.skills.levels['spaceship-command'] ?? 0;
  const nextSpaceshipCommand = nextState.systems.skills.levels['spaceship-command'] ?? 0;
  if (!fired['combat-ready'] && prevSpaceshipCommand < 2 && nextSpaceshipCommand >= 2) {
    directives.push({
      milestoneId: 'combat-ready',
      sourceLabel: 'Security Contracts',
      recommendationReason: 'Patrol operations are now viable. These pilots are weighted toward combat and balanced support so fleet operations can expand beyond passive mining.',
      focusSequence: ['combat', 'combat', 'balanced'],
      hiringCostRange: [50_000, 150_000],
    });
  }

  const hadExploration = !!previousState.unlocks['system-exploration'];
  const hasExploration = !!nextState.unlocks['system-exploration'];
  if (!fired['exploration-open'] && !hadExploration && hasExploration) {
    directives.push({
      milestoneId: 'exploration-open',
      sourceLabel: 'Survey Contracts',
      recommendationReason: 'Scanning is online. These pilots are biased toward exploration and balanced support so discoveries become actionable sooner.',
      focusSequence: ['exploration', 'exploration', 'balanced'],
      hiringCostRange: [35_000, 125_000],
    });
  }

  return directives;
}