/**
 * Anomaly generation for Phase 4 – Exploration & Anomaly Scanning.
 *
 * Anomalies are generated lazily per system, seeded from the system ID + a
 * daily day-number so they re-roll every in-game day while a fleet is scanning.
 */

import type { Anomaly, AnomalyType } from '@/types/game.types';
import type { SystemSecurity } from '@/types/galaxy.types';

// ─── Seeded RNG (LCG) ─────────────────────────────────────────────────────

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return function rng() {
    state = Math.imul(state, 1664525) + 1013904223;
    return (state >>> 0) / 0x100000000;
  };
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ─── Tables ───────────────────────────────────────────────────────────────

const ANOMALY_POOLS: Record<SystemSecurity, AnomalyType[]> = {
  highsec: ['ore-pocket', 'ore-pocket', 'data-site', 'data-site', 'relic-site'],
  lowsec:  ['ore-pocket', 'data-site', 'relic-site', 'relic-site', 'combat-site', 'combat-site'],
  nullsec: ['relic-site', 'combat-site', 'combat-site', 'wormhole', 'data-site'],
};

const COUNT_RANGES: Record<SystemSecurity, [number, number]> = {
  highsec: [0, 2],
  lowsec:  [1, 3],
  nullsec: [2, 4],
};

const ANOMALY_NAMES: Record<AnomalyType, string[]> = {
  'ore-pocket':  ['Dense Asteroid Cluster', 'Hidden Ore Pocket', 'Uncharted Belt Fragment', 'Drifting Mineral Vein'],
  'data-site':   ['Derelict Data Node', 'Abandoned Research Cache', 'Corrupted Signal Array', 'Digital Vault Wreck'],
  'relic-site':  ['Ancient Ruins', 'Pre-War Structure', 'Derelict Outpost', 'Abandoned Wreck Field'],
  'combat-site': ['Pirate Outpost', 'Hidden Raider Nest', 'Insurgent Staging Ground', 'Black Site Facility'],
  'wormhole':    ['Spatial Rift', 'Unstable Wormhole', 'Subspace Tunnel', 'Quantum Anomaly'],
};

/** Signature radius range [min, max]. Lower = smaller = harder to scan. */
const SIGNATURE_RADIUS: Record<AnomalyType, [number, number]> = {
  'ore-pocket':  [40, 80],
  'data-site':   [15, 40],
  'relic-site':  [10, 30],
  'combat-site': [50, 90],
  'wormhole':    [5,  20],
};

/** Wormhole mass range [min, max] in arbitrary units. */
const WORMHOLE_MASS_RANGE: [number, number] = [1000, 5000];

/** Wormhole lifetime range [min, max] in hours. */
const WORMHOLE_LIFETIME_RANGE: [number, number] = [12, 48];

// ─── Day index helper ─────────────────────────────────────────────────────

/** Returns the current game-day integer (days since epoch). */
export function getGameDay(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 86_400_000);
}

// ─── Main generator ───────────────────────────────────────────────────────

/**
 * Generate a deterministic set of anomalies for a system.
 *
 * @param systemId     Target star system ID.
 * @param security     Security tier of the system.
 * @param daySeed      Changes daily so anomalies re-roll when a fleet scans.
 * @param allSystemIds Full list of system IDs for wormhole destination picking.
 * @param nowMs        Current time in ms (for wormhole expiry calculation).
 */
export function generateAnomalies(
  systemId: string,
  security: SystemSecurity,
  daySeed: number,
  allSystemIds: string[],
  nowMs: number = Date.now(),
): Anomaly[] {
  const seed = (hashString(systemId) ^ daySeed) >>> 0;
  const rng  = seededRng(seed);

  const [minCount, maxCount] = COUNT_RANGES[security];
  const count = minCount + Math.floor(rng() * (maxCount - minCount + 1));

  const pool = ANOMALY_POOLS[security];
  const anomalies: Anomaly[] = [];

  for (let i = 0; i < count; i++) {
    const type           = pool[Math.floor(rng() * pool.length)] as AnomalyType;
    const nameList       = ANOMALY_NAMES[type];
    const name           = nameList[Math.floor(rng() * nameList.length)];
    const [minSig, maxSig] = SIGNATURE_RADIUS[type];
    const signatureRadius  = minSig + Math.floor(rng() * (maxSig - minSig + 1));

    // Wormhole extras
    let linkedSystemId: string | null = null;
    let massRemaining:  number | null = null;
    let expiresAt:      number | null = null;

    if (type === 'wormhole') {
      const candidates = allSystemIds.filter(id => id !== systemId);
      if (candidates.length > 0) {
        linkedSystemId = candidates[Math.floor(rng() * candidates.length)];
      }
      const [minMass, maxMass] = WORMHOLE_MASS_RANGE;
      massRemaining = minMass + Math.floor(rng() * (maxMass - minMass + 1));
      const [minH, maxH] = WORMHOLE_LIFETIME_RANGE;
      const lifetimeHours = minH + Math.floor(rng() * (maxH - minH + 1));
      expiresAt = nowMs + lifetimeHours * 3_600_000;
    }

    anomalies.push({
      id:               `anomaly-${systemId}-${daySeed}-${i}`,
      systemId,
      type,
      name,
      signatureRadius,
      scanProgress:     0,
      revealed:         false,
      depleted:         false,
      bonusExpiresAt:   null,
      linkedSystemId,
      massRemaining,
      expiresAt,
    });
  }

  return anomalies;
}
