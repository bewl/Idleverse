import type { FactionId } from './faction.types';\nimport type { Anomaly } from './game.types';

// ─── Galaxy / Travel types ─────────────────────────────────────────────────

export type StarType =
  | 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M'
  | 'neutron' | 'white-dwarf' | 'black-hole';

export type SystemSecurity = 'highsec' | 'lowsec' | 'nullsec';

export type BodyType =
  | 'rocky' | 'barren' | 'gas-giant' | 'ice-giant'
  | 'asteroid-belt' | 'moon' | 'water-world' | 'lava-world';

// ─── Celestial body ────────────────────────────────────────────────────────

export interface CelestialBody {
  /** Unique within the system, e.g. 'planet-1', 'belt-2'. */
  id: string;
  name: string;
  type: BodyType;
  /** Visual display radius in arbitrary units. */
  size: number;
  /** CSS color string for rendering. */
  color: string;
  /** Orbit radius — relative distance from star (for orrery display). */
  orbitRadius: number;
  /** Seconds for one full orbit (for CSS animation). */
  orbitPeriod: number;
  /** Ore belt IDs available in this body (only for asteroid-belt bodies). */
  beltIds: string[];
  /**
   * Per-belt richness multiplier (1.0 = nominal, >1 = richer, <1 = depleted).
   * Key matches beltId in beltIds.
   */
  richness: Record<string, number>;
}

// ─── Star system ───────────────────────────────────────────────────────────

export interface StarSystem {
  id: string;
  name: string;
  x: number;             // galaxy map coordinate [0, 1]
  y: number;             // galaxy map coordinate [0, 1]
  z: number;             // galactic elevation coordinate [0, 1] (0.5 = galactic plane)
  starType: StarType;
  security: SystemSecurity;
  /** CSS color for the star dot on galaxy map. */
  starColor: string;
  /** Star visual radius. */
  starSize: number;
  bodies: CelestialBody[];
  /** True if the player has visited this system at least once. */
  visited: boolean;
  /** True if the player has scanned the full system (all bodies revealed). */
  fullyScanned: boolean;
  /** ID of the NPC station in this system, or null if none. */
  stationId: string | null;
  /** Which faction controls / claims this system. null = unclaimed/disputed. */
  factionId: FactionId | null;
  /** Human-readable region name (e.g. "Concordat Space", "Null Fringe"). */
  regionName: string;
}

// ─── Galactic Sector ─────────────────────────────────────────────────────────

/** One cell of the galaxy's 8×8 navigational grid. Computed from system list — never stored. */
export interface GalacticSector {
  /** Unique key, e.g. 'sec-3-5' */
  id: string;
  /** Grid column [0, SECTOR_GRID_SIZE-1] */
  gridX: number;
  /** Grid row [0, SECTOR_GRID_SIZE-1] */
  gridY: number;
  /** IDs of star systems in this sector */
  systemIds: string[];
  systemCount: number;
  nullSecCount: number;
  lowSecCount: number;
  /** Total asteroid belt bodies across all systems in the sector */
  beltCount: number;
  /** True if any system contains rare null-sec ores */
  hasNullOres: boolean;
  /** Human-readable region name for the dominant territory in this sector. */
  regionName: string;
  /** Faction with the most systems in this sector, or null if evenly split. */
  dominantFactionId: FactionId | null;
}

// ─── Travel / Warp ─────────────────────────────────────────────────────────

export interface WarpState {
  fromSystemId: string;
  toSystemId: string;
  /** Unix-ms timestamp when warp started. */
  startedAt: number;
  /** Total warp duration in seconds. */
  durationSeconds: number;
  /** Progress 0–1 (derived on read, not stored as computed). */
  progress: number;
}

// ─── Galaxy meta ──────────────────────────────────────────────────────────

export interface GalaxyState {
  /** Global seed — all procedural content derives from this. */
  seed: number;
  /** ID of the current system the player is in. */
  currentSystemId: string;
  /** Active warp transit, or null when docked/stationary. */
  warp: WarpState | null;
  /** Per-system visited/scanned flags (not the full system data — that's derived). */
  visitedSystems: Record<string, boolean>;
  scannedSystems: Record<string, boolean>;
  /** Per-system, per-belt richness overrides (depleted from mining). Stored so
   *  planets being mined hold depletion state between sessions. */
  beltRichnessOverride: Record<string, Record<string, number>>;
  /** Z-slice position for the galaxy sector view [0, 1]. 0.5 = galactic plane. */
  galacticSliceZ: number;
  /** Per-NPC-group dead state. Entry present = group is dead until respawnAt (ms). */
  npcGroupStates: Record<string, { respawnAt: number }>;
  /**
   * Per-system, per-resource dynamic price pressure (1.0 = neutral).
   * Selling depresses pressure; buying raises it. Decays to 1.0 at 5%/hour.
   * Missing entry = 1.0.
   */
  systemPressure: Record<string, Record<string, number>>;
  /**
   * Per-system anomaly lists. Populated lazily on first scan.
   * Key = systemId, value = array of Anomaly objects.
   */
  anomalies: Record<string, Anomaly[]>;
}
