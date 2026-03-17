// ─── Modifier Registry ─────────────────────────────────────────────────────
// Static metadata for every game modifier key.
// Used by StatTooltip to render full stat-sheet breakdowns.

export type ModifierUnit = 'multiplier' | 'flat' | 'percent' | 'seconds';

export interface ModifierMeta {
  key: string;
  label: string;
  description: string;
  /** How the value is displayed. multiplier → ×N.NN, percent → +N.N%, flat → +N, seconds → Ns */
  unit: ModifierUnit;
  /** The base value before any bonuses (1.0 for multipliers, 0 for additive). */
  baseValue: number;
  /** Human-readable list of systems this modifier affects (shown in tooltip footer). */
  affectedSystems: string[];
  /** Short formula string shown below the effective value. */
  formula: string;
}

export const MODIFIER_REGISTRY: Record<string, ModifierMeta> = {

  // ── Mining ──────────────────────────────────────────────────────────────

  'mining-yield': {
    key: 'mining-yield',
    label: 'Mining Yield',
    description: 'Multiplier applied to all ore extracted per second from active asteroid belts.',
    unit: 'multiplier',
    baseValue: 1,
    affectedSystems: ['Ore units per second from all belts', 'Belt depletion rate', 'Ore hold fill speed'],
    formula: '(1 + skill bonus) × (1 + upgrade bonus)',
  },

  'ore-scan-depth': {
    key: 'ore-scan-depth',
    label: 'Ore Scan Depth',
    description: 'Increases the detail level of belt composition surveys.',
    unit: 'flat',
    baseValue: 0,
    affectedSystems: ['Survey scan detail', 'Composition data layers'],
    formula: 'Base 0 + Σ(level × bonus)',
  },

  'belt-pool-size': {
    key: 'belt-pool-size',
    label: 'Belt Pool Size',
    description: 'Multiplier applied to the total ore units available in each active belt.',
    unit: 'multiplier',
    baseValue: 1,
    affectedSystems: ['Total ore units per belt', 'Time until belt depletion'],
    formula: '1 + Σ(level × bonus)',
  },

  'belt-respawn-speed': {
    key: 'belt-respawn-speed',
    label: 'Belt Respawn Speed',
    description: 'Reduces the time before a depleted asteroid belt regenerates.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Belt respawn timer', 'Downtime between mining cycles'],
    formula: 'Σ(level × bonus)',
  },

  'ice-yield': {
    key: 'ice-yield',
    label: 'Ice Harvesting Yield',
    description: 'Multiplier applied to ice products harvested from ice fields.',
    unit: 'multiplier',
    baseValue: 1,
    affectedSystems: ['Ice product income rate'],
    formula: '1 + Σ(level × bonus)',
  },

  'drone-yield': {
    key: 'drone-yield',
    label: 'Drone Yield',
    description: 'Multiplier for ore collected by autonomous mining drones.',
    unit: 'multiplier',
    baseValue: 1,
    affectedSystems: ['Drone ore output per second'],
    formula: '1 + Σ(level × bonus)',
  },

  'mining-barge-bonus': {
    key: 'mining-barge-bonus',
    label: 'Mining Barge Bonus',
    description: 'General performance multiplier for mining barge-class hulls.',
    unit: 'multiplier',
    baseValue: 1,
    affectedSystems: ['Mining barge ore hold', 'Barge laser cycle time'],
    formula: '1 + Σ(level × bonus)',
  },

  'ore-hold-capacity': {
    key: 'ore-hold-capacity',
    label: 'Ore Hold Capacity',
    description: 'Multiplier applied to the maximum ore hold size before an auto-haul is triggered.',
    unit: 'multiplier',
    baseValue: 1,
    affectedSystems: ['Maximum ore hold (units)', 'Time before hold fills'],
    formula: '1 + Σ(level × bonus)',
  },

  'haul-speed': {
    key: 'haul-speed',
    label: 'Haul Speed',
    description: 'Reduces the auto-haul interval — ore is transferred to inventory more frequently.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Auto-haul cooldown timer', 'Ore hold turnover rate'],
    formula: 'Interval = Base ÷ (1 + bonus)',
  },

  'deep-ore-yield': {
    key: 'deep-ore-yield',
    label: 'Deep Ore Yield',
    description: 'Additional yield bonus applied specifically to lowsec and nullsec ore belts.',
    unit: 'multiplier',
    baseValue: 1,
    affectedSystems: ['Yield from Darkstone, Hematite, Voidite, Arkonite, Crokitite belts'],
    formula: '1 + Σ(level × bonus)',
  },

  // ── Spaceship ────────────────────────────────────────────────────────────

  'ship-bonus': {
    key: 'ship-bonus',
    label: 'Spaceship Command Bonus',
    description: 'General ship performance modifier unlocked through command certifications.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['General ship combat rating', 'Fleet mission income'],
    formula: 'Σ(level × bonus)',
  },

  'frigate-bonus': {
    key: 'frigate-bonus',
    label: 'Frigate Bonus',
    description: 'Performance multiplier for all frigate-class hull operations.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Frigate speed', 'Frigate mission income'],
    formula: 'Σ(level × bonus)',
  },

  'mining-frigate-bonus': {
    key: 'mining-frigate-bonus',
    label: 'Mining Frigate Bonus',
    description: 'Bonus applied to ore yield when piloting a dedicated mining frigate hull.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Mining frigate ore yield per second'],
    formula: 'Σ(level × bonus)',
  },

  'hauler-cargo-bonus': {
    key: 'hauler-cargo-bonus',
    label: 'Hauler Cargo Bonus',
    description: 'Increases cargo capacity for industrial-class transport ships.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Hauler cargo capacity', 'Haul batch size'],
    formula: 'Σ(level × bonus)',
  },

  'warp-speed': {
    key: 'warp-speed',
    label: 'Warp Speed',
    description: 'Reduces inter-system warp duration for manual travel, fleet orders, and detached wing convoys.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Manual warp duration', 'Fleet and wing transit ETA', 'Route travel-time estimates'],
    formula: 'Time = Distance ÷ (Base speed × (1 + bonus) × ship profile)',
  },

  'destroyer-bonus': {
    key: 'destroyer-bonus',
    label: 'Destroyer Bonus',
    description: 'Combat effectiveness multiplier for destroyer-class hulls.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Destroyer mission income', 'Destroyer combat rating'],
    formula: 'Σ(level × bonus)',
  },

  'cruiser-bonus': {
    key: 'cruiser-bonus',
    label: 'Cruiser Bonus',
    description: 'Significant combat multiplier for medium-class cruiser operations.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Cruiser mission income', 'Cruiser combat rating'],
    formula: 'Σ(level × bonus)',
  },

  // ── Industry ─────────────────────────────────────────────────────────────

  'manufacturing-speed': {
    key: 'manufacturing-speed',
    label: 'Manufacturing Speed',
    description: 'Reduces the time required to complete manufacturing jobs. Higher is faster.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Manufacturing job duration', 'Component production rate', 'Ship build time'],
    formula: 'Time = Base ÷ (1 + bonus)',
  },

  'reprocessing-efficiency': {
    key: 'reprocessing-efficiency',
    label: 'Reprocessing Efficiency',
    description: 'Multiplier applied to mineral yields from all ore reprocessing operations.',
    unit: 'multiplier',
    baseValue: 1,
    affectedSystems: ['Minerals output per batch', 'Ore-to-mineral conversion rate'],
    formula: '1 + Σ(level × bonus)',
  },

  'blueprint-research-speed': {
    key: 'blueprint-research-speed',
    label: 'Blueprint Research Speed',
    description: 'Reduces time to research blueprint efficiency and time copies.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Blueprint ME/TE research time'],
    formula: 'Σ(level × bonus)',
  },

  // ── Science ──────────────────────────────────────────────────────────────

  'belt-scan-quality': {
    key: 'belt-scan-quality',
    label: 'Belt Scan Quality',
    description: 'Improves the accuracy and detail of belt composition survey data.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Belt composition readout', 'Survey accuracy'],
    formula: 'Σ(level × bonus)',
  },

  // ── Electronics ──────────────────────────────────────────────────────────

  'sensor-strength': {
    key: 'sensor-strength',
    label: 'Sensor Strength',
    description: 'Improves active sensor modules and electronic warfare resistance.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Sensor module efficacy', 'ECM resistance'],
    formula: 'Σ(level × bonus)',
  },

  'cpu-capacity': {
    key: 'cpu-capacity',
    label: 'CPU Capacity',
    description: 'Increases available CPU for fitting higher-meta modules.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Module fitting capacity', 'Available fitting grid'],
    formula: 'Σ(level × bonus)',
  },

  'scan-strength': {
    key: 'scan-strength',
    label: 'Scan Strength',
    description: 'Improves probe scan strength for resolving cosmic signatures.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Cosmic signature resolution', 'Exploration scan speed'],
    formula: 'Σ(level × bonus)',
  },

  // ── Trade ─────────────────────────────────────────────────────────────────

  'sell-price-bonus': {
    key: 'sell-price-bonus',
    label: 'Sell Price Bonus',
    description: 'Increases the effective NPC buy price for all items sold on the market.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['NPC buy price for minerals', 'NPC buy price for components', 'NPC buy price for ships'],
    formula: 'effectivePrice = base × (1 + totalBonus)',
  },

  'broker-fee-reduction': {
    key: 'broker-fee-reduction',
    label: 'Broker Fee Reduction',
    description: 'Reduces broker fees charged on market orders. Each level saves ISK per transaction.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Effective sell price (adds to sell-price-bonus pool)'],
    formula: 'Σ(level × bonus)',
  },

  'sales-tax-reduction': {
    key: 'sales-tax-reduction',
    label: 'Sales Tax Reduction',
    description: 'Reduces the sales tax deducted from all completed sell orders.',
    unit: 'percent',
    baseValue: 0,
    affectedSystems: ['Effective sell price (adds to sell-price-bonus pool)'],
    formula: 'Σ(level × bonus)',
  },
};
