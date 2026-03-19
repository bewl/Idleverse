// ─── Commander Skill Definitions ──────────────────────────────────────────
//
// These skills are trained by a pilot designated as Fleet Commander.
// They apply fleet-wide bonuses while the pilot holds the commander role.
// Training speed is 1.5× when the fleet is actively engaged (mining/combat/hauling).

export interface CommanderSkillDefinition {
  id: string;
  name: string;
  description: string;
  /** Per-level effect bonuses. Each entry is { key: modifier, value: additive per level }. */
  effectPerLevel: Array<{ key: string; value: number }>;
  /** Milestone unlocks granted at specific levels. Key = level (1–5). */
  milestones?: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
}

/**
 * Training time in seconds for each commander skill level (1–5).
 * Range: 2 h → 48 h, exponential doubling with a jump at L5.
 */
export const COMMANDER_SKILL_LEVEL_SECONDS: [number, number, number, number, number] = [
  7_200,    // L1 — 2 h
  14_400,   // L2 — 4 h
  28_800,   // L3 — 8 h
  57_600,   // L4 — 16 h
  172_800,  // L5 — 48 h
];

export const COMMANDER_SKILL_DEFINITIONS: Record<string, CommanderSkillDefinition> = {

  'mining-command': {
    id: 'mining-command',
    name: 'Mining Command',
    description: 'Increases fleet ore extraction efficiency. Each level applies a fleet-wide mining yield bonus.',
    effectPerLevel: [{ key: 'mining-yield', value: 0.04 }], // +4% per level → max +20%
    milestones: { 3: 'multi-belt-assignment' },
  },

  'combat-command': {
    id: 'combat-command',
    name: 'Combat Command',
    description: 'Boosts fleet DPS and improves fleet survivability in combat engagements.',
    effectPerLevel: [
      { key: 'fleet-dps',  value: 0.05 }, // +5% DPS per level → max +25%
      { key: 'fleet-tank', value: 0.03 }, // +3% tank per level → max +15%
    ],
    milestones: { 4: 'patrol-raid-combo' },
  },

  'logistics-command': {
    id: 'logistics-command',
    name: 'Logistics Command',
    description: 'Expands fleet cargo capacity, accelerates haul cycles, and tightens inter-system convoy execution.',
    effectPerLevel: [
      { key: 'commander-cargo-capacity', value: 0.08 }, // +8% per level → max +40%
      { key: 'haul-speed',               value: 0.05 }, // +5% haul speed per level → max +25%
      { key: 'cargo-transfer-speed',     value: 0.04 }, // +4% cargo transfer speed per level → max +20%
      { key: 'warp-speed',              value: 0.02 }, // +2% warp speed per level → max +10%
    ],
    milestones: { 3: 'fast-haul' },
  },

  'industrial-command': {
    id: 'industrial-command',
    name: 'Industrial Command',
    description: 'Improves on-site refining yield and industrial operations efficiency.',
    effectPerLevel: [{ key: 'on-site-refining-yield', value: 0.06 }], // +6% per level → max +30%
    milestones: { 2: 'ore-refinery-module' },
  },

  'recon-command': {
    id: 'recon-command',
    name: 'Recon Command',
    description: 'Amplifies fleet sensor arrays and reduces anomaly scan time.',
    effectPerLevel: [
      { key: 'scan-speed',         value: 0.10 }, // +10% scan strength per level → max +50%
      { key: 'signature-radius',   value: 0.08 }, // −8% effective sig radius per level → max −40%
    ],
    milestones: { 5: 'deep-space-probe' },
  },
};

/** Display labels for the bonus chips shown in the Fleet Commander UI. */
export const COMMANDER_BONUS_LABELS: Record<string, string> = {
  'mining-yield':            '⛏ Mining Yield',
  'fleet-dps':               '⚔ Fleet DPS',
  'fleet-tank':              '🛡 Fleet Tank',
  'commander-cargo-capacity': '📦 Cargo Cap',
  'haul-speed':              '🚀 Haul Speed',
  'cargo-transfer-speed':    '📤 Cargo Transfer',
  'warp-speed':              '🌀 Warp Speed',
  'on-site-refining-yield':  '♻ On-Site Refining',
  'scan-speed':              '◉ Scan Speed',
  'signature-radius':        '📡 Sig Reduction',
};
