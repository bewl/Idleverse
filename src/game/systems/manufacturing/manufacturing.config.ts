import type { ManufacturingRecipeDefinition } from '@/types/game.types';

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
};

export const RECIPE_ORDER = [
  // Components
  'craft-hull-plate', 'craft-thruster-node', 'craft-condenser-coil',
  'craft-sensor-cluster', 'craft-mining-laser', 'craft-shield-emitter',
  // Ships
  'recipe-ship-shuttle', 'recipe-ship-frigate', 'recipe-ship-mining-frigate',
  'recipe-ship-hauler', 'recipe-ship-destroyer', 'recipe-ship-exhumer',
];


