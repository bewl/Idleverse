import type { FactionId } from '@/types/faction.types';
import type { NpcLootEntry } from '@/types/combat.types';

// ─── Per-faction, per-security NPC config ──────────────────────────────────

export interface NpcFactionSecurityConfig {
  factionId: FactionId;
  groupNames: string[];
  strengthRange: [number, number];
  bountyMultiplier: number;
  lootTable: NpcLootEntry[];
}

export const NPC_FACTION_CONFIGS_BY_SECURITY: Record<
  'lowsec' | 'nullsec',
  NpcFactionSecurityConfig[]
> = {
  lowsec: [
    {
      factionId: 'syndicate',
      groupNames: [
        'Serpentis Raider Squad',
        'Serpentis Patrol Wing',
        'Serpentis Assault Group',
        'Crimson Viper Squadron',
      ],
      strengthRange: [50, 200],
      bountyMultiplier: 800,
      lootTable: [
        { resourceId: 'ferrite',        chance: 0.70, minQty: 50,  maxQty: 200 },
        { resourceId: 'silite',         chance: 0.50, minQty: 30,  maxQty: 100 },
        { resourceId: 'hull-plate',     chance: 0.40, minQty: 1,   maxQty: 4   },
        { resourceId: 'condenser-coil', chance: 0.30, minQty: 1,   maxQty: 3   },
        { resourceId: 'shield-emitter', chance: 0.20, minQty: 1,   maxQty: 2   },
      ],
    },
    {
      factionId: 'veldris',
      groupNames: [
        'Angel Marauder Wing',
        'Angel Cartel Operatives',
        'Veldris Renegades',
        'Marauder Ambush Fleet',
      ],
      strengthRange: [60, 200],
      bountyMultiplier: 900,
      lootTable: [
        { resourceId: 'ferrite',        chance: 0.60, minQty: 60,  maxQty: 220 },
        { resourceId: 'vexirite',       chance: 0.40, minQty: 20,  maxQty: 80  },
        { resourceId: 'hull-plate',     chance: 0.35, minQty: 1,   maxQty: 3   },
        { resourceId: 'thruster-node',  chance: 0.25, minQty: 1,   maxQty: 2   },
        { resourceId: 'sensor-cluster', chance: 0.20, minQty: 1,   maxQty: 2   },
      ],
    },
  ],
  nullsec: [
    {
      factionId: 'syndicate',
      groupNames: [
        'Guristas Strike Wing',
        'Guristas Heavy Assault',
        'Guristas Command Frigate',
        'Guristas War Pack',
      ],
      strengthRange: [100, 500],
      bountyMultiplier: 1200,
      lootTable: [
        { resourceId: 'vexirite',       chance: 0.70, minQty: 80,  maxQty: 300 },
        { resourceId: 'isorium',        chance: 0.50, minQty: 40,  maxQty: 150 },
        { resourceId: 'hull-plate',     chance: 0.50, minQty: 2,   maxQty: 6   },
        { resourceId: 'shield-emitter', chance: 0.40, minQty: 2,   maxQty: 5   },
        { resourceId: 'sensor-cluster', chance: 0.35, minQty: 1,   maxQty: 4   },
        { resourceId: 'thruster-node',  chance: 0.30, minQty: 2,   maxQty: 4   },
      ],
    },
    {
      factionId: 'veldris',
      groupNames: [
        'Blood Raiders Command',
        'Blood Raider Battlegroup',
        'Crimson Death Wing',
        'Veldris Apex Raiders',
      ],
      strengthRange: [120, 500],
      bountyMultiplier: 1400,
      lootTable: [
        { resourceId: 'vexirite',       chance: 0.65, minQty: 100, maxQty: 350 },
        { resourceId: 'noxium',         chance: 0.50, minQty: 30,  maxQty: 120 },
        { resourceId: 'zyridium',       chance: 0.35, minQty: 10,  maxQty: 60  },
        { resourceId: 'hull-plate',     chance: 0.50, minQty: 3,   maxQty: 8   },
        { resourceId: 'shield-emitter', chance: 0.45, minQty: 2,   maxQty: 6   },
        { resourceId: 'condenser-coil', chance: 0.40, minQty: 2,   maxQty: 5   },
      ],
    },
  ],
};

/** [min, max] NPC group counts per security band. */
export const NPC_GROUP_COUNT_BY_SECURITY: Record<'lowsec' | 'nullsec', [number, number]> = {
  lowsec:  [1, 3],
  nullsec: [2, 5],
};

/** Minimum seconds between resolved combat engagements for a fleet. */
export const COMBAT_TICK_INTERVAL_SECONDS = 30;

/** Maximum entries retained in the fleet combat log. */
export const COMBAT_LOG_MAX_ENTRIES = 50;

/** Hours before a killed NPC group respawns [min, max]. */
export const NPC_RESPAWN_HOURS: [number, number] = [4, 12];
