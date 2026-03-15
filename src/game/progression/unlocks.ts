import type { GameState, UnlockRequirement, UnlockRequirementType } from '@/types/game.types';

export function checkUnlockRequirement(req: UnlockRequirement, state: GameState): boolean {
  switch (req.type as UnlockRequirementType) {
    case 'resource':
      return (state.resources[req.target] ?? 0) >= Number(req.value);
    case 'skill': {
      // target = 'skillId:minLevel', e.g. 'mining:3'
      const [skillId, minLvStr] = req.target.split(':');
      return (state.systems.skills.levels[skillId] ?? 0) >= Number(minLvStr ?? req.value);
    }
    case 'milestone':
      return state.unlocks[req.target] === true;
    default:
      return false;
  }
}

interface UnlockRule {
  unlockId: string;
  requirements: UnlockRequirement[];
}

// Most unlocks are driven by the skills system (skills grant unlock keys directly).
// These rules cover resource-threshold or compound conditions.
const UNLOCK_RULES: UnlockRule[] = [
  {
    unlockId: 'system-manufacturing',
    requirements: [
      { type: 'skill', target: 'industry:1', value: 1 },
    ],
  },
  {
    unlockId: 'system-market',
    requirements: [
      { type: 'skill', target: 'trade:1', value: 1 },
    ],
  },
  {
    unlockId: 'system-reprocessing',
    requirements: [
      { type: 'skill', target: 'reprocessing:1', value: 1 },
    ],
  },
  {
    unlockId: 'system-fleet',
    requirements: [
      { type: 'skill', target: 'spaceship-command:1', value: 1 },
    ],
  },
];

/** Returns a map of newly triggered unlocks this tick. */
export function processUnlocks(state: GameState): Record<string, boolean> {
  const newUnlocks: Record<string, boolean> = {};
  for (const rule of UNLOCK_RULES) {
    if (state.unlocks[rule.unlockId]) continue;
    const met = rule.requirements.every(req => checkUnlockRequirement(req, state));
    if (met) newUnlocks[rule.unlockId] = true;
  }
  return newUnlocks;
}
