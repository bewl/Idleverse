import type { FactionDefinition, FactionId } from '@/types/faction.types';

// ─── The four civilisations of the galaxy ─────────────────────────────────

export const FACTION_DEFINITIONS: Record<FactionId, FactionDefinition> = {
  /**
   * Aetherian Concordat — the dominant inner-core federation.
   * Controls high-security space around the galactic core.
   * They value stability and trade, but bureaucracy slows everything down.
   */
  concordat: {
    id: 'concordat',
    name: 'Aetherian Concordat',
    shortName: 'Concordat',
    color: '#38bdf8',   // sky-400
    description:
      'The oldest interstellar union, born from the first colonisation wave. ' +
      'The Concordat governs the inner systems with strict law and heavy taxation. ' +
      'Their stations are the safest in the galaxy — if you can afford the docking fees.',
    baseRep: 200,
    repMin: -1000,
    repMax: 1000,
    territoryBias: 0.22,   // core cluster
    aggression: 2,
  },

  /**
   * Veldris Commission — industrial mid-ring traders.
   * Occupy the low-sec transition zone between safe core and dangerous fringe.
   * Pragmatic; they work with anyone for the right price.
   */
  veldris: {
    id: 'veldris',
    name: 'Veldris Commission',
    shortName: 'Commission',
    color: '#fb923c',   // orange-400
    description:
      'A loose coalition of mining guilds and merchant houses that carved out the ' +
      'mid-ring industrial corridor. The Commission sells loyalty to the highest bidder ' +
      'and operates the galaxy\'s most aggressive ore-processing networks.',
    baseRep: 50,
    repMin: -1000,
    repMax: 1000,
    territoryBias: 0.38,   // mid-ring
    aggression: 2,
  },

  /**
   * Obsidian Syndicate — outer nullsec crime network.
   * Deep fringe systems. Dangerous, but rich in rare resources and contraband.
   * Player starts hostile (-300); trust must be earned through black-market runs.
   */
  syndicate: {
    id: 'syndicate',
    name: 'Obsidian Syndicate',
    shortName: 'Syndicate',
    color: '#f87171',   // red-400
    description:
      'A ruthless criminal empire that controls the outer nullsec fringe through ' +
      'violence and bribery. The Syndicate does not forgive debts — but their black ' +
      'markets stock items you will find nowhere else in the galaxy.',
    baseRep: -300,
    repMin: -1000,
    repMax: 1000,
    territoryBias: 0.58,   // outer fringe
    aggression: 3,
  },

  /**
   * Wanderers' Covenant — nomadic explorers & scavengers.
   * No fixed territory; their roaming stations appear throughout the galaxy.
   * Neutral starting rep; quests and exploration raise standing.
   */
  covenant: {
    id: 'covenant',
    name: "Wanderers' Covenant",
    shortName: 'Covenant',
    color: '#a78bfa',   // violet-400
    description:
      'Descended from generation ships that never settled. The Covenant roams ' +
      'all zones, trading ancient star charts, exotic salvage, and exploration data. ' +
      'Earn their respect and they will guide you to the rarest systems in the galaxy.',
    baseRep: 0,
    repMin: -1000,
    repMax: 1000,
    territoryBias: 0.0,   // nomadic — appears everywhere
    aggression: 1,
  },
};

/** Ordered list for iteration (UI, reports, etc.). */
export const FACTION_ORDER: FactionId[] = ['concordat', 'veldris', 'syndicate', 'covenant'];

/**
 * Human-readable region names used when assigning galaxy sectors to factions.
 * galaxy.gen.ts picks from these deterministically.
 */
export const REGION_NAMES: Record<FactionId, string[]> = {
  concordat: [
    'Aether Reach', 'Solace Basin', 'Concordat Core', 'Primal Expanse',
    'High Mandate', 'Veil Sanctum', 'Celestial March', 'Inner Prosperity',
  ],
  veldris: [
    'Veldris March', 'Commission Span', 'Forge Corridor', "Guild's Passage",
    'Smelter Row', 'Transit Belt', 'Ore Reaches', 'Refinery Expanse',
  ],
  syndicate: [
    'Obsidian Fringe', 'Shadow Null', 'Black Corridor', 'Syndicate Deep',
    'Void Margin', 'Contraband Reach', 'Outlaw Expanse', 'Dark Perimeter',
  ],
  covenant: [
    "Wanderer's Run", 'Nomad Circuit', 'Open Drift', 'Ancient Passage',
    'Pilgrim Way', 'Roaming Expanse', 'Chart Void', 'Drifter Corridor',
  ],
};

/** Null/unclaimed system region name when no faction controls a sector. */
export const NULL_REGION_NAME = 'Unclaimed Space';
