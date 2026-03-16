import type { GameState } from '@/types/game.types';
import type { FactionId, FactionsState, OutpostState, StationDefinition } from '@/types/faction.types';
import type { StarSystem } from '@/types/galaxy.types';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import { FACTION_DEFINITIONS } from './faction.config';
import { getStationForSystem } from './station.gen';

export interface CorpHqBonus {
  id: string;
  label: string;
  description: string;
  manufacturingSpeedBonus?: number;
  marketSellPriceBonus?: number;
  combatLootQualityMultiplier?: number;
  miningYieldInFactionTerritory?: { factionId: FactionId; bonus: number };
}

export const OUTPOST_ID_PREFIX = 'outpost-';

export function getOutpostId(systemId: string): string {
  return `${OUTPOST_ID_PREFIX}${systemId}`;
}

export function isOutpostId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(OUTPOST_ID_PREFIX);
}

export function getOutpostDisplayName(systemName: string): string {
  return `${systemName} Outpost`;
}

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

export function getHomeStationDefinition(state: GameState): StationDefinition | null {
  const homeSystemId = state.systems.factions.homeStationSystemId;
  const homeStationId = state.systems.factions.homeStationId;
  if (!homeSystemId || !homeStationId) return null;
  if (isOutpostId(homeStationId)) return null;

  const system = getSystemById(state.galaxy.seed, homeSystemId);
  const systemIndex = homeSystemId === 'home' ? 0 : parseInt(homeSystemId.replace('sys-', ''), 10);
  const station = getStationInSystem(system, state.galaxy.seed, isNaN(systemIndex) ? 0 : systemIndex);
  if (!station || station.id !== homeStationId) return null;
  return station;
}

export function getOutpostInSystem(state: GameState, systemId: string): OutpostState | null {
  return state.systems.factions.outposts[systemId] ?? null;
}

export function getHomeOutpost(state: GameState): OutpostState | null {
  const homeSystemId = state.systems.factions.homeStationSystemId;
  const homeStationId = state.systems.factions.homeStationId;
  if (!homeSystemId || !homeStationId || !isOutpostId(homeStationId)) return null;
  const outpost = getOutpostInSystem(state, homeSystemId);
  if (!outpost || outpost.id !== homeStationId) return null;
  return outpost;
}

export function getCorpHqBonus(station: StationDefinition | null): CorpHqBonus | null {
  if (!station) return null;

  switch (station.factionId) {
    case 'concordat':
      return {
        id: 'concordat-industrial-charter',
        label: 'Concordat Industrial Charter',
        description: '+10% manufacturing speed while this station is your Corp HQ.',
        manufacturingSpeedBonus: 0.10,
      };
    case 'veldris':
      return {
        id: 'veldris-extraction-license',
        label: 'Veldris Extraction License',
        description: '+15% mining yield in Veldris-controlled systems while this station is your Corp HQ.',
        miningYieldInFactionTerritory: { factionId: 'veldris', bonus: 0.15 },
      };
    case 'syndicate':
      return {
        id: 'syndicate-salvage-channel',
        label: 'Syndicate Salvage Channel',
        description: '+20% combat loot quality while this station is your Corp HQ.',
        combatLootQualityMultiplier: 1.2,
      };
    case 'covenant':
      return {
        id: 'covenant-trade-accord',
        label: 'Covenant Trade Accord',
        description: '+10% market sell price while this station is your Corp HQ.',
        marketSellPriceBonus: 0.10,
      };
    default:
      return null;
  }
}

export function getCorpHqBonusFromState(state: GameState): CorpHqBonus | null {
  return getCorpHqBonus(getHomeStationDefinition(state));
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
