import type { HullDefinition, ModuleDefinition, PilotTrainingFocus, ShipRole, FleetDoctrine } from '@/types/game.types';

// ─── Hull definitions ──────────────────────────────────────────────────────

export const HULL_DEFINITIONS: Record<string, HullDefinition> = {

  'shuttle': {
    id: 'shuttle', name: 'Shuttle', shipClass: 'shuttle',
    description: 'A basic personal transport. Cheap to make, easy to fly, limited capability in all roles.',
    resourceId: 'ship-shuttle',
    baseMiningBonus: 0.5, baseCombatRating: 0.5,
    baseCargoMultiplier: 1.0, warpSpeedBonus: 0.0,
    moduleSlots: { high: 1, mid: 1, low: 1 },
  },

  'frigate': {
    id: 'frigate', name: 'Frigate', shipClass: 'frigate',
    description: 'A versatile light combat hull. Fast, nimble, and capable of light mining operations.',
    resourceId: 'ship-frigate',
    baseMiningBonus: 0.8, baseCombatRating: 1.5,
    baseCargoMultiplier: 1.0, warpSpeedBonus: 0.1,
    moduleSlots: { high: 2, mid: 2, low: 2 },
    requiredPilotSkill: { skillId: 'spaceship-command', minLevel: 1 },
  },

  'mining-frigate': {
    id: 'mining-frigate', name: 'Mining Frigate', shipClass: 'mining-frigate',
    description: 'A dedicated mining hull with enhanced yield systems and expanded ore hold.',
    resourceId: 'ship-mining-frigate',
    baseMiningBonus: 2.0, baseCombatRating: 0.3,
    baseCargoMultiplier: 1.5, warpSpeedBonus: 0.0,
    moduleSlots: { high: 2, mid: 1, low: 2 },
    requiredPilotSkill: { skillId: 'mining-frigate', minLevel: 1 },
  },

  'hauler': {
    id: 'hauler', name: 'Hauler', shipClass: 'hauler',
    description: 'A large-capacity industrial transport. The backbone of any supply chain.',
    resourceId: 'ship-hauler',
    baseMiningBonus: 0.5, baseCombatRating: 0.5,
    baseCargoMultiplier: 4.0, warpSpeedBonus: 0.0,
    moduleSlots: { high: 1, mid: 2, low: 3 },
    requiredPilotSkill: { skillId: 'industrial', minLevel: 1 },
  },

  'destroyer': {
    id: 'destroyer', name: 'Destroyer', shipClass: 'destroyer',
    description: 'A high-firepower combat hull bristling with weapon systems. Excellent for patrol and interdiction.',
    resourceId: 'ship-destroyer',
    baseMiningBonus: 0.5, baseCombatRating: 3.0,
    baseCargoMultiplier: 1.0, warpSpeedBonus: 0.05,
    moduleSlots: { high: 4, mid: 2, low: 1 },
    requiredPilotSkill: { skillId: 'destroyer', minLevel: 1 },
  },

  'exhumer': {
    id: 'exhumer', name: 'Exhumer', shipClass: 'exhumer',
    description: 'Capital-class mining barge. Strips entire asteroid fields single-handedly.',
    resourceId: 'ship-exhumer',
    baseMiningBonus: 4.0, baseCombatRating: 0.3,
    baseCargoMultiplier: 2.0, warpSpeedBonus: 0.0,
    moduleSlots: { high: 3, mid: 2, low: 3 },
    requiredPilotSkill: { skillId: 'mining-barge', minLevel: 3 },
  },
};

// ─── Module definitions ────────────────────────────────────────────────────

export const MODULE_DEFINITIONS: Record<string, ModuleDefinition> = {

  // High-slot modules
  'mining-laser-i': {
    id: 'mining-laser-i', name: 'Mining Laser I',
    description: 'Standard mining laser. Increases ore yield from active belts.',
    slotType: 'high',
    effects: { 'mining-yield': 0.10 },
    buildCost: { 'ferrite': 100, 'condenser-coil': 2 },
  },

  'mining-laser-ii': {
    id: 'mining-laser-ii', name: 'Mining Laser II',
    description: 'Advanced mining laser with improved extraction aperture.',
    slotType: 'high',
    effects: { 'mining-yield': 0.18 },
    buildCost: { 'vexirite': 200, 'condenser-coil': 5, 'mining-laser': 1 },
  },

  'salvager-i': {
    id: 'salvager-i', name: 'Salvager I',
    description: 'Recovers floating wreck material, generating bonus ISK over time.',
    slotType: 'high',
    effects: { 'isk-yield': 0.05 },
    buildCost: { 'ferrite': 80, 'sensor-cluster': 1 },
  },

  'missile-launcher-i': {
    id: 'missile-launcher-i', name: 'Missile Launcher I',
    description: 'Light missile launcher for offensive combat operations.',
    slotType: 'high',
    effects: { 'combat-rating': 0.15 },
    buildCost: { 'silite': 150, 'thruster-node': 2 },
  },

  // Mid-slot modules
  'shield-extender-i': {
    id: 'shield-extender-i', name: 'Shield Extender I',
    description: 'Increases ship hull integrity, improving combat survivability.',
    slotType: 'mid',
    effects: { 'combat-rating': 0.10 },
    buildCost: { 'ferrite': 200, 'shield-emitter': 2 },
  },

  'warp-scrambler-i': {
    id: 'warp-scrambler-i', name: 'Warp Scrambler I',
    description: 'Prevents target ships from warping away. Required for successful interdiction.',
    slotType: 'mid',
    effects: { 'combat-rating': 0.05 },
    buildCost: { 'silite': 100, 'sensor-cluster': 1 },
  },

  'survey-scanner-i': {
    id: 'survey-scanner-i', name: 'Survey Scanner I',
    description: 'Improves belt ore detection and remaining pool estimates.',
    slotType: 'mid',
    effects: { 'belt-scan-quality': 0.30 },
    buildCost: { 'ferrite': 50, 'sensor-cluster': 1 },
  },

  'cargo-scanner-i': {
    id: 'cargo-scanner-i', name: 'Cargo Scanner I',
    description: 'Reveals hauler cargo manifests in-system.',
    slotType: 'mid',
    effects: { 'scan-strength': 0.10 },
    buildCost: { 'ferrite': 40, 'sensor-cluster': 1 },
  },

  // Low-slot modules
  'cargo-expander-i': {
    id: 'cargo-expander-i', name: 'Cargo Expander I',
    description: 'Increases cargo hold capacity.',
    slotType: 'low',
    effects: { 'cargo-capacity': 0.20 },
    buildCost: { 'ferrite': 120, 'hull-plate': 1 },
  },

  'cargo-expander-ii': {
    id: 'cargo-expander-ii', name: 'Cargo Expander II',
    description: 'Enhanced cargo hold expander. Takes more power but carries more.',
    slotType: 'low',
    effects: { 'cargo-capacity': 0.35 },
    buildCost: { 'vexirite': 200, 'hull-plate': 3 },
  },

  'mining-upgrade-i': {
    id: 'mining-upgrade-i', name: 'Mining Upgrade I',
    description: 'Passive mining optimization script. Small yield bonus per module.',
    slotType: 'low',
    effects: { 'mining-yield': 0.05 },
    buildCost: { 'silite': 80, 'condenser-coil': 1 },
  },

  'hull-reinforcement-i': {
    id: 'hull-reinforcement-i', name: 'Hull Reinforcement I',
    description: 'Nano-ceramic hull plates improve structural integrity under fire.',
    slotType: 'low',
    effects: { 'combat-rating': 0.08 },
    buildCost: { 'ferrite': 300, 'hull-plate': 2 },
  },
};

// ─── Pilot skill focus trees ───────────────────────────────────────────────
// Order matters: earliest entry = highest auto-training priority

export const PILOT_SKILL_FOCUS_TREES: Record<PilotTrainingFocus, string[]> = {
  mining:      ['mining', 'astrogeology', 'mining-frigate', 'mining-barge', 'drone-interfacing', 'advanced-mining'],
  combat:      ['spaceship-command', 'frigate', 'destroyer', 'cruiser', 'gunnery', 'military-operations', 'electronics', 'ladar-sensing'],
  hauling:     ['spaceship-command', 'industrial', 'frigate', 'cpu-management'],
  exploration: ['survey', 'electronics', 'ladar-sensing', 'spaceship-command', 'frigate'],
  balanced:    ['spaceship-command', 'mining', 'frigate', 'survey', 'electronics'],
};

// ─── Doctrine definitions ─────────────────────────────────────────────────

export interface DoctrineDefinition {
  label: string;
  color: string;
  dpsMult: number;
  tankMult: number;
  lootMult: number;
  /** Fractional variance range, e.g. 0.2 = ±20% randomness on combat outcome */
  varianceRange: number;
  /** Role that must be present in the fleet to activate this doctrine */
  requires: ShipRole | null;
  description: string;
}

export const DOCTRINE_DEFINITIONS: Record<FleetDoctrine, DoctrineDefinition> = {
  'balanced':     { label: 'Balanced',     color: '#94a3b8', dpsMult: 1.00, tankMult: 1.00, lootMult: 1.0,  varianceRange: 0.20, requires: null,      description: 'No specialization. Flexible but unoptimized.' },
  'brawl':        { label: 'Brawl',        color: '#f87171', dpsMult: 1.25, tankMult: 0.70, lootMult: 1.0,  varianceRange: 0.15, requires: 'dps',     description: 'Go in hard and fast. Heavy DPS, fragile.' },
  'sniper':       { label: 'Sniper',       color: '#60a5fa', dpsMult: 1.15, tankMult: 0.85, lootMult: 1.0,  varianceRange: 0.10, requires: 'scout',   description: 'Precision strike backed by scout intel.' },
  'shield-wall':  { label: 'Shield Wall',  color: '#4ade80', dpsMult: 0.85, tankMult: 1.40, lootMult: 0.9,  varianceRange: 0.25, requires: 'tank',    description: 'Heavy defense formation. Grinds down enemies.' },
  'stealth-raid': { label: 'Stealth Raid', color: '#a78bfa', dpsMult: 0.75, tankMult: 1.00, lootMult: 1.5,  varianceRange: 0.10, requires: 'scout',   description: 'Ghost in, maximize loot recovery.' },
};
