import type { EnergySourceDefinition } from '@/types/game.types';

export const ENERGY_SOURCES: Record<string, EnergySourceDefinition> = {
  'solar-array': {
    id: 'solar-array',
    name: 'Solar Array',
    description: 'Photovoltaic panels providing steady renewable energy output.',
    supplyPerLevel: 5,
    baseCost: { 'silicon-wafers': 10, 'structural-alloys': 5 },
    maxLevel: 20,
  },
  'fusion-reactor': {
    id: 'fusion-reactor',
    name: 'Fusion Reactor',
    description: 'High-output reactor powered by hydrogen fusion.',
    supplyPerLevel: 30,
    baseCost: { 'structural-alloys': 50, 'hydrogen-fuel': 20, 'machine-parts': 10 },
    maxLevel: 10,
    unlockResearch: 'energy-fusion-basics',
  },
  'stellar-harvester': {
    id: 'stellar-harvester',
    name: 'Stellar Energy Harvester',
    description: 'Taps directly into stellar radiation for massive energy output.',
    supplyPerLevel: 200,
    baseCost: { 'exotic-matter': 5, 'energy-cells': 50, 'neutronium-plates': 2 },
    maxLevel: 5,
    unlockResearch: 'energy-stellar-tap',
  },
};

export const ENERGY_SOURCE_ORDER = ['solar-array', 'fusion-reactor', 'stellar-harvester'];

/** Flat energy demand per system operation (energy/sec). */
export const BASE_ENERGY_DEMAND = {
  manufacturing: 2,
  researchLab: 1,
} as const;
