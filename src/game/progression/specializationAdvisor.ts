import { skillTrainingSeconds } from '@/game/balance/constants';
import { RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { getFleetStoredCargo, getOperationalFleetShipIds } from '@/game/systems/fleet/wings.logic';

import type { GameState } from '@/types/game.types';

export type AdvisoryPanelId = 'overview' | 'skills' | 'mining' | 'manufacturing' | 'reprocessing' | 'market' | 'fleet' | 'starmap' | 'system';
export type SpecializationLaneId = 'mining' | 'industry' | 'trade' | 'combat' | 'exploration';
export type LaneRecommendationTone = 'recommended' | 'strong' | 'later';

export interface SpecializationLaneAdvice {
  id: SpecializationLaneId;
  title: string;
  icon: string;
  accentColor: string;
  panelId: AdvisoryPanelId;
  skillId: string;
  targetLevel: 1 | 2 | 3 | 4 | 5;
  summary: string;
  payoff: string;
  reasons: string[];
  score: number;
  tone: LaneRecommendationTone;
}

function getDirectTrainingEtaToLevel(state: GameState, skillId: string, targetLevel: number): number {
  const def = SKILL_DEFINITIONS[skillId];
  if (!def) return 0;

  const currentLevel = state.systems.skills.levels[skillId] ?? 0;
  if (currentLevel >= targetLevel) return 0;

  let total = 0;
  for (let level = currentLevel + 1; level <= targetLevel; level += 1) {
    total += skillTrainingSeconds(def.rank, level);
  }

  if (state.systems.skills.activeSkillId === skillId) {
    total = Math.max(0, total - state.systems.skills.activeProgress);
  }

  return total;
}

export function getTrainingEtaToLevel(
  state: GameState,
  skillId: string,
  targetLevel: number,
  visiting: Set<string> = new Set(),
): number {
  const def = SKILL_DEFINITIONS[skillId];
  if (!def) return 0;

  const currentLevel = state.systems.skills.levels[skillId] ?? 0;
  if (currentLevel >= targetLevel) return 0;
  if (visiting.has(skillId)) return 0;

  const nextVisiting = new Set(visiting);
  nextVisiting.add(skillId);

  let total = 0;
  for (const [requiredSkillId, requiredLevel] of Object.entries(def.prerequisiteSkills ?? {})) {
    total += getTrainingEtaToLevel(state, requiredSkillId, requiredLevel, nextVisiting);
  }

  return total + getDirectTrainingEtaToLevel(state, skillId, targetLevel);
}

function totalOreInInventory(state: GameState): number {
  return Object.entries(state.resources).reduce((sum, [resourceId, amount]) => {
    if (RESOURCE_REGISTRY[resourceId]?.category !== 'ore') return sum;
    return sum + amount;
  }, 0);
}

function totalMineralsInInventory(state: GameState): number {
  return Object.entries(state.resources).reduce((sum, [resourceId, amount]) => {
    if (RESOURCE_REGISTRY[resourceId]?.category !== 'mineral') return sum;
    return sum + amount;
  }, 0);
}

function nextLaneTarget(state: GameState, laneId: SpecializationLaneId): Pick<SpecializationLaneAdvice, 'skillId' | 'targetLevel' | 'panelId' | 'summary' | 'payoff'> {
  const levels = state.systems.skills.levels;
  const unlocks = state.unlocks;

  switch (laneId) {
    case 'mining': {
      const miningLevel = levels['mining'] ?? 0;
      const astroLevel = levels['astrogeology'] ?? 0;
      const advancedMiningLevel = levels['advanced-mining'] ?? 0;
      const miningBargeLevel = levels['mining-barge'] ?? 0;
      if (miningLevel < 3) {
        return {
          skillId: 'mining',
          targetLevel: 3,
          panelId: 'skills',
          summary: 'Push extraction first, then unlock richer belts and mining-specific hull growth.',
          payoff: 'Faster ore flow right away, then stronger mining specialization.',
        };
      }
      if (astroLevel < 1) {
        return {
          skillId: 'astrogeology',
          targetLevel: 1,
          panelId: 'skills',
          summary: 'The first real quality-of-mining breakpoint after starter extraction.',
          payoff: 'Better belts and stronger extraction scaling.',
        };
      }
      if (advancedMiningLevel < 1) {
        return {
          skillId: 'advanced-mining',
          targetLevel: 1,
          panelId: 'skills',
          summary: 'This is the gate into lowsec ore and the next yield tier.',
          payoff: 'A richer-riskier mining path opens.',
        };
      }
      return {
        skillId: miningBargeLevel < 1 ? 'mining-barge' : 'mining-barge',
        targetLevel: miningBargeLevel < 1 ? 1 : 3,
        panelId: 'skills',
        summary: 'Scale from better belts into heavy mining hull and hauling improvements.',
        payoff: 'A real extraction-specialist identity instead of just more starter mining.',
      };
    }
    case 'industry': {
      if (!unlocks['system-manufacturing']) {
        return {
          skillId: 'industry',
          targetLevel: 1,
          panelId: 'skills',
          summary: 'This is the fastest jump from raw extraction into compounding production.',
          payoff: 'Ore starts turning into components, hulls, and infrastructure.',
        };
      }
      if (!unlocks['system-reprocessing']) {
        return {
          skillId: 'reprocessing',
          targetLevel: 1,
          panelId: 'skills',
          summary: 'Close the mine-to-build loop by converting ore into manufacturing inputs.',
          payoff: 'Mining output gains a higher-value industrial destination.',
        };
      }
      return {
        skillId: 'advanced-industry',
        targetLevel: 1,
        panelId: 'skills',
        summary: 'The manufacturing lane is live; this starts improving throughput instead of just unlocking access.',
        payoff: 'A stronger day-1-to-day-7 industrial identity.',
      };
    }
    case 'trade': {
      const tradeLevel = levels['trade'] ?? 0;
      if (!unlocks['system-market']) {
        return {
          skillId: 'trade',
          targetLevel: 1,
          panelId: 'skills',
          summary: 'Open direct liquidity first so the starter loop pays out in credits.',
          payoff: 'Ore can become money immediately instead of waiting for industry.',
        };
      }
      if (tradeLevel < 3) {
        return {
          skillId: 'trade',
          targetLevel: 3,
          panelId: 'skills',
          summary: 'Move from manual selling into route-driven automation.',
          payoff: 'Trade III turns the economy lane into a logistics lane.',
        };
      }
      return {
        skillId: 'broker-relations',
        targetLevel: 2,
        panelId: 'skills',
        summary: 'The route lane is available; this is now about making volume more efficient.',
        payoff: 'Cleaner margins on a high-throughput market path.',
      };
    }
    case 'combat': {
      const spacesCommandLevel = levels['spaceship-command'] ?? 0;
      if (spacesCommandLevel < 2) {
        return {
          skillId: 'spaceship-command',
          targetLevel: 2,
          panelId: 'skills',
          summary: 'The first true transition from passive fleet ownership into active operations.',
          payoff: 'Patrol gameplay comes online.',
        };
      }
      if ((levels['military-operations'] ?? 0) < 1) {
        return {
          skillId: 'military-operations',
          targetLevel: 1,
          panelId: 'skills',
          summary: 'Push past patrols into targeted offensive orders.',
          payoff: 'Raid capability and a more explicit combat economy loop.',
        };
      }
      return {
        skillId: 'gunnery',
        targetLevel: 1,
        panelId: 'skills',
        summary: 'The combat lane is live; this improves actual combat throughput next.',
        payoff: 'Better fleet lethality instead of only more permissions.',
      };
    }
    case 'exploration': {
      const scienceLevel = levels['science'] ?? 0;
      const astrometricsLevel = levels['astrometrics'] ?? 0;
      if (scienceLevel < 1) {
        return {
          skillId: 'science',
          targetLevel: 1,
          panelId: 'skills',
          summary: 'Start the science chain before you try to branch into scanning.',
          payoff: 'You set up both exploration and later research paths.',
        };
      }
      if (astrometricsLevel < 1) {
        return {
          skillId: 'astrometrics',
          targetLevel: 1,
          panelId: 'skills',
          summary: 'This is the first actual exploration unlock, not just preparation.',
          payoff: 'Scanning gives fleets something new to chase besides fixed belts and routes.',
        };
      }
      return {
        skillId: 'hacking',
        targetLevel: 1,
        panelId: 'skills',
        summary: 'The scan loop is open; this makes discoveries actionable instead of just visible.',
        payoff: 'A more specialized anomaly-reward path.',
      };
    }
  }
}

export function buildSpecializationAdvice(state: GameState): SpecializationLaneAdvice[] {
  const levels = state.systems.skills.levels;
  const fleets = Object.values(state.systems.fleet.fleets);
  const miningFleetCount = fleets.filter(fleet => {
    const operationalShipIds = new Set(getOperationalFleetShipIds(fleet));
    return fleet.shipIds.some(shipId => operationalShipIds.has(shipId) && !!state.systems.fleet.ships[shipId]?.assignedBeltId);
  }).length;
  const totalStoredCargo = fleets.reduce((sum, fleet) => sum + getFleetStoredCargo(fleet), 0);
  const oreInInventory = totalOreInInventory(state);
  const mineralsInInventory = totalMineralsInInventory(state);
  const lifetimeCreditsFromSales = Object.values(state.systems.market.lifetimeSold).reduce((sum, value) => sum + value, 0);
  const branchUnlockCount = [
    state.unlocks['system-market'],
    state.unlocks['system-manufacturing'],
    state.unlocks['system-reprocessing'],
    state.unlocks['system-exploration'],
  ].filter(Boolean).length;
  const credits = state.resources['credits'] ?? 0;

  const lanes: Array<SpecializationLaneAdvice & { score: number; reasons: string[] }> = [];

  {
    let score = 0;
    const reasons: string[] = [];
    if (miningFleetCount > 0) {
      score += 3;
      reasons.push('Mining is already active, so this lane pays off immediately.');
    }
    if ((levels['mining'] ?? 0) < 3) {
      score += 2;
      reasons.push('You still have fast early extraction gains available.');
    }
    if (branchUnlockCount === 0) {
      score += 1;
      reasons.push('It is the safest default while the first branch is still unopened.');
    }
    const target = nextLaneTarget(state, 'mining');
    lanes.push({
      id: 'mining',
      title: 'Mining Specialist',
      icon: '⛏',
      accentColor: '#22d3ee',
      ...target,
      score,
      reasons,
      tone: 'later',
    });
  }

  {
    let score = 0;
    const reasons: string[] = [];
    if (oreInInventory > 0 || totalStoredCargo > 0) {
      score += 3;
      reasons.push('You already have raw material that can feed an industrial chain.');
    }
    if (!state.unlocks['system-manufacturing']) {
      score += 2;
      reasons.push('Manufacturing is still one of the shortest high-payoff branches from the opener.');
    }
    if (lifetimeCreditsFromSales > 0 || state.unlocks['system-market']) {
      score += 1;
      reasons.push('You have enough economy to start compounding output instead of only liquidating it.');
    }
    if (mineralsInInventory > 0 && !state.unlocks['system-manufacturing']) {
      score += 1;
      reasons.push('Minerals are already waiting for a production outlet.');
    }
    const target = nextLaneTarget(state, 'industry');
    lanes.push({
      id: 'industry',
      title: 'Industrial Builder',
      icon: '🏭',
      accentColor: '#fbbf24',
      ...target,
      score,
      reasons,
      tone: 'later',
    });
  }

  {
    let score = 0;
    const reasons: string[] = [];
    if (oreInInventory > 0) {
      score += 2;
      reasons.push('You have saleable inventory ready right now.');
    }
    if (!state.unlocks['system-market']) {
      score += 2;
      reasons.push('Trade I is still one of the fastest ways to make the early loop feel concrete.');
    }
    if (lifetimeCreditsFromSales <= 0) {
      score += 2;
      reasons.push('You have not closed the first credit loop yet.');
    }
    if (credits < 10_000) {
      score += 1;
      reasons.push('Direct liquidity still matters at your current bankroll.');
    }
    const target = nextLaneTarget(state, 'trade');
    lanes.push({
      id: 'trade',
      title: 'Trader / Logistician',
      icon: '📈',
      accentColor: '#fb7185',
      ...target,
      score,
      reasons,
      tone: 'later',
    });
  }

  {
    let score = 0;
    const reasons: string[] = [];
    if (fleets.length > 0) {
      score += 1;
      reasons.push('You already have a fleet footprint to build on.');
    }
    if ((levels['spaceship-command'] ?? 0) < 2) {
      score += 2;
      reasons.push('Patrol orders are still a near-term operational breakpoint.');
    }
    if (branchUnlockCount >= 1) {
      score += 1;
      reasons.push('Once one economy branch is open, combat becomes a more sensible second identity.');
    }
    const target = nextLaneTarget(state, 'combat');
    lanes.push({
      id: 'combat',
      title: 'Fleet Operator',
      icon: '⚔',
      accentColor: '#a78bfa',
      ...target,
      score,
      reasons,
      tone: 'later',
    });
  }

  {
    let score = 0;
    const reasons: string[] = [];
    if (lifetimeCreditsFromSales > 0) {
      score += 1;
      reasons.push('You already have a stable enough opener to justify a lateral branch.');
    }
    if ((levels['science'] ?? 0) < 1 || (levels['astrometrics'] ?? 0) < 1) {
      score += 2;
      reasons.push('Exploration is still a clean untouched branch if you want something different from ore or trade.');
    }
    if (branchUnlockCount >= 1) {
      score += 1;
      reasons.push('It works best once the basic economy no longer needs all of your queue time.');
    }
    const target = nextLaneTarget(state, 'exploration');
    lanes.push({
      id: 'exploration',
      title: 'Explorer',
      icon: '⊕',
      accentColor: '#34d399',
      ...target,
      score,
      reasons,
      tone: 'later',
    });
  }

  const ranked = lanes.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return getTrainingEtaToLevel(state, a.skillId, a.targetLevel) - getTrainingEtaToLevel(state, b.skillId, b.targetLevel);
  });

  return ranked.map((lane, index) => ({
    ...lane,
    tone: index === 0 ? 'recommended' : index === 1 ? 'strong' : 'later',
  }));
}