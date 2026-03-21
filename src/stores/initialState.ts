import type { GameState, Blueprint } from '@/types/game.types';
import { RESOURCE_IDS } from '@/game/resources/resourceRegistry';
import { SAVE_VERSION } from '@/game/balance/constants';
import { generateFoundingPilot } from '@/game/systems/fleet/fleet.gen';
import { STARTER_BLUEPRINT_RECIPE_IDS } from '@/game/systems/manufacturing/manufacturing.config';
import { createInitialTutorialState } from '@/game/progression/tutorialSequence';

const INITIAL_BLUEPRINTS: Blueprint[] = STARTER_BLUEPRINT_RECIPE_IDS.map(recipeId => ({
  id: `bpo-${recipeId}`,
  itemId: recipeId,
  tier: 1,
  type: 'original',
  researchLevel: 0,
  copiesRemaining: null,
  isLocked: false,
}));

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

    pilot: undefined,

    corp: {
      name: 'New Corp',
      foundedAt: Date.now(),
    },

    resources,

  tutorial: createInitialTutorialState(),

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
        blueprints: INITIAL_BLUEPRINTS,
        researchJobs: [],
        copyJobs: [],
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
          'ionite':    135,
          'arkonite':  500,
          'crokitite': 5000,
          // Components (manufactured)
          'hull-plate':     800,
          'thruster-node':  2000,
          'condenser-coil': 2500,
          'sensor-cluster': 4000,
          'mining-laser':   3500,
          'shield-emitter': 2800,
          'armor-honeycomb': 4200,
          'reactor-lattice': 6800,
          'targeting-bus':   6200,
          // Modules
          'mining-laser-i':      9000,
          'mining-laser-ii':     18000,
          'salvager-i':          7000,
          'missile-launcher-i':  11000,
          'shield-extender-i':   9500,
          'warp-scrambler-i':    8000,
          'survey-scanner-i':    6500,
          'cargo-scanner-i':     6000,
          'scan-pinpointing-i':  12000,
          'warp-tuner-i':        14500,
          'tracking-computer-i': 16500,
          'tracking-computer-ii': 28000,
          'cargo-expander-i':    7500,
          'cargo-expander-ii':   13000,
          'mining-upgrade-i':    8000,
          'hull-reinforcement-i': 9800,
          // NPC buy prices for advanced minerals
          'morphite':  45000,
          'zydrine':   12000,
          'fluxite':   900,
          // Datacores (not directly sold — used for research — but priced for market display)
          'datacore-mechanical':  250000,
          'datacore-electronic':  400000,
          'datacore-starship':    750000,
          // T2 Components
          'advanced-hull-plate':     85000,
          'advanced-thruster-node':  110000,
          'advanced-condenser-coil': 95000,
          // T2 Ships
          'ship-assault-frigate':    1200000,
          'ship-covert-ops':         1500000,
          'ship-command-destroyer':  3500000,
          // Ships (manufactured)
          'ship-shuttle':         12000,
          'ship-frigate':         45000,
          'ship-mining-frigate':  80000,
          'ship-hauler':          38000,
          'ship-destroyer':       110000,
          'ship-cruiser':         420000,
          'ship-exhumer':         320000,
        },
        lastTickAt:    Date.now(),
        autoSell:      {},
        lifetimeSold:  {},
        lifetimeBought: {},
      },

      fleet: {
        ships: {
          'ship-starter': {
            id: 'ship-starter',
            shipDefinitionId: 'mining-frigate',
            customName: 'Starter',
            activity: 'mining',
            assignedBeltId: 'belt-ferrock',
            assignedPilotId: 'pilot-0',
            systemId: 'home',
            fittedModules: { high: [], mid: [], low: [] },
            deployedAt: Date.now(),
            fleetOrder: null,
            fleetId: 'fleet-starter',
            role: 'unassigned',
            hullDamage: 0,
          },
        },
        pilots: {
          'pilot-0': {
            ...generateFoundingPilot(DEFAULT_GALAXY_SEED),
            assignedShipId: 'ship-starter',
            status: 'active',
            commandSkills: { levels: {}, queue: [], activeSkillId: null, activeProgress: 0 },
          },
        },
        recruitmentOffers: [],
        recruitmentMilestones: {},
        fleets: {
          'fleet-starter': {
            id: 'fleet-starter',
            name: 'Mining Wing Alpha',
            shipIds: ['ship-starter'],
            currentSystemId: 'home',
            fleetOrder: null,
            maxJumpRangeLY: 10,
            doctrine: 'balanced',
            combatOrder: null,
            isScanning: false,
            cargoHold: {},
            hqOffloadStartedAt: null,
            recentTransitArrival: null,
            commanderId: null,
            wings: [{
              id: 'wing-starter-mining',
              name: 'Starter Mining Wing',
              type: 'mining',
              shipIds: ['ship-starter'],
              commanderId: null,
              cargoHold: {},
              escortWingId: null,
              isDispatched: false,
              haulingOriginSystemId: null,
              hqOffloadStartedAt: null,
              recentTransitArrival: null,
              lastEscortCombatAt: 0,
            }],
          },
        },
        maxFleets: 5,
        combatLog: [],
        tradeRoutes: [],
        discoveries: [],
      },

      rewards: {
        inventory: [],
        history: [],
        discoveredDefinitionIds: {},
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
        homeStationId: 'station-home',
        homeStationSystemId: 'home',
        registeredStations: ['station-home'],
      },
    },

    unlocks: {
      'system-skills':   true,
      'system-mining':   true,
      'system-fleet':    true,  // granted at start — player has a starter fleet
      // All others unlock via skill training
    },

    modifiers: {},

    notifications: {
      entries: [],
    },

    settings: {
      autoSave: true,
      autoSaveInterval: 30_000,
      audioEnabled: true,
      masterVolume: 0.55,
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
      anomalies: {},
    },
  };
}

