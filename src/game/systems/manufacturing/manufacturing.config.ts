import type { ManufacturingRecipeDefinition } from '@/types/game.types';

// ─── Research constants ────────────────────────────────────────────────────

/** Base time in seconds for researching from level 0 → 1. Each subsequent level
 *  takes 50% longer: totalTime = BASE_RESEARCH_TIME × 1.5^currentLevel */
export const BASE_RESEARCH_TIME = 300; // 5 minutes

/** Base time in seconds for copying (same formula, 0.5× rate). */
export const BASE_COPY_TIME_MULTIPLIER = 0.5;

/** Default number of concurrent research/copy slots (without Science bonuses). */
export const DEFAULT_RESEARCH_SLOTS = 3;

// ─── Blueprint definitions ─────────────────────────────────────────────────
// One entry per T1 recipe: itemId → { researchDatacore, t2RecipeId }

export interface BlueprintDefinition {
  /** Which datacore is consumed per research level-up (1 per level). */
  datacoreId: string;
  /** T2 recipe ID unlocked when this BPO reaches researchLevel 5. null = no T2 upgrade. */
  t2RecipeId: string | null;
}

export const BLUEPRINT_DEFINITIONS: Record<string, BlueprintDefinition> = {
  'craft-hull-plate':       { datacoreId: 'datacore-mechanical', t2RecipeId: 'craft-advanced-hull-plate' },
  'craft-thruster-node':    { datacoreId: 'datacore-mechanical', t2RecipeId: 'craft-advanced-thruster-node' },
  'craft-condenser-coil':   { datacoreId: 'datacore-electronic', t2RecipeId: 'craft-advanced-condenser-coil' },
  'craft-sensor-cluster':   { datacoreId: 'datacore-electronic', t2RecipeId: null },
  'craft-mining-laser':     { datacoreId: 'datacore-mechanical', t2RecipeId: null },
  'craft-shield-emitter':   { datacoreId: 'datacore-electronic', t2RecipeId: null },
  'recipe-ship-shuttle':    { datacoreId: 'datacore-mechanical', t2RecipeId: null },
  'recipe-ship-frigate':    { datacoreId: 'datacore-starship',   t2RecipeId: 'recipe-ship-assault-frigate' },
  'recipe-ship-mining-frigate': { datacoreId: 'datacore-mechanical', t2RecipeId: 'recipe-ship-covert-ops' },
  'recipe-ship-hauler':     { datacoreId: 'datacore-mechanical', t2RecipeId: null },
  'recipe-ship-destroyer':  { datacoreId: 'datacore-starship',   t2RecipeId: 'recipe-ship-command-destroyer' },
  'recipe-ship-exhumer':    { datacoreId: 'datacore-mechanical', t2RecipeId: null },
};

// ─── Component recipes ─────────────────────────────────────────────────────

export const MANUFACTURING_RECIPES: Record<string, ManufacturingRecipeDefinition> = {

  'craft-hull-plate': {
    id: 'craft-hull-plate', name: 'Hull Plate',
    description: 'Structural plating rolled from Ferrite and Silite minerals.',
    inputs: { 'ferrite': 40, 'silite': 20 },
    outputs: { 'hull-plate': 1 },
    timeCost: 30,
    category: 'component',
  },

  'craft-thruster-node': {
    id: 'craft-thruster-node', name: 'Thruster Node',
    description: 'Propulsion subassembly manufactured from Vexirite and Noxium.',
    inputs: { 'vexirite': 30, 'noxium': 10 },
    outputs: { 'thruster-node': 1 },
    timeCost: 45,
    category: 'component',
  },

  'craft-condenser-coil': {
    id: 'craft-condenser-coil', name: 'Condenser Coil',
    description: 'Power-storage coil for capacitors and shield systems.',
    inputs: { 'isorium': 25, 'silite': 15 },
    outputs: { 'condenser-coil': 1 },
    timeCost: 40,
    category: 'component',
  },

  'craft-sensor-cluster': {
    id: 'craft-sensor-cluster', name: 'Sensor Cluster',
    description: 'Navigation and deep-space scanning module.',
    inputs: { 'isorium': 40, 'vexirite': 20 },
    outputs: { 'sensor-cluster': 1 },
    timeCost: 60,
    category: 'component',
    requiredSkill: { skillId: 'electronics', minLevel: 2 },
  },

  'craft-mining-laser': {
    id: 'craft-mining-laser', name: 'Mining Laser',
    description: 'Core ore-extraction module for mining vessels.',
    inputs: { 'ferrite': 30, 'vexirite': 20, 'isorium': 10 },
    outputs: { 'mining-laser': 1 },
    timeCost: 50,
    category: 'component',
  },

  'craft-shield-emitter': {
    id: 'craft-shield-emitter', name: 'Shield Emitter',
    description: 'Defensive shield projector for combat-capable vessels.',
    inputs: { 'isorium': 30, 'noxium': 15, 'silite': 20 },
    outputs: { 'shield-emitter': 1 },
    timeCost: 70,
    category: 'component',
    requiredSkill: { skillId: 'electronics', minLevel: 1 },
  },

  // ─── Ship recipes ──────────────────────────────────────────────────────────

  'recipe-ship-shuttle': {
    id: 'recipe-ship-shuttle', name: 'Shuttle',
    description: 'Entry-level hull. Fast to produce, ideal as first ship.',
    inputs: { 'hull-plate': 4, 'thruster-node': 2 },
    outputs: { 'ship-shuttle': 1 },
    timeCost: 120,
    category: 'ship',
  },

  'recipe-ship-frigate': {
    id: 'recipe-ship-frigate', name: 'Frigate',
    description: 'Standard all-purpose frigate hull.',
    inputs: { 'hull-plate': 8, 'thruster-node': 4, 'condenser-coil': 3 },
    outputs: { 'ship-frigate': 1 },
    timeCost: 300,
    category: 'ship',
    requiredSkill: { skillId: 'frigate', minLevel: 1 },
  },

  'recipe-ship-mining-frigate': {
    id: 'recipe-ship-mining-frigate', name: 'Mining Frigate',
    description: 'Venture-class dedicated mining vessel with enhanced ore bays.',
    inputs: { 'hull-plate': 6, 'mining-laser': 4, 'thruster-node': 3, 'condenser-coil': 2 },
    outputs: { 'ship-mining-frigate': 1 },
    timeCost: 360,
    category: 'ship',
    requiredSkill: { skillId: 'mining-frigate', minLevel: 1 },
  },

  'recipe-ship-hauler': {
    id: 'recipe-ship-hauler', name: 'Hauler',
    description: 'Industrial transport hull for bulk logistics runs.',
    inputs: { 'hull-plate': 12, 'thruster-node': 4, 'condenser-coil': 4 },
    outputs: { 'ship-hauler': 1 },
    timeCost: 480,
    category: 'ship',
    requiredSkill: { skillId: 'industrial', minLevel: 1 },
  },

  'recipe-ship-destroyer': {
    id: 'recipe-ship-destroyer', name: 'Destroyer',
    description: 'Multi-launcher combat hull optimised for engagement at close range.',
    inputs: { 'hull-plate': 16, 'thruster-node': 6, 'condenser-coil': 5, 'shield-emitter': 4 },
    outputs: { 'ship-destroyer': 1 },
    timeCost: 600,
    category: 'ship',
    requiredSkill: { skillId: 'destroyer', minLevel: 1 },
  },

  'recipe-ship-exhumer': {
    id: 'recipe-ship-exhumer', name: 'Exhumer',
    description: 'Advanced mining barge for high-volume null-sec extraction.',
    inputs: { 'hull-plate': 20, 'mining-laser': 10, 'thruster-node': 6, 'condenser-coil': 8, 'zyridium': 50 },
    outputs: { 'ship-exhumer': 1 },
    timeCost: 1800,
    category: 'ship',
    requiredSkill: { skillId: 'mining-barge', minLevel: 4 },
  },

  // ─── T2 Component recipes ──────────────────────────────────────────────────

  'craft-advanced-hull-plate': {
    id: 'craft-advanced-hull-plate', name: 'Advanced Hull Plate',
    description: 'High-grade structural plating reinforced with Morphite lattices. Requires a T2 BPC.',
    inputs: { 'hull-plate': 4, 'morphite': 10, 'zydrine': 5 },
    outputs: { 'advanced-hull-plate': 1 },
    timeCost: 120,
    category: 'component',
    requiredSkill: { skillId: 'advanced-industry', minLevel: 1 },
    isTech2: true,
  },

  'craft-advanced-thruster-node': {
    id: 'craft-advanced-thruster-node', name: 'Advanced Thruster Node',
    description: 'Overclocked propulsion assembly with Zydrine-cooled plasma chambers. Requires a T2 BPC.',
    inputs: { 'thruster-node': 4, 'morphite': 8, 'zydrine': 8 },
    outputs: { 'advanced-thruster-node': 1 },
    timeCost: 150,
    category: 'component',
    requiredSkill: { skillId: 'advanced-industry', minLevel: 1 },
    isTech2: true,
  },

  'craft-advanced-condenser-coil': {
    id: 'craft-advanced-condenser-coil', name: 'Advanced Condenser Coil',
    description: 'High-capacity power storage coil using Morphite superconductors. Requires a T2 BPC.',
    inputs: { 'condenser-coil': 4, 'morphite': 12, 'zydrine': 6 },
    outputs: { 'advanced-condenser-coil': 1 },
    timeCost: 130,
    category: 'component',
    requiredSkill: { skillId: 'advanced-industry', minLevel: 1 },
    isTech2: true,
  },

  // ─── T2 Ship recipes ───────────────────────────────────────────────────────

  'recipe-ship-assault-frigate': {
    id: 'recipe-ship-assault-frigate', name: 'Assault Frigate',
    description: 'Tech 2 combat frigate with hardened systems and boosted weapons output. Requires a T2 BPC.',
    inputs: {
      'advanced-hull-plate': 8, 'advanced-thruster-node': 4, 'advanced-condenser-coil': 3,
      'shield-emitter': 4, 'morphite': 20, 'zydrine': 15,
    },
    outputs: { 'ship-assault-frigate': 1 },
    timeCost: 900,
    category: 'ship',
    requiredSkill: { skillId: 'frigate', minLevel: 3 },
    isTech2: true,
  },

  'recipe-ship-covert-ops': {
    id: 'recipe-ship-covert-ops', name: 'Covert Ops',
    description: 'Tech 2 stealth frigate specialised for deep-space scanning and infiltration. Requires a T2 BPC.',
    inputs: {
      'advanced-hull-plate': 6, 'sensor-cluster': 6, 'advanced-condenser-coil': 3,
      'morphite': 15, 'zydrine': 10,
    },
    outputs: { 'ship-covert-ops': 1 },
    timeCost: 900,
    category: 'ship',
    requiredSkill: { skillId: 'frigate', minLevel: 3 },
    isTech2: true,
  },

  'recipe-ship-command-destroyer': {
    id: 'recipe-ship-command-destroyer', name: 'Command Destroyer',
    description: 'Tech 2 destroyer with fleet coordination systems and enhanced combat modules. Requires a T2 BPC.',
    inputs: {
      'advanced-hull-plate': 16, 'advanced-thruster-node': 6, 'advanced-condenser-coil': 5,
      'shield-emitter': 8, 'morphite': 35, 'zydrine': 25,
    },
    outputs: { 'ship-command-destroyer': 1 },
    timeCost: 1800,
    category: 'ship',
    requiredSkill: { skillId: 'destroyer', minLevel: 3 },
    isTech2: true,
  },
};

export const RECIPE_ORDER = [
  // T1 Components
  'craft-hull-plate', 'craft-thruster-node', 'craft-condenser-coil',
  'craft-sensor-cluster', 'craft-mining-laser', 'craft-shield-emitter',
  // T1 Ships
  'recipe-ship-shuttle', 'recipe-ship-frigate', 'recipe-ship-mining-frigate',
  'recipe-ship-hauler', 'recipe-ship-destroyer', 'recipe-ship-exhumer',
  // T2 Components
  'craft-advanced-hull-plate', 'craft-advanced-thruster-node', 'craft-advanced-condenser-coil',
  // T2 Ships
  'recipe-ship-assault-frigate', 'recipe-ship-covert-ops', 'recipe-ship-command-destroyer',
];


