import type { GameState, SystemMasteryState } from '@/types/game.types';
import { masteryXpRequired } from '@/game/balance/constants';

type XpCalculator = (state: GameState, deltaSeconds: number) => number;

const MASTERY_XP_CALCULATORS: Record<string, XpCalculator> = {
  mining: (state, delta) => {
    const active = Object.values(state.systems.mining.targets).filter(Boolean).length;
    return active * 0.5 * delta;
  },
  energy: (state, delta) => {
    const hasSources = Object.values(state.systems.energy.sources).some(l => l > 0);
    return hasSources ? 0.2 * delta : 0;
  },
  research: (state, delta) => {
    return state.systems.research.activeNodeId ? 1.0 * delta : 0;
  },
  manufacturing: (state, delta) => {
    return state.systems.manufacturing.queue.length > 0 ? 0.8 * delta : 0;
  },
};

function advanceMasteryLevel(
  current: SystemMasteryState,
  gainedXp: number
): SystemMasteryState {
  let xp = current.xp + gainedXp;
  let level = current.level;
  while (true) {
    const required = masteryXpRequired(level);
    if (xp >= required) {
      xp -= required;
      level++;
    } else {
      break;
    }
  }
  return { level, xp, milestonesClaimed: current.milestonesClaimed };
}

/** Returns updated mastery entries for any systems that gained XP this tick. */
export function processMastery(
  state: GameState,
  deltaSeconds: number
): Record<string, SystemMasteryState> {
  const updates: Record<string, SystemMasteryState> = {};
  for (const [systemId, calcXp] of Object.entries(MASTERY_XP_CALCULATORS)) {
    const gained = calcXp(state, deltaSeconds);
    if (gained <= 0) continue;
    const current = state.mastery[systemId] ?? { level: 1, xp: 0, milestonesClaimed: [] };
    const updated = advanceMasteryLevel(current, gained);
    if (updated.level !== current.level || updated.xp !== current.xp) {
      updates[systemId] = updated;
    }
  }
  return updates;
}
