import type { FactionId } from './faction.types';

// ─── Combat orders ─────────────────────────────────────────────────────────

export type CombatOrderType = 'patrol' | 'raid';

export interface CombatOrder {
  type: CombatOrderType;
  /** Raid only — targeted NPC group ID. */
  targetGroupId?: string;
  /** Timestamp (ms) of last resolved combat engagement. Throttles combat ticks. */
  lastCombatAt: number;
}

// ─── NPC Groups ────────────────────────────────────────────────────────────

export interface NpcLootEntry {
  resourceId: string;
  /** Drop probability 0–1. */
  chance: number;
  minQty: number;
  maxQty: number;
}

export interface NpcGroupDef {
  id: string;
  systemId: string;
  name: string;
  factionId: FactionId;
  /** Effective combat strength. Fleet must overcome this to win. */
  strength: number;
  /** ISK bounty awarded on destruction. */
  bounty: number;
  lootTable: NpcLootEntry[];
}

// ─── Combat log ────────────────────────────────────────────────────────────

export interface CombatLogEntry {
  id: string;
  timestamp: number;
  fleetId: string;
  fleetName: string;
  systemId: string;
  systemName: string;
  npcName: string;
  victory: boolean;
  /** ISK bounty credited to the player. 0 on defeat. */
  bountyEarned: number;
  /** Resources looted. Empty on defeat. */
  lootGained: Record<string, number>;
  /** Average hull damage % applied to fleet ships this engagement. */
  avgHullDamage: number;
}
