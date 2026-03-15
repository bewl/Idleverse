import type { PilotInstance, PilotSkillState, PilotSkillQueueEntry, GameState } from '@/types/game.types';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { PILOT_SKILL_FOCUS_TREES } from './fleet.config';
import { skillTrainingSeconds } from '@/game/balance/constants';

// ─── Multiplier getters ────────────────────────────────────────────────────

/**
 * Mining yield multiplier from pilot personal skills.
 * Returns an additive bonus (0.0 = no bonus, 0.5 = +50%).
 */
export function getPilotMiningBonus(pilot: PilotInstance): number {
  let bonus = 0;
  const miningSkills = ['mining', 'astrogeology', 'advanced-mining', 'mining-frigate', 'drone-interfacing', 'mining-barge'];
  for (const skillId of miningSkills) {
    const level = pilot.skills.levels[skillId] ?? 0;
    if (level <= 0) continue;
    const def = SKILL_DEFINITIONS[skillId];
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.modifier === 'mining-yield' || effect.modifier === 'mining-frigate-bonus' || effect.modifier === 'mining-barge-bonus') {
        bonus += effect.valuePerLevel * level;
      }
    }
  }
  return bonus;
}

/**
 * Combat effectiveness multiplier from pilot skills.
 */
export function getPilotCombatBonus(pilot: PilotInstance): number {
  let bonus = 0;
  const combatSkills = ['spaceship-command', 'frigate', 'destroyer', 'cruiser'];
  for (const skillId of combatSkills) {
    const level = pilot.skills.levels[skillId] ?? 0;
    if (level <= 0) continue;
    const def = SKILL_DEFINITIONS[skillId];
    if (!def) continue;
    for (const effect of def.effects) {
      bonus += effect.valuePerLevel * level;
    }
  }
  return bonus;
}

/**
 * Hauling speed bonus from pilot skills.
 */
export function getPilotHaulingBonus(pilot: PilotInstance): number {
  let bonus = 0;
  const haulingSkills = ['industrial', 'spaceship-command'];
  for (const skillId of haulingSkills) {
    const level = pilot.skills.levels[skillId] ?? 0;
    if (level <= 0) continue;
    const def = SKILL_DEFINITIONS[skillId];
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.modifier === 'hauler-cargo-bonus' || effect.modifier === 'haul-speed') {
        bonus += effect.valuePerLevel * level;
      }
    }
  }
  return bonus;
}

/**
 * Morale multiplier. Range 0.5 (demoralised) to 1.2 (enthusiastic).
 */
export function getPilotMoraleMultiplier(pilot: PilotInstance): number {
  return 0.5 + (pilot.morale / 100) * 0.7;
}

/**
 * Checks whether a pilot meets the skill requirement to fly a hull.
 */
export function canPilotFlyShip(pilot: PilotInstance, requiredPilotSkill?: { skillId: string; minLevel: number }): boolean {
  if (!requiredPilotSkill) return true;
  return (pilot.skills.levels[requiredPilotSkill.skillId] ?? 0) >= requiredPilotSkill.minLevel;
}

// ─── Morale tick ──────────────────────────────────────────────────────────

/**
 * Update morale each tick.
 * Active pilots gain morale; idle pilots lose it slowly.
 */
export function tickMorale(pilot: PilotInstance, deltaSeconds: number): number {
  const isActive = pilot.status === 'active';
  const ratePerMinute = isActive ? 0.10 : -0.05;
  const delta = ratePerMinute * (deltaSeconds / 60);
  return Math.max(0, Math.min(100, pilot.morale + delta));
}

// ─── Skill training ────────────────────────────────────────────────────────

/**
 * Auto-select the next skill to train based on the pilot's focus tree.
 * Returns null if nothing is left to train or no focus is set.
 */
export function selectNextIdleSkill(pilot: PilotInstance): string | null {
  const focus = pilot.skills.idleTrainingFocus;
  if (!focus) return null;

  const tree = PILOT_SKILL_FOCUS_TREES[focus];
  for (const skillId of tree) {
    const def = SKILL_DEFINITIONS[skillId];
    if (!def?.pilotTrainable) continue;

    const currentLevel = pilot.skills.levels[skillId] ?? 0;
    if (currentLevel >= 5) continue;

    // Check prerequisites
    if (def.prerequisiteSkills) {
      const prereqsMet = Object.entries(def.prerequisiteSkills).every(
        ([reqId, minLv]) => (pilot.skills.levels[reqId] ?? 0) >= minLv,
      );
      if (!prereqsMet) continue;
    }

    return skillId;
  }
  return null;
}

export interface PilotSkillTickResult {
  newSkillState: PilotSkillState;
  advanced: Array<{ skillId: string; fromLevel: number; toLevel: number }>;
}

/**
 * Advance a pilot's personal skill training by deltaSeconds.
 * Mirrors the corp-level tickSkills logic.
 */
export function tickPilotSkillTraining(pilot: PilotInstance, deltaSeconds: number): PilotSkillTickResult {
  let skills = { ...pilot.skills };
  const advanced: Array<{ skillId: string; fromLevel: number; toLevel: number }> = [];

  // ── If nothing training, pull from queue or auto-select from focus tree ─
  if (!skills.activeSkillId) {
    let nextSkillId: string | null = null;

    if (skills.queue.length > 0) {
      const next = skills.queue[0];
      const currentLevel = skills.levels[next.skillId] ?? 0;
      if (currentLevel < next.targetLevel) {
        nextSkillId = next.skillId;
      } else {
        skills = { ...skills, queue: skills.queue.slice(1) };
      }
    } else {
      // Idle auto-training
      nextSkillId = selectNextIdleSkill({ ...pilot, skills });
    }

    if (nextSkillId) {
      skills = { ...skills, activeSkillId: nextSkillId, activeProgress: 0 };
    }
  }

  if (!skills.activeSkillId) {
    return { newSkillState: skills, advanced };
  }

  const activeId = skills.activeSkillId;
  const def = SKILL_DEFINITIONS[activeId];
  if (!def?.pilotTrainable) {
    return { newSkillState: { ...skills, activeSkillId: null, activeProgress: 0 }, advanced };
  }

  let progress = skills.activeProgress + deltaSeconds;
  let currentLevel = skills.levels[activeId] ?? 0;

  // May complete multiple levels in one large delta (offline progress)
  while (progress > 0 && currentLevel < 5) {
    const required = skillTrainingSeconds(def.rank, currentLevel + 1);
    if (progress >= required) {
      const fromLevel = currentLevel;
      currentLevel += 1;
      progress -= required;
      advanced.push({ skillId: activeId, fromLevel, toLevel: currentLevel });
    } else {
      break;
    }
  }

  const newLevels = { ...skills.levels, [activeId]: currentLevel };

  // Check if the queued target level was reached
  const queueEntry: PilotSkillQueueEntry | undefined = skills.queue[0];
  const targetReached = queueEntry?.skillId === activeId && currentLevel >= queueEntry.targetLevel;
  const maxedOut = currentLevel >= 5;

  if (maxedOut || targetReached) {
    const newQueue = targetReached ? skills.queue.slice(1) : skills.queue;
    return {
      newSkillState: {
        ...skills,
        levels: newLevels,
        activeSkillId: null,
        activeProgress: 0,
        queue: newQueue,
      },
      advanced,
    };
  }

  return {
    newSkillState: {
      ...skills,
      levels: newLevels,
      activeProgress: progress,
    },
    advanced,
  };
}

/** Remaining seconds until the pilot's current active training level completes. */
export function pilotTrainingEta(skills: PilotSkillState): number {
  if (!skills.activeSkillId) return 0;
  const level = (skills.levels[skills.activeSkillId] ?? 0) + 1;
  const def = SKILL_DEFINITIONS[skills.activeSkillId];
  if (!def) return 0;
  const total = skillTrainingSeconds(def.rank, level);
  return Math.max(0, total - skills.activeProgress);
}

/** Enqueue a skill for a pilot, returning the updated skill state (or null if invalid). */
export function enqueuePilotSkill(
  pilot: PilotInstance,
  skillId: string,
  targetLevel: 1 | 2 | 3 | 4 | 5,
): PilotSkillState | null {
  const def = SKILL_DEFINITIONS[skillId];
  if (!def?.pilotTrainable) return null;

  const currentLevel = pilot.skills.levels[skillId] ?? 0;
  if (targetLevel <= currentLevel) return null;
  if (pilot.skills.queue.length >= 50) return null;

  const alreadyQueued = pilot.skills.queue.some(
    e => e.skillId === skillId && e.targetLevel === targetLevel,
  );
  if (alreadyQueued) return null;

  const newEntry: PilotSkillQueueEntry = { skillId, targetLevel };
  const newQueue = [...pilot.skills.queue, newEntry];
  const newState = { ...pilot.skills, queue: newQueue };

  // Auto-activate if nothing is training
  if (!newState.activeSkillId) {
    return { ...newState, activeSkillId: skillId, activeProgress: 0 };
  }
  return newState;
}

/** Remove a skill from a pilot's queue by index. */
export function dequeuePilotSkill(pilot: PilotInstance, index: number): PilotSkillState {
  const queue = pilot.skills.queue.filter((_, i) => i !== index);
  return { ...pilot.skills, queue };
}

/** Get the 'state' of the pilot's current game — used for display and logic branching. */
export function getPilotDisplayState(pilot: PilotInstance, state: GameState): string {
  if (pilot.status === 'incapacitated') return 'Incapacitated';
  if (!pilot.assignedShipId) return 'Unassigned';
  const ship = state.systems.fleet.ships[pilot.assignedShipId];
  if (!ship) return 'Unassigned';
  if (ship.activity === 'idle') return 'Standing By';
  return ship.activity.charAt(0).toUpperCase() + ship.activity.slice(1);
}
