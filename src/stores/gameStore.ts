import { create } from 'zustand';
import { useUiStore } from '@/stores/uiStore';
import type { GameState, NotificationEntry, OfflineSummary, ManufacturingJob, SkillQueueEntry, ReprocessingJob, FleetActivity, PilotTrainingFocus, WingType } from '@/types/game.types';
import type { FactionId, RouteSecurityFilter } from '@/types/faction.types';
import { createInitialState } from './initialState';
import { runTick } from '@/game/core/tickRunner';
import { MANUFACTURING_RECIPES, BLUEPRINT_DEFINITIONS } from '@/game/systems/manufacturing/manufacturing.config';
import { getResearchTimeForLevel, getCopyTime, getMaxResearchSlots } from '@/game/systems/manufacturing/manufacturing.logic';
import { ORE_BELTS, MINING_UPGRADES } from '@/game/systems/mining/mining.config';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import {
  enqueueSkill,
  dequeueSkill,
  canTrainSkill,
  buildModifiersFromSkills,
  buildUnlocksFromSkills,
} from '@/game/systems/skills/skills.logic';
import { upgradeCost } from '@/game/balance/constants';
import { saveGame, loadGame, deleteSave } from '@/game/persistence/saveLoad';
import { processOfflineProgress } from '@/game/offline/offlineCalc';
import { playManufacturingComplete, playSkillAdvance } from '@/game/audio/soundEvents';
import { getTriggeredRecruitmentDirectives } from '@/game/progression/recruitmentAdvisor';
import {
  completeTutorialStep as completeTutorialStepState,
  evaluateTutorialState,
  restartTutorialState,
  skipTutorialState,
  tutorialStatesEqual,
} from '@/game/progression/tutorialSequence';
import { appendNotificationEntries, buildTickNotifications } from '@/game/notifications/notification.logic';
import { calculateSellValue } from '@/game/systems/market/market.logic';
import type { TradeRoute } from '@/types/game.types';
import { BATCH_SIZE_BASE } from '@/game/systems/reprocessing/reprocessing.config';
import { getSystemById, getSystemBeltIds, generateGalaxy, systemDistance } from '@/game/galaxy/galaxy.gen';
import { calcWarpDuration } from '@/game/galaxy/travel.logic';
import {
  deployShip,
  recallShip,
  assignPilotToShip,
  setShipActivity,
  fitModule,
  removeModule,
  createPlayerFleet,
  disbandPlayerFleet,
  addShipToFleet,
  removeShipFromFleet,
  renamePlayerFleet,
  setShipRoleInState,
  setFleetDoctrineInState,
  repairShipInState,
} from '@/game/systems/fleet/fleet.logic';
import {
  issuePatrolOrderInState,
  issueCombatRaidOrderInState,
  cancelCombatOrderInState,
} from '@/game/systems/combat/combat.logic';
import {
  issueFleetOrder,
  cancelFleetOrder,
  issueFleetGroupOrder,
  cancelFleetGroupOrder,
} from '@/game/systems/fleet/fleet.orders';
import { adjustRep, dockAtStation, undockFromStation, getStationInSystem } from '@/game/systems/factions/faction.logic';
import { getOutpostDisplayName, getOutpostId } from '@/game/systems/factions/faction.logic';
import {
  enqueuePilotSkill,
  dequeuePilotSkill,
} from '@/game/systems/fleet/pilot.logic';
import { generatePilot, generateRecruitmentOffers } from '@/game/systems/fleet/fleet.gen';
import { COMMANDER_SKILL_DEFINITIONS } from '@/game/systems/fleet/commander.config';
import { assignWingToMiningBelt, dispatchHaulerWing, getFleetStoredCargo, getHaulingWings, getOperationalFleetShipIds, hasDispatchedHaulingWing } from '@/game/systems/fleet/wings.logic';

// ─── Store interface ───────────────────────────────────────────────────────

interface GameStore {
  state: GameState;
  offlineSummary: OfflineSummary | null;

  // Core loop
  tick: (deltaSeconds: number) => void;

  // Mining
  toggleMiningBelt: (beltId: string) => void;
  purchaseMiningUpgrade: (upgradeId: string) => void;
  haulOreHold: () => void;

  // Skills
  addSkillToQueue: (skillId: string, targetLevel: 1 | 2 | 3 | 4 | 5) => boolean;
  removeSkillFromQueue: (index: number) => void;
  clearSkillQueue: () => void;

  // Manufacturing
  queueManufacturing: (recipeId: string, quantity: number) => boolean;
  queueManufacturingWithBpc: (recipeId: string, quantity: number, blueprintId: string) => boolean;
  cancelManufacturingJob: (index: number) => void;
  prioritizeManufacturingJob: (index: number) => void;

  // Blueprint Research & Copy
  researchBlueprint: (blueprintId: string) => boolean;
  cancelResearchJob: (jobId: string) => void;
  copyBlueprint: (blueprintId: string, runs: number) => boolean;
  cancelCopyJob: (jobId: string) => void;

  // Reprocessing
  queueReprocessing: (oreId: string, amount: number) => boolean;
  cancelReprocessingJob: (index: number) => void;
  toggleAutoReprocess: (oreId: string) => void;
  setAutoThreshold: (oreId: string, amount: number) => void;

  // Market
  sellResource: (resourceId: string, amount: number) => boolean;
  sellAll: (resourceId: string) => boolean;
  toggleAutoSell: (resourceId: string) => void;
  setAutoSellThreshold: (resourceId: string, amount: number) => void;

  // Pilot
  renamePilot: (name: string) => void;
  /** Rename the corp. Preferred over the legacy renamePilot. */
  renameCorpName: (name: string) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setMasterVolume: (volume: number) => void;

  // Fleet
  deployShip: (hullId: string, customName?: string) => boolean;
  recallShip: (shipId: string) => boolean;
  assignPilotToShip: (pilotId: string, shipId: string | null) => boolean;
  setShipActivity: (shipId: string, activity: FleetActivity, assignedBeltId?: string) => boolean;
  repairShip: (shipId: string) => boolean;
  fitModule: (shipId: string, slotType: 'high' | 'mid' | 'low', moduleId: string) => boolean;
  removeModule: (shipId: string, slotType: 'high' | 'mid' | 'low', index: number) => boolean;
  addPilotSkillToQueue: (pilotId: string, skillId: string, targetLevel: 1 | 2 | 3 | 4 | 5) => boolean;
  removePilotSkillFromQueue: (pilotId: string, index: number) => void;
  setPilotTrainingFocus: (pilotId: string, focus: PilotTrainingFocus | null) => void;
  hirePilot: (offerId: string) => boolean;
  refreshRecruitmentOffers: () => void;
  renamePilotCharacter: (pilotId: string, name: string) => void;
  issueFleetOrder: (shipId: string, destinationId: string, securityFilter?: RouteSecurityFilter, pauseOnArrival?: boolean) => boolean;
  cancelFleetOrder: (shipId: string) => boolean;
  createPlayerFleet: (name: string, shipIds: string[]) => string | null;
  disbandPlayerFleet: (fleetId: string) => boolean;
  addShipToFleet: (fleetId: string, shipId: string) => boolean;
  removeShipFromFleet: (fleetId: string, shipId: string) => boolean;
  renamePlayerFleet: (fleetId: string, name: string) => boolean;
  movePlayerFleet: (fleetId: string, direction: 'up' | 'down') => void;
  issueFleetGroupOrder: (fleetId: string, destinationId: string, securityFilter?: RouteSecurityFilter, pauseOnArrival?: boolean) => boolean;
  cancelFleetGroupOrder: (fleetId: string) => boolean;
  haulFleetToHQ: (fleetId: string) => boolean;
  dispatchHaulingWingToHQ: (fleetId: string, wingId?: string) => boolean;
  setShipRole: (shipId: string, role: import('@/types/game.types').ShipRole) => boolean;
  setFleetDoctrine: (fleetId: string, doctrine: import('@/types/game.types').FleetDoctrine) => boolean;
  issuePatrolOrder: (fleetId: string) => boolean;
  issueCombatRaidOrder: (fleetId: string, npcGroupId: string) => boolean;
  cancelCombatOrder: (fleetId: string) => boolean;
  createFleetWing: (fleetId: string, type: WingType, name: string) => boolean;
  renameFleetWing: (fleetId: string, wingId: string, name: string) => boolean;
  deleteFleetWing: (fleetId: string, wingId: string) => boolean;
  designateWingCommander: (fleetId: string, wingId: string, pilotId: string | null) => boolean;
  assignShipToWing: (fleetId: string, shipId: string, wingId: string | null) => boolean;
  setWingEscort: (fleetId: string, wingId: string, escortWingId: string | null) => boolean;
  assignWingToMiningBelt: (fleetId: string, wingId: string, beltId: string) => boolean;

  // Trade routes
  createTradeRoute: (params: {
    name: string;
    fleetId: string;
    fromSystemId: string;
    toSystemId: string;
    resourceId: string;
    amountPerRun: number;
  }) => boolean;
  deleteTradeRoute: (routeId: string) => void;
  toggleTradeRoute:  (routeId: string) => void;

  // Factions
  adjustReputation: (factionId: FactionId, delta: number) => void;
  dockAtStation: (stationId: string) => boolean;
  undockFromStation: () => void;
  registerWithStation: (stationId: string) => boolean;
  /** Register a station as Corp HQ. Stores both the station ID and its system ID for fast lookup. */
  setHomeStation: (stationId: string, systemId: string) => void;
  deployPOS: (systemId: string) => boolean;

  // Galaxy / Travel
  /** Begin a warp jump to another system. Returns false if already in warp or same system. */
  initiateWarp: (toSystemId: string) => boolean;
  /** Cancel a warp in progress (only if not yet past the point of no return -- 50% progress). */
  cancelWarp: () => void;
  /** Mark a system as scanned (reveals all body details). */
  scanSystem: (systemId: string) => void;
  /** Global galaxy selector helper — reads galaxy from state. */
  getGalaxy: () => ReturnType<typeof generateGalaxy>;

  // Exploration
  /** Toggle a fleet's scanning mode. Scanning fleets reveal anomalies each tick. */
  setFleetScanning: (fleetId: string, scanning: boolean) => boolean;
  /** Loot a revealed data or relic anomaly with the given fleet. Requires Hacking or Archaeology unlock. */
  lootSite: (fleetId: string, anomalyId: string) => boolean;
  /** Activate a revealed ore-pocket anomaly to receive an immediate bonus ore yield. */
  activateOrePocket: (fleetId: string, anomalyId: string) => boolean;

  // Fleet Commander
  /** Designate a pilot (who must be in the fleet) as Fleet Commander. Pass null to remove. */
  designateFleetCommander: (fleetId: string, pilotId: string | null) => boolean;
  /** Add a command skill to a pilot's commander training queue. */
  queueCommanderSkill: (pilotId: string, skillId: string, targetLevel: 1 | 2 | 3 | 4 | 5) => boolean;
  /** Remove an entry from a pilot's commander skill training queue by index. */
  removeCommanderSkillFromQueue: (pilotId: string, index: number) => void;

  // Persistence
  saveToStorage: () => void;
  loadFromStorage: () => void;
  dismissOfflineSummary: () => void;
  clearSave: () => void;
  completeTutorialStep: (stepId?: import('@/types/game.types').TutorialStepId) => void;
  skipTutorial: () => void;
  restartTutorial: () => void;
  evaluateTutorialProgress: () => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  archiveNotification: (notificationId: string) => void;
  restoreNotification: (notificationId: string) => void;
  archiveReadNotifications: () => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>((set, get) => ({
  state: createInitialState(),
  offlineSummary: null,

  // ── Core loop ────────────────────────────────────────────────────────────

  tick: (deltaSeconds) => {
    const previousState = get().state;
    let tickResult = runTick(previousState, deltaSeconds);
    let { newState, completedManufacturing, skillsAdvanced } = tickResult;

    const directives = getTriggeredRecruitmentDirectives(previousState, newState);
    if (directives.length > 0) {
      let recruitmentOffers = [...newState.systems.fleet.recruitmentOffers];
      const recruitmentMilestones = { ...(newState.systems.fleet.recruitmentMilestones ?? {}) };
      let epochBase = recruitmentOffers.length + Object.keys(recruitmentMilestones).length;

      for (const directive of directives) {
        if (recruitmentMilestones[directive.milestoneId]) continue;
        const generatedOffers = generateRecruitmentOffers(newState.galaxy.seed, epochBase, {
          focusSequence: directive.focusSequence,
          hiringCostRange: directive.hiringCostRange,
          source: 'milestone',
          sourceLabel: directive.sourceLabel,
          recommendationReason: directive.recommendationReason,
          milestoneId: directive.milestoneId,
        });
        epochBase += 1;
        recruitmentOffers = [...generatedOffers, ...recruitmentOffers].slice(0, 6);
        recruitmentMilestones[directive.milestoneId] = true;
      }

      newState = {
        ...newState,
        systems: {
          ...newState.systems,
          fleet: {
            ...newState.systems.fleet,
            recruitmentOffers,
            recruitmentMilestones,
          },
        },
      };
    }

    const notificationBatch = buildTickNotifications(previousState, newState, tickResult, directives);
    if (notificationBatch.entries.length > 0) {
      newState = {
        ...newState,
        notifications: {
          entries: appendNotificationEntries(newState.notifications.entries, notificationBatch.entries),
        },
      };
    }

    const evaluatedTutorial = evaluateTutorialState(newState);
    const nextState = tutorialStatesEqual(newState.tutorial, evaluatedTutorial)
      ? newState
      : { ...newState, tutorial: evaluatedTutorial };

    set({ state: nextState });

    if (notificationBatch.toastIds.length > 0) {
      useUiStore.getState().queueNotificationToasts(notificationBatch.toastIds);
    }

    const completedManufacturingCount = Object.values(completedManufacturing).reduce((sum, qty) => sum + qty, 0);
    if (completedManufacturingCount > 0) {
      playManufacturingComplete(completedManufacturingCount);
    }
    if (skillsAdvanced.length > 0) {
      playSkillAdvance(skillsAdvanced.length);
    }
  },

  // ── Mining ───────────────────────────────────────────────────────────────

  toggleMiningBelt: (beltId) => {
    const { state } = get();
    const def = ORE_BELTS[beltId];
    if (!def) return;

    // Check skill requirement
    if (def.requiredSkill) {
      const lvl = state.systems.skills.levels[def.requiredSkill.skillId] ?? 0;
      if (lvl < def.requiredSkill.minLevel) return;
    }

    const current = state.systems.mining.targets[beltId] ?? false;
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          mining: {
            ...state.systems.mining,
            targets: { ...state.systems.mining.targets, [beltId]: !current },
          },
        },
      },
    });
  },

  purchaseMiningUpgrade: (upgradeId) => {
    const { state } = get();
    const def = MINING_UPGRADES[upgradeId];
    if (!def) return;

    const currentLevel = state.systems.mining.upgrades[upgradeId] ?? 0;
    if (currentLevel >= def.maxLevel) return;

    if (def.prerequisiteSkill) {
      const lvl = state.systems.skills.levels[def.prerequisiteSkill.skillId] ?? 0;
      if (lvl < def.prerequisiteSkill.minLevel) return;
    }

    const newResources = { ...state.resources };
    for (const [resourceId, baseAmount] of Object.entries(def.baseCost)) {
      const cost = upgradeCost(baseAmount, currentLevel);
      if ((newResources[resourceId] ?? 0) < cost) return;
      newResources[resourceId] = (newResources[resourceId] ?? 0) - cost;
    }

    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          mining: {
            ...state.systems.mining,
            upgrades: { ...state.systems.mining.upgrades, [upgradeId]: currentLevel + 1 },
          },
        },
      },
    });
  },

  haulOreHold: () => {
    const { state } = get();
    const oreHold = state.systems.mining.oreHold ?? {};
    if (Object.keys(oreHold).length === 0) return;

    const newResources = { ...state.resources };
    for (const [resourceId, amount] of Object.entries(oreHold)) {
      if (amount > 0) {
        newResources[resourceId] = (newResources[resourceId] ?? 0) + amount;
      }
    }

    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          mining: {
            ...state.systems.mining,
            oreHold: {},
            lastHaulAt: Date.now(),
          },
        },
      },
    });
  },

  // ── Skills ───────────────────────────────────────────────────────────────

  addSkillToQueue: (skillId, targetLevel) => {
    const { state } = get();
    const def = SKILL_DEFINITIONS[skillId];
    if (!def) return false;

    if (!canTrainSkill(state, skillId)) return false;

    const currentLevel = state.systems.skills.levels[skillId] ?? 0;
    if (targetLevel <= currentLevel) return false;

    const newSkillsState = enqueueSkill(state, skillId, targetLevel);
    if (!newSkillsState) return false;

    // If nothing is actively training, start this skill immediately
    const shouldActivate = !newSkillsState.activeSkillId;
    const updatedState = {
      ...state,
      systems: {
        ...state.systems,
        skills: shouldActivate
          ? { ...newSkillsState, activeSkillId: skillId, activeProgress: 0 }
          : newSkillsState,
      },
    };
    set({
      state: {
        ...updatedState,
        tutorial: evaluateTutorialState(updatedState),
      },
    });
    return true;
  },

  removeSkillFromQueue: (index) => {
    const { state } = get();
    const newSkillsState = dequeueSkill(state, index);
    set({
      state: { ...state, systems: { ...state.systems, skills: newSkillsState } },
    });
  },

  clearSkillQueue: () => {
    const { state } = get();
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          skills: {
            ...state.systems.skills,
            queue: [],
            activeSkillId: null,
            activeProgress: 0,
          },
        },
      },
    });
  },

  // ── Manufacturing ────────────────────────────────────────────────────────

  queueManufacturing: (recipeId, quantity) => {
    const { state } = get();
    if (!state.unlocks['system-manufacturing']) return false;
    if (!state.systems.factions.homeStationId || !state.systems.factions.homeStationSystemId) return false;

    const recipe = MANUFACTURING_RECIPES[recipeId];
    if (!recipe) return false;

    if (recipe.requiredSkill) {
      const lvl = state.systems.skills.levels[recipe.requiredSkill.skillId] ?? 0;
      if (lvl < recipe.requiredSkill.minLevel) return false;
    }

    const newResources = { ...state.resources };
    for (const [resourceId, amount] of Object.entries(recipe.inputs)) {
      const total = amount * quantity;
      if ((newResources[resourceId] ?? 0) < total) return false;
      newResources[resourceId] = (newResources[resourceId] ?? 0) - total;
    }

    const newJob: ManufacturingJob = { recipeId, progress: 0, quantity };
    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          manufacturing: {
            ...state.systems.manufacturing,
            queue: [...state.systems.manufacturing.queue, newJob],
          },
        },
      },
    });
    return true;
  },

  cancelManufacturingJob: (index) => {
    const { state } = get();
    const job = state.systems.manufacturing.queue[index];
    if (!job) return;

    const recipe = MANUFACTURING_RECIPES[job.recipeId];
    const newResources = { ...state.resources };
    if (recipe) {
      for (const [resourceId, amount] of Object.entries(recipe.inputs)) {
        newResources[resourceId] = (newResources[resourceId] ?? 0) + Math.floor(amount * job.quantity * 0.5);
      }
    }

    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          manufacturing: {
            ...state.systems.manufacturing,
            queue: state.systems.manufacturing.queue.filter((_, i) => i !== index),
          },
        },
      },
    });
  },

  prioritizeManufacturingJob: (index) => {
    const { state } = get();
    const queue = state.systems.manufacturing.queue;
    if (index <= 0 || index >= queue.length) return;
    const newQueue = [...queue];
    const [chosen] = newQueue.splice(index, 1);
    newQueue.unshift(chosen);
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          manufacturing: { ...state.systems.manufacturing, queue: newQueue },
        },
      },
    });
  },

  queueManufacturingWithBpc: (recipeId, quantity, blueprintId) => {
    const { state } = get();
    if (!state.unlocks['system-manufacturing']) return false;
    if (!state.systems.factions.homeStationId || !state.systems.factions.homeStationSystemId) return false;

    const recipe = MANUFACTURING_RECIPES[recipeId];
    if (!recipe || !recipe.isTech2) return false;

    // Validate the BPC
    const bpc = state.systems.manufacturing.blueprints.find(b => b.id === blueprintId);
    if (!bpc || bpc.type !== 'copy' || bpc.tier !== 2 || bpc.itemId !== recipeId) return false;
    if (bpc.isLocked) return false;
    if (bpc.copiesRemaining !== null && bpc.copiesRemaining < 1) return false;

    if (recipe.requiredSkill) {
      const lvl = state.systems.skills.levels[recipe.requiredSkill.skillId] ?? 0;
      if (lvl < recipe.requiredSkill.minLevel) return false;
    }

    const newResources = { ...state.resources };
    for (const [resourceId, amount] of Object.entries(recipe.inputs)) {
      const total = amount * quantity;
      if ((newResources[resourceId] ?? 0) < total) return false;
      newResources[resourceId] = (newResources[resourceId] ?? 0) - total;
    }

    const newJob: ManufacturingJob = { recipeId, progress: 0, quantity, blueprintId };
    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          manufacturing: {
            ...state.systems.manufacturing,
            queue: [...state.systems.manufacturing.queue, newJob],
          },
        },
      },
    });
    return true;
  },

  researchBlueprint: (blueprintId) => {
    const { state } = get();
    if (!state.systems.factions.homeStationId || !state.systems.factions.homeStationSystemId) return false;
    const mfg = state.systems.manufacturing;

    const bp = mfg.blueprints.find(b => b.id === blueprintId);
    if (!bp || bp.type !== 'original' || bp.isLocked) return false;
    if (bp.researchLevel >= 10) return false;

    // Science L1 required
    const scienceLevel = state.systems.skills.levels['science'] ?? 0;
    if (scienceLevel < 1) return false;

    // Check slot availability
    const usedSlots = mfg.researchJobs.length + mfg.copyJobs.length;
    const maxSlots  = getMaxResearchSlots(state);
    if (usedSlots >= maxSlots) return false;

    // Check datacore cost
    const def = BLUEPRINT_DEFINITIONS[bp.itemId];
    if (!def) return false;
    if ((state.resources[def.datacoreId] ?? 0) < 1) return false;

    const totalTime = getResearchTimeForLevel(bp.researchLevel);
    const jobId = `research-${blueprintId}-${Date.now()}`;

    set({
      state: {
        ...state,
        resources: { ...state.resources, [def.datacoreId]: (state.resources[def.datacoreId] ?? 0) - 1 },
        systems: {
          ...state.systems,
          manufacturing: {
            ...mfg,
            blueprints: mfg.blueprints.map(b => b.id === blueprintId ? { ...b, isLocked: true } : b),
            researchJobs: [
              ...mfg.researchJobs,
              { id: jobId, blueprintId, targetLevel: bp.researchLevel + 1, progress: 0, totalTime },
            ],
          },
        },
      },
    });
    return true;
  },

  cancelResearchJob: (jobId) => {
    const { state } = get();
    const mfg = state.systems.manufacturing;
    const job = mfg.researchJobs.find(j => j.id === jobId);
    if (!job) return;

    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          manufacturing: {
            ...mfg,
            blueprints: mfg.blueprints.map(b => b.id === job.blueprintId ? { ...b, isLocked: false } : b),
            researchJobs: mfg.researchJobs.filter(j => j.id !== jobId),
          },
        },
      },
    });
  },

  copyBlueprint: (blueprintId, runs) => {
    const { state } = get();
    if (!state.systems.factions.homeStationId || !state.systems.factions.homeStationSystemId) return false;
    const mfg = state.systems.manufacturing;

    const bp = mfg.blueprints.find(b => b.id === blueprintId);
    if (!bp || !bp || bp.type !== 'original' || bp.isLocked) return false;
    if (runs < 1 || runs > 10) return false;

    // Science L1 required
    const scienceLevel = state.systems.skills.levels['science'] ?? 0;
    if (scienceLevel < 1) return false;

    // Check slot availability
    const usedSlots = mfg.researchJobs.length + mfg.copyJobs.length;
    const maxSlots  = getMaxResearchSlots(state);
    if (usedSlots >= maxSlots) return false;

    const totalTime = getCopyTime(runs);
    const jobId = `copy-${blueprintId}-${Date.now()}`;

    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          manufacturing: {
            ...mfg,
            blueprints: mfg.blueprints.map(b => b.id === blueprintId ? { ...b, isLocked: true } : b),
            copyJobs: [
              ...mfg.copyJobs,
              { id: jobId, blueprintId, runs, progress: 0, totalTime },
            ],
          },
        },
      },
    });
    return true;
  },

  cancelCopyJob: (jobId) => {
    const { state } = get();
    const mfg = state.systems.manufacturing;
    const job = mfg.copyJobs.find(j => j.id === jobId);
    if (!job) return;

    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          manufacturing: {
            ...mfg,
            blueprints: mfg.blueprints.map(b => b.id === job.blueprintId ? { ...b, isLocked: false } : b),
            copyJobs: mfg.copyJobs.filter(j => j.id !== jobId),
          },
        },
      },
    });
  },

  // ── Reprocessing ─────────────────────────────────────────────────────────

  queueReprocessing: (oreId, amount) => {
    const { state } = get();
    if (!state.unlocks['system-reprocessing']) return false;
    if (!state.systems.factions.homeStationId || !state.systems.factions.homeStationSystemId) return false;

    const have = state.resources[oreId] ?? 0;
    const batches = Math.floor(amount / BATCH_SIZE_BASE);
    if (batches < 1) return false;
    const totalOre = batches * BATCH_SIZE_BASE;
    if (have < totalOre) return false;

    const newResources = { ...state.resources, [oreId]: have - totalOre };
    const newJobs: ReprocessingJob[] = Array.from({ length: batches }, () => ({
      oreId, amount: BATCH_SIZE_BASE, progress: 0, isAuto: false,
    }));

    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          reprocessing: {
            ...state.systems.reprocessing,
            queue: [...state.systems.reprocessing.queue, ...newJobs],
          },
        },
      },
    });
    return true;
  },

  cancelReprocessingJob: (index) => {
    const { state } = get();
    const job = state.systems.reprocessing.queue[index];
    if (!job) return;

    // Refund the ore (50% recovery on cancel; 100% if not yet started)
    const refund = job.progress === 0 ? job.amount : Math.floor(job.amount * 0.5);
    const newResources = { ...state.resources };
    newResources[job.oreId] = (newResources[job.oreId] ?? 0) + refund;

    set({
      state: {
        ...state,
        resources: newResources,
        systems: {
          ...state.systems,
          reprocessing: {
            ...state.systems.reprocessing,
            queue: state.systems.reprocessing.queue.filter((_, i) => i !== index),
          },
        },
      },
    });
  },

  toggleAutoReprocess: (oreId) => {
    const { state } = get();
    if (!state.systems.factions.homeStationId || !state.systems.factions.homeStationSystemId) return;
    const current = state.systems.reprocessing.autoTargets?.[oreId] ?? false;
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          reprocessing: {
            ...state.systems.reprocessing,
            autoTargets: { ...(state.systems.reprocessing.autoTargets ?? {}), [oreId]: !current },
          },
        },
      },
    });
  },

  setAutoThreshold: (oreId, amount) => {
    const { state } = get();
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          reprocessing: {
            ...state.systems.reprocessing,
            autoThreshold: { ...(state.systems.reprocessing.autoThreshold ?? {}), [oreId]: Math.max(0, amount) },
          },
        },
      },
    });
  },

  // ── Market ───────────────────────────────────────────────────────────────

  sellResource: (resourceId, amount) => {
    const { state } = get();
    if (!state.unlocks['system-market']) return false;
    const have = state.resources[resourceId] ?? 0;
    const sell = Math.min(Math.floor(amount), have);
    if (sell <= 0) return false;

    const isk = calculateSellValue(state, resourceId, sell);
    if (isk === 0) return false;

    const newLifetime = {
      ...(state.systems.market.lifetimeSold ?? {}),
      [resourceId]: ((state.systems.market.lifetimeSold ?? {})[resourceId] ?? 0) + isk,
    };

    const updatedState = {
      ...state,
      resources: {
        ...state.resources,
        [resourceId]: have - sell,
        'credits': (state.resources['credits'] ?? 0) + isk,
      },
      systems: {
        ...state.systems,
        market: { ...state.systems.market, lifetimeSold: newLifetime },
      },
    };

    set({
      state: {
        ...updatedState,
        tutorial: evaluateTutorialState(updatedState),
      },
    });
    return true;
  },

  sellAll: (resourceId) => {
    const { state } = get();
    const have = state.resources[resourceId] ?? 0;
    if (have <= 0) return false;
    return get().sellResource(resourceId, have);
  },

  toggleAutoSell: (resourceId) => {
    const { state } = get();
    const current = state.systems.market.autoSell?.[resourceId];
    const newEntry = { enabled: !(current?.enabled ?? false), threshold: current?.threshold ?? 0 };
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          market: {
            ...state.systems.market,
            autoSell: { ...(state.systems.market.autoSell ?? {}), [resourceId]: newEntry },
          },
        },
      },
    });
  },

  setAutoSellThreshold: (resourceId, amount) => {
    const { state } = get();
    const current = state.systems.market.autoSell?.[resourceId];
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          market: {
            ...state.systems.market,
            autoSell: {
              ...(state.systems.market.autoSell ?? {}),
              [resourceId]: {
                enabled: current?.enabled ?? false,
                threshold: Math.max(0, amount),
              },
            },
          },
        },
      },
    });
  },

  // ── Pilot ────────────────────────────────────────────────────────────────

  renamePilot: (name) => {
    const { state } = get();
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return;
    set({ state: { ...state, corp: { ...state.corp, name: trimmed } } });
  },

  renameCorpName: (name) => {
    const { state } = get();
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    set({ state: { ...state, corp: { ...state.corp, name: trimmed } } });
  },

  setAudioEnabled: (enabled) => {
    const { state } = get();
    set({
      state: {
        ...state,
        settings: {
          ...state.settings,
          audioEnabled: enabled,
        },
      },
    });
  },

  setMasterVolume: (volume) => {
    const { state } = get();
    set({
      state: {
        ...state,
        settings: {
          ...state.settings,
          masterVolume: Math.max(0, Math.min(1, volume)),
        },
      },
    });
  },

  // ── Fleet ────────────────────────────────────────────────────────────────

  deployShip: (hullId, customName) => {
    const newState = deployShip(get().state, hullId, customName);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  recallShip: (shipId) => {
    const newState = recallShip(get().state, shipId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  assignPilotToShip: (pilotId, shipId) => {
    const newState = assignPilotToShip(get().state, pilotId, shipId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  setShipActivity: (shipId, activity, assignedBeltId) => {
    const newState = setShipActivity(get().state, shipId, activity, assignedBeltId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  repairShip: (shipId) => {
    const newState = repairShipInState(get().state, shipId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  fitModule: (shipId, slotType, moduleId) => {
    const newState = fitModule(get().state, shipId, slotType, moduleId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  removeModule: (shipId, slotType, index) => {
    const newState = removeModule(get().state, shipId, slotType, index);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  addPilotSkillToQueue: (pilotId, skillId, targetLevel) => {
    const { state } = get();
    const pilot = state.systems.fleet.pilots[pilotId];
    if (!pilot) return false;
    const newSkillState = enqueuePilotSkill(pilot, skillId, targetLevel);
    if (!newSkillState) return false;
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            pilots: {
              ...state.systems.fleet.pilots,
              [pilotId]: { ...pilot, skills: newSkillState },
            },
          },
        },
      },
    });
    return true;
  },

  removePilotSkillFromQueue: (pilotId, index) => {
    const { state } = get();
    const pilot = state.systems.fleet.pilots[pilotId];
    if (!pilot) return;
    const newSkillState = dequeuePilotSkill(pilot, index);
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            pilots: { ...state.systems.fleet.pilots, [pilotId]: { ...pilot, skills: newSkillState } },
          },
        },
      },
    });
  },

  setPilotTrainingFocus: (pilotId, focus) => {
    const { state } = get();
    const pilot = state.systems.fleet.pilots[pilotId];
    if (!pilot) return;
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            pilots: {
              ...state.systems.fleet.pilots,
              [pilotId]: { ...pilot, skills: { ...pilot.skills, idleTrainingFocus: focus } },
            },
          },
        },
      },
    });
  },

  hirePilot: (offerId) => {
    const { state } = get();
    const offer = state.systems.fleet.recruitmentOffers.find(o => o.id === offerId);
    if (!offer) return false;
    const credits = state.resources['credits'] ?? 0;
    if (credits < offer.hiringCost) return false;

    const newPilot = generatePilot(state.galaxy.seed, offer.pilotSeed);
    const newOffers = state.systems.fleet.recruitmentOffers.filter(o => o.id !== offerId);

    set({
      state: {
        ...state,
        resources: { ...state.resources, 'credits': credits - offer.hiringCost },
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            pilots: { ...state.systems.fleet.pilots, [newPilot.id]: newPilot },
            recruitmentOffers: newOffers,
          },
        },
      },
    });
    return true;
  },

  refreshRecruitmentOffers: () => {
    const { state } = get();
    const epoch = state.systems.fleet.recruitmentOffers.length; // simple epoch
    const newOffers = generateRecruitmentOffers(state.galaxy.seed, epoch);
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: { ...state.systems.fleet, recruitmentOffers: newOffers },
        },
      },
    });
  },

  renamePilotCharacter: (pilotId, name) => {
    const { state } = get();
    const pilot = state.systems.fleet.pilots[pilotId];
    if (!pilot) return;
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return;
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            pilots: { ...state.systems.fleet.pilots, [pilotId]: { ...pilot, name: trimmed } },
          },
        },
      },
    });
  },

  issueFleetOrder: (shipId, destinationId, securityFilter = 'shortest', pauseOnArrival = false) => {
    const newState = issueFleetOrder(get().state, shipId, destinationId, securityFilter, pauseOnArrival);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  cancelFleetOrder: (shipId) => {
    const newState = cancelFleetOrder(get().state, shipId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  createPlayerFleet: (name, shipIds) => {
    const newState = createPlayerFleet(get().state, name, shipIds);
    if (!newState) return null;
    // Extract the newly created fleet ID (the one not present before)
    const before = new Set(Object.keys(get().state.systems.fleet.fleets));
    set({ state: newState });
    const after = Object.keys(newState.systems.fleet.fleets);
    return after.find(id => !before.has(id)) ?? null;
  },

  disbandPlayerFleet: (fleetId) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet || hasDispatchedHaulingWing(fleet)) return false;
    const newState = disbandPlayerFleet(state, fleetId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  addShipToFleet: (fleetId, shipId) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet || hasDispatchedHaulingWing(fleet)) return false;
    const newState = addShipToFleet(state, fleetId, shipId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  removeShipFromFleet: (fleetId, shipId) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet || hasDispatchedHaulingWing(fleet)) return false;
    const newState = removeShipFromFleet(state, fleetId, shipId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  renamePlayerFleet: (fleetId, name) => {
    const newState = renamePlayerFleet(get().state, fleetId, name);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  movePlayerFleet: (fleetId, direction) => {
    const state = get().state;
    const ids = Object.keys(state.systems.fleet.fleets);
    const idx = ids.indexOf(fleetId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    const reordered: Record<string, import('@/types/game.types').PlayerFleet> = {};
    for (const id of ids) reordered[id] = state.systems.fleet.fleets[id];
    set({ state: { ...state, systems: { ...state.systems, fleet: { ...state.systems.fleet, fleets: reordered } } } });
  },

  issueFleetGroupOrder: (fleetId, destinationId, securityFilter = 'shortest', pauseOnArrival = false) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet || hasDispatchedHaulingWing(fleet)) return false;
    const newState = issueFleetGroupOrder(state, fleetId, destinationId, securityFilter, pauseOnArrival);
    if (!newState) return false;
    const evaluatedTutorial = evaluateTutorialState(newState);
    set({
      state: tutorialStatesEqual(newState.tutorial, evaluatedTutorial)
        ? newState
        : { ...newState, tutorial: evaluatedTutorial },
    });
    return true;
  },

  haulFleetToHQ: (fleetId) => {
    const { state } = get();
    const homeSystemId = state.systems.factions.homeStationSystemId;
    if (!homeSystemId) return false;

    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet || hasDispatchedHaulingWing(fleet)) return false;
    if (fleet.fleetOrder) return false;
    if (getHaulingWings(fleet).length > 0) return false;
    if (fleet.currentSystemId === homeSystemId) return false;
    if (getFleetStoredCargo(fleet) <= 0) return false;

    const stagedState: GameState = {
      ...state,
      systems: {
        ...state.systems,
        fleet: {
          ...state.systems.fleet,
          fleets: {
            ...state.systems.fleet.fleets,
            [fleetId]: {
              ...fleet,
              miningOriginSystemId: fleet.currentSystemId,
            },
          },
        },
      },
    };

    const newState = issueFleetGroupOrder(stagedState, fleetId, homeSystemId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  dispatchHaulingWingToHQ: (fleetId, wingId) => {
    const { state } = get();
    const homeSystemId = state.systems.factions.homeStationSystemId;
    if (!homeSystemId) return false;
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet) return false;
    if (fleet.fleetOrder) return false;
    const targetWingId = wingId
      ?? (fleet.wings ?? []).find(wing => wing.type === 'hauling' && !wing.isDispatched)?.id;
    if (!targetWingId) return false;
    const newState = dispatchHaulerWing(state, fleetId, targetWingId, homeSystemId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  cancelFleetGroupOrder: (fleetId) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet || hasDispatchedHaulingWing(fleet)) return false;
    const newState = cancelFleetGroupOrder(state, fleetId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  setShipRole: (shipId, role) => {
    const newState = setShipRoleInState(get().state, shipId, role);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  setFleetDoctrine: (fleetId, doctrine) => {
    const newState = setFleetDoctrineInState(get().state, fleetId, doctrine);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  issuePatrolOrder: (fleetId) => {
    const newState = issuePatrolOrderInState(get().state, fleetId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  issueCombatRaidOrder: (fleetId, npcGroupId) => {
    const newState = issueCombatRaidOrderInState(get().state, fleetId, npcGroupId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  cancelCombatOrder: (fleetId) => {
    const newState = cancelCombatOrderInState(get().state, fleetId);
    if (!newState) return false;
    set({ state: newState });
    return true;
  },

  // ── Trade routes ─────────────────────────────────────────────────────────

  createTradeRoute: (params) => {
    const state = get().state;
    const tradeLevel  = state.systems.skills.levels['trade'] ?? 0;
    if (tradeLevel < 3) return false;

    const existing  = state.systems.fleet.tradeRoutes ?? [];
    const maxRoutes = Math.max(1, tradeLevel - 2); // III=1, IV=2, V=3
    if (existing.length >= maxRoutes) return false;

    // Verify the fleet exists
    if (!state.systems.fleet.fleets[params.fleetId]) return false;

    const newRoute: TradeRoute = {
      id:               `route-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name:             params.name || `Route ${existing.length + 1}`,
      fleetId:          params.fleetId,
      fromSystemId:     params.fromSystemId,
      toSystemId:       params.toSystemId,
      resourceId:       params.resourceId,
      amountPerRun:     Math.max(1, params.amountPerRun),
      enabled:          true,
      inTransit:        0,
      buyCostForTransit: 0,
      lastRunProfit:    null,
      totalRunsCompleted: 0,
    };

    set(s => ({
      state: {
        ...s.state,
        systems: {
          ...s.state.systems,
          fleet: { ...s.state.systems.fleet, tradeRoutes: [...existing, newRoute] },
        },
      },
    }));
    return true;
  },

  deleteTradeRoute: (routeId) => {
    set(s => ({
      state: {
        ...s.state,
        systems: {
          ...s.state.systems,
          fleet: {
            ...s.state.systems.fleet,
            tradeRoutes: (s.state.systems.fleet.tradeRoutes ?? []).filter(r => r.id !== routeId),
          },
        },
      },
    }));
  },

  toggleTradeRoute: (routeId) => {
    set(s => ({
      state: {
        ...s.state,
        systems: {
          ...s.state.systems,
          fleet: {
            ...s.state.systems.fleet,
            tradeRoutes: (s.state.systems.fleet.tradeRoutes ?? []).map(r =>
              r.id === routeId ? { ...r, enabled: !r.enabled } : r,
            ),
          },
        },
      },
    }));
  },

  // ── Factions ──────────────────────────────────────────────

  adjustReputation: (factionId, delta) => {
    const { state } = get();
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          factions: adjustRep(state.systems.factions, factionId, delta),
        },
      },
    });
  },

  dockAtStation: (stationId) => {
    const { state } = get();
    // Find the system that contains this station
    const galaxy = generateGalaxy(state.galaxy.seed);
    const system = galaxy.find(s => s.stationId === stationId);
    if (!system || !system.factionId) return false;
    const sysIndex = system.id === 'home' ? 0 : parseInt(system.id.replace('sys-', ''), 10);
    const station = getStationInSystem(system, state.galaxy.seed, isNaN(sysIndex) ? 0 : sysIndex);
    if (!station) return false;
    const newFactions = dockAtStation(state.systems.factions, station);
    if (!newFactions) return false;
    set({
      state: {
        ...state,
        systems: { ...state.systems, factions: newFactions },
      },
    });
    return true;
  },

  undockFromStation: () => {
    const { state } = get();
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          factions: undockFromStation(state.systems.factions),
        },
      },
    });
  },

  registerWithStation: (stationId) => {
    const { state } = get();
    const galaxy = generateGalaxy(state.galaxy.seed);
    const system = galaxy.find(entry => entry.stationId === stationId);
    if (!system || !system.factionId) return false;

    const sysIndex = system.id === 'home' ? 0 : parseInt(system.id.replace('sys-', ''), 10);
    const station = getStationInSystem(system, state.galaxy.seed, isNaN(sysIndex) ? 0 : sysIndex);
    if (!station) return false;

    const factions = state.systems.factions;
    if (factions.dockedStationId !== station.id) return false;

    const rep = factions.rep[station.factionId] ?? 0;
    if (rep < station.registrationRepRequired) return false;

    const credits = state.resources['credits'] ?? 0;
    const registeredStations = factions.registeredStations ?? [];
    const alreadyRegistered = registeredStations.includes(station.id);
    if (!alreadyRegistered && credits < station.registrationCost) return false;

    set({
      state: {
        ...state,
        resources: alreadyRegistered
          ? state.resources
          : { ...state.resources, credits: credits - station.registrationCost },
        systems: {
          ...state.systems,
          factions: {
            ...factions,
            registeredStations: alreadyRegistered ? registeredStations : [...registeredStations, station.id],
            homeStationId: station.id,
            homeStationSystemId: system.id,
          },
        },
      },
    });
    return true;
  },

  setHomeStation: (stationId, systemId) => {
    const { state } = get();
    const factions = state.systems.factions;
    const existing = factions.registeredStations ?? [];
    const outpost = factions.outposts[systemId];
    const isKnownOutpost = outpost?.id === stationId;
    if (!existing.includes(stationId) && !isKnownOutpost) return;
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          factions: {
            ...factions,
            homeStationId: stationId,
            homeStationSystemId: systemId,
            registeredStations: existing,
          },
        },
      },
    });
  },

  deployPOS: (systemId) => {
    const { state } = get();
    const factions = state.systems.factions;
    const existingOutpost = factions.outposts[systemId];
    if (existingOutpost) return false;

    const posCores = state.resources['pos-core'] ?? 0;
    if (posCores < 1) return false;

    const fleetsInSystem = Object.values(state.systems.fleet.fleets).filter(fleet => fleet.currentSystemId === systemId && fleet.shipIds.length > 0);
    if (fleetsInSystem.length === 0) return false;

    const system = getSystemById(state.galaxy.seed, systemId);
    const outpostId = getOutpostId(systemId);
    const outpost = {
      id: outpostId,
      systemId,
      name: getOutpostDisplayName(system.name),
      builtAt: Date.now(),
      level: 1,
      storageBonus: 0.5,
    };

    set({
      state: {
        ...state,
        resources: { ...state.resources, 'pos-core': posCores - 1 },
        systems: {
          ...state.systems,
          structures: {
            ...state.systems.structures,
            levels: { ...state.systems.structures.levels, [outpostId]: 1 },
          },
          factions: {
            ...factions,
            outposts: { ...factions.outposts, [systemId]: outpost },
            homeStationId: outpostId,
            homeStationSystemId: systemId,
          },
        },
      },
    });
    return true;
  },

  // ── Galaxy / Travel ─────────────────────────────────────────────────────

  initiateWarp: (toSystemId) => {
    const { state } = get();
    const galaxy = state.galaxy;
    if (galaxy.warp) return false;                        // already in warp
    if (galaxy.currentSystemId === toSystemId) return false; // already here

    const seed = galaxy.seed;
    const fromSystem = getSystemById(seed, galaxy.currentSystemId);
    const toSystem   = getSystemById(seed, toSystemId);
    const duration   = calcWarpDuration(state, fromSystem, toSystem);

    set({
      state: {
        ...state,
        // Pause all mining belts while in warp
        systems: {
          ...state.systems,
          mining: {
            ...state.systems.mining,
            targets: Object.fromEntries(
              Object.keys(state.systems.mining.targets).map(k => [k, false]),
            ),
          },
        },
        galaxy: {
          ...galaxy,
          warp: {
            fromSystemId: galaxy.currentSystemId,
            toSystemId,
            startedAt: Date.now(),
            durationSeconds: duration,
            progress: 0,
          },
        },
      },
    });
    return true;
  },

  cancelWarp: () => {
    const { state } = get();
    const warp = state.galaxy.warp;
    if (!warp) return;
    // Can only cancel before 50% through
    const progress = Math.min(1, (Date.now() - warp.startedAt) / 1000 / warp.durationSeconds);
    if (progress >= 0.5) return;
    set({ state: { ...state, galaxy: { ...state.galaxy, warp: null } } });
  },

  scanSystem: (systemId) => {
    const { state } = get();
    set({
      state: {
        ...state,
        galaxy: {
          ...state.galaxy,
          scannedSystems: { ...state.galaxy.scannedSystems, [systemId]: true },
        },
      },
    });
  },

  getGalaxy: () => {
    return generateGalaxy(get().state.galaxy.seed);
  },

  // ── Fleet Commander ───────────────────────────────────────────────────────

  designateFleetCommander: (fleetId, pilotId) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet) return false;

    if (pilotId !== null) {
      const pilot = state.systems.fleet.pilots[pilotId];
      if (!pilot) return false;
      const pilotShipId = pilot.assignedShipId;
      const inFleet = pilotShipId && fleet.shipIds.includes(pilotShipId);
      if (!inFleet) return false;
    }

    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            fleets: {
              ...state.systems.fleet.fleets,
              [fleetId]: { ...fleet, commanderId: pilotId },
            },
          },
        },
      },
    });
    return true;
  },

  queueCommanderSkill: (pilotId, skillId, targetLevel) => {
    const { state } = get();
    const pilot = state.systems.fleet.pilots[pilotId];
    if (!pilot) return false;

    if (!COMMANDER_SKILL_DEFINITIONS[skillId]) return false;

    const currentLevel = pilot.commandSkills?.levels[skillId] ?? 0;
    if (targetLevel <= currentLevel) return false;

    const existing = pilot.commandSkills?.queue ?? [];
    if (existing.some(e => e.skillId === skillId && e.targetLevel === targetLevel)) return false;

    const newQueue = [...existing, { skillId, targetLevel }];
    const cs = pilot.commandSkills ?? { levels: {}, queue: [], activeSkillId: null, activeProgress: 0 };

    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            pilots: {
              ...state.systems.fleet.pilots,
              [pilotId]: {
                ...pilot,
                commandSkills: {
                  ...cs,
                  queue: newQueue,
                  activeSkillId: cs.activeSkillId ?? skillId,
                  activeProgress: cs.activeSkillId ? cs.activeProgress : 0,
                },
              },
            },
          },
        },
      },
    });
    return true;
  },

  removeCommanderSkillFromQueue: (pilotId, index) => {
    const { state } = get();
    const pilot = state.systems.fleet.pilots[pilotId];
    if (!pilot) return;
    const cs = pilot.commandSkills ?? { levels: {}, queue: [], activeSkillId: null, activeProgress: 0 };
    const newQueue = cs.queue.filter((_, i) => i !== index);
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            pilots: {
              ...state.systems.fleet.pilots,
              [pilotId]: { ...pilot, commandSkills: { ...cs, queue: newQueue } },
            },
          },
        },
      },
    });
  },

  createFleetWing: (fleetId, type, name) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet) return false;
    if (fleet.fleetOrder) return false;

    const wingId = `wing-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const newWing = {
      id: wingId,
      name: name.trim() || `${type[0].toUpperCase()}${type.slice(1)} Wing`,
      type,
      shipIds: [],
      commanderId: null,
      cargoHold: {},
      escortWingId: null,
      isDispatched: false,
      haulingOriginSystemId: null,
      lastEscortCombatAt: 0,
    };

    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            fleets: {
              ...state.systems.fleet.fleets,
              [fleetId]: { ...fleet, wings: [...(fleet.wings ?? []), newWing] },
            },
          },
        },
      },
    });
    return true;
  },

  renameFleetWing: (fleetId, wingId, name) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet) return false;
    if (fleet.fleetOrder) return false;

    const trimmed = name.trim();
    if (!trimmed) return false;

    const nextWings = (fleet.wings ?? []).map(wing =>
      wing.id === wingId ? { ...wing, name: trimmed } : wing,
    );
    if (nextWings.every(wing => wing.id !== wingId)) return false;

    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            fleets: {
              ...state.systems.fleet.fleets,
              [fleetId]: { ...fleet, wings: nextWings },
            },
          },
        },
      },
    });
    return true;
  },

  deleteFleetWing: (fleetId, wingId) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet) return false;
    if (fleet.fleetOrder) return false;

    const targetWing = (fleet.wings ?? []).find(wing => wing.id === wingId);
    if (!targetWing) return false;
    if (targetWing.isDispatched) return false;

    const nextWings = (fleet.wings ?? [])
      .filter(wing => wing.id !== wingId)
      .map(wing => wing.escortWingId === wingId ? { ...wing, escortWingId: null } : wing);
    const nextCargoHold = { ...fleet.cargoHold };
    for (const [resourceId, amount] of Object.entries(targetWing.cargoHold ?? {})) {
      if (amount > 0) nextCargoHold[resourceId] = (nextCargoHold[resourceId] ?? 0) + amount;
    }

    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            fleets: {
              ...state.systems.fleet.fleets,
              [fleetId]: { ...fleet, cargoHold: nextCargoHold, wings: nextWings },
            },
          },
        },
      },
    });
    return true;
  },

  designateWingCommander: (fleetId, wingId, pilotId) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet) return false;
    if (fleet.fleetOrder) return false;

    const targetWing = (fleet.wings ?? []).find(wing => wing.id === wingId);
    if (!targetWing || targetWing.isDispatched) return false;

    if (pilotId !== null) {
      const pilot = state.systems.fleet.pilots[pilotId];
      if (!pilot?.assignedShipId) return false;
      if (!targetWing.shipIds.includes(pilot.assignedShipId)) return false;
    }

    const nextWings = (fleet.wings ?? []).map(wing => {
      if (pilotId !== null && wing.commanderId === pilotId) {
        return wing.id === wingId ? { ...wing, commanderId: pilotId } : { ...wing, commanderId: null };
      }
      return wing.id === wingId ? { ...wing, commanderId: pilotId } : wing;
    });

    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            fleets: {
              ...state.systems.fleet.fleets,
              [fleetId]: { ...fleet, wings: nextWings },
            },
          },
        },
      },
    });
    return true;
  },

  assignShipToWing: (fleetId, shipId, wingId) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet) return false;
    if (fleet.fleetOrder) return false;
    if (!fleet.shipIds.includes(shipId)) return false;
    const wings = fleet.wings ?? [];
    const sourceWing = wings.find(wing => wing.shipIds.includes(shipId));
    const targetWing = wingId !== null ? wings.find(wing => wing.id === wingId) : null;
    if (wingId !== null && !targetWing) return false;
    if (sourceWing?.isDispatched || targetWing?.isDispatched) return false;

    const ship = state.systems.fleet.ships[shipId];
    if (ship?.fleetOrder) return false;

    const nextWings = wings.map(wing => {
      const withoutShip = wing.shipIds.filter(id => id !== shipId);
      const nextShipIds = wing.id === wingId ? [...withoutShip, shipId] : withoutShip;
      const commanderShipId = wing.commanderId ? state.systems.fleet.pilots[wing.commanderId]?.assignedShipId : null;
      return {
        ...wing,
        shipIds: nextShipIds,
        commanderId: commanderShipId && nextShipIds.includes(commanderShipId) ? wing.commanderId : null,
      };
    });

    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            fleets: {
              ...state.systems.fleet.fleets,
              [fleetId]: { ...fleet, wings: nextWings },
            },
          },
        },
      },
    });
    return true;
  },

  assignWingToMiningBelt: (fleetId, wingId, beltId) => {
    const newState = assignWingToMiningBelt(get().state, fleetId, wingId, beltId);
    if (!newState) return false;
    const evaluatedTutorial = evaluateTutorialState(newState);
    set({
      state: tutorialStatesEqual(newState.tutorial, evaluatedTutorial)
        ? newState
        : { ...newState, tutorial: evaluatedTutorial },
    });
    return true;
  },

  setWingEscort: (fleetId, wingId, escortWingId) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet) return false;
    if (fleet.fleetOrder) return false;

    const wings = fleet.wings ?? [];
    const targetWing = wings.find(wing => wing.id === wingId);
    if (!targetWing) return false;
    if (targetWing.isDispatched) return false;
    if (escortWingId === wingId) return false;
    if (escortWingId !== null) {
      const escortWing = wings.find(wing => wing.id === escortWingId);
      if (!escortWing || escortWing.type !== 'combat' || escortWing.isDispatched) return false;
      if (wings.some(wing => wing.id !== wingId && wing.escortWingId === escortWingId)) return false;
    }

    const nextWings = wings.map(wing =>
      wing.id === wingId ? { ...wing, escortWingId } : wing,
    );

    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            fleets: {
              ...state.systems.fleet.fleets,
              [fleetId]: { ...fleet, wings: nextWings },
            },
          },
        },
      },
    });
    return true;
  },

  // ── Exploration ───────────────────────────────────────────────────────────

  setFleetScanning: (fleetId, scanning) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet) return false;
    set({
      state: {
        ...state,
        systems: {
          ...state.systems,
          fleet: {
            ...state.systems.fleet,
            fleets: {
              ...state.systems.fleet.fleets,
              [fleetId]: { ...fleet, isScanning: scanning },
            },
          },
        },
      },
    });
    return true;
  },

  lootSite: (fleetId, anomalyId) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet) return false;

    const systemId = fleet.currentSystemId ?? state.galaxy.currentSystemId;
    const systemAnomalies = state.galaxy.anomalies[systemId] ?? [];
    const anomaly = systemAnomalies.find(a => a.id === anomalyId);
    if (!anomaly || !anomaly.revealed || anomaly.depleted) return false;

    const isDataSite  = anomaly.type === 'data-site';
    const isRelicSite = anomaly.type === 'relic-site';
    if (!isDataSite && !isRelicSite) return false;

    const hasHacking    = isDataSite  && !!state.unlocks['loot-data-sites'];
    const hasArchaeology = isRelicSite && !!state.unlocks['loot-relic-sites'];
    if (!hasHacking && !hasArchaeology) return false;

    // Award loot into state.resources
    const loot: Record<string, number> = isDataSite
      ? { 'datacore-electronic': 2 + Math.floor(Math.random() * 3), 'datacore-mechanical': 1 + Math.floor(Math.random() * 2) }
      : { 'advanced-alloy': 3 + Math.floor(Math.random() * 4), 'datacore-starship': 1 + Math.floor(Math.random() * 2) };

    const newResources = { ...state.resources };
    for (const [id, qty] of Object.entries(loot)) {
      newResources[id] = (newResources[id] ?? 0) + qty;
    }

    const updatedAnomalies = systemAnomalies.map(a =>
      a.id === anomalyId ? { ...a, depleted: true } : a,
    );

    set({
      state: {
        ...state,
        resources: newResources,
        galaxy: {
          ...state.galaxy,
          anomalies: { ...state.galaxy.anomalies, [systemId]: updatedAnomalies },
        },
      },
    });
    return true;
  },

  activateOrePocket: (fleetId, anomalyId) => {
    const { state } = get();
    const fleet = state.systems.fleet.fleets[fleetId];
    if (!fleet) return false;

    const systemId = fleet.currentSystemId ?? state.galaxy.currentSystemId;
    const systemAnomalies = state.galaxy.anomalies[systemId] ?? [];
    const anomaly = systemAnomalies.find(a => a.id === anomalyId);
    if (!anomaly || !anomaly.revealed || anomaly.depleted || anomaly.type !== 'ore-pocket') return false;

    // Award a bonus ore haul proportional to the fleet's mining power
    const shipCount = getOperationalFleetShipIds(fleet).length;
    const bonusOre  = 200 + shipCount * 80;
    const newResources = { ...state.resources };
    newResources['ferrite'] = (newResources['ferrite'] ?? 0) + bonusOre;

    const updatedAnomalies = systemAnomalies.map(a =>
      a.id === anomalyId ? { ...a, depleted: true, bonusExpiresAt: null } : a,
    );

    set({
      state: {
        ...state,
        resources: newResources,
        galaxy: {
          ...state.galaxy,
          anomalies: { ...state.galaxy.anomalies, [systemId]: updatedAnomalies },
        },
      },
    });
    return true;
  },

  // ── Persistence ──────────────────────────────────────────────────────────

  saveToStorage: () => {
    saveGame(get().state);
  },

  loadFromStorage: () => {
    const save = loadGame();
    if (!save) return;

    // Version guard: discard saves from pre-pivot (version < 2)
    if (save.version < 2) {
      console.info('[Idleverse] Old save format detected (v%d). Starting fresh.', save.version);
      return;
    }

    // Patch any systems added after the save was created
    const defaults      = createInitialState();
    const patchedSystems = { ...defaults.systems, ...save.state.systems };
    const patchedUnlocks = { ...defaults.unlocks,  ...save.state.unlocks };
    const patchedSettings = { ...defaults.settings, ...save.state.settings };
    const patchedResources = { ...defaults.resources, ...save.state.resources };
    const patchedNotifications = {
      ...defaults.notifications,
      ...save.state.notifications,
      entries: Array.isArray(save.state.notifications?.entries) ? save.state.notifications.entries as NotificationEntry[] : [],
    };

    // Patch fleet — ensure pilots + recruitmentOffers exist (added after initial release)
    if (!patchedSystems.fleet.pilots) {
      patchedSystems.fleet = { ...patchedSystems.fleet, pilots: defaults.systems.fleet.pilots };
    }
    if (!patchedSystems.fleet.recruitmentOffers) {
      patchedSystems.fleet = { ...patchedSystems.fleet, recruitmentOffers: [] };
    }
    if (!patchedSystems.fleet.recruitmentMilestones) {
      patchedSystems.fleet = { ...patchedSystems.fleet, recruitmentMilestones: {} };
    }
    patchedSystems.fleet = {
      ...patchedSystems.fleet,
      recruitmentOffers: (patchedSystems.fleet.recruitmentOffers ?? []).map(offer => ({
        ...offer,
        source: offer.source ?? 'contracts',
      })),
    };
    if (!patchedSystems.fleet.fleets) {
      patchedSystems.fleet = { ...patchedSystems.fleet, fleets: {} };
    }
    if (patchedSystems.fleet.maxFleets === undefined) {
      patchedSystems.fleet = { ...patchedSystems.fleet, maxFleets: defaults.systems.fleet.maxFleets };
    }
    // Patch existing ships — add fleetId field if missing; migrate stale activity values
    const VALID_ACTIVITIES = new Set(['idle', 'mining', 'hauling', 'transport']);
    const patchedShips: typeof patchedSystems.fleet.ships = {};
    for (const [id, ship] of Object.entries(patchedSystems.fleet.ships)) {
      const shipWithFleet = ship.fleetId === undefined ? { ...ship, fleetId: null } : ship;
      const activity = VALID_ACTIVITIES.has(shipWithFleet.activity) ? shipWithFleet.activity : 'idle' as const;
      patchedShips[id] = activity !== shipWithFleet.activity ? { ...shipWithFleet, activity } : shipWithFleet;
    }
    patchedSystems.fleet = { ...patchedSystems.fleet, ships: patchedShips };
    // Patch combatLog — added in Phase 2
    if (!patchedSystems.fleet.combatLog) {
      patchedSystems.fleet = { ...patchedSystems.fleet, combatLog: [] };
    }
    // Patch fleet combatOrder — added in Phase 2
    const patchedFleets: typeof patchedSystems.fleet.fleets = {};
    for (const [id, fleet] of Object.entries(patchedSystems.fleet.fleets)) {
      patchedFleets[id] = fleet.combatOrder === undefined ? { ...fleet, combatOrder: null } : fleet;
    }
    patchedSystems.fleet = { ...patchedSystems.fleet, fleets: patchedFleets };

    // Patch factions — added in v3; default to fresh faction state for older saves
    if (!patchedSystems.factions) {
      patchedSystems.factions = defaults.systems.factions;
    }

    // Patch manufacturing — blueprints/researchJobs/copyJobs added in Phase 3
    if (!patchedSystems.manufacturing.blueprints) {
      patchedSystems.manufacturing = { ...patchedSystems.manufacturing, blueprints: defaults.systems.manufacturing.blueprints };
    }
    if (!patchedSystems.manufacturing.researchJobs) {
      patchedSystems.manufacturing = { ...patchedSystems.manufacturing, researchJobs: [] };
    }
    if (!patchedSystems.manufacturing.copyJobs) {
      patchedSystems.manufacturing = { ...patchedSystems.manufacturing, copyJobs: [] };
    }
    const existingBlueprintItemIds = new Set(
      (patchedSystems.manufacturing.blueprints ?? []).map(bp => bp.itemId),
    );
    const missingStarterBlueprints = defaults.systems.manufacturing.blueprints.filter(
      bp => !existingBlueprintItemIds.has(bp.itemId),
    );
    if (missingStarterBlueprints.length > 0) {
      patchedSystems.manufacturing = {
        ...patchedSystems.manufacturing,
        blueprints: [...patchedSystems.manufacturing.blueprints, ...missingStarterBlueprints],
      };
    }
    patchedSystems.market = {
      ...patchedSystems.market,
      prices: { ...defaults.systems.market.prices, ...(patchedSystems.market.prices ?? {}) },
    };

    // Patch fleet Phase 4 — discoveries feed, isScanning flag on every fleet; FC-1b cargoHold; FC-3 wings
    if (!patchedSystems.fleet.discoveries) {
      patchedSystems.fleet = { ...patchedSystems.fleet, discoveries: [] };
    }
    const patchedFleets4: typeof patchedSystems.fleet.fleets = {};
    for (const [id, fleet] of Object.entries(patchedSystems.fleet.fleets)) {
      let f = fleet.isScanning === undefined ? { ...fleet, isScanning: false } : fleet;
      if (f.cargoHold === undefined) f = { ...f, cargoHold: {} };
      if (!Array.isArray(f.wings)) f = { ...f, wings: [] };
      f = {
        ...f,
        wings: (f.wings ?? []).map(wing => ({ ...wing, commanderId: wing.commanderId ?? null, cargoHold: wing.cargoHold ?? {}, lastEscortCombatAt: wing.lastEscortCombatAt ?? 0 })),
      };
      patchedFleets4[id] = f;
    }
    patchedSystems.fleet = { ...patchedSystems.fleet, fleets: patchedFleets4 };

    // Recompute skill-derived modifiers from saved skill levels (safety net)
    const recomputedModifiers = buildModifiersFromSkills(patchedSystems.skills);
    const recomputedUnlocks   = buildUnlocksFromSkills(patchedSystems.skills);

    // Migrate pilot → corp (FC-1G): old saves had state.pilot, new saves use state.corp
    const migratedCorp: typeof defaults.corp = save.state.corp ?? {
      name:      (save.state as GameState & { pilot?: { name?: string; birthdate?: number } }).pilot?.name ?? defaults.corp.name,
      foundedAt: (save.state as GameState & { pilot?: { name?: string; birthdate?: number; foundedAt?: number } }).pilot?.foundedAt
        ?? (save.state as GameState & { pilot?: { birthdate?: number } }).pilot?.birthdate
        ?? defaults.corp.foundedAt,
    };

    const patchedState: GameState = {
      ...save.state,
      corp:      migratedCorp,
      resources: patchedResources,
      settings:  patchedSettings,
      systems:   patchedSystems,
      unlocks:   { ...patchedUnlocks,  ...recomputedUnlocks },
      modifiers: { ...save.state.modifiers, ...recomputedModifiers },
      notifications: patchedNotifications,
      tutorial: save.state.tutorial ?? defaults.tutorial,
      // Patch galaxy if it was added after this save was written
      galaxy:    save.state.galaxy
        ? {
            ...save.state.galaxy,
            galacticSliceZ:  save.state.galaxy.galacticSliceZ  ?? 0.5,
            npcGroupStates:  save.state.galaxy.npcGroupStates ?? {},
            anomalies:       save.state.galaxy.anomalies       ?? {},
          }
        : defaults.galaxy,
    };

    const tutorialEvaluatedState = {
      ...patchedState,
      tutorial: evaluateTutorialState(patchedState),
    };
    const { newState, summary } = processOfflineProgress(tutorialEvaluatedState, Date.now());
    set({
      state: newState,
      offlineSummary: summary.elapsedSeconds > 60 ? summary : null,
    });
  },

  dismissOfflineSummary: () => set({ offlineSummary: null }),

  completeTutorialStep: (stepId) => set((store) => ({
    state: {
      ...store.state,
      tutorial: completeTutorialStepState(store.state, stepId),
    },
  })),

  skipTutorial: () => set((store) => ({
    state: {
      ...store.state,
      tutorial: skipTutorialState(store.state),
    },
  })),

  restartTutorial: () => set((store) => ({
    state: {
      ...store.state,
      tutorial: restartTutorialState(),
    },
  })),

  evaluateTutorialProgress: () => set((store) => {
    const nextTutorial = evaluateTutorialState(store.state);
    if (tutorialStatesEqual(store.state.tutorial, nextTutorial)) {
      return store;
    }
    return {
      state: {
        ...store.state,
        tutorial: nextTutorial,
      },
    };
  }),

  markNotificationRead: (notificationId) => set((store) => ({
    state: {
      ...store.state,
      notifications: {
        entries: store.state.notifications.entries.map(entry => (
          entry.id === notificationId && entry.readAt === null
            ? { ...entry, readAt: Date.now() }
            : entry
        )),
      },
    },
  })),

  markAllNotificationsRead: () => set((store) => ({
    state: {
      ...store.state,
      notifications: {
        entries: store.state.notifications.entries.map(entry => (
          entry.readAt === null ? { ...entry, readAt: Date.now() } : entry
        )),
      },
    },
  })),

  archiveNotification: (notificationId) => set((store) => ({
    state: {
      ...store.state,
      notifications: {
        entries: store.state.notifications.entries.map(entry => (
          entry.id === notificationId
            ? { ...entry, archivedAt: entry.archivedAt ?? Date.now(), readAt: entry.readAt ?? Date.now() }
            : entry
        )),
      },
    },
  })),

  restoreNotification: (notificationId) => set((store) => ({
    state: {
      ...store.state,
      notifications: {
        entries: store.state.notifications.entries.map(entry => (
          entry.id === notificationId ? { ...entry, archivedAt: null } : entry
        )),
      },
    },
  })),

  archiveReadNotifications: () => set((store) => ({
    state: {
      ...store.state,
      notifications: {
        entries: store.state.notifications.entries.map(entry => (
          entry.readAt !== null && entry.archivedAt === null
            ? { ...entry, archivedAt: Date.now() }
            : entry
        )),
      },
    },
  })),

  clearSave: () => {
    deleteSave();
    set({ state: createInitialState(), offlineSummary: null });
  },
}));

// Export for backwards-compat with any surviving imports
export type { SkillQueueEntry };

