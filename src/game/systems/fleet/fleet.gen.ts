import type { PilotInstance, PilotRecruitmentOffer, PilotTrainingFocus } from '@/types/game.types';
import { mulberry32, childSeed, randInt, randPick, randWeighted } from '@/game/utils/prng';
import { PILOT_SKILL_FOCUS_TREES } from './fleet.config';

// ─── Name pools ────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Aeva', 'Kira', 'Taryn', 'Malen', 'Dex', 'Solan', 'Vera', 'Cyrin',
  'Aryn', 'Jorel', 'Nyx', 'Tessa', 'Kael', 'Mira', 'Oryn', 'Zara',
  'Vex', 'Lyra', 'Calen', 'Daria', 'Fenix', 'Sabel', 'Tane', 'Riven',
  'Asha', 'Crest', 'Elara', 'Forn', 'Gael', 'Hela',
] as const;

const LAST_NAMES = [
  'Solace', 'Varn', 'Krix', 'Ashveil', 'Dawnstar', 'Noctus', 'Hale', 'Craven',
  'Voryn', 'Elsin', 'Rathmore', 'Sable', 'Colborn', 'Wren', 'Faust', 'Mirk',
  'Castian', 'Drey', 'Skaal', 'Ironveil', 'Navis', 'Crest', 'Talvorn', 'Ryn',
  'Galvin', 'Shard', 'Voss', 'Ulane', 'Trynn', 'Alek',
] as const;

const BACKSTORY_TEMPLATES = [
  'A former station worker who saw the stars and decided they were better than a cubicle.',
  'Trained as a defense contractor pilot before corporate downsizing ended that career path.',
  'Third-generation capsuleer from a mid-tier industrial family. Wants to prove themselves.',
  'Left a comfortable planetary life chasing rumors of untouched ore fields in deep space.',
  'Ex-military scout with a knack for finding trouble and mining profitable.',
  'Self-taught capsuleer who bootstrapped certification through salvage and hustle.',
  'Once flew for a rival corporation — asks few questions, follows orders precisely.',
  'A scholar-turned-pilot who treats every system entry as a data-gathering opportunity.',
  'Grew up aboard a freighter. Space is the only home they have ever known.',
  'Reputation for ice-cool decision-making under pressure. Nobody knows their real name.',
];

const FOCUS_WEIGHTS: Array<{ value: PilotTrainingFocus; weight: number }> = [
  { value: 'mining',      weight: 35 },
  { value: 'hauling',     weight: 20 },
  { value: 'combat',      weight: 20 },
  { value: 'exploration', weight: 15 },
  { value: 'balanced',    weight: 10 },
];

// ─── Generator helpers ─────────────────────────────────────────────────────

function generatePilotName(rng: () => number): string {
  return `${randPick(rng, FIRST_NAMES)} ${randPick(rng, LAST_NAMES)}`;
}

function generatePreviewSkills(focus: PilotTrainingFocus, rng: () => number): Record<string, number> {
  const tree = PILOT_SKILL_FOCUS_TREES[focus];
  const levels: Record<string, number> = {};
  // Give 2-4 skills at varying levels (1-3) to hint at the pilot's background
  const count = randInt(rng, 2, 4);
  for (let i = 0; i < count && i < tree.length; i++) {
    levels[tree[i]] = randInt(rng, 1, 3);
  }
  return levels;
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Generate the founding pilot-0 (the player character). */
export function generateFoundingPilot(galaxySeed: number): PilotInstance {
  const portraitSeed = childSeed(galaxySeed, 0);
  return {
    id: 'pilot-0',
    name: 'New Capsuleer',
    isPlayerPilot: true,
    portraitSeed,
    backstory: 'A lone capsuleer with nothing but a dream and a loaded skill queue.',
    hiredAt: Date.now(),
    status: 'idle',
    currentSystemId: 'home',
    assignedShipId: null,
    skills: {
      levels: {},
      queue: [],
      activeSkillId: null,
      activeProgress: 0,
      idleTrainingFocus: null,
    },
    morale: 100,
    experience: 0,
    stats: { oreMinedTotal: 0, iskEarnedTotal: 0, systemsVisited: 1, combatKills: 0 },
    payrollPerDay: 0,
    commandSkills: { levels: {}, queue: [], activeSkillId: null, activeProgress: 0 },
  };
}

/**
 * Generate a full PilotInstance from a seed (for hired pilots).
 * @param globalSeed  Galaxy seed.
 * @param pilotSeed   Unique integer for this pilot.
 */
export function generatePilot(globalSeed: number, pilotSeed: number): PilotInstance {
  const seed = childSeed(globalSeed, pilotSeed);
  const rng = mulberry32(seed);

  const focus = randWeighted(rng, FOCUS_WEIGHTS);
  const name = generatePilotName(rng);
  const backstory = randPick(rng, BACKSTORY_TEMPLATES);
  const portraitSeed = childSeed(seed, 99);

  return {
    id: `pilot-${pilotSeed}`,
    name,
    isPlayerPilot: false,
    portraitSeed,
    backstory,
    hiredAt: Date.now(),
    status: 'idle',
    currentSystemId: 'home',
    assignedShipId: null,
    skills: {
      levels: {},
      queue: [],
      activeSkillId: null,
      activeProgress: 0,
      idleTrainingFocus: focus,
    },
    morale: randInt(rng, 60, 90),
    experience: 0,
    stats: { oreMinedTotal: 0, iskEarnedTotal: 0, systemsVisited: 1, combatKills: 0 },
    payrollPerDay: randInt(rng, 1000, 5000),
    commandSkills: { levels: {}, queue: [], activeSkillId: null, activeProgress: 0 },
  };
}

/**
 * Generate 3 recruitment offers seeded to the current galaxy state.
 * @param globalSeed   Galaxy seed (changes as game progresses to rotate offers).
 * @param offersEpoch  Increment this to force-refresh available recruits.
 */
export function generateRecruitmentOffers(globalSeed: number, offersEpoch: number = 0): PilotRecruitmentOffer[] {
  const offers: PilotRecruitmentOffer[] = [];
  for (let i = 0; i < 3; i++) {
    const offerSeed = childSeed(childSeed(globalSeed, offersEpoch + 1), i + 1000);
    const rng = mulberry32(offerSeed);

    const focus = randWeighted(rng, FOCUS_WEIGHTS);
    const name = generatePilotName(rng);
    const backstory = randPick(rng, BACKSTORY_TEMPLATES);
    const previewSkills = generatePreviewSkills(focus, rng);
    const hiringCost = randInt(rng, 50_000, 300_000);
    const payrollPerDay = randInt(rng, 1_000, 5_000);
    const pilotSeed = childSeed(offerSeed, 77);

    offers.push({
      id: `offer-${offersEpoch}-${i}`,
      pilotSeed,
      name,
      trainingFocus: focus,
      hiringCost,
      payrollPerDay,
      backstory,
      previewSkills,
    });
  }
  return offers;
}
