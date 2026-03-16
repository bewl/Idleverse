import type { SkillDefinition } from '@/types/game.types';

// ─── Skill definitions ─────────────────────────────────────────────────────
// Training time = SKILL_LEVEL_SECONDS[level-1] × rank
// Rank 1 → Lv1 1min / Lv5 18hr   |   Rank 5 → Lv1 5min / Lv5 90hr

export const SKILL_DEFINITIONS: Record<string, SkillDefinition> = {

  // ══════════════════════════════════ MINING ══════════════════════════════════

  'mining': {
    id: 'mining', name: 'Mining', description: 'Proficiency with mining lasers. Each level increases ore yield from all active belts.',
    category: 'mining', rank: 2,
    effects: [{ modifier: 'mining-yield', valuePerLevel: 0.05 }],
    unlocks: ['belt-ferrock', 'belt-corite'],
    pilotTrainable: true,
  },

  'astrogeology': {
    id: 'astrogeology', name: 'Astrogeology', description: 'Advanced study of asteroid composition. Increases yield and effective ore pool size from all belts.',
    category: 'mining', rank: 3,
    effects: [
      { modifier: 'mining-yield',    valuePerLevel: 0.05 },
      { modifier: 'ore-scan-depth',  valuePerLevel: 1    },
      { modifier: 'belt-pool-size',  valuePerLevel: 0.20 },
    ],
    prerequisiteSkills: { 'mining': 3 },
    unlocks: ['belt-silisite', 'belt-platonite'],
    pilotTrainable: true,
  },

  'advanced-mining': {
    id: 'advanced-mining', name: 'Advanced Mining', description: 'Mastery over deep-vein extraction. Unlocks lowsec ore belts and speeds up belt respawn timers.',
    category: 'mining', rank: 4,
    effects: [
      { modifier: 'mining-yield',        valuePerLevel: 0.08 },
      { modifier: 'belt-respawn-speed',  valuePerLevel: 0.10 },
    ],
    prerequisiteSkills: { 'mining': 4 },
    unlocks: ['belt-darkstone', 'belt-hematite'],
    pilotTrainable: true,
  },

  'ice-harvesting': {
    id: 'ice-harvesting', name: 'Ice Harvesting', description: 'Specialised training for operating ice-harvesting modules in ice belts.',
    category: 'mining', rank: 4,
    effects: [{ modifier: 'ice-yield', valuePerLevel: 0.10 }],
    prerequisiteSkills: { 'mining': 4 },
    pilotTrainable: true,
  },

  'drone-interfacing': {
    id: 'drone-interfacing', name: 'Drone Interfacing', description: 'Skill in deploying autonomous mining drones. Increases drone ore yield per level.',
    category: 'mining', rank: 5,
    effects: [{ modifier: 'drone-yield', valuePerLevel: 0.20 }],
    prerequisiteSkills: { 'mining': 2 },
    pilotTrainable: true,
  },

  'mining-barge': {
    id: 'mining-barge', name: 'Mining Barge', description: 'Allows operation of industrial-class mining barges and exhumers. Each level increases ore hold capacity and haul speed.',
    category: 'mining', rank: 4,
    effects: [
      { modifier: 'mining-barge-bonus',  valuePerLevel: 0.05 },
      { modifier: 'ore-hold-capacity',   valuePerLevel: 0.20 },
      { modifier: 'haul-speed',          valuePerLevel: 0.10 },
    ],
    prerequisiteSkills: { 'advanced-mining': 3 },
    unlocks: ['belt-voidite', 'belt-arkonite'],
    pilotTrainable: true,
  },

  // ════════════════════════════════ SPACESHIP ═════════════════════════════════

  'spaceship-command': {
    id: 'spaceship-command', name: 'Spaceship Command', description: 'Core starship operations training. Reduces all skill penalties and improves general ship performance.',
    category: 'spaceship', rank: 1,
    effects: [{ modifier: 'ship-bonus', valuePerLevel: 0.02 }],
    unlocks: ['system-fleet'],
    pilotTrainable: true,
  },

  'frigate': {
    id: 'frigate', name: 'Frigate', description: 'Allows piloting of all standard frigate hulls. Each level improves frigate performance.',
    category: 'spaceship', rank: 2,
    effects: [{ modifier: 'frigate-bonus', valuePerLevel: 0.05 }],
    prerequisiteSkills: { 'spaceship-command': 1 },
    unlocks: ['recipe-ship-frigate'],
    pilotTrainable: true,
  },

  'mining-frigate': {
    id: 'mining-frigate', name: 'Mining Frigate', description: 'Specialised frigate certification for Venture-class mining ships. Greatly improves mining yield when piloting.',
    category: 'spaceship', rank: 4,
    effects: [{ modifier: 'mining-frigate-bonus', valuePerLevel: 0.12 }],
    prerequisiteSkills: { 'frigate': 3, 'mining': 3 },
    unlocks: ['recipe-ship-mining-frigate'],
    pilotTrainable: true,
  },

  'industrial': {
    id: 'industrial', name: 'Industrial', description: 'Pilots large industrial transport hulls. Each level increases hauler cargo capacity and auto-haul speed.',
    category: 'spaceship', rank: 2,
    effects: [
      { modifier: 'hauler-cargo-bonus', valuePerLevel: 0.10 },
      { modifier: 'haul-speed',        valuePerLevel: 0.05 },
    ],
    prerequisiteSkills: { 'spaceship-command': 1 },
    unlocks: ['recipe-ship-hauler'],
    pilotTrainable: true,
  },

  'destroyer': {
    id: 'destroyer', name: 'Destroyer', description: 'Allows piloting of destroyer-class hulls. Prerequisite for cruiser training.',
    category: 'spaceship', rank: 3,
    effects: [{ modifier: 'destroyer-bonus', valuePerLevel: 0.05 }],
    prerequisiteSkills: { 'frigate': 3 },
    unlocks: ['recipe-ship-destroyer'],
    pilotTrainable: true,
  },

  'cruiser': {
    id: 'cruiser', name: 'Cruiser', description: 'Certification for medium-class cruiser hulls. Significant combat and exploration improvements.',
    category: 'spaceship', rank: 5,
    effects: [{ modifier: 'cruiser-bonus', valuePerLevel: 0.05 }],
    prerequisiteSkills: { 'destroyer': 3 },
    pilotTrainable: true,
  },

  'gunnery': {
    id: 'gunnery', name: 'Gunnery',
    description: 'Weapons training. Improves combat effectiveness for all ship classes.',
    category: 'spaceship', rank: 2,
    effects: [{ modifier: 'gunnery-bonus', valuePerLevel: 0.05 }],
    prerequisiteSkills: { 'spaceship-command': 1 },
    pilotTrainable: true,
  },

  'military-operations': {
    id: 'military-operations', name: 'Military Operations',
    description: 'Advanced tactical training. Enables targeted fleet raid orders against NPC groups.',
    category: 'spaceship', rank: 3,
    effects: [{ modifier: 'combat-bonus', valuePerLevel: 0.03 }],
    prerequisiteSkills: { 'spaceship-command': 2 },
    unlocks: ['combat-raid'],
    pilotTrainable: true,
  },

  // ═══════════════════════════════ INDUSTRY ══════════════════════════════════

  'industry': {
    id: 'industry', name: 'Industry', description: 'Reduces manufacturing time for all jobs. The cornerstone of any industrial operation.',
    category: 'industry', rank: 1,
    effects: [{ modifier: 'manufacturing-speed', valuePerLevel: 0.04 }],
    unlocks: ['system-manufacturing'],
  },

  'advanced-industry': {
    id: 'advanced-industry', name: 'Advanced Industry', description: 'Mastery of complex manufacturing. Further reduces all job times at a cost of intensive training.',
    category: 'industry', rank: 5,
    effects: [{ modifier: 'manufacturing-speed', valuePerLevel: 0.02 }],
    prerequisiteSkills: { 'industry': 5 },
  },

  'reprocessing': {
    id: 'reprocessing', name: 'Reprocessing', description: 'Core ore processing skill. Each level improves mineral yield from reprocessing operations.',
    category: 'industry', rank: 4,
    effects: [{ modifier: 'reprocessing-efficiency', valuePerLevel: 0.03 }],
    unlocks: ['system-reprocessing'],
  },

  'reprocessing-efficiency': {
    id: 'reprocessing-efficiency', name: 'Reprocessing Efficiency', description: 'Advanced reprocessing technique. Further improves mineral yield per reprocessing cycle.',
    category: 'industry', rank: 5,
    effects: [{ modifier: 'reprocessing-efficiency', valuePerLevel: 0.02 }],
    prerequisiteSkills: { 'reprocessing': 3 },
  },

  // ══════════════════════════════ SCIENCE ════════════════════════════════════

  'science': {
    id: 'science', name: 'Science', description: 'Foundational science training. Required for blueprint research and invention activities.',
    category: 'science', rank: 1,
    effects: [{ modifier: 'blueprint-research-speed', valuePerLevel: 0.04 }],
  },

  'metallurgy': {
    id: 'metallurgy', name: 'Metallurgy', description: 'Improves material efficiency when reprocessing. Every level reduces ore waste during smelting.',
    category: 'science', rank: 3,
    effects: [{ modifier: 'reprocessing-efficiency', valuePerLevel: 0.01 }],
    prerequisiteSkills: { 'science': 1 },
  },

  'survey': {
    id: 'survey', name: 'Survey', description: 'Reveals ore composition data for active asteroid belts and their richness ratings.',
    category: 'science', rank: 1,
    effects: [{ modifier: 'belt-scan-quality', valuePerLevel: 0.20 }],
    pilotTrainable: true,
  },

  'astrometrics': {
    id: 'astrometrics', name: 'Astrometrics',
    description: 'Improves deep-space object detection. Each level increases anomaly scanning speed by 10%, enabling faster anomaly discovery in uncharted systems.',
    category: 'science', rank: 2,
    effects: [{ modifier: 'scan-speed', valuePerLevel: 0.10 }],
    prerequisiteSkills: { 'science': 1 },
    unlocks: ['system-exploration'],
    pilotTrainable: true,
  },

  'archaeology': {
    id: 'archaeology', name: 'Archaeology',
    description: 'Certifies the operator to access ancient relic sites. Required for looting relic anomalies.',
    category: 'science', rank: 3,
    effects: [],
    prerequisiteSkills: { 'astrometrics': 1 },
    unlocks: ['loot-relic-sites'],
  },

  'hacking': {
    id: 'hacking', name: 'Hacking',
    description: 'Grants access to encrypted data vaults. Required for looting data site anomalies.',
    category: 'science', rank: 2,
    effects: [],
    prerequisiteSkills: { 'astrometrics': 1 },
    unlocks: ['loot-data-sites'],
  },

  // ═══════════════════════════ ELECTRONICS ═══════════════════════════════════

  'electronics': {
    id: 'electronics', name: 'Electronics', description: 'Core electronics training. Underpins sensor, scanner, and electronic warfare systems.',
    category: 'electronics', rank: 1,
    effects: [{ modifier: 'sensor-strength', valuePerLevel: 0.05 }],
    pilotTrainable: true,
  },

  'cpu-management': {
    id: 'cpu-management', name: 'CPU Management', description: 'Optimise CPU usage, enabling fitting of higher-meta modules.',
    category: 'electronics', rank: 1,
    effects: [{ modifier: 'cpu-capacity', valuePerLevel: 0.05 }],
    prerequisiteSkills: { 'electronics': 1 },
    pilotTrainable: true,
  },

  'ladar-sensing': {
    id: 'ladar-sensing', name: 'Ladar Sensing', description: 'Skill with laser-based deep-space sensors. Improves cosmic signature scan strength for exploration.',
    category: 'electronics', rank: 4,
    effects: [{ modifier: 'scan-strength', valuePerLevel: 0.10 }],
    prerequisiteSkills: { 'electronics': 3 },
    pilotTrainable: true,
  },

  // ═══════════════════════════════ TRADE ═════════════════════════════════════

  'trade': {
    id: 'trade', name: 'Trade', description: 'Improves NPC sell prices for all minerals and manufactured goods.',
    category: 'trade', rank: 2,
    effects: [{ modifier: 'sell-price-bonus', valuePerLevel: 0.04 }],
    unlocks: ['system-market'],
  },

  'broker-relations': {
    id: 'broker-relations', name: 'Broker Relations', description: 'Reduces market broker fees. Essential for high-volume trading operations.',
    category: 'trade', rank: 2,
    effects: [{ modifier: 'broker-fee-reduction', valuePerLevel: 0.003 }],
    prerequisiteSkills: { 'trade': 2 },
  },

  'accounting': {
    id: 'accounting', name: 'Accounting', description: 'Reduces sales tax on all transactions. Each level is worth real ISK at volume.',
    category: 'trade', rank: 3,
    effects: [{ modifier: 'sales-tax-reduction', valuePerLevel: 0.004 }],
    prerequisiteSkills: { 'broker-relations': 2 },
  },
};

export const SKILL_CATEGORIES: Record<string, string[]> = {
  mining:       ['mining', 'astrogeology', 'advanced-mining', 'ice-harvesting', 'drone-interfacing', 'mining-barge'],
  spaceship:    ['spaceship-command', 'frigate', 'mining-frigate', 'industrial', 'destroyer', 'cruiser', 'gunnery', 'military-operations'],
  industry:     ['industry', 'advanced-industry', 'reprocessing', 'reprocessing-efficiency'],
  science:      ['science', 'metallurgy', 'survey', 'astrometrics', 'archaeology', 'hacking'],
  electronics:  ['electronics', 'cpu-management', 'ladar-sensing'],
  trade:        ['trade', 'broker-relations', 'accounting'],
};

export const SKILL_CATEGORY_LABELS: Record<string, string> = {
  mining: 'Mining', spaceship: 'Spaceship Command',
  industry: 'Industry', science: 'Science',
  electronics: 'Electronics', trade: 'Trade',
};

export const SKILL_CATEGORY_ICONS: Record<string, string> = {
  mining: '⛏', spaceship: '🚀', industry: '🏭',
  science: '🔬', electronics: '⚡', trade: '📊',
};
