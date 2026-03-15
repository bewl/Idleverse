import type { FactionId, FactionsState, StationDefinition } from '@/types/faction.types';
import type { StarSystem } from '@/types/galaxy.types';
import { FACTION_DEFINITIONS } from './faction.config';
import { getStationForSystem } from './station.gen';

// ─── Reputation helpers ────────────────────────────────────────────────────

/** Clamp reputation to its faction-defined bounds. */
export function clampRep(factionId: FactionId, rep: number): number {
  const def = FACTION_DEFINITIONS[factionId];
  return Math.max(def.repMin, Math.min(def.repMax, rep));
}

/**
 * Apply a reputation delta and return a new FactionsState.
 * Automatically clamps to faction bounds.
 */
export function adjustRep(
  factions: FactionsState,
  factionId: FactionId,
  delta: number,
): FactionsState {
  const current = factions.rep[factionId] ?? 0;
  return {
    ...factions,
    rep: {
      ...factions.rep,
      [factionId]: clampRep(factionId, current + delta),
    },
  };
}

// ─── Standing labels ───────────────────────────────────────────────────────

export type StandingLabel =
  | 'Neutral'
  | 'Friendly'
  | 'Trusted'
  | 'Allied'
  | 'Hostile'
  | 'Nemesis';

/**
 * Convert a numeric reputation to a human-readable standing label.
 * Used in the UI for tooltips and faction panels.
 */
export function getStandingLabel(rep: number): StandingLabel {
  if (rep >= 800)  return 'Allied';
  if (rep >= 500)  return 'Trusted';
  if (rep >= 100)  return 'Friendly';
  if (rep >= -100) return 'Neutral';
  if (rep >= -600) return 'Hostile';
  return 'Nemesis';
}

/** CSS color class for a given reputation number (Tailwind classes). */
export function getRepColor(rep: number): string {
  if (rep >= 800)  return 'text-emerald-400';
  if (rep >= 500)  return 'text-green-400';
  if (rep >= 100)  return 'text-sky-400';
  if (rep >= -100) return 'text-slate-400';
  if (rep >= -600) return 'text-orange-400';
  return 'text-red-500';
}

// ─── Docking ───────────────────────────────────────────────────────────────

/**
 * Returns true if the player can dock at the given station.
 * Requires standing above the station's minimum rep requirement.
 */
export function canDock(
  factions: FactionsState,
  station: Pick<StationDefinition, 'factionId' | 'minRepToDock'>,
): boolean {
  const rep = factions.rep[station.factionId] ?? 0;
  return rep >= station.minRepToDock;
}

/**
 * Dock the player at a station.
 * Returns null if docking is not allowed (rep too low).
 */
export function dockAtStation(
  factions: FactionsState,
  station: StationDefinition,
): FactionsState | null {
  if (!canDock(factions, station)) return null;
  return { ...factions, dockedStationId: station.id };
}

/** Undock from the current station. */
export function undockFromStation(factions: FactionsState): FactionsState {
  return { ...factions, dockedStationId: null };
}

// ─── Station lookup ────────────────────────────────────────────────────────

/**
 * Get a station definition for a system if one exists.
 * Returns null for systems without stations (stationId === null).
 */
export function getStationInSystem(
  system: StarSystem,
  galaxySeed: number,
  systemIndex: number,
): StationDefinition | null {
  if (!system.stationId || !system.factionId) return null;
  return getStationForSystem(system, system.factionId, systemIndex, galaxySeed);
}

// ─── Aggression & engagement ───────────────────────────────────────────────

/**
 * Whether the given faction should engage the player on sight given current rep.
 * Only factions with aggression >= 2 and hostile standing will attack.
 */
export function isFactionHostileToPlayer(
  factions: FactionsState,
  factionId: FactionId,
): boolean {
  const def = FACTION_DEFINITIONS[factionId];
  const rep = factions.rep[factionId] ?? 0;
  return def.aggression >= 2 && rep <= -500;
}

// ─── Rep gain presets ─────────────────────────────────────────────────────

/**
 * Preset rep deltas for common player actions.
 * Call adjustRep() with these values in appropriate game events.
 */
export const REP_EVENTS = {
  /** Complete a legal trade at a faction station. */
  TRADE_AT_STATION: 1,
  /** Complete a mission issued by faction agents. */
  COMPLETE_MISSION: 50,
  /** Mine in faction-controlled space (minor goodwill). */
  MINE_IN_TERRITORY: 0.5,
  /** Destroy a faction ship (hostile). */
  DESTROY_FACTION_SHIP: -100,
  /** Smuggle past a faction patrol. */
  CONTRABAND_RUN: -25,
  /** Syndicate-specific: complete a black-market delivery. */
  SYNDICATE_DELIVERY: 75,
  /** Explore and share data with Covenant scouts. */
  COVENANT_SCAN_SHARE: 30,
} as const;
