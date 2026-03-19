import type {
  GameState,
  NotificationFocusTarget,
  TutorialState,
  TutorialStepId,
} from '@/types/game.types';
import { formatResourceAmount } from '@/game/resources/resourceRegistry';
import { skillTrainingSeconds } from '@/game/balance/constants';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { formatTrainingEta } from '@/game/systems/skills/skills.logic';
import { generateGalaxy, getSystemBeltIds, getSystemById, systemDistance } from '@/game/galaxy/galaxy.gen';

export const TUTORIAL_ENABLED = false;

function createDisabledTutorialState(): TutorialState {
  return {
    currentStepId: null,
    completedStepIds: [],
    skippedAt: Date.now(),
    completedAt: null,
  };
}

export interface TutorialFleetTravelContext {
  starterFleetId: string | null;
  targetSystemId: string | null;
  targetSystemName: string | null;
  targetBeltId: string | null;
  targetBodyId: string | null;
}

export interface TutorialStepDefinition {
  id: TutorialStepId;
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  completionMode: 'acknowledge' | 'automatic';
  panelId: NotificationFocusTarget['panelId'];
  focusTarget?: NotificationFocusTarget;
  isComplete?(state: GameState): boolean;
}

export interface TutorialStepMetric {
  label: string;
  value: string;
  tone: 'cyan' | 'emerald' | 'amber' | 'violet' | 'slate';
}

export interface TutorialStepChecklistItem {
  label: string;
  detail: string;
  status: 'complete' | 'active' | 'pending';
}

export interface TutorialStepProgress {
  label: string;
  valueLabel: string;
  percent: number;
  tone: 'cyan' | 'emerald' | 'amber' | 'violet';
}

export interface TutorialStepPresentation {
  helperText: string;
  lockMessage: string;
  metrics: TutorialStepMetric[];
  checklist: TutorialStepChecklistItem[];
  progress: TutorialStepProgress | null;
  uiTerms: string[];
  spotlightIds: string[];
  allowedInteractionIds: string[];
  anchorId: string | null;
}

export const TUTORIAL_STEP_ORDER: TutorialStepId[] = [
  'welcome-briefing',
  'command-deck',
  'queue-first-skill',
  'complete-first-skill',
  'first-sale',
  'fleet-command-intro',
  'starmap-dispatch-fleet',
  'fleet-arrival-watch',
  'system-assign-mining',
  'mining-readout',
  'guidance-handoff',
];

function lifetimeSales(state: GameState) {
  return Object.values(state.systems.market.lifetimeSold).reduce((sum, value) => sum + value, 0);
}

function marketUnlocked(state: GameState) {
  return !!state.unlocks['system-market'];
}

function hasTradeQueuedOrActive(state: GameState) {
  const skills = state.systems.skills;
  return skills.activeSkillId === 'trade' || skills.queue.some(entry => entry.skillId === 'trade');
}

function getTradeStepStatus(state: GameState) {
  const skills = state.systems.skills;
  const currentLevel = skills.levels.trade ?? 0;
  const active = skills.activeSkillId === 'trade';
  const queuedEntryIndex = skills.queue.findIndex(entry => entry.skillId === 'trade' && entry.targetLevel >= 1);
  const queued = queuedEntryIndex >= 0 || active;
  const totalSeconds = currentLevel >= 5 ? 0 : skillTrainingSeconds(SKILL_DEFINITIONS.trade.rank, currentLevel + 1);
  const progressSeconds = active ? Math.min(skills.activeProgress, totalSeconds) : currentLevel >= 1 ? totalSeconds : 0;
  const remainingSeconds = currentLevel >= 1
    ? 0
    : active
      ? Math.max(0, totalSeconds - progressSeconds)
      : totalSeconds;
  const percent = currentLevel >= 1
    ? 100
    : active && totalSeconds > 0
      ? Math.max(2, Math.min(100, Math.round((progressSeconds / totalSeconds) * 100)))
      : queued
        ? 4
        : 0;

  return {
    currentLevel,
    active,
    queued,
    queuedEntryIndex,
    totalSeconds,
    progressSeconds,
    remainingSeconds,
    percent,
  };
}

function getFirstSellCandidate(state: GameState) {
  return Object.entries(state.resources)
    .filter(([resourceId, amount]) => resourceId !== 'credits' && amount > 0 && (state.systems.market.prices[resourceId] ?? 0) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]))[0] ?? null;
}

function firstBranchUnlocked(state: GameState) {
  return [
    'system-market',
    'system-manufacturing',
    'system-reprocessing',
    'system-fleet',
    'system-exploration',
  ].some(unlockKey => state.unlocks[unlockKey]);
}

function getStarterFleetId(state: GameState) {
  if (state.systems.fleet.fleets['fleet-starter']) return 'fleet-starter';
  return Object.keys(state.systems.fleet.fleets)[0] ?? null;
}

export function getTutorialFleetTravelContext(state: GameState): TutorialFleetTravelContext {
  const starterFleetId = getStarterFleetId(state);
  if (!starterFleetId) {
    return {
      starterFleetId: null,
      targetSystemId: null,
      targetSystemName: null,
      targetBeltId: null,
      targetBodyId: null,
    };
  }

  const homeSystem = getSystemById(state.galaxy.seed, 'home');
  const galaxy = generateGalaxy(state.galaxy.seed);
  const targetSystem = galaxy
    .filter(system => system.id !== 'home' && getSystemBeltIds(system).length > 0)
    .sort((left, right) => systemDistance(homeSystem, left) - systemDistance(homeSystem, right))[0] ?? null;
  const targetBeltId = targetSystem ? getSystemBeltIds(targetSystem)[0] ?? null : null;
  const targetBodyId = targetSystem?.bodies.find(body => body.beltIds.includes(targetBeltId ?? ''))?.id ?? null;

  return {
    starterFleetId,
    targetSystemId: targetSystem?.id ?? null,
    targetSystemName: targetSystem?.name ?? null,
    targetBeltId,
    targetBodyId,
  };
}

function starterFleetDispatchedToTarget(state: GameState, context: TutorialFleetTravelContext) {
  if (!context.starterFleetId || !context.targetSystemId) return false;
  const fleet = state.systems.fleet.fleets[context.starterFleetId];
  return fleet?.fleetOrder?.destinationSystemId === context.targetSystemId;
}

function starterFleetArrivedAtTarget(state: GameState, context: TutorialFleetTravelContext) {
  if (!context.starterFleetId || !context.targetSystemId) return false;
  const fleet = state.systems.fleet.fleets[context.starterFleetId];
  return !!fleet && fleet.currentSystemId === context.targetSystemId && fleet.fleetOrder === null;
}

function starterFleetMiningTargetAssigned(state: GameState, context: TutorialFleetTravelContext) {
  if (!context.starterFleetId || !context.targetSystemId || !context.targetBeltId) return false;
  const fleet = state.systems.fleet.fleets[context.starterFleetId];
  if (!fleet || fleet.currentSystemId !== context.targetSystemId) return false;
  return fleet.shipIds.some(shipId => {
    const ship = state.systems.fleet.ships[shipId];
    return ship?.activity === 'mining' && ship.assignedBeltId === context.targetBeltId;
  });
}

function getStarterFleetTravelStatus(state: GameState, context: TutorialFleetTravelContext) {
  if (!context.starterFleetId) {
    return { fleetName: 'Starter fleet', currentSystemName: 'Unknown', inTransit: false, destinationName: 'Unknown', assignedShipCount: 0 };
  }

  const fleet = state.systems.fleet.fleets[context.starterFleetId];
  if (!fleet) {
    return { fleetName: 'Starter fleet', currentSystemName: 'Unknown', inTransit: false, destinationName: 'Unknown', assignedShipCount: 0 };
  }

  const currentSystemName = getSystemById(state.galaxy.seed, fleet.currentSystemId).name;
  const destinationName = fleet.fleetOrder?.destinationSystemId
    ? getSystemById(state.galaxy.seed, fleet.fleetOrder.destinationSystemId).name
    : context.targetSystemName ?? currentSystemName;
  const assignedShipCount = fleet.shipIds.filter(shipId => {
    const ship = state.systems.fleet.ships[shipId];
    return ship?.activity === 'mining' && ship.assignedBeltId === context.targetBeltId;
  }).length;

  return {
    fleetName: fleet.name,
    currentSystemName,
    inTransit: fleet.fleetOrder !== null,
    destinationName,
    assignedShipCount,
  };
}

export function createInitialTutorialState(): TutorialState {
  if (!TUTORIAL_ENABLED) {
    return createDisabledTutorialState();
  }

  return {
    currentStepId: TUTORIAL_STEP_ORDER[0],
    completedStepIds: [],
    skippedAt: null,
    completedAt: null,
  };
}

export function getTutorialDefinitions(state: GameState): TutorialStepDefinition[] {
  const fleetContext = getTutorialFleetTravelContext(state);
  return [
    {
      id: 'welcome-briefing',
      icon: 'overview',
      eyebrow: 'Tutorial',
      title: 'Welcome, Director',
      description: 'Your starter mining wing is already working. This tour shows what the corp is doing, where to look first, and how to turn that first trickle of ore into real progression.',
      actionLabel: 'Show the command deck',
      completionMode: 'acknowledge',
      panelId: 'overview',
    },
    {
      id: 'command-deck',
      icon: 'data',
      eyebrow: 'Orientation',
      title: 'Use Overview as mission control',
      description: 'Operations is your live status board. Guidance is where Idleverse explains what the next meaningful action is. When you feel lost, this is the place to re-center.',
      actionLabel: 'Open Guidance mode',
      completionMode: 'acknowledge',
      panelId: 'overview',
      focusTarget: { panelId: 'overview', entityType: 'panel', entityId: 'overview-guidance', panelSection: 'guidance' },
    },
    {
      id: 'queue-first-skill',
      icon: 'skills',
      eyebrow: 'Progression',
      title: 'Start training Trade I',
      description: 'The tutorial now commits to the first real unlock. Train Trade I so the market comes online and the opening mining loop turns into visible income.',
      actionLabel: 'Open Trade I training',
      completionMode: 'automatic',
      panelId: 'skills',
      focusTarget: { panelId: 'skills', entityType: 'skill', entityId: 'trade' },
      isComplete: (currentState) => hasTradeQueuedOrActive(currentState),
    },
    {
      id: 'complete-first-skill',
      icon: 'skills',
      eyebrow: 'Training Lock',
      title: 'Wait for Trade I to complete',
      description: 'The market stays locked until Trade I actually finishes. Watch the training bar here so the dependency is explicit: no unlock, no market, no first sale.',
      actionLabel: 'Open Trade I status',
      completionMode: 'automatic',
      panelId: 'skills',
      focusTarget: { panelId: 'skills', entityType: 'skill', entityId: 'trade' },
      isComplete: (currentState) => (currentState.systems.skills.levels.trade ?? 0) >= 1,
    },
    {
      id: 'first-sale',
      icon: 'market',
      eyebrow: 'Economic Loop',
      title: 'Convert ore into credits',
      description: 'Now the loop pays off. Sell a small batch from the highlighted market listing so the player sees raw extraction become liquid credits.',
      actionLabel: 'Open market listings',
      completionMode: 'automatic',
      panelId: 'market',
      focusTarget: { panelId: 'market', entityType: 'panel', entityId: 'market-listings', panelSection: 'listings' },
      isComplete: (currentState) => marketUnlocked(currentState) && lifetimeSales(currentState) > 0,
    },
    {
      id: 'fleet-command-intro',
      icon: 'fleet',
      eyebrow: 'Fleet Command',
      title: 'Inspect your starter fleet',
      description: 'You already have a live mining fleet. Before sending it anywhere, confirm which fleet is moving, where it is staged, and what posture it is currently holding.',
      actionLabel: 'Open the starter fleet',
      completionMode: 'acknowledge',
      panelId: 'fleet',
      focusTarget: fleetContext.starterFleetId
        ? { panelId: 'fleet', entityType: 'fleet', entityId: fleetContext.starterFleetId, panelSection: 'fleets' }
        : { panelId: 'fleet', entityType: 'panel', entityId: 'fleet-fleets', panelSection: 'fleets' },
    },
    {
      id: 'starmap-dispatch-fleet',
      icon: 'starmap',
      eyebrow: 'Route Planning',
      title: fleetContext.targetSystemName ? `Dispatch to ${fleetContext.targetSystemName}` : 'Dispatch to a new mining system',
      description: fleetContext.targetSystemName
        ? `Use the route planner to move the starter fleet out of home space and into ${fleetContext.targetSystemName}. This is the first time the tour asks you to project mining into a new system.`
        : 'Use the route planner to move the starter fleet out of home space and into a new mining system.',
      actionLabel: 'Open the route planner',
      completionMode: 'automatic',
      panelId: 'starmap',
      focusTarget: fleetContext.targetSystemId
        ? { panelId: 'starmap', entityType: 'system', entityId: fleetContext.targetSystemId, panelSection: 'route' }
        : { panelId: 'starmap', entityType: 'panel', entityId: 'starmap-route', panelSection: 'route' },
      isComplete: (currentState) => starterFleetDispatchedToTarget(currentState, getTutorialFleetTravelContext(currentState)),
    },
    {
      id: 'fleet-arrival-watch',
      icon: 'fleet',
      eyebrow: 'Transit Watch',
      title: fleetContext.targetSystemName ? `Track arrival into ${fleetContext.targetSystemName}` : 'Track fleet arrival',
      description: 'Once the order is live, the tutorial shifts from interaction to observation. Watch the fleet status until transit completes and the destination system becomes the active mining theatre.',
      actionLabel: 'Open fleet transit status',
      completionMode: 'automatic',
      panelId: 'fleet',
      focusTarget: fleetContext.starterFleetId
        ? { panelId: 'fleet', entityType: 'fleet', entityId: fleetContext.starterFleetId, panelSection: 'fleets' }
        : { panelId: 'fleet', entityType: 'panel', entityId: 'fleet-fleets', panelSection: 'fleets' },
      isComplete: (currentState) => starterFleetArrivedAtTarget(currentState, getTutorialFleetTravelContext(currentState)),
    },
    {
      id: 'system-assign-mining',
      icon: 'system',
      eyebrow: 'System Mining',
      title: 'Assign the destination belt',
      description: 'Mining assignment happens inside the system view. Select the destination belt, choose the starter mining wing, and commit the wing to the new field.',
      actionLabel: 'Open the destination system',
      completionMode: 'automatic',
      panelId: 'system',
      focusTarget: fleetContext.targetSystemId
        ? { panelId: 'system', entityType: 'system', entityId: fleetContext.targetSystemId, panelSection: 'orrery', parentEntityId: fleetContext.targetBodyId ?? undefined }
        : { panelId: 'system', entityType: 'panel', entityId: 'system-orrery', panelSection: 'orrery' },
      isComplete: (currentState) => starterFleetMiningTargetAssigned(currentState, getTutorialFleetTravelContext(currentState)),
    },
    {
      id: 'mining-readout',
      icon: 'mining',
      eyebrow: 'Mining Readout',
      title: 'Read the mining status board',
      description: 'The Mining panel is not where assignments happen. It is where you verify that the new system is paying off by checking ore flow, storage pressure, active wings, and hauling posture.',
      actionLabel: 'Show the mining readout',
      completionMode: 'acknowledge',
      panelId: 'mining',
      focusTarget: fleetContext.starterFleetId
        ? { panelId: 'mining', entityType: 'fleet', entityId: fleetContext.starterFleetId }
        : { panelId: 'mining', entityType: 'panel', entityId: 'mining-summary' },
    },
    {
      id: 'guidance-handoff',
      icon: firstBranchUnlocked(state) ? 'success' : 'overview',
      eyebrow: 'Handoff',
      title: firstBranchUnlocked(state) ? 'You have a branch online' : 'Keep using Guidance for the next branch',
      description: firstBranchUnlocked(state)
        ? 'The corp has moved past the raw starter loop. From here, Overview Guidance keeps translating your state into concrete next steps without forcing a scripted tour.'
        : 'The first branch is still coming together. Overview Guidance remains the best place to decide whether trade, industry, fleet growth, or exploration deserves the next queue time.',
      actionLabel: 'Enter Guidance mode',
      completionMode: 'acknowledge',
      panelId: 'overview',
      focusTarget: { panelId: 'overview', entityType: 'panel', entityId: 'overview-guidance', panelSection: 'guidance' },
    },
  ];
}

export function getTutorialStepDefinition(state: GameState, stepId: TutorialStepId | null) {
  if (!stepId) return null;
  return getTutorialDefinitions(state).find(step => step.id === stepId) ?? null;
}

export function tutorialStatesEqual(left: TutorialState, right: TutorialState): boolean {
  return left.currentStepId === right.currentStepId
    && left.skippedAt === right.skippedAt
    && left.completedAt === right.completedAt
    && left.completedStepIds.length === right.completedStepIds.length
    && left.completedStepIds.every((stepId, index) => right.completedStepIds[index] === stepId);
}

export function evaluateTutorialState(state: GameState): TutorialState {
  const tutorial = state.tutorial;
  if (tutorial.skippedAt || tutorial.completedAt) return tutorial;

  const definitions = getTutorialDefinitions(state);
  const completedStepIds = [...tutorial.completedStepIds];
  const completedSet = new Set(completedStepIds);

  for (const step of definitions) {
    if (completedSet.has(step.id)) continue;
    if (step.completionMode === 'automatic' && step.isComplete?.(state)) {
      completedStepIds.push(step.id);
      completedSet.add(step.id);
    }
  }

  const nextStep = TUTORIAL_STEP_ORDER.find(stepId => !completedSet.has(stepId)) ?? null;
  if (nextStep === null) {
    return {
      ...tutorial,
      currentStepId: null,
      completedStepIds,
      completedAt: tutorial.completedAt ?? Date.now(),
    };
  }

  return {
    ...tutorial,
    currentStepId: nextStep,
    completedStepIds,
  };
}

export function completeTutorialStep(state: GameState, stepId?: TutorialStepId): TutorialState {
  const targetStepId = stepId ?? state.tutorial.currentStepId;
  if (!targetStepId) return evaluateTutorialState(state);
  if (state.tutorial.completedStepIds.includes(targetStepId)) {
    return evaluateTutorialState(state);
  }

  return evaluateTutorialState({
    ...state,
    tutorial: {
      ...state.tutorial,
      completedStepIds: [...state.tutorial.completedStepIds, targetStepId],
    },
  });
}

export function skipTutorialState(state: GameState): TutorialState {
  if (state.tutorial.skippedAt) return state.tutorial;
  return {
    ...state.tutorial,
    currentStepId: null,
    skippedAt: Date.now(),
  };
}

export function restartTutorialState(): TutorialState {
  if (!TUTORIAL_ENABLED) {
    return createDisabledTutorialState();
  }

  return createInitialTutorialState();
}

export function isTutorialActive(tutorial: TutorialState): boolean {
  return TUTORIAL_ENABLED && !tutorial.skippedAt && !tutorial.completedAt && tutorial.currentStepId !== null;
}

export function getTutorialProgressSummary(state: GameState) {
  const completedCount = state.tutorial.completedStepIds.length;
  return {
    completedCount,
    totalCount: TUTORIAL_STEP_ORDER.length,
  };
}

export function getTutorialStepPresentation(state: GameState, stepId: TutorialStepId | null): TutorialStepPresentation | null {
  if (!stepId) return null;

  const tradeStatus = getTradeStepStatus(state);
  const sellCandidate = getFirstSellCandidate(state);
  const fleetContext = getTutorialFleetTravelContext(state);
  const fleetTravelStatus = getStarterFleetTravelStatus(state, fleetContext);

  switch (stepId) {
    case 'welcome-briefing':
      return {
        helperText: 'This is a locked briefing step. Read the context, then continue into the command deck.',
        lockMessage: 'The rest of the game is locked until the opening briefing is acknowledged.',
        metrics: [
          { label: 'Active belts', value: `${Object.values(state.systems.mining.targets).filter(Boolean).length}`, tone: 'cyan' },
          { label: 'Credits', value: formatResourceAmount(state.resources.credits ?? 0, 0), tone: 'slate' },
          { label: 'Queue load', value: `${state.systems.skills.queue.length}`, tone: 'amber' },
        ],
        checklist: [
          { label: 'Read the opening briefing', detail: 'Understand that mining is already live and the tutorial will now walk the first payoff chain.', status: 'active' },
          { label: 'Continue to Overview guidance', detail: 'Use the action button to move into the first guided interface step.', status: 'pending' },
        ],
        progress: null,
        uiTerms: ['Overview'],
        spotlightIds: [],
        allowedInteractionIds: [],
        anchorId: null,
      };
    case 'command-deck': {
      const promptCount = state.tutorial.completedStepIds.includes('command-deck') ? 1 : 0;
      return {
        helperText: 'Only the highlighted Guidance tab is interactive during this step.',
        lockMessage: 'The tutorial is teaching where to recover direction when the game opens up.',
        metrics: [
          { label: 'Live training', value: state.systems.skills.activeSkillId ? 'Online' : 'Idle', tone: state.systems.skills.activeSkillId ? 'cyan' : 'slate' },
          { label: 'Market', value: marketUnlocked(state) ? 'Unlocked' : 'Locked', tone: marketUnlocked(state) ? 'emerald' : 'amber' },
          { label: 'Tour state', value: `${promptCount + 1} focus point`, tone: 'violet' },
        ],
        checklist: [
          { label: 'Switch Overview to Guidance', detail: 'The highlighted Guidance tab is where progression advice stays visible after the tour ends.', status: 'active' },
        ],
        progress: null,
        uiTerms: ['Overview', 'Operations', 'Guidance'],
        spotlightIds: ['overview-guidance-tab'],
        allowedInteractionIds: ['overview-guidance-tab'],
        anchorId: 'overview-guidance-tab',
      };
    }
    case 'queue-first-skill':
      return {
        helperText: 'Only the highlighted Trade I training control is interactive during this step.',
        lockMessage: 'Trade I is forced first so the player sees the market unlock before broader branching opens up.',
        metrics: [
          { label: 'Target', value: 'Trade I', tone: 'cyan' },
          { label: 'Train time', value: formatTrainingEta(skillTrainingSeconds(SKILL_DEFINITIONS.trade.rank, 1)), tone: 'amber' },
          { label: 'Unlock', value: 'Market panel', tone: 'emerald' },
        ],
        checklist: [
          { label: 'Open Trade skill detail', detail: 'The action button centers the correct skill if the panel is not already focused.', status: 'complete' },
          { label: 'Click Train to I', detail: 'The breathing button is the only enabled game control right now.', status: 'active' },
          { label: 'Begin live training', detail: 'As soon as the queue starts, the tutorial advances into a wait-and-watch state.', status: 'pending' },
        ],
        progress: null,
        uiTerms: ['Trade I', 'Skill Queue', 'Train to I', 'Market'],
        spotlightIds: ['skills-trade-train-next'],
        allowedInteractionIds: ['skills-trade-train-next'],
        anchorId: 'skills-trade-train-next',
      };
    case 'complete-first-skill': {
      const marketIsUnlocked = marketUnlocked(state);
      const currentStatus = tradeStatus.currentLevel >= 1
        ? 'complete'
        : tradeStatus.active
          ? 'active'
          : tradeStatus.queued
            ? 'pending'
            : 'pending';

      return {
        helperText: 'The tutorial is now waiting on real simulation progress. You cannot advance this step manually.',
        lockMessage: tradeStatus.active
          ? 'Trade I is training now. Watch the progress bar below until the market unlock fires.'
          : tradeStatus.queued
            ? 'Trade I is queued but not yet active. The tutorial remains locked until that training starts and completes.'
            : 'Trade I has not started correctly. Re-open the skill panel and verify the queue if this persists.',
        metrics: [
          { label: 'Trade level', value: `${tradeStatus.currentLevel} / 1`, tone: tradeStatus.currentLevel >= 1 ? 'emerald' : 'amber' },
          { label: 'Market', value: marketIsUnlocked ? 'Unlocked' : 'Locked', tone: marketIsUnlocked ? 'emerald' : 'amber' },
          { label: 'Remaining', value: formatTrainingEta(tradeStatus.remainingSeconds), tone: tradeStatus.active ? 'cyan' : 'slate' },
        ],
        checklist: [
          { label: 'Trade I queued', detail: tradeStatus.queued ? 'The training entry is in flight.' : 'The training entry still needs to be added.', status: tradeStatus.queued ? 'complete' : 'pending' },
          { label: 'Trade I in active training', detail: tradeStatus.active ? 'The live skill timer is advancing.' : 'This will become active automatically when it reaches the front of the queue.', status: tradeStatus.active ? 'active' : currentStatus },
          { label: 'Market unlock fires', detail: marketIsUnlocked ? 'Trade I is complete and the next tutorial step can begin.' : 'The tutorial remains locked until level I is finished.', status: marketIsUnlocked ? 'complete' : 'pending' },
        ],
        progress: {
          label: 'Trade I training progress',
          valueLabel: `${formatTrainingEta(tradeStatus.progressSeconds)} / ${formatTrainingEta(Math.max(tradeStatus.totalSeconds, tradeStatus.progressSeconds))}`,
          percent: tradeStatus.percent,
          tone: marketIsUnlocked ? 'emerald' : tradeStatus.active ? 'cyan' : 'amber',
        },
        uiTerms: ['Trade I', 'Market'],
        spotlightIds: ['skills-active-training'],
        allowedInteractionIds: [],
        anchorId: 'skills-active-training',
      };
    }
    case 'first-sale': {
      const candidateResourceId = sellCandidate?.[0] ?? null;
      const candidateAmount = Number(sellCandidate?.[1] ?? 0);
      const candidateValue = candidateResourceId
        ? formatResourceAmount((state.systems.market.prices[candidateResourceId] ?? 0) * Math.floor(candidateAmount), 0)
        : '0';

      return {
        helperText: 'Only the highlighted quantity field and Sell button are interactive during this step.',
        lockMessage: candidateResourceId
          ? 'Enter a quantity and post one sale to make the opening economy tangible.'
          : 'No sellable market stock is available yet. The tutorial will stay locked until mining produces a sellable batch.',
        metrics: [
          { label: 'Market', value: marketUnlocked(state) ? 'Unlocked' : 'Locked', tone: marketUnlocked(state) ? 'emerald' : 'amber' },
          { label: 'Ready stock', value: formatResourceAmount(candidateAmount, 0), tone: candidateAmount > 0 ? 'cyan' : 'slate' },
          { label: 'Sale value', value: `${candidateValue} ISK`, tone: candidateAmount > 0 ? 'emerald' : 'slate' },
        ],
        checklist: [
          { label: 'Trade I completed', detail: 'The market is now legally available because the skill requirement has been met.', status: marketUnlocked(state) ? 'complete' : 'pending' },
          { label: 'Enter a quantity', detail: candidateAmount > 0 ? 'Use the highlighted Qty field on any stocked row.' : 'Wait for mining inventory to reach a sellable listing.', status: candidateAmount > 0 ? 'active' : 'pending' },
          { label: 'Post the first sale', detail: lifetimeSales(state) > 0 ? 'The corp has now completed the full mine-to-sell loop.' : 'Click the highlighted Sell button after entering a quantity.', status: lifetimeSales(state) > 0 ? 'complete' : 'pending' },
        ],
        progress: candidateAmount > 0
          ? {
              label: 'Sellable stock ready',
              valueLabel: `${formatResourceAmount(candidateAmount, 0)} units available`,
              percent: Math.min(100, Math.max(12, Math.round((candidateAmount / Math.max(candidateAmount, 20)) * 100))),
              tone: 'cyan',
            }
          : null,
        uiTerms: ['Market', 'Qty', 'Sell', 'Trade I'],
        spotlightIds: candidateAmount > 0 ? ['market-sell-input', 'market-sell-button'] : [],
        allowedInteractionIds: candidateAmount > 0 ? ['market-sell-input', 'market-sell-button'] : [],
        anchorId: candidateAmount > 0 ? 'market-sell-input' : null,
      };
    }
    case 'guidance-handoff':
      return {
        helperText: 'Only the highlighted Guidance tab is interactive for the final handoff.',
        lockMessage: 'The tutorial ends by handing the player back to the persistent Guidance view, not by dropping them into an empty shell.',
        metrics: [
          { label: 'Completed steps', value: `${state.tutorial.completedStepIds.length} / ${TUTORIAL_STEP_ORDER.length}`, tone: 'emerald' },
          { label: 'Market', value: marketUnlocked(state) ? 'Online' : 'Locked', tone: marketUnlocked(state) ? 'emerald' : 'amber' },
          { label: 'First branch', value: firstBranchUnlocked(state) ? 'Online' : 'Pending', tone: firstBranchUnlocked(state) ? 'cyan' : 'amber' },
        ],
        checklist: [
          { label: 'Return to Guidance', detail: 'This is the ongoing surface the player should consult after the scripted lock lifts.', status: 'active' },
          { label: 'Release the interface', detail: 'Once this handoff completes, the hard lock is removed and the rest of the game becomes interactive.', status: 'pending' },
        ],
        progress: null,
        uiTerms: ['Overview', 'Guidance'],
        spotlightIds: ['overview-guidance-tab'],
        allowedInteractionIds: ['overview-guidance-tab'],
        anchorId: 'overview-guidance-tab',
      };
    case 'fleet-command-intro':
      return {
        helperText: 'This step teaches fleet posture before route planning starts. Only the starter fleet card is relevant here.',
        lockMessage: 'The tour is narrowing focus to the exact fleet that will travel and mine in the next system.',
        metrics: [
          { label: 'Fleet', value: fleetTravelStatus.fleetName, tone: 'cyan' },
          { label: 'Staged at', value: fleetTravelStatus.currentSystemName, tone: 'slate' },
          { label: 'Target', value: fleetContext.targetSystemName ?? 'Unknown', tone: 'violet' },
        ],
        checklist: [
          { label: 'Open the starter fleet card', detail: 'This is the fleet the tutorial will route through the star map.', status: 'active' },
          { label: 'Confirm its current posture', detail: 'Readiness, location, and current activity are the key travel inputs.', status: 'pending' },
        ],
        progress: null,
        uiTerms: ['Fleet Command Deck', 'Current Activity', 'Fleet status'],
        spotlightIds: ['fleet-starter-card'],
        allowedInteractionIds: ['fleet-starter-card'],
        anchorId: 'fleet-starter-card',
      };
    case 'starmap-dispatch-fleet': {
      const dispatched = starterFleetDispatchedToTarget(state, fleetContext);
      return {
        helperText: 'Use the route planner controls to bind the starter fleet, select the destination system, solve the route, and dispatch the order.',
        lockMessage: fleetContext.targetSystemName
          ? `The tutorial is holding the UI until the starter fleet has an active order for ${fleetContext.targetSystemName}.`
          : 'The tutorial is holding the UI until the starter fleet has a live outbound order.',
        metrics: [
          { label: 'Fleet', value: fleetTravelStatus.fleetName, tone: 'cyan' },
          { label: 'Origin', value: 'New Aether', tone: 'slate' },
          { label: 'Destination', value: fleetContext.targetSystemName ?? 'Unknown', tone: 'violet' },
        ],
        checklist: [
          { label: 'Open the Route planner', detail: 'If the Star Map is still on Intel, use the highlighted Route tab first.', status: 'active' },
          { label: 'Select the starter fleet', detail: 'Use the Fleet field in the route planner.', status: 'active' },
          { label: 'Choose the destination system', detail: fleetContext.targetSystemName ? `${fleetContext.targetSystemName} is the first remote mining target.` : 'Pick the highlighted mining destination.', status: 'active' },
          { label: 'Find the route and dispatch', detail: dispatched ? 'The fleet now has a live movement order.' : 'The step completes only when the movement order exists in live state.', status: dispatched ? 'complete' : 'pending' },
        ],
        progress: null,
        uiTerms: ['Route Planner', 'Fleet', 'Destination', 'Find Route', 'Dispatch'],
        spotlightIds: ['starmap-route-tab', 'starmap-route-fleet', 'starmap-route-destination', 'starmap-route-find', 'starmap-route-summary', 'starmap-route-dispatch'],
        allowedInteractionIds: ['starmap-route-tab', 'starmap-route-fleet', 'starmap-route-destination', 'starmap-route-find', 'starmap-route-dispatch'],
        anchorId: 'starmap-route-tab',
      };
    }
    case 'fleet-arrival-watch': {
      const arrived = starterFleetArrivedAtTarget(state, fleetContext);
      return {
        helperText: 'This is a watch-state step. The tutorial will advance automatically when the fleet finishes transit.',
        lockMessage: arrived
          ? 'Transit is complete. The tutorial can now move into destination-system mining assignment.'
          : 'The fleet is in motion. Watch the transit card until it drops out of travel and into the destination system.',
        metrics: [
          { label: 'Fleet', value: fleetTravelStatus.fleetName, tone: 'cyan' },
          { label: 'Current system', value: fleetTravelStatus.currentSystemName, tone: arrived ? 'emerald' : 'amber' },
          { label: 'Destination', value: fleetContext.targetSystemName ?? fleetTravelStatus.destinationName, tone: 'violet' },
        ],
        checklist: [
          { label: 'Outbound order is live', detail: 'The fleet has already left the route-planning step.', status: 'complete' },
          { label: 'Watch transit status', detail: arrived ? 'The fleet has arrived and is ready for system-level mining assignment.' : 'The activity block below shows transit progress and ETA.', status: arrived ? 'complete' : 'active' },
        ],
        progress: null,
        uiTerms: ['Current Activity', 'Fleet status'],
        spotlightIds: ['fleet-starter-transit'],
        allowedInteractionIds: [],
        anchorId: 'fleet-starter-transit',
      };
    }
    case 'system-assign-mining': {
      const miningAssigned = starterFleetMiningTargetAssigned(state, fleetContext);
      return {
        helperText: 'Mining assignment is performed in the system view, not the mining summary panel.',
        lockMessage: miningAssigned
          ? 'The destination belt is now assigned and the tutorial can move into mining readout interpretation.'
          : 'Pick the starter mining wing and commit it to the highlighted destination belt.',
        metrics: [
          { label: 'System', value: fleetContext.targetSystemName ?? 'Unknown', tone: 'violet' },
          { label: 'Target belt', value: fleetContext.targetBeltId ?? 'Unknown', tone: 'cyan' },
          { label: 'Assigned ships', value: `${fleetTravelStatus.assignedShipCount}`, tone: miningAssigned ? 'emerald' : 'amber' },
        ],
        checklist: [
          { label: 'Open the destination belt', detail: 'The selected asteroid belt is the operational mining target.', status: 'active' },
          { label: 'Choose the starter mining wing', detail: 'The dropdown is limited to ready mining wings in this system.', status: 'active' },
          { label: 'Assign the wing', detail: miningAssigned ? 'The fleet is now mining in the new system.' : 'The step completes only when the ships are actually assigned to the target belt.', status: miningAssigned ? 'complete' : 'pending' },
        ],
        progress: null,
        uiTerms: ['Ore Deposits', 'Assign Wing'],
        spotlightIds: ['system-target-belt-card', 'system-target-belt-wing-select', 'system-target-belt-assign'],
        allowedInteractionIds: ['system-target-belt-wing-select', 'system-target-belt-assign'],
        anchorId: 'system-target-belt-wing-select',
      };
    }
    case 'mining-readout':
      return {
        helperText: 'This is a read-the-board step. Use the CTA to move into the Mining panel, then acknowledge once you understand the four core signals.',
        lockMessage: 'The tutorial is teaching how to verify that the remote mining loop is healthy: flow, storage, wings, and hauling.',
        metrics: [
          { label: 'Fleet', value: fleetTravelStatus.fleetName, tone: 'cyan' },
          { label: 'System', value: fleetContext.targetSystemName ?? fleetTravelStatus.currentSystemName, tone: 'violet' },
          { label: 'Assigned ships', value: `${fleetTravelStatus.assignedShipCount}`, tone: fleetTravelStatus.assignedShipCount > 0 ? 'emerald' : 'amber' },
        ],
        checklist: [
          { label: 'Read Ore Flow', detail: 'This is the top-line extraction rate from the active mining wings.', status: 'active' },
          { label: 'Check Storage and Hauling', detail: 'These tell you whether mining is filling safely or backing up.', status: 'pending' },
          { label: 'Confirm wing count', detail: 'Mining Wings shows how many active extraction groups are contributing.', status: 'pending' },
        ],
        progress: null,
        uiTerms: ['Ore Flow', 'Storage', 'Mining Wings', 'Hauling'],
        spotlightIds: ['mining-summary-ore-flow', 'mining-summary-storage', 'mining-summary-wings', 'mining-summary-hauling'],
        allowedInteractionIds: [],
        anchorId: 'mining-summary-ore-flow',
      };
    default:
      return null;
  }
}

export function isTutorialStepCurrent(state: GameState, stepId: TutorialStepId) {
  return isTutorialActive(state.tutorial) && state.tutorial.currentStepId === stepId;
}