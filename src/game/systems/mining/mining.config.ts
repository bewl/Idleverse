import type { MiningTargetDefinition, MiningUpgradeDefinition } from '@/types/game.types';

export const MINING_TARGETS: Record<string, MiningTargetDefinition> = {
  'rocky-asteroid-cluster': {
    id: 'rocky-asteroid-cluster',
    name: 'Rocky Asteroid Cluster',
    description: 'Dense cluster of rocky asteroids yielding raw ore and silicon crystals.',
    outputs: [
      { resourceId: 'raw-ore',          baseRate: 1.5 },
      { resourceId: 'silicon-crystals', baseRate: 0.3 },
    ],
    energyCost: 3,
  },
  'metallic-asteroid-field': {
    id: 'metallic-asteroid-field',
    name: 'Metallic Asteroid Field',
    description: 'High-density metal-rich asteroids with excellent ore yields.',
    outputs: [
      { resourceId: 'raw-ore',       baseRate: 3.0 },
      { resourceId: 'metallic-dust', baseRate: 0.8 },
    ],
    energyCost: 6,
    unlockResearch: 'industrial-mining-ii',
  },
  'carbon-asteroid-belt': {
    id: 'carbon-asteroid-belt',
    name: 'Carbon Asteroid Belt',
    description: 'Rich belt of carbonaceous asteroids with trace ice deposits.',
    outputs: [
      { resourceId: 'carbon-materials', baseRate: 1.2 },
      { resourceId: 'ice-deposits',     baseRate: 0.4 },
    ],
    energyCost: 4,
    unlockResearch: 'industrial-mining-ii',
  },
  'ice-asteroid-cluster': {
    id: 'ice-asteroid-cluster',
    name: 'Ice Asteroid Cluster',
    description: 'Frozen bodies rich in water ice and volatile compounds.',
    outputs: [
      { resourceId: 'ice-deposits',     baseRate: 2.5 },
      { resourceId: 'carbon-materials', baseRate: 0.2 },
    ],
    energyCost: 5,
    unlockResearch: 'exploration-remote-sensing',
  },
};

export const MINING_UPGRADES: Record<string, MiningUpgradeDefinition> = {
  'mining-laser-i': {
    id: 'mining-laser-i',
    name: 'Mining Laser I',
    description: 'Basic laser enhancement. +10% mining output per level.',
    category: 'efficiency',
    systemId: 'mining',
    baseCost: { 'raw-ore': 50 },
    maxLevel: 5,
    effects: { 'mining-efficiency': 0.10 },
  },
  'mining-laser-ii': {
    id: 'mining-laser-ii',
    name: 'Mining Laser II',
    description: 'Advanced laser optics. +15% mining output per level.',
    category: 'efficiency',
    systemId: 'mining',
    baseCost: { 'raw-ore': 500, 'refined-metals': 20 },
    maxLevel: 5,
    effects: { 'mining-efficiency': 0.15 },
    prerequisiteUpgrade: 'mining-laser-i',
    prerequisiteResearch: 'industrial-laser-refinement',
  },
  'extractor-array-i': {
    id: 'extractor-array-i',
    name: 'Extractor Array I',
    description: 'Wider extraction net. +8% resource yield per level.',
    category: 'extraction',
    systemId: 'mining',
    baseCost: { 'raw-ore': 150, 'metallic-dust': 30 },
    maxLevel: 5,
    effects: { 'mining-yield': 0.08 },
  },
  'drone-coordinator': {
    id: 'drone-coordinator',
    name: 'Drone Coordinator',
    description: 'Enables autonomous mining drones. Adds +1 drone slot.',
    category: 'drone',
    systemId: 'mining',
    baseCost: { 'refined-metals': 80, 'machine-parts': 10 },
    maxLevel: 1,
    effects: { 'mining-drone-slots': 1 },
    prerequisiteResearch: 'ai-basic-automation',
  },
  'deep-scan-array': {
    id: 'deep-scan-array',
    name: 'Deep Scan Array',
    description: 'Reveals rare mineral deposits in deeper asteroid strata. +5% rare bonus per level.',
    category: 'deepMining',
    systemId: 'mining',
    baseCost: { 'quantum-circuits': 5, 'refined-metals': 200 },
    maxLevel: 3,
    effects: { 'mining-rare-bonus': 0.05 },
    prerequisiteResearch: 'exploration-deep-scan',
  },
};

export const MINING_UPGRADE_ORDER = [
  'mining-laser-i',
  'mining-laser-ii',
  'extractor-array-i',
  'drone-coordinator',
  'deep-scan-array',
];
