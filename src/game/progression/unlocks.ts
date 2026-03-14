import type { GameState, UnlockRequirement, UnlockRequirementType } from '@/types/game.types';

export function checkUnlockRequirement(req: UnlockRequirement, state: GameState): boolean {
  switch (req.type as UnlockRequirementType) {
    case 'resource':
      return (state.resources[req.target] ?? 0) >= Number(req.value);
    case 'research':
      return state.systems.research.unlockedNodes[req.target] === true;
    case 'milestone':
      return state.unlocks[req.target] === true;
    case 'prestige':
      return state.prestige.points >= Number(req.value);
    case 'systemLevel':
      return (state.mastery[req.target]?.level ?? 0) >= Number(req.value);
    default:
      return false;
  }
}

interface UnlockRule {
  unlockId: string;
  requirements: UnlockRequirement[];
}

const UNLOCK_RULES: UnlockRule[] = [
  {
    unlockId: 'system-manufacturing',
    requirements: [
      { type: 'research', target: 'industrial-manufacturing-i', value: 1 },
    ],
  },
  {
    unlockId: 'system-prestige',
    requirements: [
      { type: 'resource', target: 'refined-metals', value: 100 },
      { type: 'research', target: 'industrial-mining-ii', value: 1 },
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
