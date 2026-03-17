import type { OreBeltDefinition, MiningUpgradeDefinition } from '@/types/game.types';

// ─── Ore Belts ─────────────────────────────────────────────────────────────
// Rates are base units/sec before skill and upgrade multipliers.

export const ORE_BELTS: Record<string, OreBeltDefinition> = {

  // ── HighSec Belts (always accessible, no skill required) ─────────────────

  'belt-ferrock': {
    id: 'belt-ferrock',
    name: 'Ferrock Belt',
    description: 'Dense cluster of Ferrock asteroids. Bread-and-butter ore for new capsuleers.',
    securityTier: 'highsec',
    outputs: [{ resourceId: 'ferrock', baseRate: 2.0 }],
    poolSize: 10_000,
    respawnSeconds: 14_400, // 4 hours
  },

  'belt-corite': {
    id: 'belt-corite',
    name: 'Corite Vein',
    description: 'Dark compressed Corite formations rich in Ferrite and Vexirite content.',
    securityTier: 'highsec',
    outputs: [{ resourceId: 'corite', baseRate: 1.6 }],
    poolSize: 9_000,
    respawnSeconds: 14_400,
  },

  'belt-silisite': {
    id: 'belt-silisite',
    name: 'Silisite Cluster',
    description: 'A crystalline Silisite formation yielding Silite and Isorium.',
    securityTier: 'highsec',
    outputs: [{ resourceId: 'silisite', baseRate: 1.3 }],
    requiredSkill: { skillId: 'astrogeology', minLevel: 1 },
    poolSize: 8_500,
    respawnSeconds: 14_400,
  },

  'belt-platonite': {
    id: 'belt-platonite',
    name: 'Platonite Field',
    description: 'Mixed-composition Platonite asteroids with above-average multi-mineral yields.',
    securityTier: 'highsec',
    outputs: [{ resourceId: 'platonite', baseRate: 1.8 }],
    requiredSkill: { skillId: 'astrogeology', minLevel: 1 },
    poolSize: 9_500,
    respawnSeconds: 14_400,
  },

  // ── LowSec Belts (require Mining 3+ via advanced-mining unlock) ───────────

  'belt-darkstone': {
    id: 'belt-darkstone',
    name: 'Darkstone Seam',
    description: 'A reactive Darkstone deposit in a contested lowsec system. High Isorium and trace Noxium.',
    securityTier: 'lowsec',
    outputs: [{ resourceId: 'darkstone', baseRate: 1.1 }],
    requiredSkill: { skillId: 'advanced-mining', minLevel: 1 },
    poolSize: 40_000,
    respawnSeconds: 28_800, // 8 hours
  },

  'belt-hematite': {
    id: 'belt-hematite',
    name: 'Hematite Field',
    description: 'Blood-red Hematite asteroids in a disputed belt. Notable Vexirite and Noxium source.',
    securityTier: 'lowsec',
    outputs: [{ resourceId: 'hematite', baseRate: 0.9 }],
    requiredSkill: { skillId: 'advanced-mining', minLevel: 1 },
    poolSize: 38_000,
    respawnSeconds: 28_800,
  },

  'belt-voidite': {
    id: 'belt-voidite',
    name: 'Voidite Anomaly',
    description: 'Semi-translucent Voidite formations deep in lowsec. Rare Zyridium crystal source.',
    securityTier: 'lowsec',
    outputs: [{ resourceId: 'voidite', baseRate: 0.55 }],
    requiredSkill: { skillId: 'mining-barge', minLevel: 1 },
    poolSize: 50_000,
    respawnSeconds: 28_800,
  },

  'belt-ionite': {
    id: 'belt-ionite',
    name: 'Ionite Storm Belt',
    description: 'Electrostatic Ionite veins found in storm-torn lowsec systems. Primary Fluxite source.',
    securityTier: 'lowsec',
    outputs: [{ resourceId: 'ionite', baseRate: 0.75 }],
    requiredSkill: { skillId: 'advanced-mining', minLevel: 2 },
    poolSize: 42_000,
    respawnSeconds: 28_800,
  },

  // ── NullSec Belts (require Mining Barge certification) ───────────────────

  'belt-arkonite': {
    id: 'belt-arkonite',
    name: 'Arkonite Vein',
    description: 'Rare Arkonite deposits found only in null-security systems. Yields Zyridium and Megacite.',
    securityTier: 'nullsec',
    outputs: [{ resourceId: 'arkonite', baseRate: 0.4 }],
    requiredSkill: { skillId: 'mining-barge', minLevel: 1 },
    poolSize: 160_000,
    respawnSeconds: 86_400, // 24 hours
  },

  'belt-crokitite': {
    id: 'belt-crokitite',
    name: 'Crokitite Core',
    description: 'Extraordinarily dense Crokitite. The only reliable source of the exotic Voidsteel mineral.',
    securityTier: 'nullsec',
    outputs: [{ resourceId: 'crokitite', baseRate: 0.18 }],
    requiredSkill: { skillId: 'astrogeology', minLevel: 5 },
    poolSize: 200_000,
    respawnSeconds: 86_400,
  },
};

export const BELT_ORDER = [
  'belt-ferrock', 'belt-corite', 'belt-silisite', 'belt-platonite',
  'belt-darkstone', 'belt-hematite', 'belt-voidite', 'belt-ionite',
  'belt-arkonite', 'belt-crokitite',
];

// ─── Mining Upgrades ───────────────────────────────────────────────────────

export const MINING_UPGRADES: Record<string, MiningUpgradeDefinition> = {

  'laser-focus-i': {
    id: 'laser-focus-i', name: 'Mining Laser Focus I',
    description: 'Calibrates laser frequencies for tighter ore extraction. +10% yield per level.',
    category: 'laser', systemId: 'mining',
    baseCost: { 'ferrite': 50 },
    maxLevel: 5,
    effects: { 'mining-yield': 0.10 },
  },

  'laser-focus-ii': {
    id: 'laser-focus-ii', name: 'Mining Laser Focus II',
    description: 'Advanced cavity focus optics for maximum energy transfer. +12% yield per level.',
    category: 'laser', systemId: 'mining',
    baseCost: { 'ferrite': 300, 'isorium': 50 },
    maxLevel: 5,
    effects: { 'mining-yield': 0.12 },
    prerequisiteSkill: { skillId: 'mining', minLevel: 3 },
  },

  'drone-harvesters-i': {
    id: 'drone-harvesters-i', name: 'Mining Drone Harvesters',
    description: 'Deploy autonomous ore-collection drones alongside laser operations. +8% yield per level.',
    category: 'drone', systemId: 'mining',
    baseCost: { 'ferrite': 200, 'vexirite': 30 },
    maxLevel: 3,
    effects: { 'mining-yield': 0.08 },
    prerequisiteSkill: { skillId: 'drone-interfacing', minLevel: 1 },
  },

  'deep-core-drill': {
    id: 'deep-core-drill', name: 'Deep-Core Drill Array',
    description: 'Tunnels past surface deposits into the asteroid core. +15% yield for lowsec and nullsec ores.',
    category: 'yield', systemId: 'mining',
    baseCost: { 'vexirite': 200, 'isorium': 100 },
    maxLevel: 3,
    effects: { 'deep-ore-yield': 0.15 },
    prerequisiteSkill: { skillId: 'advanced-mining', minLevel: 2 },
  },

  // ── Ore Hold & Haul upgrades ──────────────────────────────────────────────

  'expanded-ore-bay': {
    id: 'expanded-ore-bay', name: 'Expanded Ore Bay',
    description: 'Retrofits additional cargo volume for ore storage. +20% ore hold capacity per level.',
    category: 'hull', systemId: 'mining',
    baseCost: { 'ferrite': 150 },
    maxLevel: 5,
    effects: { 'ore-hold-capacity': 0.20 },
    prerequisiteSkill: { skillId: 'mining', minLevel: 2 },
  },

  'express-hauler': {
    id: 'express-hauler', name: 'Express Hauler Protocol',
    description: 'Streamlines ore transfer procedures. Reduces auto-haul interval by 10% per level.',
    category: 'hull', systemId: 'mining',
    baseCost: { 'ferrite': 100, 'vexirite': 20 },
    maxLevel: 5,
    effects: { 'haul-speed': 0.10 },
    prerequisiteSkill: { skillId: 'industrial', minLevel: 1 },
  },

  'ore-compression-array': {
    id: 'ore-compression-array', name: 'Ore Compression Array',
    description: 'Compresses ore in-place to extend the effective pool size. +25% belt pool size per level.',
    category: 'yield', systemId: 'mining',
    baseCost: { 'isorium': 100, 'vexirite': 50 },
    maxLevel: 3,
    effects: { 'belt-pool-size': 0.25 },
    prerequisiteSkill: { skillId: 'astrogeology', minLevel: 2 },
  },
};

export const UPGRADE_ORDER = [
  'laser-focus-i', 'laser-focus-ii', 'drone-harvesters-i', 'deep-core-drill',
  'expanded-ore-bay', 'express-hauler', 'ore-compression-array',
];

