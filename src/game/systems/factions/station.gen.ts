import type { FactionId, StationDefinition, StationServiceType } from '@/types/faction.types';
import type { StarSystem } from '@/types/galaxy.types';

// ─── Station name tables ───────────────────────────────────────────────────

const STATION_PREFIXES: Record<FactionId, string[]> = {
  concordat: ['Celestia', 'Aether', 'Solace', 'Primal', 'Veil', 'Sanctum', 'Mandate', 'Citadel'],
  veldris:   ['Forge',    'Smelter', 'Alloy', 'Guild',  'Trade', 'Ore',     'Refinery', 'Transit'],
  syndicate: ['Shadow',   'Obsidian', 'Void', 'Black',  'Dark',  'Silence', 'Ruin',    'Skull'],
  covenant:  ['Drifter',  'Pilgrim',  'Chart', 'Nomad', 'Ancient', 'Roam',  'Current', 'Passage'],
};

const STATION_SUFFIXES = [
  'Platform', 'Outpost', 'Hub', 'Nexus', 'Depot', 'Citadel', 'Station', 'Base', 'Anchorage', 'Port',
];

// ─── Services per faction ─────────────────────────────────────────────────

const CONCORDAT_SERVICES: StationServiceType[] = ['market', 'recruiter', 'factory', 'refit', 'intel', 'hangar'];
const VELDRIS_SERVICES:   StationServiceType[] = ['market', 'factory', 'refit', 'hangar'];
const SYNDICATE_SERVICES: StationServiceType[] = ['market', 'blackmarket', 'refit', 'hangar'];
const COVENANT_SERVICES:  StationServiceType[] = ['market', 'recruiter', 'intel', 'hangar'];

const SERVICES_BY_FACTION: Record<FactionId, StationServiceType[]> = {
  concordat: CONCORDAT_SERVICES,
  veldris:   VELDRIS_SERVICES,
  syndicate: SYNDICATE_SERVICES,
  covenant:  COVENANT_SERVICES,
};

// ─── Generator ────────────────────────────────────────────────────────────

/**
 * Generate a station for a system deterministically from a 32-bit integer seed.
 * Returns null for systems that should NOT have a station (based on their security/faction).
 */
export function generateStation(
  system: Pick<StarSystem, 'id' | 'name'>,
  factionId: FactionId,
  rngSeed: number,
): StationDefinition {
  // Cheap LCG to pick indices without crypto overhead
  const lcg = (n: number) => (Math.imul(1664525, n) + 1013904223) >>> 0;

  let r = rngSeed;
  r = lcg(r);
  const prefixIdx = r % STATION_PREFIXES[factionId].length;
  r = lcg(r);
  const suffixIdx = r % STATION_SUFFIXES.length;

  const name = `${STATION_PREFIXES[factionId][prefixIdx]} ${STATION_SUFFIXES[suffixIdx]}`;

  // Price modifier: concordat is most expensive, syndicate cheapest but dodgy
  const priceModifiers: Record<FactionId, number> = {
    concordat: 1.15,
    veldris:   1.0,
    syndicate: 0.9,
    covenant:  1.05,
  };

  const registrationCost: Record<FactionId, number> = {
    concordat: 8000,
    veldris:   6000,
    syndicate: 4000,
    covenant:  7000,
  };

  const registrationRepRequired: Record<FactionId, number> = {
    concordat: 150,
    veldris:   50,
    syndicate: -150,
    covenant:  100,
  };

  // Manufacturing bonus: veldris industrial, others basic
  const mfgBonus: Record<FactionId, number> = {
    concordat: 0.10,
    veldris:   0.25,
    syndicate: 0.0,
    covenant:  0.05,
  };

  // Minimum rep to dock
  const minRep: Record<FactionId, number> = {
    concordat: -200,   // kick out deeply hostile players
    veldris:   -400,
    syndicate: -700,   // very hard to get barred from the Syndicate
    covenant:  -100,   // they are picky about reputation
  };

  return {
    id: `station-${system.id}`,
    name,
    systemId: system.id,
    factionId,
    services: SERVICES_BY_FACTION[factionId],
    registrationCost: registrationCost[factionId],
    registrationRepRequired: registrationRepRequired[factionId],
    marketPriceModifier:     priceModifiers[factionId],
    manufacturingSpeedBonus: mfgBonus[factionId],
    minRepToDock:            minRep[factionId],
  };
}

/**
 * Derive a station definition directly from the galaxy seed + system index.
 * This is the runtime accessor — never store stations in game state.
 */
export function getStationForSystem(
  system: Pick<StarSystem, 'id' | 'name'>,
  factionId: FactionId,
  systemIndex: number,
  galaxySeed: number,
): StationDefinition {
  // Combine galaxy seed and system index for a unique but stable seed
  const stationSeed = (galaxySeed ^ (systemIndex * 0x9e3779b9)) >>> 0;
  return generateStation(system, factionId, stationSeed);
}
