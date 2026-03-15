import type { ResourceDefinition } from '@/types/game.types';

const RESOURCES: ResourceDefinition[] = [
  // ── Currency ──────────────────────────────────────────────────────────────
  { id: 'credits', name: 'ISK', category: 'currency', tier: 1, precision: 0,
    description: 'Interstellar Kredits — the universal currency of New Aether.' },

  // ── Highsec Ores (Tier 1) ──────────────────────────────────────────────────
  { id: 'ferrock',   name: 'Ferrock',   category: 'ore-highsec', tier: 1, precision: 0,
    description: 'Abundant iron-rich ore from high-security belts. Yields Ferrite and Silite.' },
  { id: 'corite',    name: 'Corite',    category: 'ore-highsec', tier: 1, precision: 0,
    description: 'Dense dark ore with high Ferrite yields and trace Vexirite content.' },
  { id: 'silisite',  name: 'Silisite',  category: 'ore-highsec', tier: 1, precision: 0,
    description: 'Crystalline whitish ore that reprocesses into Silite and Isorium.' },
  { id: 'platonite', name: 'Platonite', category: 'ore-highsec', tier: 1, precision: 0,
    description: 'Mixed-composition ore with broad mineral yields across all common types.' },

  // ── Lowsec Ores (Tier 1) ───────────────────────────────────────────────────
  { id: 'darkstone', name: 'Darkstone', category: 'ore-lowsec', tier: 1, precision: 0,
    description: 'Dark reactive ore from contested regions. Rich in Isorium and trace Noxium.' },
  { id: 'hematite',  name: 'Hematite',  category: 'ore-lowsec', tier: 1, precision: 0,
    description: 'Blood-red heavy ore from disputed belts. Notable Vexirite and Noxium source.' },
  { id: 'voidite',   name: 'Voidite',   category: 'ore-lowsec', tier: 1, precision: 0,
    description: 'Semi-translucent pale ore. Uncommon source of Zyridium crystals.' },

  // ── Nullsec Ores (Tier 1) ──────────────────────────────────────────────────
  { id: 'arkonite',  name: 'Arkonite',  category: 'ore-nullsec', tier: 1, precision: 0,
    description: 'Rare silvery ore from null-security belts. Yields Zyridium and Megacite.' },
  { id: 'crokitite', name: 'Crokitite', category: 'ore-nullsec', tier: 1, precision: 0,
    description: 'Extremely dense null-sec ore. The only natural source of Voidsteel.' },

  // ── Minerals (Tier 2) ─────────────────────────────────────────────────────
  { id: 'ferrite',   name: 'Ferrite',   category: 'mineral', tier: 2, precision: 0,
    description: 'The most common structural mineral. Foundation of every manufactured hull.' },
  { id: 'silite',    name: 'Silite',    category: 'mineral', tier: 2, precision: 0,
    description: 'Lightweight mineral prized for hull plating and structural components.' },
  { id: 'vexirite',  name: 'Vexirite',  category: 'mineral', tier: 2, precision: 0,
    description: 'Industrial-grade mineral used in medium-complexity manufacturing.' },
  { id: 'isorium',   name: 'Isorium',   category: 'mineral', tier: 2, precision: 0,
    description: 'Conductive mineral essential for electronics and shield systems.' },
  { id: 'noxium',    name: 'Noxium',    category: 'mineral', tier: 2, precision: 0,
    description: 'Reactive mineral used in propulsion and advanced alloy production.' },
  { id: 'zyridium',  name: 'Zyridium',  category: 'mineral', tier: 2, precision: 0,
    description: 'Rare crystalline mineral required for advanced components.' },
  { id: 'megacite',  name: 'Megacite',  category: 'mineral', tier: 2, precision: 0,
    description: 'High-demand rare mineral at the heart of advanced ship manufacturing.' },
  { id: 'voidsteel', name: 'Voidsteel', category: 'mineral', tier: 2, precision: 0,
    description: 'Exotic ultra-rare mineral found only in deep null-security excavations.' },

  // ── Manufactured Components (Tier 3) ─────────────────────────────────────
  { id: 'hull-plate',      name: 'Hull Plate',      category: 'component', tier: 3, precision: 0,
    description: 'Structural hull plating rolled from Ferrite and Silite.' },
  { id: 'thruster-node',   name: 'Thruster Node',   category: 'component', tier: 3, precision: 0,
    description: 'Propulsion subassembly for frigate-class hulls and above.' },
  { id: 'condenser-coil',  name: 'Condenser Coil',  category: 'component', tier: 3, precision: 0,
    description: 'Power storage component for capacitors, shield arrays and drives.' },
  { id: 'sensor-cluster',  name: 'Sensor Cluster',  category: 'component', tier: 3, precision: 0,
    description: 'Navigation and scanning system for exploration-capable vessels.' },
  { id: 'mining-laser',    name: 'Mining Laser',    category: 'component', tier: 3, precision: 0,
    description: 'Core ore-extraction module. Increases yield and reduces cycle time.' },
  { id: 'shield-emitter',  name: 'Shield Emitter',  category: 'component', tier: 3, precision: 0,
    description: 'Defensive shield projector for combat-capable vessels.' },

  // ── Advanced Minerals (Tier 2 — nullsec sources) ─────────────────────────
  { id: 'morphite',  name: 'Morphite',  category: 'mineral', tier: 2, precision: 0,
    description: 'Exotic metamorphic mineral from deep null-security belts. Required for all T2 manufacturing.' },
  { id: 'zydrine',   name: 'Zydrine',   category: 'mineral', tier: 2, precision: 0,
    description: 'Green crystalline mineral extracted from compressed null-sec ore. Essential for advanced alloys.' },

  // ── Datacores (Tier 3 — combat loot, used in T2 unlocking) ───────────────
  { id: 'datacore-mechanical',  name: 'Mechanical Engineering Core',  category: 'loot', tier: 3, precision: 0,
    description: 'Encrypted assembly data recovered from lowsec pirates. Used to research industrial ship blueprints.' },
  { id: 'datacore-electronic',  name: 'Electronic Systems Core',      category: 'loot', tier: 3, precision: 0,
    description: 'Nullsec pirate tactical cores containing advanced electronics schematics.' },
  { id: 'datacore-starship',    name: 'Starship Engineering Core',    category: 'loot', tier: 3, precision: 0,
    description: 'Faction raid loot encoding advanced hull construction protocols.' },

  // ── T2 Components (Tier 3 — advanced manufactured parts) ─────────────────
  { id: 'advanced-hull-plate',    name: 'Advanced Hull Plate',    category: 'component', tier: 3, precision: 0,
    description: 'High-grade structural plating reinforced with Morphite lattices.' },
  { id: 'advanced-thruster-node', name: 'Advanced Thruster Node', category: 'component', tier: 3, precision: 0,
    description: 'Overclocked propulsion assembly with Zydrine-cooled plasma chambers.' },
  { id: 'advanced-condenser-coil',name: 'Advanced Condenser Coil',category: 'component', tier: 3, precision: 0,
    description: 'High-capacity power storage coil using Morphite superconductors.' },

  // ── Ships (Tier 4 — T1 manufactured items) ────────────────────────────────
  { id: 'ship-shuttle',        name: 'Shuttle',        category: 'ship', tier: 4, precision: 0,
    description: 'Entry-level vessel with minimal systems. Fast to produce and replace.' },
  { id: 'ship-frigate',        name: 'Frigate',        category: 'ship', tier: 4, precision: 0,
    description: 'Standard combat and exploration frigate. Versatile all-rounder.' },
  { id: 'ship-mining-frigate', name: 'Mining Frigate', category: 'ship', tier: 4, precision: 0,
    description: 'Dedicated mining vessel with enhanced laser hardpoints and ore bays.' },
  { id: 'ship-hauler',         name: 'Hauler',         category: 'ship', tier: 4, precision: 0,
    description: 'Industrial transport hull with expanded cargo hold for bulk logistics.' },
  { id: 'ship-destroyer',      name: 'Destroyer',      category: 'ship', tier: 4, precision: 0,
    description: 'Combat-focused multi-launcher hull bridging frigates and cruisers.' },
  { id: 'ship-exhumer',        name: 'Exhumer',        category: 'ship', tier: 4, precision: 0,
    description: 'Advanced mining barge with the highest ore yield per cycle in its class.' },

  // ── T2 Ships (Tier 5 — require T2 BPC + advanced minerals) ───────────────
  { id: 'ship-assault-frigate',   name: 'Assault Frigate',   category: 'ship', tier: 5, precision: 0,
    description: 'Tech 2 combat frigate with hardened systems and boosted weapons output.' },
  { id: 'ship-covert-ops',        name: 'Covert Ops',        category: 'ship', tier: 5, precision: 0,
    description: 'Tech 2 stealth frigate specialised for deep-space scanning and infiltration.' },
  { id: 'ship-command-destroyer', name: 'Command Destroyer', category: 'ship', tier: 5, precision: 0,
    description: 'Tech 2 destroyer with fleet coordination systems and enhanced combat modules.' },
];

export const RESOURCE_REGISTRY: Record<string, ResourceDefinition> = Object.fromEntries(
  RESOURCES.map(r => [r.id, r]),
);

export const RESOURCE_IDS: string[] = RESOURCES.map(r => r.id);

export const RESOURCES_BY_TIER: Record<number, ResourceDefinition[]> = {};
for (const r of RESOURCES) {
  if (!RESOURCES_BY_TIER[r.tier]) RESOURCES_BY_TIER[r.tier] = [];
  RESOURCES_BY_TIER[r.tier].push(r);
}

export const ORE_IDS = [
  'ferrock', 'corite', 'silisite', 'platonite',
  'darkstone', 'hematite', 'voidite',
  'arkonite', 'crokitite',
];

export const MINERAL_IDS = [
  'ferrite', 'silite', 'vexirite', 'isorium',
  'noxium', 'zyridium', 'megacite', 'voidsteel',
  'morphite', 'zydrine',
];

export const DATACORE_IDS = [
  'datacore-mechanical', 'datacore-electronic', 'datacore-starship',
];

export const SHIP_RESOURCE_IDS = [
  'ship-shuttle', 'ship-frigate', 'ship-mining-frigate',
  'ship-hauler', 'ship-destroyer', 'ship-exhumer',
  'ship-assault-frigate', 'ship-covert-ops', 'ship-command-destroyer',
];

export function formatResourceAmount(amount: number, _precision = 0): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return Math.floor(amount).toString();
}

export function formatCredits(amount: number): string {
  if (amount >= 1_000_000_000_000) return `${(amount / 1_000_000_000_000).toFixed(2)}T ISK`;
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B ISK`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M ISK`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K ISK`;
  return `${Math.floor(amount).toLocaleString()} ISK`;
}


