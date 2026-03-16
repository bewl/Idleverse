import type { PilotInstance, PlayerFleet, FleetWing, GameState, CommanderSkillState } from '@/types/game.types';
import { COMMANDER_SKILL_DEFINITIONS, COMMANDER_SKILL_LEVEL_SECONDS } from './commander.config';

// ─── Bonus getters ─────────────────────────────────────────────────────────

/** Get the total additive bonus for a given modifier key from all trained command skills. */
export function getCommanderStat(pilot: PilotInstance, key: string): number {
  let total = 0;
  const levels = pilot.commandSkills?.levels ?? {};
  for (const [skillId, level] of Object.entries(levels)) {
    if (level <= 0) continue;
    const def = COMMANDER_SKILL_DEFINITIONS[skillId];
    if (!def) continue;
    for (const effect of def.effectPerLevel) {
      if (effect.key === key) total += effect.value * level;
    }
  }
  return total;
}

function getFleetStoredCargoLocal(fleet: PlayerFleet): number {
  const fleetCargo = Object.values(fleet.cargoHold ?? {}).reduce((sum, qty) => sum + qty, 0);
  const wingCargo = (fleet.wings ?? []).reduce(
    (sum, wing) => sum + Object.values(wing.cargoHold ?? {}).reduce((wingSum, qty) => wingSum + qty, 0),
    0,
  );
  return fleetCargo + wingCargo;
}

function getCommanderIds(fleet: PlayerFleet, wing: FleetWing | null): string[] {
  const ids = [fleet.commanderId, wing?.commanderId ?? null].filter(Boolean) as string[];
  return [...new Set(ids)];
}

export function getCombinedCommanderBonus(
  pilots: Record<string, PilotInstance>,
  fleet: PlayerFleet,
  wing: FleetWing | null,
  key: string,
): number {
  return getCommanderIds(fleet, wing).reduce((sum, pilotId) => {
    const pilot = pilots[pilotId];
    return sum + (pilot ? getCommanderStat(pilot, key) : 0);
  }, 0);
}

/** Fleet-wide mining yield bonus from Mining Command. Returns additive fraction, e.g. 0.08 = +8%. */
export function getCommanderMiningBonus(pilot: PilotInstance): number {
  return getCommanderStat(pilot, 'mining-yield');
}

/** Fleet cargo capacity bonus from Logistics Command. Returns additive fraction. */
export function getCommanderCargoBonus(pilot: PilotInstance): number {
  return getCommanderStat(pilot, 'commander-cargo-capacity');
}

/** Fleet DPS bonus from Combat Command. Returns additive fraction. */
export function getCommanderCombatBonus(pilot: PilotInstance): number {
  return getCommanderStat(pilot, 'fleet-dps');
}

/** Fleet tank bonus from Combat Command. Returns additive fraction. */
export function getCommanderTankBonus(pilot: PilotInstance): number {
  return getCommanderStat(pilot, 'fleet-tank');
}

/** Fleet scan strength bonus from Recon Command. Returns additive fraction. */
export function getCommanderScanBonus(pilot: PilotInstance): number {
  return getCommanderStat(pilot, 'scan-speed');
}

/** On-site refining yield bonus from Industrial Command. Returns additive fraction. */
export function getCommanderIndustrialBonus(pilot: PilotInstance): number {
  return getCommanderStat(pilot, 'on-site-refining-yield');
}

/** Returns the commander for a fleet, or null if none is designated / pilot not found. */
export function getFleetCommander(state: GameState, fleetId: string): PilotInstance | null {
  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet?.commanderId) return null;
  return state.systems.fleet.pilots[fleet.commanderId] ?? null;
}

// ─── Training seconds helper ───────────────────────────────────────────────

/** Training time in seconds for a given command skill level (1–5). */
export function commanderSkillTrainingSeconds(level: 1 | 2 | 3 | 4 | 5): number {
  return COMMANDER_SKILL_LEVEL_SECONDS[level - 1];
}

// ─── ETA helper ───────────────────────────────────────────────────────────

/**
 * Estimated seconds until a command skill reaches its target level.
 * Returns 0 if already at or above target.
 */
export function commanderSkillEtaSeconds(
  pilot: PilotInstance,
  skillId: string,
  targetLevel: 1 | 2 | 3 | 4 | 5,
): number {
  let current = pilot.commandSkills?.levels[skillId] ?? 0;
  if (current >= targetLevel) return 0;

  let eta = 0;

  // Remaining time on the currently active level (if this skill is being trained)
  const cs = pilot.commandSkills;
  if (cs?.activeSkillId === skillId) {
    const levelTime = commanderSkillTrainingSeconds((current + 1) as 1 | 2 | 3 | 4 | 5);
    eta += Math.max(0, levelTime - (cs.activeProgress ?? 0));
    current++;
  }

  // Full levels still needed
  while (current < targetLevel) {
    eta += commanderSkillTrainingSeconds((current + 1) as 1 | 2 | 3 | 4 | 5);
    current++;
  }

  return eta;
}

// ─── Commander skill tick ──────────────────────────────────────────────────

export interface CommanderSkillTickResult {
  newCommandSkills: CommanderSkillState;
  advanced: Array<{ skillId: string; fromLevel: number; toLevel: number }>;
}

const EMPTY_COMMAND_SKILLS: CommanderSkillState = {
  levels: {},
  queue: [],
  activeSkillId: null,
  activeProgress: 0,
};

/**
 * Advance a pilot's command skill training by deltaSeconds.
 * Should only be called when this pilot is the designated fleet commander.
 *
 * Active fleets (moving, in combat, or holding cargo) train at 1.5× speed.
 */
export function tickCommanderSkillTraining(
  pilot: PilotInstance,
  fleet: PlayerFleet,
  deltaSeconds: number,
): CommanderSkillTickResult {
  // Active fleet = has an order OR is in combat OR carrying ore
  const cargoTotal = getFleetStoredCargoLocal(fleet);
  const isActive = fleet.fleetOrder !== null || fleet.combatOrder !== null || cargoTotal > 0;
  const effectiveDelta = deltaSeconds * (isActive ? 1.5 : 1.0);

  let skills: CommanderSkillState = pilot.commandSkills
    ? { ...pilot.commandSkills }
    : { ...EMPTY_COMMAND_SKILLS };

  const advanced: CommanderSkillTickResult['advanced'] = [];

  // Pull next skill from queue if nothing is training
  if (!skills.activeSkillId) {
    if (skills.queue.length > 0) {
      const next = skills.queue[0];
      const current = skills.levels[next.skillId] ?? 0;
      if (current < next.targetLevel) {
        skills = { ...skills, activeSkillId: next.skillId, activeProgress: 0 };
      } else {
        // Already at or above target — drop the entry and try again next tick
        skills = { ...skills, queue: skills.queue.slice(1) };
      }
    }
  }

  if (!skills.activeSkillId) {
    return { newCommandSkills: skills, advanced };
  }

  const activeId = skills.activeSkillId;
  if (!COMMANDER_SKILL_DEFINITIONS[activeId]) {
    return { newCommandSkills: { ...skills, activeSkillId: null, activeProgress: 0 }, advanced };
  }

  let progress = (skills.activeProgress ?? 0) + effectiveDelta;
  let currentLevel = skills.levels[activeId] ?? 0;

  // Handle offline progress: may complete multiple levels in one tick
  while (progress > 0 && currentLevel < 5) {
    const required = COMMANDER_SKILL_LEVEL_SECONDS[currentLevel]; // index = level about to be trained
    if (progress >= required) {
      const fromLevel = currentLevel;
      currentLevel++;
      progress -= required;
      advanced.push({ skillId: activeId, fromLevel, toLevel: currentLevel });
    } else {
      break;
    }
  }

  const newLevels = { ...skills.levels, [activeId]: currentLevel };
  const queueEntry = skills.queue[0];
  const targetReached = queueEntry?.skillId === activeId && currentLevel >= queueEntry.targetLevel;
  const maxedOut = currentLevel >= 5;

  if (maxedOut || targetReached) {
    const newQueue = targetReached ? skills.queue.slice(1) : skills.queue;
    return {
      newCommandSkills: {
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
    newCommandSkills: {
      ...skills,
      levels: newLevels,
      activeProgress: progress,
    },
    advanced,
  };
}
