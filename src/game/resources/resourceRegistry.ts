import type { ResourceDefinition } from '@/types/game.types';

const RESOURCES: ResourceDefinition[] = [
  // ── Tier 1 – Raw Materials ─────────────────────────────────────────────
  { id: 'raw-ore',           name: 'Raw Ore',           category: 'metallic',      tier: 1, precision: 1, description: 'Unprocessed ore extracted from asteroid fields.' },
  { id: 'metallic-dust',     name: 'Metallic Dust',     category: 'metallic',      tier: 1, precision: 1, description: 'Fine metallic particulate, byproduct of mining operations.' },
  { id: 'carbon-materials',  name: 'Carbon Materials',  category: 'industrial',    tier: 1, precision: 1, description: 'Carbon compounds mined from carbon-rich asteroids.' },
  { id: 'ice-deposits',      name: 'Ice Deposits',      category: 'volatile',      tier: 1, precision: 1, description: 'Frozen water and volatile compounds from ice asteroids.' },
  { id: 'silicon-crystals',  name: 'Silicon Crystals',  category: 'semiconductor', tier: 1, precision: 1, description: 'Raw silicon formations found in rocky asteroids.' },

  // ── Tier 2 – Processed Materials ──────────────────────────────────────
  { id: 'refined-metals',      name: 'Refined Metals',      category: 'processed', tier: 2, precision: 2, description: 'Smelted and purified metals ready for manufacturing.' },
  { id: 'structural-alloys',   name: 'Structural Alloys',   category: 'processed', tier: 2, precision: 2, description: 'High-strength alloys formed from refined metals and carbon.' },
  { id: 'industrial-polymers', name: 'Industrial Polymers', category: 'processed', tier: 2, precision: 2, description: 'Synthetic polymers derived from carbon materials.' },
  { id: 'hydrogen-fuel',       name: 'Hydrogen Fuel',       category: 'fuel',      tier: 2, precision: 2, description: 'Extracted hydrogen, primary fuel for reactors and ships.' },
  { id: 'silicon-wafers',      name: 'Silicon Wafers',      category: 'processed', tier: 2, precision: 2, description: 'Precision-cut silicon discs used in electronics.' },

  // ── Tier 3 – Advanced Components ──────────────────────────────────────
  { id: 'energy-cells',      name: 'Energy Cells',      category: 'component', tier: 3, precision: 3, description: 'Compact energy storage units for advanced systems.' },
  { id: 'machine-parts',     name: 'Machine Parts',     category: 'component', tier: 3, precision: 3, description: 'Precision mechanical components for factories and colonies.' },
  { id: 'drone-components',  name: 'Drone Components',  category: 'component', tier: 3, precision: 3, description: 'Modular parts for constructing autonomous drones.' },
  { id: 'quantum-circuits',  name: 'Quantum Circuits',  category: 'component', tier: 3, precision: 3, description: 'Advanced computing substrate enabling quantum processing.' },
  { id: 'nano-assemblies',   name: 'Nano Assemblies',   category: 'component', tier: 3, precision: 3, description: 'Self-organising nanoscale structures for precision manufacturing.' },

  // ── Tier 4 – Exotic Materials ──────────────────────────────────────────
  { id: 'exotic-matter',       name: 'Exotic Matter',       category: 'exotic', tier: 4, precision: 4, description: 'Strange matter with unusual physical properties.' },
  { id: 'neutronium-plates',   name: 'Neutronium Plates',   category: 'exotic', tier: 4, precision: 4, description: 'Ultra-dense material harvested from stellar remnants.' },
  { id: 'dark-energy-samples', name: 'Dark Energy Samples', category: 'exotic', tier: 4, precision: 4, description: 'Captured dark energy from deep space anomalies.' },
  { id: 'stellar-fragments',   name: 'Stellar Fragments',   category: 'exotic', tier: 4, precision: 4, description: 'Remnant matter from supernova events.' },
  { id: 'graviton-crystals',   name: 'Graviton Crystals',   category: 'exotic', tier: 4, precision: 4, description: 'Crystallised gravity waves from gravitational anomalies.' },

  // ── Tier 5 – Cosmic Materials ──────────────────────────────────────────
  { id: 'singularity-crystals', name: 'Singularity Crystals', category: 'cosmic', tier: 5, precision: 5, description: 'Crystallised remnants of collapsed singularities.' },
  { id: 'temporal-particles',   name: 'Temporal Particles',   category: 'cosmic', tier: 5, precision: 5, description: 'Subatomic particles that exist across multiple timelines.' },
  { id: 'cosmic-lattice',       name: 'Cosmic Lattice',       category: 'cosmic', tier: 5, precision: 5, description: 'A framework of cosmic strings spanning galactic distances.' },
  { id: 'reality-shards',       name: 'Reality Shards',       category: 'cosmic', tier: 5, precision: 5, description: 'Fragments from dimensional rift events.' },
  { id: 'primordial-energy',    name: 'Primordial Energy',    category: 'cosmic', tier: 5, precision: 5, description: 'Raw unstructured energy from the first moments of the universe.' },
];

export const RESOURCE_REGISTRY: Record<string, ResourceDefinition> = Object.fromEntries(
  RESOURCES.map(r => [r.id, r])
);

export const RESOURCE_IDS: string[] = RESOURCES.map(r => r.id);

export const RESOURCES_BY_TIER: Record<number, ResourceDefinition[]> = {};
for (const r of RESOURCES) {
  if (!RESOURCES_BY_TIER[r.tier]) RESOURCES_BY_TIER[r.tier] = [];
  RESOURCES_BY_TIER[r.tier].push(r);
}

export function formatResourceAmount(amount: number, precision: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toFixed(Math.min(precision, 1));
}
