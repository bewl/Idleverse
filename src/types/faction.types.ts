// ─── Faction system types ──────────────────────────────────────────────────

/** The four playable / NPC civilizations in the galaxy. */
export type FactionId = 'concordat' | 'veldris' | 'syndicate' | 'covenant';

/**
 * Static definition for a faction — never changes at runtime.
 */
export interface FactionDefinition {
  id: FactionId;
  name: string;
  shortName: string;
  /** CSS hex color used on the map overlay and UI badges. */
  color: string;
  description: string;
  /** Starting reputation when a new game begins. */
  baseRep: number;
  /** Hard floor on reputation (player cannot go below this). */
  repMin: number;
  /** Hard cap on reputation. */
  repMax: number;
  /**
   * Radial distance from galaxy centre [0, 1] at which this faction
   * prefers to place stations.  0 = core, 1 = fringe.
   */
  territoryBias: number;
  /**
   * How aggressively this faction penalises hostile actions.
   * 1 = mild, 2 = standard, 3 = severe.
   */
  aggression: 1 | 2 | 3;
}

// ─── Stations ──────────────────────────────────────────────────────────────

export type StationServiceType =
  | 'market'       // buy/sell resources
  | 'recruiter'    // hire NPC pilots
  | 'factory'      // manufacturing with bonus
  | 'refit'        // fit/remove modules
  | 'repair'       // restore ship hp (future)
  | 'intel'        // reveal nearby systems on map
  | 'blackmarket'  // off-the-books trades (syndicate only)
  | 'hangar';      // ship storage

export interface StationDefinition {
  /** Stable deterministic ID, e.g. 'station-sys42'. */
  id: string;
  name: string;
  /** The system this station orbits. */
  systemId: string;
  factionId: FactionId;
  services: StationServiceType[];
  /** Credit cost to register this station for corp use. */
  registrationCost: number;
  /** Minimum standing required to register the station. */
  registrationRepRequired: number;
  /** Multiplier applied to buy/sell prices at this station (1.0 = neutral). */
  marketPriceModifier: number;
  /** Additive speed bonus to manufacturing jobs run here (0.15 = +15%). */
  manufacturingSpeedBonus: number;
  /** Minimum reputation required to dock here (-1000 = always open). */
  minRepToDock: number;
}

// ─── Player outposts ───────────────────────────────────────────────────────

export interface OutpostState {
  systemId: string;
  name: string;
  builtAt: number;       // ms timestamp
  level: number;         // 1–5
  storageBonus: number;  // additive fraction (0.5 = +50% local storage)
}

// ─── Fleet orders ──────────────────────────────────────────────────────────

/**
 * Governs which star systems an autonomous fleet route may traverse.
 *
 * - 'safest'      — prefer highest security (longercourse acceptable)
 * - 'shortest'    — pure hop count, ignore security rating
 * - 'avoid-null'  — skip nullsec systems entirely
 * - 'avoid-low'   — skip lowsec and nullsec (highsec only)
 */
export type RouteSecurityFilter = 'safest' | 'shortest' | 'avoid-null' | 'avoid-low';

/**
 * An active order issued to a ship.
 * Ships with a non-null fleetOrder will autonomously move toward the destination
 * one hop per tick cycle (governed by their warp speed).
 */
export interface FleetOrder {
  /** Target system ID. */
  destinationSystemId: string;
  /** Pre-computed route from issueFleetOrder(), a list of system IDs to traverse. */
  route: string[];
  /** Which hops have been completed (index into route). 0 = at origin, not yet moving. */
  currentLeg: number;
  securityFilter: RouteSecurityFilter;
  /** If true the ship will go idle on arrival rather than resuming previous activity. */
  pauseOnArrival: boolean;
  /**
   * Timestamp (ms) when the current leg departure began.
   * Used to smoothly interpolate the ship icon position on the galaxy map
   * between route[currentLeg] and route[currentLeg+1].
   */
  legDepartedAt: number;
}

// ─── Runtime reputation state ──────────────────────────────────────────────

export interface FactionsState {
  /** Player reputation per faction.  Range: repMin..repMax (see FactionDefinition). */
  rep: Record<FactionId, number>;
  /** ID of the NPC station the player is currently docked at (null = undocked). */
  dockedStationId: string | null;
  /** Player-built outposts, keyed by systemId. */
  outposts: Record<string, OutpostState>;
  /** Station ID designated as the corp HQ (null = no HQ set). */
  homeStationId: string | null;
  /** System ID of the corp HQ station (null = no HQ set). Stored alongside homeStationId for fast lookup. */
  homeStationSystemId: string | null;
  /** Station IDs the corp has registered with (includes homeStationId if set). */
  registeredStations: string[];
}
