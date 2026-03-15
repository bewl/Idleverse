import type { GameState, SkillsState, SkillQueueEntry } from '@/types/game.types';
import { SKILL_DEFINITIONS } from './skills.config';
import { skillTrainingSeconds } from '@/game/balance/constants';

// ─── Derived helpers ───────────────────────────────────────────────────────

export function getSkillLevel(state: GameState, skillId: string): number {
  return state.systems.skills.levels[skillId] ?? 0;
}

/** Seconds required to train a skill from its current level to the next level. */
export function trainingSecondsForNextLevel(skillId: string, currentLevel: number): number {
  const def = SKILL_DEFINITIONS[skillId];
  if (!def) return Infinity;
  if (currentLevel >= 5) return Infinity;
  return skillTrainingSeconds(def.rank, currentLevel + 1);
}

/** True if all prerequisite skills are met. */
export function canTrainSkill(state: GameState, skillId: string): boolean {
  const def = SKILL_DEFINITIONS[skillId];
  if (!def) return false;
  if (!def.prerequisiteSkills) return true;
  return Object.entries(def.prerequisiteSkills).every(
    ([reqId, minLv]) => (state.systems.skills.levels[reqId] ?? 0) >= minLv,
  );
}

/** Seconds remaining until the active training level completes. */
export function activeTrainingEta(skillsState: SkillsState): number {
  if (!skillsState.activeSkillId) return 0;
  const level = (skillsState.levels[skillsState.activeSkillId] ?? 0) + 1;
  const def = SKILL_DEFINITIONS[skillsState.activeSkillId];
  if (!def) return 0;
  const total = skillTrainingSeconds(def.rank, level);
  return Math.max(0, total - skillsState.activeProgress);
}

/** Human-readable ETA string. */
export function formatTrainingEta(seconds: number): string {
  if (seconds <= 0) return 'Done';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d}d ${h}h`;
}

/** Build full modifiers map from all currently trained skill levels. */
export function buildModifiersFromSkills(skillsState: SkillsState): Record<string, number> {
  const mods: Record<string, number> = {};
  for (const [skillId, level] of Object.entries(skillsState.levels)) {
    if (level <= 0) continue;
    const def = SKILL_DEFINITIONS[skillId];
    if (!def) continue;
    for (const effect of def.effects) {
      mods[effect.modifier] = (mods[effect.modifier] ?? 0) + effect.valuePerLevel * level;
    }
  }
  return mods;
}

/** Collect all unlock keys earned across current skill levels. */
export function buildUnlocksFromSkills(skillsState: SkillsState): Record<string, boolean> {
  const unlocks: Record<string, boolean> = {};
  for (const [skillId, level] of Object.entries(skillsState.levels)) {
    if (level <= 0) continue;
    const def = SKILL_DEFINITIONS[skillId];
    if (!def?.unlocks) continue;
    for (const key of def.unlocks) {
      unlocks[key] = true;
    }
  }
  return unlocks;
}

// ─── Queue helpers ─────────────────────────────────────────────────────────

/** Append a skill+targetLevel entry to the queue if valid. */
export function enqueueSkill(
  state: GameState,
  skillId: string,
  targetLevel: 1 | 2 | 3 | 4 | 5,
): SkillsState | null {
  const def = SKILL_DEFINITIONS[skillId];
  if (!def) return null;
  const currentLevel = state.systems.skills.levels[skillId] ?? 0;
  if (targetLevel <= currentLevel) return null;
  if (state.systems.skills.queue.length >= 50) return null;

  // Prevent duplicate final target level in queue
  const alreadyQueued = state.systems.skills.queue.some(
    e => e.skillId === skillId && e.targetLevel === targetLevel,
  );
  if (alreadyQueued) return null;

  const newEntry: SkillQueueEntry = { skillId, targetLevel };
  return { ...state.systems.skills, queue: [...state.systems.skills.queue, newEntry] };
}

/** Remove an entry from the skill queue by index. */
export function dequeueSkill(state: GameState, index: number): SkillsState {
  const queue = state.systems.skills.queue.filter((_, i) => i !== index);
  return { ...state.systems.skills, queue };
}

// ─── Tick ──────────────────────────────────────────────────────────────────

export interface SkillsTickResult {
  newSkillsState: SkillsState;
  modifierDeltas: Record<string, number>;
  unlockDeltas: Record<string, boolean>;
  advanced: Array<{ skillId: string; fromLevel: number; toLevel: number }>;
}

export function tickSkills(state: GameState, deltaSeconds: number): SkillsTickResult {
  let skills = { ...state.systems.skills };
  const advanced: Array<{ skillId: string; fromLevel: number; toLevel: number }> = [];
  const modifierDeltas: Record<string, number> = {};
  const unlockDeltas: Record<string, boolean> = {};

  // ── Activate the next queue item if nothing is training ─────────────────
  if (!skills.activeSkillId && skills.queue.length > 0) {
    const next = skills.queue[0];
    const currentLevel = skills.levels[next.skillId] ?? 0;
    if (currentLevel < next.targetLevel) {
      skills = { ...skills, activeSkillId: next.skillId, activeProgress: 0 };
    } else {
      // Already at or past target — pop this entry and try the next tick
      skills = { ...skills, queue: skills.queue.slice(1) };
    }
  }

  if (!skills.activeSkillId) {
    return { newSkillsState: skills, modifierDeltas, unlockDeltas, advanced };
  }

  const activeId = skills.activeSkillId;
  const def = SKILL_DEFINITIONS[activeId];
  if (!def) {
    // Unknown skill — clear it
    return {
      newSkillsState: { ...skills, activeSkillId: null, activeProgress: 0 },
      modifierDeltas, unlockDeltas, advanced,
    };
  }

  const currentLevel = skills.levels[activeId] ?? 0;
  if (currentLevel >= 5) {
    // Already maxed — clear and dequeue
    return {
      newSkillsState: { ...skills, activeSkillId: null, activeProgress: 0, queue: skills.queue.slice(1) },
      modifierDeltas, unlockDeltas, advanced,
    };
  }

  const totalRequired = skillTrainingSeconds(def.rank, currentLevel + 1);
  let remaining = deltaSeconds;
  let progress = skills.activeProgress;
  let level = currentLevel;
  const newLevels = { ...skills.levels };
  let queue = [...skills.queue];

  // Advance through potentially multiple levels in a single tick (offline progress)
  while (remaining > 0 && activeId === skills.activeSkillId) {
    const needed = totalRequired - progress;
    if (remaining >= needed) {
      // Level completes during this tick
      remaining -= needed;
      const fromLevel = level;
      level++;
      newLevels[activeId] = level;
      advanced.push({ skillId: activeId, fromLevel, toLevel: level });

      // Apply effects for this new level
      for (const effect of def.effects) {
        modifierDeltas[effect.modifier] = (modifierDeltas[effect.modifier] ?? 0) + effect.valuePerLevel;
      }

      // Apply unlocks if first level gained
      if (fromLevel === 0 && def.unlocks) {
        for (const key of def.unlocks) unlockDeltas[key] = true;
      }

      // Check if the queue entry's target level was reached
      const headEntry = queue[0];
      if (headEntry?.skillId === activeId && level >= headEntry.targetLevel) {
        queue = queue.slice(1);
        // Move to the next entry if remaining time allows
        if (queue.length > 0) {
          const next = queue[0];
          const nextLevel = newLevels[next.skillId] ?? 0;
          if (nextLevel < next.targetLevel && remaining > 0) {
            const nextDef = SKILL_DEFINITIONS[next.skillId];
            if (nextDef) {
              skills = { ...skills, activeSkillId: next.skillId };
              // continue loop with new skill context
              progress = 0;
              level = nextLevel;
              continue;
            }
          }
        }
        // Nothing more to train
        skills = { ...skills, activeSkillId: null };
        break;
      }

      // Same skill, next level
      progress = 0;
      if (level >= 5) {
        queue = queue.filter(e => e.skillId !== activeId || e.targetLevel <= level);
        skills = { ...skills, activeSkillId: null };
        break;
      }
    } else {
      progress += remaining;
      remaining = 0;
    }
  }

  const finalSkills: SkillsState = {
    ...skills,
    levels: newLevels,
    queue,
    activeProgress: progress,
  };

  return { newSkillsState: finalSkills, modifierDeltas, unlockDeltas, advanced };
}
