/**
 * Procedural galaxy generation.
 *
 * Everything here is computed from a global seed + system index — nothing is stored
 * except the player's visit flags and depletion overrides in GalaxyState.
 *
 * Design notes:
 * - 120 systems spread across a normalised [0,1]² galaxy grid
 * - System 0 ("home") is fixed — New Aether, highsec, G-type star
 * - Star types determine security tier and ore body prevalence
 * - Each system has 2–7 celestial bodies; asteroid belts carry ore templates
 * - Belt IDs map to the same belt-template IDs in mining.config so the mining
 *   system can gate them by skill without any changes to that system
 */

import type { StarSystem, CelestialBody, StarType, SystemSecurity, BodyType, GalacticSector } from '@/types/galaxy.types';
import type { FactionId } from '@/types/faction.types';
import {
  mulberry32, childSeed, randInt, randFloat, randPick, randWeighted,
} from '@/game/utils/prng';
import { REGION_NAMES, NULL_REGION_NAME } from '@/game/systems/factions/faction.config';

// ─── Configuration ─────────────────────────────────────────────────────────

export const GALAXY_SYSTEM_COUNT = 400;

/** Number of sector grid columns/rows (8×8 = 64 sectors). */
export const SECTOR_GRID_SIZE = 8;

/** Galaxy width in light-years (1 galaxy unit = GALAXY_WIDTH_LY). */
export const GALAXY_WIDTH_LY = 200;

/** Minimum jump distance to prevent over-clustering. */
const MIN_SYSTEM_SPACING = 0.024;

// ─── Star type metadata ────────────────────────────────────────────────────

const STAR_META: Record<StarType, { color: string; size: number; security: Array<{ value: SystemSecurity; weight: number }> }> = {
  'O':          { color: '#a0c4ff', size: 14, security: [{ value: 'nullsec', weight: 5 }, { value: 'lowsec', weight: 3 }, { value: 'highsec', weight: 1 }] },
  'B':          { color: '#c7e1ff', size: 13, security: [{ value: 'nullsec', weight: 3 }, { value: 'lowsec', weight: 4 }, { value: 'highsec', weight: 1 }] },
  'A':          { color: '#ddeeff', size: 12, security: [{ value: 'lowsec', weight: 3 }, { value: 'highsec', weight: 3 }, { value: 'nullsec', weight: 2 }] },
  'F':          { color: '#fffacd', size: 11, security: [{ value: 'highsec', weight: 4 }, { value: 'lowsec', weight: 3 }, { value: 'nullsec', weight: 1 }] },
  'G':          { color: '#ffe47a', size: 10, security: [{ value: 'highsec', weight: 6 }, { value: 'lowsec', weight: 2 }, { value: 'nullsec', weight: 1 }] },
  'K':          { color: '#ffb347', size: 9,  security: [{ value: 'highsec', weight: 5 }, { value: 'lowsec', weight: 3 }, { value: 'nullsec', weight: 1 }] },
  'M':          { color: '#ff6b47', size: 8,  security: [{ value: 'highsec', weight: 3 }, { value: 'lowsec', weight: 4 }, { value: 'nullsec', weight: 2 }] },
  'neutron':    { color: '#c0eeff', size: 6,  security: [{ value: 'nullsec', weight: 9 }, { value: 'lowsec', weight: 1 }, { value: 'highsec', weight: 0 }] },
  'white-dwarf':{ color: '#e8f0ff', size: 5,  security: [{ value: 'nullsec', weight: 5 }, { value: 'lowsec', weight: 3 }, { value: 'highsec', weight: 1 }] },
  'black-hole': { color: '#6030a0', size: 18, security: [{ value: 'nullsec', weight: 10 }, { value: 'lowsec', weight: 0 }, { value: 'highsec', weight: 0 }] },
};

// Weighted pool for random star type rolling (skew toward common M/K/G)
const STAR_TYPE_POOL: Array<{ value: StarType; weight: number }> = [
  { value: 'M',          weight: 22 },
  { value: 'K',          weight: 18 },
  { value: 'G',          weight: 14 },
  { value: 'F',          weight: 10 },
  { value: 'A',          weight: 8  },
  { value: 'B',          weight: 5  },
  { value: 'O',          weight: 3  },
  { value: 'white-dwarf',weight: 4  },
  { value: 'neutron',    weight: 3  },
  { value: 'black-hole', weight: 2  },
];

// ─── Ore belts by security tier ───────────────────────────────────────────

const HIGHSEC_BELTS  = ['belt-ferrock', 'belt-corite', 'belt-silisite', 'belt-platonite'];
const LOWSEC_BELTS   = ['belt-darkstone', 'belt-hematite', 'belt-voidite', 'belt-ionite'];
const NULLSEC_BELTS  = ['belt-arkonite', 'belt-crokitite'];

/** Returns which ore belt IDs are available in a system of a given security tier. */
export function getBeltsForSecurity(security: SystemSecurity): string[] {
  switch (security) {
    case 'highsec': return HIGHSEC_BELTS;
    case 'lowsec':  return [...HIGHSEC_BELTS, ...LOWSEC_BELTS];
    case 'nullsec': return [...HIGHSEC_BELTS, ...LOWSEC_BELTS, ...NULLSEC_BELTS];
  }
}

// ─── Body colours ─────────────────────────────────────────────────────────

const ROCKY_COLOURS  = ['#a89070', '#8c7a6b', '#b09a80', '#9c8878', '#7a6a58'];
const GAS_COLOURS    = ['#e8c878', '#d4a860', '#f0d890', '#c8a050', '#e0b870'];
const ICE_COLOURS    = ['#a8d8f0', '#b8e8ff', '#90c8e8', '#c0ddf0', '#a0ccee'];
const LAVA_COLOURS   = ['#e8521c', '#c04010', '#e86030', '#f07040', '#d04820'];
const WATER_COLOURS  = ['#4090d8', '#3878c8', '#50a0e8', '#2868b8', '#4888d0'];
const BARREN_COLOURS = ['#888890', '#787888', '#a0a0b0', '#909098', '#70707a'];
const BELT_COLOURS   = ['#a08868', '#b09878', '#907858', '#887050', '#c0a880'];
const MOON_COLOURS   = ['#b0b0c0', '#a8a8b8', '#c0c0d0', '#909098', '#a0a0b0'];

function bodyColor(rng: () => number, type: BodyType): string {
  switch (type) {
    case 'rocky':         return randPick(rng, ROCKY_COLOURS);
    case 'barren':        return randPick(rng, BARREN_COLOURS);
    case 'gas-giant':     return randPick(rng, GAS_COLOURS);
    case 'ice-giant':     return randPick(rng, ICE_COLOURS);
    case 'lava-world':    return randPick(rng, LAVA_COLOURS);
    case 'water-world':   return randPick(rng, WATER_COLOURS);
    case 'asteroid-belt': return randPick(rng, BELT_COLOURS);
    case 'moon':          return randPick(rng, MOON_COLOURS);
  }
}

// ─── Name generation ──────────────────────────────────────────────────────

const NAME_PREFIXES = [
  'Aether', 'Vela', 'Pyrax', 'Nova', 'Zeta', 'Keth', 'Sol', 'Eris',
  'Nyx', 'Arkon', 'Cygni', 'Lyra', 'Drakon', 'Velar', 'Omex', 'Tharsis',
  'Korvan', 'Iridus', 'Xanthis', 'Pell', 'Rixa', 'Turax', 'Braxis',
  'Myron', 'Vorena', 'Helion', 'Sindra', 'Kalar', 'Zondra', 'Arix',
  'Helix', 'Cetus', 'Ulrix', 'Pharon', 'Vanos', 'Kyris', 'Delphi',
  'Ixara', 'Thorun', 'Pyroth', 'Velkan', 'Noval', 'Soran', 'Aquila',
  'Cephis', 'Mundra', 'Raxton', 'Thyris', 'Ostara', 'Luxar',
  'Meridian', 'Arctis', 'Corvus', 'Fenrix', 'Garant', 'Helkon',
  'Ikarix', 'Joral', 'Kroval', 'Lygos', 'Marix', 'Nexara',
];

const NAME_SUFFIXES = [
  'Prime', 'Minor', 'Alpha', 'Beta', 'Gamma', 'Delta',
  'Major', 'Ultima', 'Proxima', 'Secundus', 'Tertius',
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII',
  'A', 'B', 'C', 'Core', 'Reach', 'Deep', 'Void',
  'Expanse', 'Station', 'Gate', 'Passage', 'Junction',
  'Point', 'Relay', 'Bastion', 'Drift', 'Frontier',
  'Haven', 'Nexus', 'Hold', 'Verge', 'Crossing',
];

function generateSystemName(rng: () => number, index: number): string {
  if (index === 0) return 'New Aether';
  const prefix = randPick(rng, NAME_PREFIXES);
  const suffix = randPick(rng, NAME_SUFFIXES);
  return `${prefix} ${suffix}`;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// ─── Position generation ──────────────────────────────────────────────────

/**
 * Generates galaxy positions using a jittered Poisson-disc–inspired approach:
 * partition [0,1]² into a grid, jitter within each cell, then shuffle.
 * Ensures no two systems are closer than MIN_SYSTEM_SPACING.
 * Z coordinates are generated independently to give galactic elevation spread.
 */
export function generateGalaxyPositions(seed: number, count: number): Array<{ x: number; y: number; z: number }> {
  const rng = mulberry32(seed ^ 0xdeadbeef);
  const positions: Array<{ x: number; y: number; z: number }> = [];

  // Home system always at galactic-plane centre
  positions.push({ x: 0.5, y: 0.5, z: 0.5 });

  // Separate Z RNG so XY spacing logic is identical to previous version
  const zRng = mulberry32(seed ^ 0xf00dcafe);

  let attempts = 0;
  while (positions.length < count && attempts < count * 50) {
    attempts++;
    const x = randFloat(rng, 0.03, 0.97);
    const y = randFloat(rng, 0.03, 0.97);
    const tooClose = positions.some(p => {
      const dx = p.x - x, dy = p.y - y;
      return Math.sqrt(dx * dx + dy * dy) < MIN_SYSTEM_SPACING;
    });
    // Z is Gaussian-ish: mostly near the galactic plane (0.5) with tails
    const z = Math.max(0.05, Math.min(0.95, 0.5 + (randFloat(zRng, -1, 1) * 0.28)));
    if (!tooClose) positions.push({ x, y, z });
  }

  // Pad with random if we ran out of attempts
  while (positions.length < count) {
    const z = Math.max(0.05, Math.min(0.95, 0.5 + (randFloat(zRng, -1, 1) * 0.28)));
    positions.push({ x: randFloat(rng, 0.03, 0.97), y: randFloat(rng, 0.03, 0.97), z });
  }

  return positions;
}

// ─── System generation ────────────────────────────────────────────────────

// ─── Radial security + faction assignment ─────────────────────────────────

/**
 * Compute security tier from radial distance from galactic centre (0.5, 0.5).
 * Extreme star types (black-hole, neutron) always force nullsec.
 */
function radialSecurity(
  rng: () => number,
  dist: number,
  starType: StarType,
): SystemSecurity {
  // Exotic objects are always dangerous regardless of location
  if (starType === 'black-hole') return 'nullsec';
  if (starType === 'neutron') return rng() < 0.88 ? 'nullsec' : 'lowsec';

  // Add some geographic jitter so boundaries aren't razor-sharp
  const jitter = randFloat(rng, -0.07, 0.07);
  const d = Math.max(0, dist + jitter);

  if (d < 0.28) {
    const r = rng();
    if (r < 0.72) return 'highsec';
    if (r < 0.92) return 'lowsec';
    return 'nullsec';
  } else if (d < 0.46) {
    const r = rng();
    if (r < 0.32) return 'highsec';
    if (r < 0.70) return 'lowsec';
    return 'nullsec';
  } else {
    const r = rng();
    if (r < 0.10) return 'highsec';
    if (r < 0.28) return 'lowsec';
    return 'nullsec';
  }
}

/**
 * Assign a faction to a system based on its radial distance from the core.
 * Returns null for unclaimed/contested systems.
 */
function assignFaction(rng: () => number, dist: number): FactionId | null {
  const r = rng();
  if (dist < 0.22) {
    // Core — Concordat dominant
    if (r < 0.65) return 'concordat';
    if (r < 0.82) return 'covenant';
    if (r < 0.89) return 'veldris';
    return null;
  } else if (dist < 0.36) {
    // Transition zone around the core
    if (r < 0.30) return 'concordat';
    if (r < 0.58) return 'veldris';
    if (r < 0.76) return 'covenant';
    if (r < 0.82) return 'syndicate';
    return null;
  } else if (dist < 0.50) {
    // Mid-fringe — Veldris and Syndicate compete
    if (r < 0.38) return 'veldris';
    if (r < 0.62) return 'syndicate';
    if (r < 0.77) return 'covenant';
    if (r < 0.82) return 'concordat';
    return null;
  } else {
    // Deep fringe — Syndicate dominant, Covenant nomads, mostly unclaimed
    if (r < 0.52) return 'syndicate';
    if (r < 0.67) return 'covenant';
    return null;
  }
}

/** Pick a region name deterministically for a faction + numeric hash. */
function pickRegionName(rng: () => number, factionId: FactionId | null): string {
  if (!factionId) return NULL_REGION_NAME;
  const names = REGION_NAMES[factionId];
  return names[Math.floor(rng() * names.length)];
}

// ─── Station probability per faction ──────────────────────────────────────
const STATION_PROBABILITY: Record<FactionId, number> = {
  concordat: 0.72,
  veldris:   0.60,
  syndicate: 0.50,
  covenant:  0.45,
};

/** Generate a single star system from the global seed and its index. */
export function generateSystem(
  globalSeed: number,
  index: number,
  x: number,
  y: number,
  z = 0.5,
): StarSystem {
  const rng = mulberry32(childSeed(globalSeed, index * 31337 + 17));

  // ── Home system is always fixed ──────────────────────────────────────
  if (index === 0) {
    return buildHomeSystem(x, y, z);
  }

  const starType: StarType = randWeighted(rng, STAR_TYPE_POOL);
  const meta = STAR_META[starType];

  // Radial distance from galactic centre [0,1] — drives security + faction
  const dx = x - 0.5, dy = y - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const security: SystemSecurity = radialSecurity(rng, dist, starType);
  const factionId: FactionId | null = assignFaction(rng, dist);

  const regionName = pickRegionName(rng, factionId);

  // Station: only faction-claimed systems can have a station
  const hasStation = factionId !== null && rng() < STATION_PROBABILITY[factionId];
  const stationId = hasStation ? `station-sys-${index}` : null;

  const name = generateSystemName(rng, index);
  const bodies = generateBodies(rng, security, name);

  return {
    id: `sys-${index}`,
    name,
    x, y, z,
    starType,
    security,
    starColor: meta.color,
    starSize:  meta.size,
    bodies,
    visited: false,
    fullyScanned: false,
    factionId,
    stationId,
    regionName,
  };
}

/** The home system is always the same — New Aether, highsec, G-type. */
function buildHomeSystem(x: number, y: number, z = 0.5): StarSystem {
  return {
    id: 'home',
    name: 'New Aether',
    x, y, z,
    starType: 'G',
    security: 'highsec',
    starColor: STAR_META.G.color,
    starSize: STAR_META.G.size,
    factionId: 'concordat',
    stationId: 'station-home',
    regionName: 'Aether Reach',
    bodies: [
      {
        id: 'home-planet-1',
        name: 'New Aether I',
        type: 'rocky',
        size: 14,
        color: '#c8a878',
        orbitRadius: 110,
        orbitPeriod: 58,
        beltIds: [],
        richness: {},
      },
      {
        id: 'home-belt-1',
        name: 'New Aether Belt Alpha',
        type: 'asteroid-belt',
        size: 6,
        color: '#a08858',
        orbitRadius: 165,
        orbitPeriod: 0,
        beltIds: ['belt-ferrock', 'belt-corite'],
        richness: { 'belt-ferrock': 1.0, 'belt-corite': 0.9 },
      },
      {
        id: 'home-planet-2',
        name: 'New Aether II',
        type: 'gas-giant',
        size: 22,
        color: '#e8c060',
        orbitRadius: 230,
        orbitPeriod: 140,
        beltIds: [],
        richness: {},
      },
      {
        id: 'home-belt-2',
        name: 'New Aether Belt Beta',
        type: 'asteroid-belt',
        size: 5,
        color: '#907858',
        orbitRadius: 300,
        orbitPeriod: 0,
        beltIds: ['belt-silisite', 'belt-platonite'],
        richness: { 'belt-silisite': 1.1, 'belt-platonite': 0.8 },
      },
      {
        id: 'home-planet-3',
        name: 'New Aether III',
        type: 'water-world',
        size: 13,
        color: '#4090d8',
        orbitRadius: 380,
        orbitPeriod: 220,
        beltIds: [],
        richness: {},
      },
    ],
    visited: true,
    fullyScanned: true,
  };
}

/** Generate 2–7 celestial bodies for a system. */
function generateBodies(
  rng: () => number,
  security: SystemSecurity,
  systemName: string,
): CelestialBody[] {
  const available = getBeltsForSecurity(security);
  const bodyCount = randInt(rng, 2, 7);
  const bodies: CelestialBody[] = [];

  // Determine how many asteroid belts to include (1–3)
  const beltCount = randInt(rng, 1, Math.min(3, available.length));

  // Choose which ore belts appear in this system
  const systemBeltIds = shuffled(rng, available).slice(0, randInt(rng, beltCount, Math.min(available.length, beltCount + 2)));

  let orbitRadius = randFloat(rng, 90, 130);
  let beltIndex = 0;

  const planetTypes: BodyType[] = ['rocky', 'barren', 'gas-giant', 'ice-giant', 'lava-world', 'water-world'];

  for (let i = 0; i < bodyCount; i++) {
    orbitRadius += randFloat(rng, 60, 120);
    const period = Math.floor(orbitRadius * 0.7 + randFloat(rng, 0, 40));

    // Decide if this slot is an asteroid belt
    const isAsteroidBelt = beltIndex < systemBeltIds.length && (
      rng() < (beltIndex === 0 ? 0.55 : 0.35) || i === bodyCount - 1 - (systemBeltIds.length - 1 - beltIndex)
    );

    if (isAsteroidBelt) {
      // Pack up to 2 belt templates into this body
      const beltsHere: string[] = [];
      while (beltIndex < systemBeltIds.length && beltsHere.length < 2) {
        beltsHere.push(systemBeltIds[beltIndex++]);
      }
      const richness: Record<string, number> = {};
      for (const bid of beltsHere) {
        richness[bid] = randFloat(rng, 0.6, 1.8);
      }
      bodies.push({
        id: `body-belt-${i}`,
        name: `${systemName} Belt ${ROMAN[i] ?? i + 1}`,
        type: 'asteroid-belt',
        size: randInt(rng, 4, 7),
        color: bodyColor(rng, 'asteroid-belt'),
        orbitRadius,
        orbitPeriod: 0,
        beltIds: beltsHere,
        richness,
      });
    } else {
      const type = randPick(rng, planetTypes);
      const hasMoon = rng() < 0.35 && bodies.length < bodyCount - 1;
      bodies.push({
        id: `body-${i}`,
        name: `${systemName} ${ROMAN[i] ?? i + 1}`,
        type,
        size: type === 'gas-giant' || type === 'ice-giant' ? randInt(rng, 18, 28) : randInt(rng, 8, 16),
        color: bodyColor(rng, type),
        orbitRadius,
        orbitPeriod: period,
        beltIds: [],
        richness: {},
      });
      if (hasMoon) {
        orbitRadius += 20;
        bodies.push({
          id: `body-${i}-moon`,
          name: `${systemName} ${ROMAN[i] ?? i + 1}a`,
          type: 'moon',
          size: randInt(rng, 4, 8),
          color: bodyColor(rng, 'moon'),
          orbitRadius: orbitRadius - 15,
          orbitPeriod: Math.floor(period * 0.22),
          beltIds: [],
          richness: {},
        });
      }
    }
  }

  // Flush remaining belt slots if any
  while (beltIndex < systemBeltIds.length) {
    orbitRadius += randFloat(rng, 60, 100);
    const beltsHere: string[] = [systemBeltIds[beltIndex++]];
    const richness: Record<string, number> = {};
    richness[beltsHere[0]] = randFloat(rng, 0.5, 1.6);
    bodies.push({
      id: `body-belt-extra-${beltIndex}`,
      name: `${systemName} Outer Belt`,
      type: 'asteroid-belt',
      size: 5,
      color: bodyColor(rng, 'asteroid-belt'),
      orbitRadius,
      orbitPeriod: 0,
      beltIds: beltsHere,
      richness,
    });
  }

  return bodies;
}

function shuffled<T>(rng: () => number, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Galaxy-level helpers ──────────────────────────────────────────────────

/** Full generated galaxy (all systems). Memoised externally — call once per seed. */
export function generateGalaxy(seed: number): StarSystem[] {
  const positions = generateGalaxyPositions(seed, GALAXY_SYSTEM_COUNT);
  return positions.map((pos, i) => generateSystem(seed, i, pos.x, pos.y, pos.z));
}

/** Get a single system by numeric index — cheaper than generating all. */
export function getSystemByIndex(seed: number, index: number): StarSystem {
  const positions = generateGalaxyPositions(seed, GALAXY_SYSTEM_COUNT);
  const pos = positions[index] ?? { x: 0.5, y: 0.5, z: 0.5 };
  return generateSystem(seed, index, pos.x, pos.y, pos.z);
}

/** Get a system by ID ('home' returns index 0, 'sys-N' returns index N). */
export function getSystemById(seed: number, id: string): StarSystem {
  const index = id === 'home' ? 0 : parseInt(id.replace('sys-', ''), 10);
  return getSystemByIndex(seed, isNaN(index) ? 0 : index);
}

/** All belt IDs present in a system. */
export function getSystemBeltIds(system: StarSystem): string[] {
  return system.bodies.flatMap(b => b.beltIds);
}

/** Distance in normalised units between two systems (2D navplane, not including Z elevation). */
export function systemDistance(a: StarSystem, b: StarSystem): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Sector helpers ─────────────────────────────────────────────────────────────────────

/** Stable sector ID from grid column/row. */
export function sectorId(gx: number, gy: number): string {
  return `sec-${gx}-${gy}`;
}

/** Return which sector cell a system belongs to. */
export function systemSector(sys: StarSystem): { gx: number; gy: number } {
  const gx = Math.min(SECTOR_GRID_SIZE - 1, Math.floor(sys.x * SECTOR_GRID_SIZE));
  const gy = Math.min(SECTOR_GRID_SIZE - 1, Math.floor(sys.y * SECTOR_GRID_SIZE));
  return { gx, gy };
}

/** NULL_SEC ore belt IDs for determining sector richness. */
const NULL_ORE_IDS = new Set(['belt-arkonite', 'belt-crokitite']);

/**
 * Build the full sector grid from a generated galaxy.
 * Returns all populated sectors (no empty sector objects are emitted).
 */
export function buildSectors(systems: StarSystem[]): GalacticSector[] {
  const map = new Map<string, GalacticSector>();

  // First pass: accumulate counts and faction tallies
  const factionCounts = new Map<string, Map<FactionId, number>>();

  for (const sys of systems) {
    const { gx, gy } = systemSector(sys);
    const id = sectorId(gx, gy);
    if (!map.has(id)) {
      map.set(id, {
        id, gridX: gx, gridY: gy,
        systemIds: [], systemCount: 0,
        nullSecCount: 0, lowSecCount: 0,
        beltCount: 0, hasNullOres: false,
        regionName: NULL_REGION_NAME,
        dominantFactionId: null,
      });
      factionCounts.set(id, new Map());
    }
    const sector = map.get(id)!;
    sector.systemIds.push(sys.id);
    sector.systemCount++;
    if (sys.security === 'nullsec') sector.nullSecCount++;
    if (sys.security === 'lowsec')  sector.lowSecCount++;
    const beltBodies = sys.bodies.filter(b => b.type === 'asteroid-belt');
    sector.beltCount += beltBodies.length;
    if (beltBodies.some(b => b.beltIds.some(bid => NULL_ORE_IDS.has(bid)))) {
      sector.hasNullOres = true;
    }
    // Tally faction presence
    if (sys.factionId) {
      const counts = factionCounts.get(id)!;
      counts.set(sys.factionId, (counts.get(sys.factionId) ?? 0) + 1);
    }
  }

  // Second pass: compute dominantFactionId and regionName from tallies
  for (const [id, sector] of map.entries()) {
    const counts = factionCounts.get(id)!;
    let best: FactionId | null = null;
    let bestCount = 0;
    for (const [fid, cnt] of counts.entries()) {
      if (cnt > bestCount) { bestCount = cnt; best = fid; }
    }
    sector.dominantFactionId = best;
    // Region name comes from the dominant faction; ties fall back to NULL_REGION_NAME
    if (best) {
      const names = REGION_NAMES[best];
      // Stable index from sector grid position
      const nameIdx = (sector.gridX * 3 + sector.gridY * 7) % names.length;
      sector.regionName = names[nameIdx];
    }
  }

  return Array.from(map.values());
}
