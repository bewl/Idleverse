import type { GameState } from '@/types/game.types';
import { RESOURCE_IDS } from '@/game/resources/resourceRegistry';
import { SAVE_VERSION } from '@/game/balance/constants';
import { generateFoundingPilot } from '@/game/systems/fleet/fleet.gen';

/** Default galaxy seed. Players eventually get a unique seed per run. */
export const DEFAULT_GALAXY_SEED = 0x4944_4c56; // "IDLV" in ASCII

export function createInitialState(): GameState {
  const resources: Record<string, number> = {};
  for (const id of RESOURCE_IDS) {
    resources[id] = 0;
  }
  // New pilots start with a small ISK grant
  resources['credits'] = 5000;

  return {
    version: SAVE_VERSION,
    lastUpdatedAt: Date.now(),

    pilot: {
      name: 'New Capsuleer',
      birthdate: Date.now(),
    },

    resources,

    systems: {
      skills: {
        levels: {},
        activeSkillId: null,
        activeProgress: 0,
        queue: [],
      },

      mining: {
        targets: {
          'belt-ferrock': false,
          'belt-corite':  false,
        },
        upgrades: {},
        lifetimeProduced: {},
        oreHold: {},
        beltPool: {},
        beltRespawnAt: {},
        lastHaulAt: Date.now(),
      },

      reprocessing: {
        queue: [],
        autoTargets:   {},
        autoThreshold: {},
      },

      manufacturing: {
        queue: [],
        completedCount: {},
      },

      market: {
        prices: {
          // Base ISK/unit NPC buy prices for minerals
          'ferrite':   5,
          'silite':    8,
          'vexirite':  16,
          'isorium':   55,
          'noxium':    230,
          'zyridium':  1400,
          'megacite':  8500,
          'voidsteel': 95000,
          // Base ISK/unit NPC buy prices for ores (~35-40% of mineral yield value)
          'ferrock':   2,
          'corite':    3,
          'silisite':  5,
          'platonite': 5,
          'darkstone': 25,
          'hematite':  20,
          'voidite':   100,
          'arkonite':  500,
          'crokitite': 5000,
          // Components (manufactured)
          'hull-plate':     800,
          'thruster-node':  2000,
          'condenser-coil': 2500,
          'sensor-cluster': 4000,
          'mining-laser':   3500,
          'shield-emitter': 2800,
          // Ships (manufactured)
          'ship-shuttle':         12000,
          'ship-frigate':         45000,
          'ship-mining-frigate':  80000,
          'ship-hauler':          38000,
          'ship-destroyer':       110000,
          'ship-exhumer':         320000,
        },
        lastTickAt:    Date.now(),
        autoSell:      {},
        lifetimeSold:  {},
      },

      fleet: {
        ships: {},
        pilots: {
          'pilot-0': generateFoundingPilot(DEFAULT_GALAXY_SEED),
        },
        recruitmentOffers: [],
        fleets: {},
        maxFleets: 5,
        combatLog: [],
        tradeRoutes: [],
      },

      structures: {
        levels: {},
      },

      factions: {
        rep: {
          concordat: 200,
          veldris:   50,
          syndicate: -300,
          covenant:  0,
        },
        dockedStationId: null,
        outposts: {},
      },
    },

    unlocks: {
      'system-skills':   true,
      'system-mining':   true,
      // All others unlock via skill training
    },

    modifiers: {},

    settings: {
      autoSave: true,
      autoSaveInterval: 30_000,
    },

    galaxy: {
      seed: DEFAULT_GALAXY_SEED,
      currentSystemId: 'home',
      warp: null,
      visitedSystems: { home: true },
      scannedSystems: { home: true },
      beltRichnessOverride: {},
      galacticSliceZ: 0.5,
      npcGroupStates: {},
      systemPressure: {},
    },
  };
}

