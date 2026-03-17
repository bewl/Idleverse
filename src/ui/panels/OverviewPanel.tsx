import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useUiStore, type FocusTarget, type PanelId } from '@/stores/uiStore';
import { MANUFACTURING_RECIPES } from '@/game/systems/manufacturing/manufacturing.config';
import { getManufacturingSpeedMultiplier } from '@/game/systems/manufacturing/manufacturing.logic';
import { FlairProgressBar } from '@/ui/components/FlairProgressBar';
import { PanelInfoSection } from '@/ui/components/PanelInfoSection';
import { buildSpecializationAdvice, getTrainingEtaToLevel } from '@/game/progression/specializationAdvisor';
import { useResourceRates } from '@/game/hooks/useResourceRates';
import { formatCredits, formatResourceAmount, RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { activeTrainingEta, formatTrainingEta } from '@/game/systems/skills/skills.logic';
import { skillTrainingSeconds } from '@/game/balance/constants';
import { NavTag } from '@/ui/components/NavTag';
import { getCorpHqBonus, getHomeOutpost, getStationInSystem } from '@/game/systems/factions/faction.logic';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import { getAliveNpcGroupsInSystem } from '@/game/systems/combat/combat.logic';
import { computeFleetCargoCapacity } from '@/game/systems/fleet/fleet.logic';
import { getFleetStoredCargo, getFleetStorageCapacity, getHaulingWings, getOperationalFleetShipIds, getWingCurrentSystemId, hasActiveEscortWing } from '@/game/systems/fleet/wings.logic';
import { ActivityBar } from '@/ui/effects/ActivityBar';
import { describeFleetActivity } from '@/ui/utils/fleetActivity';
import { ThemedIcon } from '@/ui/components/ThemedIcon';

import type { AnomalyType, GameState, WingType } from '@/types/game.types';

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d}d ${h}h`;
}

function fmtSec(s: number): string {
  if (s < 60)   return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function skillTargetLabel(skillId: string, targetLevel: 1 | 2 | 3 | 4 | 5): string {
  const def = SKILL_DEFINITIONS[skillId];
  return `${def?.name ?? skillId} ${ROMAN[targetLevel]}`;
}

interface ProgressPath {
  id: string;
  title: string;
  icon: string;
  panelId: PanelId;
  focusTarget: FocusTarget | null;
  accentColor: string;
  statusLabel: string;
  statusTone: 'active' | 'pending' | 'met';
  summary: string;
  payoff: string;
  synergy: string;
  nextTargetLabel: string;
  nextTargetEtaSeconds: number;
}

interface ImminentUnlock {
  unlockId: string;
  title: string;
  skillId: string;
  targetLevel: 1 | 2 | 3 | 4 | 5;
  summary: string;
  payoff: string;
  accentColor: string;
  panelId: PanelId;
  focusTarget: FocusTarget;
}

interface OpeningObjective {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'met';
  detail: string;
  panelId: PanelId;
  focusTarget: FocusTarget | null;
  actionLabel: string;
}

interface ProgressPrompt {
  id: string;
  title: string;
  tone: 'cyan' | 'amber' | 'emerald';
  detail: string;
  panelId: PanelId;
  focusTarget: FocusTarget | null;
  actionLabel: string;
}

const EARLY_UNLOCKS: ImminentUnlock[] = [
  {
    unlockId: 'system-manufacturing',
    title: 'Manufacturing',
    skillId: 'industry',
    targetLevel: 1,
    summary: 'Turns stored minerals into components and ships instead of leaving all value in raw ore.',
    payoff: 'The fastest industrial branch from a new save.',
    accentColor: '#fbbf24',
    panelId: 'skills',
    focusTarget: { entityType: 'skill', entityId: 'industry' },
  },
  {
    unlockId: 'system-market',
    title: 'Market',
    skillId: 'trade',
    targetLevel: 1,
    summary: 'Converts ore, minerals, and parts into credits immediately.',
    payoff: 'The shortest route to direct liquidity.',
    accentColor: '#fb7185',
    panelId: 'skills',
    focusTarget: { entityType: 'skill', entityId: 'trade' },
  },
  {
    unlockId: 'system-reprocessing',
    title: 'Reprocessing',
    skillId: 'reprocessing',
    targetLevel: 1,
    summary: 'Refines ore into the mineral base that manufacturing actually consumes.',
    payoff: 'The bridge from extraction into industry.',
    accentColor: '#22d3ee',
    panelId: 'skills',
    focusTarget: { entityType: 'skill', entityId: 'reprocessing' },
  },
  {
    unlockId: 'system-exploration',
    title: 'Exploration Scanning',
    skillId: 'astrometrics',
    targetLevel: 1,
    summary: 'Opens anomaly scanning so fleets can chase opportunities beyond fixed belts and routes.',
    payoff: 'The first real break from the pure ore loop.',
    accentColor: '#34d399',
    panelId: 'skills',
    focusTarget: { entityType: 'skill', entityId: 'astrometrics' },
  },
];

function findFirstFleetId(state: GameState): string | null {
  return Object.keys(state.systems.fleet.fleets)[0] ?? null;
}

function findMiningFleetId(state: GameState): string | null {
  for (const fleet of Object.values(state.systems.fleet.fleets)) {
    const operationalShipIds = new Set(getOperationalFleetShipIds(fleet));
    const hasAssignedMiners = fleet.shipIds.some(shipId => {
      if (!operationalShipIds.has(shipId)) return false;
      return !!state.systems.fleet.ships[shipId]?.assignedBeltId;
    });
    if (hasAssignedMiners) return fleet.id;
  }
  return null;
}

function findWingFocus(state: GameState, wingType: WingType): { fleetId: string; wingId: string } | null {
  for (const fleet of Object.values(state.systems.fleet.fleets)) {
    const wing = (fleet.wings ?? []).find(candidate => candidate.type === wingType && candidate.shipIds.length > 0);
    if (wing) return { fleetId: fleet.id, wingId: wing.id };
  }
  return null;
}

function buildImminentUnlocks(state: GameState): Array<ImminentUnlock & { etaSeconds: number }> {
  return EARLY_UNLOCKS
    .filter(unlock => !state.unlocks[unlock.unlockId])
    .map(unlock => ({
      ...unlock,
      etaSeconds: getTrainingEtaToLevel(state, unlock.skillId, unlock.targetLevel),
    }))
    .sort((a, b) => a.etaSeconds - b.etaSeconds);
}

function buildOpeningObjectives(state: GameState): OpeningObjective[] {
  const firstFleetId = findFirstFleetId(state);
  const miningFleetId = findMiningFleetId(state) ?? firstFleetId;
  const fleets = Object.values(state.systems.fleet.fleets);
  const totalStoredCargo = fleets.reduce((sum, fleet) => sum + getFleetStoredCargo(fleet), 0);
  const oreInInventory = Object.entries(state.resources).reduce((sum, [resourceId, amount]) => {
    if (RESOURCE_REGISTRY[resourceId]?.category !== 'ore') return sum;
    return sum + amount;
  }, 0);
  const lifetimeCreditsFromSales = Object.values(state.systems.market.lifetimeSold).reduce((sum, value) => sum + value, 0);
  const imminentUnlocks = buildImminentUnlocks(state);
  const nearestUnlock = imminentUnlocks[0] ?? null;
  const branchUnlockCount = [
    state.unlocks['system-market'],
    state.unlocks['system-manufacturing'],
    state.unlocks['system-reprocessing'],
    state.unlocks['system-exploration'],
  ].filter(Boolean).length;
  const branchTrainingStarted = !!state.systems.skills.activeSkillId || state.systems.skills.queue.length > 0;

  return [
    {
      id: 'mining-live',
      title: 'Extraction is live',
      status: miningFleetId ? 'active' : 'pending',
      detail: miningFleetId
        ? 'Your starter mining wing is already extracting. The next question is where that ore goes after it leaves the belt.'
        : 'Assign a mining wing to an active belt to begin the first resource loop.',
      panelId: 'mining',
      focusTarget: miningFleetId ? { entityType: 'fleet', entityId: miningFleetId } : null,
      actionLabel: miningFleetId ? 'Open mining ops' : 'Assign mining wing',
    },
    {
      id: 'understand-haul',
      title: 'Watch storage and haul pressure',
      status: oreInInventory > 0 ? 'met' : totalStoredCargo > 0 ? 'active' : 'pending',
      detail: oreInInventory > 0
        ? 'Ore has already reached corp inventory. Haul trips empty storage targets back to HQ so the output can be sold or refined.'
        : totalStoredCargo > 0
          ? 'Ore is sitting in a storage target right now. As capacity pressure rises, fleets or hauling wings carry it back to HQ.'
          : 'Ore first accumulates in a fleet or hauling storage target before it is brought back to HQ inventory.',
      panelId: totalStoredCargo > 0 ? 'fleet' : 'mining',
      focusTarget: miningFleetId ? { entityType: 'fleet', entityId: miningFleetId } : null,
      actionLabel: totalStoredCargo > 0 ? 'Inspect storage target' : 'Open mining flow',
    },
    {
      id: 'sell-output',
      title: 'Turn output into credits',
      status: lifetimeCreditsFromSales > 0 ? 'met' : state.unlocks['system-market'] ? 'active' : 'pending',
      detail: lifetimeCreditsFromSales > 0
        ? 'You have already completed a market sale. Credits are now a live outcome, not just a starting grant.'
        : state.unlocks['system-market']
          ? 'The market is unlocked. Selling raw ore is the fastest way to prove out the starter loop and fund expansion.'
          : 'Trade I is the quickest direct-liquidity unlock if you want the first mining cycles to convert into credits immediately.',
      panelId: state.unlocks['system-market'] ? 'market' : 'skills',
      focusTarget: state.unlocks['system-market']
        ? { entityType: 'panel', entityId: 'market-listings', panelSection: 'listings' }
        : { entityType: 'skill', entityId: 'trade' },
      actionLabel: state.unlocks['system-market'] ? 'Open market' : 'Queue Trade I',
    },
    {
      id: 'pick-branch',
      title: 'Choose the first branch',
      status: branchUnlockCount >= 2 ? 'met' : branchUnlockCount >= 1 || branchTrainingStarted ? 'active' : 'pending',
      detail: branchUnlockCount >= 2
        ? 'You already have multiple branches online. The next step is choosing which one deserves focused queue time.'
        : branchUnlockCount >= 1
          ? 'Your first branch is online. Push it deeper or open a second lane so mining output starts compounding.'
          : nearestUnlock
            ? `${nearestUnlock.title} is your nearest new system unlock at ${formatTrainingEta(nearestUnlock.etaSeconds)}.`
            : 'Industry, Trade, and Exploration are your first meaningful pivots away from a pure starter loop.',
      panelId: nearestUnlock?.panelId ?? 'skills',
      focusTarget: nearestUnlock?.focusTarget ?? { entityType: 'skill', entityId: 'industry' },
      actionLabel: branchUnlockCount >= 1 ? 'Review progression lanes' : nearestUnlock ? `Queue ${skillTargetLabel(nearestUnlock.skillId, nearestUnlock.targetLevel)}` : 'Open skills',
    },
  ];
}

function buildProgressPrompts(state: GameState): ProgressPrompt[] {
  const firstFleetId = findFirstFleetId(state);
  const miningFleetId = findMiningFleetId(state) ?? firstFleetId;
  const fleets = Object.values(state.systems.fleet.fleets);
  const totalStoredCargo = fleets.reduce((sum, fleet) => sum + getFleetStoredCargo(fleet), 0);
  const oreInInventory = Object.entries(state.resources).reduce((sum, [resourceId, amount]) => {
    if (RESOURCE_REGISTRY[resourceId]?.category !== 'ore') return sum;
    return sum + amount;
  }, 0);
  const lifetimeCreditsFromSales = Object.values(state.systems.market.lifetimeSold).reduce((sum, value) => sum + value, 0);
  const imminentUnlocks = buildImminentUnlocks(state);
  const nearestUnlock = imminentUnlocks[0] ?? null;
  const milestoneOffers = state.systems.fleet.recruitmentOffers.filter(offer => offer.source === 'milestone');
  const prompts: ProgressPrompt[] = [];

  if (totalStoredCargo > 0 && oreInInventory <= 0) {
    prompts.push({
      id: 'first-haul-watch',
      title: 'First haul is forming',
      tone: 'cyan',
      detail: 'Ore is sitting in a storage target now. Once storage pressure rises enough, a fleet or hauling wing will carry that ore back to HQ inventory.',
      panelId: 'fleet',
      focusTarget: miningFleetId ? { entityType: 'fleet', entityId: miningFleetId } : null,
      actionLabel: 'Inspect storage flow',
    });
  }

  if (oreInInventory > 0 && lifetimeCreditsFromSales <= 0) {
    prompts.push({
      id: 'first-haul-complete',
      title: 'First haul reached HQ',
      tone: 'emerald',
      detail: 'Ore is in corp inventory now. You can sell it for immediate credits or refine it into minerals if you want to push toward industry.',
      panelId: state.unlocks['system-market'] ? 'market' : 'skills',
      focusTarget: state.unlocks['system-market']
        ? { entityType: 'panel', entityId: 'market-listings', panelSection: 'listings' }
        : { entityType: 'skill', entityId: 'trade' },
      actionLabel: state.unlocks['system-market'] ? 'Sell ore now' : 'Unlock Trade I',
    });
  }

  if (state.unlocks['system-market'] && lifetimeCreditsFromSales <= 0) {
    prompts.push({
      id: 'first-sale-ready',
      title: 'First sale is ready',
      tone: 'amber',
      detail: 'The market is unlocked and you have output available. Completing one sale makes the credit loop tangible and gives the opening economy a clear payoff.',
      panelId: 'market',
      focusTarget: { entityType: 'panel', entityId: 'market-listings', panelSection: 'listings' },
      actionLabel: 'Open market listings',
    });
  }

  if (lifetimeCreditsFromSales > 0 && nearestUnlock) {
    prompts.push({
      id: 'first-branch-prompt',
      title: 'Pick the first real branch',
      tone: 'amber',
      detail: `${nearestUnlock.title} is the nearest system pivot at ${formatTrainingEta(nearestUnlock.etaSeconds)}. This is where the starter loop turns into a specialization path.`,
      panelId: nearestUnlock.panelId,
      focusTarget: nearestUnlock.focusTarget,
      actionLabel: `Queue ${skillTargetLabel(nearestUnlock.skillId, nearestUnlock.targetLevel)}`,
    });
  }

  if (milestoneOffers.length > 0) {
    const leadOffer = milestoneOffers[0];
    prompts.push({
      id: `recruitment-${leadOffer.milestoneId ?? leadOffer.id}`,
      title: 'Specialist pilots are available',
      tone: 'cyan',
      detail: leadOffer.recommendationReason ?? 'Recruitment contracts were posted because the corp has reached a new staffing breakpoint.',
      panelId: 'fleet',
      focusTarget: { entityType: 'panel', entityId: 'fleet-operations', panelSection: 'operations' },
      actionLabel: 'Open recruitment office',
    });
  }

  return prompts;
}

function buildProgressPaths(state: GameState): ProgressPath[] {
  const levels = state.systems.skills.levels;
  const unlocks = state.unlocks;

  const miningLevel = levels['mining'] ?? 0;
  const astroLevel = levels['astrogeology'] ?? 0;
  const advancedMiningLevel = levels['advanced-mining'] ?? 0;
  const miningBargeLevel = levels['mining-barge'] ?? 0;

  const tradeLevel = levels['trade'] ?? 0;
  const brokerRelationsLevel = levels['broker-relations'] ?? 0;

  const spacesCommandLevel = levels['spaceship-command'] ?? 0;
  const militaryOperationsLevel = levels['military-operations'] ?? 0;
  const gunneryLevel = levels['gunnery'] ?? 0;

  const industryLevel = levels['industry'] ?? 0;
  const reprocessingLevel = levels['reprocessing'] ?? 0;
  const scienceLevel = levels['science'] ?? 0;

  const astrometricsLevel = levels['astrometrics'] ?? 0;
  const hackingLevel = levels['hacking'] ?? 0;
  const archaeologyLevel = levels['archaeology'] ?? 0;

  const miningNext = miningLevel < 3
    ? { skillId: 'mining', targetLevel: 3 as const }
    : astroLevel < 1
      ? { skillId: 'astrogeology', targetLevel: 1 as const }
      : advancedMiningLevel < 1
        ? { skillId: 'advanced-mining', targetLevel: 1 as const }
        : miningBargeLevel < 1
          ? { skillId: 'mining-barge', targetLevel: 1 as const }
          : { skillId: 'mining-barge', targetLevel: 3 as const };

  const industryNext = !unlocks['system-manufacturing']
    ? { skillId: 'industry', targetLevel: 1 as const }
    : !unlocks['system-reprocessing']
      ? { skillId: 'reprocessing', targetLevel: 1 as const }
      : scienceLevel < 1
        ? { skillId: 'science', targetLevel: 1 as const }
        : { skillId: 'advanced-industry', targetLevel: 1 as const };

  const tradeNext = !unlocks['system-market']
    ? { skillId: 'trade', targetLevel: 1 as const }
    : tradeLevel < 3
      ? { skillId: 'trade', targetLevel: 3 as const }
      : brokerRelationsLevel < 2
        ? { skillId: 'broker-relations', targetLevel: 2 as const }
        : { skillId: 'accounting', targetLevel: 1 as const };

  const combatNext = spacesCommandLevel < 2
    ? { skillId: 'spaceship-command', targetLevel: 2 as const }
    : militaryOperationsLevel < 1
      ? { skillId: 'military-operations', targetLevel: 1 as const }
      : gunneryLevel < 1
        ? { skillId: 'gunnery', targetLevel: 1 as const }
        : { skillId: 'destroyer', targetLevel: 1 as const };

  const explorationNext = scienceLevel < 1
    ? { skillId: 'science', targetLevel: 1 as const }
    : astrometricsLevel < 1
      ? { skillId: 'astrometrics', targetLevel: 1 as const }
      : hackingLevel < 1
        ? { skillId: 'hacking', targetLevel: 1 as const }
        : archaeologyLevel < 1
          ? { skillId: 'archaeology', targetLevel: 1 as const }
          : { skillId: 'ladar-sensing', targetLevel: 1 as const };

  const firstFleetId = findFirstFleetId(state);
  const miningFleetId = findMiningFleetId(state) ?? firstFleetId;
  const combatWingFocus = findWingFocus(state, 'combat');
  const currentSystemId = state.galaxy.currentSystemId;

  return [
    {
      id: 'mining',
      title: 'Mining',
      icon: '⛏',
      panelId: 'mining',
      focusTarget: miningFleetId ? { entityType: 'fleet', entityId: miningFleetId } : null,
      accentColor: '#22d3ee',
      statusLabel: miningLevel >= 3 ? 'Richer belts ready' : 'Live now',
      statusTone: 'active',
      summary: 'Reliable early income with a clear specialist ladder into richer belts, mining hulls, and larger haul throughput.',
      payoff: miningLevel >= 3 ? 'Astrogeology opens better belts and stronger extraction scaling.' : 'The starter fleet already mines, so this path pays off immediately.',
      synergy: 'Pairs with Reprocessing for value extraction and with Market for clean liquidity.',
      nextTargetLabel: skillTargetLabel(miningNext.skillId, miningNext.targetLevel),
      nextTargetEtaSeconds: getTrainingEtaToLevel(state, miningNext.skillId, miningNext.targetLevel),
    },
    {
      id: 'industry',
      title: 'Industry',
      icon: '🏭',
      panelId: unlocks['system-manufacturing'] ? 'manufacturing' : 'skills',
      focusTarget: unlocks['system-manufacturing']
        ? { entityType: 'panel', entityId: 'manufacturing-jobs', panelSection: 'jobs' }
        : { entityType: 'skill', entityId: 'industry' },
      accentColor: '#fbbf24',
      statusLabel: unlocks['system-manufacturing'] && unlocks['system-reprocessing'] ? 'Industrial core live' : unlocks['system-manufacturing'] ? 'Growing' : 'One unlock away',
      statusTone: unlocks['system-manufacturing'] ? 'active' : 'pending',
      summary: 'Convert mined resources into components, hulls, and later blueprint research instead of only selling raw ore.',
      payoff: unlocks['system-manufacturing'] ? 'Industry now compounds mining into fleet growth and future T2 work.' : 'Industry I is the fastest path into an industrial branch from a fresh save.',
      synergy: 'Best hybrid chain: mine -> reprocess -> manufacture -> deploy or sell.',
      nextTargetLabel: skillTargetLabel(industryNext.skillId, industryNext.targetLevel),
      nextTargetEtaSeconds: getTrainingEtaToLevel(state, industryNext.skillId, industryNext.targetLevel),
    },
    {
      id: 'trade',
      title: 'Trade',
      icon: '📈',
      panelId: unlocks['system-market'] ? 'market' : 'skills',
      focusTarget: unlocks['system-market']
        ? { entityType: 'panel', entityId: tradeLevel >= 3 ? 'market-routes' : 'market-listings', panelSection: tradeLevel >= 3 ? 'routes' : 'listings' }
        : { entityType: 'skill', entityId: 'trade' },
      accentColor: '#fb7185',
      statusLabel: tradeLevel >= 3 ? 'Routes ready' : unlocks['system-market'] ? 'Market live' : 'One unlock away',
      statusTone: unlocks['system-market'] ? 'active' : 'pending',
      summary: 'Turn stockpiles into credits, then grow into automated logistics and route-driven profit instead of pure extraction.',
      payoff: tradeLevel >= 3 ? 'Trade III is the handoff from direct selling into automated route play.' : 'Trade I gives immediate access to liquidity and pricing bonuses.',
      synergy: 'Pairs with hauling wings and later safe-vs-fast route posture decisions.',
      nextTargetLabel: skillTargetLabel(tradeNext.skillId, tradeNext.targetLevel),
      nextTargetEtaSeconds: getTrainingEtaToLevel(state, tradeNext.skillId, tradeNext.targetLevel),
    },
    {
      id: 'combat',
      title: 'Combat',
      icon: '⚔',
      panelId: 'fleet',
      focusTarget: combatWingFocus
        ? { entityType: 'wing', entityId: combatWingFocus.wingId, parentEntityId: combatWingFocus.fleetId, panelSection: 'fleets' }
        : firstFleetId
          ? { entityType: 'fleet', entityId: firstFleetId, panelSection: 'operations' }
          : { entityType: 'panel', entityId: 'fleet-operations', panelSection: 'operations' },
      accentColor: '#f87171',
      statusLabel: spacesCommandLevel >= 2 ? 'Patrol ready' : 'Staging',
      statusTone: spacesCommandLevel >= 2 ? 'active' : 'pending',
      summary: 'Use fleets, doctrines, and wing structure to clear threats, protect routes, and push into a more operations-heavy playstyle.',
      payoff: spacesCommandLevel >= 2 ? 'Patrol orders are online; the next step is raid capability and stronger hulls.' : 'Spaceship Command II is the first real shift from passive fleet ownership into active operations.',
      synergy: 'Supports escorted hauling, safer logistics, and later mining-defense loops.',
      nextTargetLabel: skillTargetLabel(combatNext.skillId, combatNext.targetLevel),
      nextTargetEtaSeconds: getTrainingEtaToLevel(state, combatNext.skillId, combatNext.targetLevel),
    },
    {
      id: 'exploration',
      title: 'Exploration',
      icon: '⊕',
      panelId: astrometricsLevel >= 1 ? 'system' : 'skills',
      focusTarget: astrometricsLevel >= 1 && currentSystemId
        ? { entityType: 'system', entityId: currentSystemId }
        : { entityType: 'skill', entityId: 'astrometrics' },
      accentColor: '#34d399',
      statusLabel: astrometricsLevel >= 1 ? 'Scanning live' : scienceLevel >= 1 ? 'One unlock away' : 'Research first',
      statusTone: astrometricsLevel >= 1 ? 'active' : 'pending',
      summary: 'Reveal anomalies, branch into data or relic site access, and widen the set of valuable things your fleets can chase.',
      payoff: astrometricsLevel >= 1 ? 'Astrometrics opens the scan loop; Hacking and Archaeology turn that into specialisation.' : 'Science I into Astrometrics I is a fast route into a very different kind of progression.',
      synergy: 'Combines well with combat fleets, scout hulls, and future travel-focused builds.',
      nextTargetLabel: skillTargetLabel(explorationNext.skillId, explorationNext.targetLevel),
      nextTargetEtaSeconds: getTrainingEtaToLevel(state, explorationNext.skillId, explorationNext.targetLevel),
    },
  ];
}

function toneClass(tone: ProgressPath['statusTone']): string {
  if (tone === 'met') return 'text-emerald-300 border-emerald-500/30 bg-emerald-900/15';
  if (tone === 'active') return 'text-cyan-300 border-cyan-500/30 bg-cyan-950/20';
  return 'text-amber-300 border-amber-500/30 bg-amber-950/20';
}

function ProgressionShellCard() {
  const state = useGameStore(s => s.state);
  const navigate = useUiStore(s => s.navigate);
  const paths = buildProgressPaths(state);
  const rates = useResourceRates();
  const miningRate = Object.entries(rates)
    .filter(([id, rate]) => id !== 'credits' && rate > 0 && RESOURCE_REGISTRY[id]?.category === 'ore')
    .reduce((sum, [, rate]) => sum + rate, 0);

  const opportunities = paths.map(path => ({
    id: path.id,
    panelId: path.panelId,
    focusTarget: path.focusTarget,
    icon: path.icon,
    title: path.title,
    action: path.nextTargetLabel,
    eta: path.nextTargetEtaSeconds,
    detail: path.payoff,
    accentColor: path.accentColor,
    tone: path.statusTone,
  }));

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-4"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.96) 0%, rgba(34,211,238,0.03) 100%)',
        border: '1px solid rgba(34,211,238,0.14)',
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold">Parallel Progression</div>
        <h3 className="text-slate-100 text-sm font-semibold">Focus one lane deeply or chain several together.</h3>
        <p className="text-xs text-slate-400 max-w-3xl">
          Mining is already live. The next layer is choosing where that output goes: into minerals, manufacturing, direct trade, combat growth, or exploration unlocks.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-3">
        <div className="rounded-xl border border-slate-700/25 bg-slate-950/45 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500">Current Opportunities</div>
              <div className="text-xs text-slate-300 mt-0.5">These are all valid next moves. None of them close off the others.</div>
            </div>
            {miningRate > 0 && (
              <span className="text-[10px] font-mono text-cyan-300">ore flow {miningRate.toFixed(2)}/s</span>
            )}
          </div>

          {opportunities.map(item => (
            <button
              key={item.id}
              className="w-full rounded-lg border border-slate-700/20 bg-white/[0.02] px-3 py-2 text-left hover:bg-white/[0.04] transition-colors"
              onClick={() => navigate(item.panelId, item.focusTarget ?? undefined)}
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center mt-0.5"><ThemedIcon icon={item.icon} size={18} tone={item.accentColor} interactive /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-slate-100">{item.title}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded border ${toneClass(item.tone)}`}>
                      {item.tone === 'active' ? 'live' : 'next unlock'}
                    </span>
                    <span className="text-[9px] font-mono" style={{ color: item.accentColor }}>
                      {formatTrainingEta(item.eta)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-300 mt-1">{item.action}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{item.detail}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-slate-700/25 bg-slate-950/45 p-3 flex flex-col gap-3">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500">Operating Chains</div>
            <div className="text-xs text-slate-300 mt-0.5">Use these to play as a specialist or a hybrid without guessing how systems connect.</div>
          </div>

          <div className="rounded-lg border border-cyan-700/20 bg-cyan-950/10 px-3 py-2">
            <div className="text-[10px] font-semibold text-cyan-300">Specialist Loop</div>
            <div className="text-xs text-slate-300 mt-1">Mine harder, unlock richer belts, add hauling capacity, then scale fleets around extraction efficiency.</div>
          </div>

          <div className="rounded-lg border border-amber-700/20 bg-amber-950/10 px-3 py-2">
            <div className="text-[10px] font-semibold text-amber-300">Hybrid Industry Loop</div>
            <div className="text-xs text-slate-300 mt-1">Mine, then reprocess, then manufacture, then sell or deploy. This is the fastest way to feel several systems feeding each other.</div>
          </div>

          <div className="rounded-lg border border-rose-700/20 bg-rose-950/10 px-3 py-2">
            <div className="text-[10px] font-semibold text-rose-300">Logistics & Ops Loop</div>
            <div className="text-xs text-slate-300 mt-1">Trade and combat both scale with fleets, route posture, and later escorted hauling, so you can pivot from economy into operations without restarting.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressPathGrid() {
  const state = useGameStore(s => s.state);
  const navigate = useUiStore(s => s.navigate);
  const paths = buildProgressPaths(state);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Focus Tracks</div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {paths.map(path => (
          <button
            key={path.id}
            className="rounded-xl border px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
            style={{ background: 'rgba(3,8,20,0.65)', borderColor: `${path.accentColor}22` }}
            onClick={() => navigate(path.panelId, path.focusTarget ?? undefined)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] uppercase tracking-widest font-bold" style={{ color: path.accentColor }}>
                  {path.icon} {path.title}
                </div>
                <div className="text-[11px] mt-1 text-slate-100 font-semibold">{path.statusLabel}</div>
              </div>
              <span className={`text-[8px] px-1.5 py-0.5 rounded border shrink-0 ${toneClass(path.statusTone)}`}>
                {formatTrainingEta(path.nextTargetEtaSeconds)}
              </span>
            </div>

            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{path.summary}</p>

            <div className="mt-3 rounded-lg border border-slate-700/25 bg-slate-950/45 px-2.5 py-2">
              <div className="text-[8px] uppercase tracking-widest text-slate-500">Next Leverage</div>
              <div className="mt-1 text-[10px] text-white">{path.nextTargetLabel}</div>
            </div>

            <div className="mt-2 text-[10px] text-slate-500">{path.payoff}</div>
            <div className="mt-2 text-[9px] text-slate-600">{path.synergy}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProgressionGuideSection() {
  return (
    <PanelInfoSection
      sectionId="overview-progression-guide"
      title="Progression Guide"
      subtitle="Hide the long-form progression framing when you only want command summaries and actionable cards."
      accentColor="#22d3ee"
      defaultCollapsed
    >
      <div className="flex flex-col gap-4">
        <ProgressionShellCard />
        <ProgressPathGrid />
      </div>
    </PanelInfoSection>
  );
}

function OverviewModeTabs() {
  const overviewState = useUiStore(s => s.panelStates.overview);
  const setPanelState = useUiStore(s => s.setPanelState);
  const state = useGameStore(s => s.state);
  const mode = overviewState.mode ?? 'operations';
  const promptCount = buildProgressPrompts(state).length;
  const manufacturingQueue = state.systems.manufacturing.queue.length;
  const reprocessingQueue = state.systems.reprocessing.queue.length;
  const liveSignals = [manufacturingQueue > 0, reprocessingQueue > 0, state.systems.skills.activeSkillId !== null, promptCount > 0].filter(Boolean).length;

  const tabs: Array<{
    id: 'operations' | 'guidance';
    label: string;
    summary: string;
  }> = [
    {
      id: 'operations',
      label: 'Operations',
      summary: 'Urgent status, current work, and quick drill-downs.',
    },
    {
      id: 'guidance',
      label: 'Guidance',
      summary: 'Opening checkpoints, branch advice, and progression framing.',
    },
  ];

  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-2"
      style={{ background: 'rgba(3,8,20,0.55)', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">Command View</div>
          <div className="text-xs text-slate-400 mt-0.5">Switch between immediate operations and longer-horizon guidance without leaving the overview shell.</div>
        </div>
        <div className="flex gap-2 shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-cyan-700/30 bg-cyan-950/15 text-cyan-300 font-mono">
            live {liveSignals}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-violet-700/30 bg-violet-950/15 text-violet-300 font-mono">
            prompts {promptCount}
          </span>
        </div>
      </div>
      <div className="flex gap-1 border-b border-slate-800/60 pb-1" role="tablist" aria-label="Overview view modes">
        {tabs.map(tab => {
          const active = tab.id === mode;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              className={`px-4 py-2 rounded-t-lg text-xs font-bold uppercase tracking-wide transition-all duration-150 border ${
                active
                  ? 'bg-cyan-900/30 border-cyan-600/40 border-b-transparent text-cyan-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'
              }`}
              onClick={() => setPanelState('overview', { mode: tab.id })}
            >
              <span className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
                <span>{tab.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-800/50 bg-slate-950/35 px-3 py-2">
        <div className="text-[10px] text-slate-400 leading-relaxed">
          {tabs.find(tab => tab.id === mode)?.summary}
        </div>
      </div>
      <ActivityBar active={liveSignals > 0} rate={Math.min(1, Math.max(liveSignals / 4, promptCount > 0 ? 0.55 : 0))} color={mode === 'guidance' ? 'violet' : 'cyan'} label="View load" valueLabel={mode === 'guidance' ? `${promptCount} prompts` : `${liveSignals} live signals`} />
    </div>
  );
}

function objectiveTone(status: OpeningObjective['status']): { dot: string; badge: string; label: string } {
  if (status === 'met') {
    return {
      dot: 'bg-emerald-400',
      badge: 'text-emerald-300 border-emerald-500/30 bg-emerald-900/15',
      label: 'Complete',
    };
  }
  if (status === 'active') {
    return {
      dot: 'bg-cyan-400 animate-pulse',
      badge: 'text-cyan-300 border-cyan-500/30 bg-cyan-950/20',
      label: 'In progress',
    };
  }
  return {
    dot: 'bg-amber-400/60',
    badge: 'text-amber-300 border-amber-500/30 bg-amber-900/15',
    label: 'Next',
  };
}

function promptToneStyles(tone: ProgressPrompt['tone']): { border: string; background: string; title: string; action: string } {
  if (tone === 'emerald') {
    return {
      border: 'rgba(74, 222, 128, 0.24)',
      background: 'linear-gradient(135deg, rgba(6, 18, 14, 0.95) 0%, rgba(74, 222, 128, 0.05) 100%)',
      title: '#86efac',
      action: '#bbf7d0',
    };
  }
  if (tone === 'cyan') {
    return {
      border: 'rgba(34, 211, 238, 0.24)',
      background: 'linear-gradient(135deg, rgba(3, 8, 20, 0.95) 0%, rgba(34, 211, 238, 0.05) 100%)',
      title: '#67e8f9',
      action: '#a5f3fc',
    };
  }
  return {
    border: 'rgba(251, 191, 36, 0.24)',
    background: 'linear-gradient(135deg, rgba(18, 12, 3, 0.95) 0%, rgba(251, 191, 36, 0.05) 100%)',
    title: '#fcd34d',
    action: '#fde68a',
  };
}

function CommandMetric({
  label,
  value,
  meta,
  tone = 'slate',
  onClick,
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: 'cyan' | 'violet' | 'amber' | 'emerald' | 'slate';
  onClick?: () => void;
}) {
  const toneClass =
    tone === 'cyan'
      ? 'text-cyan-300 border-cyan-700/30 bg-cyan-950/15'
      : tone === 'violet'
        ? 'text-violet-300 border-violet-700/30 bg-violet-950/15'
        : tone === 'amber'
          ? 'text-amber-300 border-amber-700/30 bg-amber-950/15'
          : tone === 'emerald'
            ? 'text-emerald-300 border-emerald-700/30 bg-emerald-950/15'
            : 'text-slate-300 border-slate-700/30 bg-slate-900/50';

  const content = (
    <>
      <div className="text-[8px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-[12px] font-semibold font-mono mt-1">{value}</div>
      {meta && <div className="text-[9px] text-slate-500 mt-0.5">{meta}</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04] ${toneClass}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`rounded-lg border px-2.5 py-2 ${toneClass}`}>{content}</div>;
}

function OperationsCommandDeck() {
  const state = useGameStore(s => s.state);
  const navigate = useUiStore(s => s.navigate);
  const rates = useResourceRates();
  const fleets = Object.values(state.systems.fleet.fleets ?? {});
  const activeSkillId = state.systems.skills.activeSkillId;
  const manufacturingQueue = state.systems.manufacturing.queue.length;
  const researchLoad = state.systems.manufacturing.researchJobs.length + state.systems.manufacturing.copyJobs.length;
  const reprocessingQueue = state.systems.reprocessing.queue.length;
  const movingFleets = fleets.filter(fleet => fleet.fleetOrder !== null).length;
  const combatFleets = fleets.filter(fleet => fleet.combatOrder !== null).length;
  const haulingFleets = fleets.filter(fleet => getHaulingWings(fleet).some(wing => wing.isDispatched)).length;
  const activeSignals = [manufacturingQueue > 0, reprocessingQueue > 0, activeSkillId !== null, movingFleets > 0, combatFleets > 0].filter(Boolean).length;
  const idleSignals = [manufacturingQueue === 0, reprocessingQueue === 0, activeSkillId === null, movingFleets === 0, combatFleets === 0].filter(Boolean).length;
  const creditsRate = rates['credits'] ?? 0;
  const oreRate = Object.entries(rates)
    .filter(([id, rate]) => id !== 'credits' && rate > 0 && RESOURCE_REGISTRY[id]?.category === 'ore')
    .reduce((sum, [, rate]) => sum + rate, 0);
  const activityRate = Math.min(1, Math.max(
    activeSignals / 5,
    Math.min(1, manufacturingQueue / 4),
    Math.min(1, reprocessingQueue / 4),
    Math.min(1, movingFleets / Math.max(1, fleets.length)),
  ));

  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.96) 0%, rgba(34,211,238,0.04) 100%)',
        borderColor: 'rgba(34,211,238,0.14)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[9px] text-cyan-400 uppercase tracking-widest font-bold">Operations Deck</div>
          <div className="text-xs text-slate-300 mt-0.5">Read-only command snapshot across corp training, industry, and fleet tempo.</div>
        </div>
        <div className="flex gap-2 shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-cyan-700/30 bg-cyan-950/15 text-cyan-300 font-mono">
            ore {oreRate.toFixed(2)}/s
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-700/30 bg-amber-950/15 text-amber-300 font-mono">
            cash {formatCredits(creditsRate)}/s
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <CommandMetric
          label="Corp Training"
          value={activeSkillId ? 'live' : 'idle'}
          meta={activeSkillId ? `${SKILL_DEFINITIONS[activeSkillId]?.name ?? activeSkillId} in queue` : `${state.systems.skills.queue.length} queued`}
          tone={activeSkillId ? 'cyan' : state.systems.skills.queue.length > 0 ? 'amber' : 'slate'}
          onClick={() => navigate('skills')}
        />
        <CommandMetric
          label="Industry"
          value={`${manufacturingQueue}`}
          meta={researchLoad > 0 ? `${researchLoad} lab jobs active` : manufacturingQueue > 0 ? 'fabrication live' : 'queue empty'}
          tone={manufacturingQueue > 0 ? 'violet' : researchLoad > 0 ? 'cyan' : 'slate'}
          onClick={() => navigate('manufacturing', { entityType: 'panel', entityId: 'manufacturing-jobs', panelSection: 'jobs' })}
        />
        <CommandMetric
          label="Refinery"
          value={`${reprocessingQueue}`}
          meta={reprocessingQueue > 0 ? 'batches staged' : 'facility idle'}
          tone={reprocessingQueue > 0 ? 'amber' : 'slate'}
          onClick={() => navigate('reprocessing')}
        />
        <CommandMetric
          label="Fleet Tempo"
          value={`${movingFleets + combatFleets}`}
          meta={combatFleets > 0 ? `${combatFleets} combat · ${movingFleets} transit` : haulingFleets > 0 ? `${haulingFleets} hauling lines` : `${idleSignals} idle systems`}
          tone={combatFleets > 0 ? 'amber' : movingFleets > 0 ? 'cyan' : 'slate'}
          onClick={() => navigate('fleet', { entityType: 'panel', entityId: 'fleet-operations', panelSection: 'operations' })}
        />
      </div>

      <ActivityBar active={activeSignals > 0} rate={activityRate} color={manufacturingQueue > 0 ? 'violet' : movingFleets > 0 ? 'cyan' : 'amber'} label="Operations load" valueLabel={manufacturingQueue > 0 ? `${manufacturingQueue} fabrication` : movingFleets > 0 ? `${movingFleets} in transit` : `${activeSignals} active`} />
    </div>
  );
}

function ProgressPromptStrip() {
  const state = useGameStore(s => s.state);
  const navigate = useUiStore(s => s.navigate);
  const dismissedPrompts = useUiStore(s => s.dismissedProgressPrompts);
  const dismissProgressPrompt = useUiStore(s => s.dismissProgressPrompt);
  const prompts = buildProgressPrompts(state).filter(prompt => !dismissedPrompts[prompt.id]);

  if (prompts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {prompts.map(prompt => {
        const styles = promptToneStyles(prompt.tone);
        return (
          <div
            key={prompt.id}
            className="rounded-xl border px-4 py-3 flex items-start gap-3"
            style={{ background: styles.background, borderColor: styles.border }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: styles.title }}>
                  Milestone Callout
                </span>
                <span className="text-[11px] font-semibold text-slate-100">{prompt.title}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1 leading-relaxed">{prompt.detail}</div>
              <button
                className="mt-2 text-[10px] font-semibold transition-colors hover:text-white"
                style={{ color: styles.action }}
                onClick={() => navigate(prompt.panelId, prompt.focusTarget ?? undefined)}
              >
                {prompt.actionLabel}
              </button>
            </div>
            <button
              className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              onClick={() => dismissProgressPrompt(prompt.id)}
              aria-label={`Dismiss ${prompt.title}`}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

function OpeningOperationsCard() {
  const state = useGameStore(s => s.state);
  const navigate = useUiStore(s => s.navigate);
  const objectives = buildOpeningObjectives(state);
  const imminentUnlocks = buildImminentUnlocks(state).slice(0, 3);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-4"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.95) 0%, rgba(251,191,36,0.04) 100%)',
        border: '1px solid rgba(251,191,36,0.16)',
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="text-[10px] text-amber-400 uppercase tracking-widest font-bold">Opening Operations</div>
        <h3 className="text-slate-100 text-sm font-semibold">Understand the first loop, then pick the first real branch.</h3>
        <p className="text-xs text-slate-400 max-w-3xl">
          These checkpoints explain what the starter fleet is already doing, what should happen next, and which system unlocks are nearest from the current corp skill sheet.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-3">
        <div className="rounded-xl border border-slate-700/25 bg-slate-950/45 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500">Checkpoint Briefing</div>
              <div className="text-xs text-slate-300 mt-0.5">Each row is a live read of the opening progression state.</div>
            </div>
          </div>

          {objectives.map(objective => {
            const tone = objectiveTone(objective.status);
            return (
              <button
                key={objective.id}
                className="w-full rounded-lg border border-slate-700/20 bg-white/[0.02] px-3 py-2 text-left hover:bg-white/[0.04] transition-colors"
                onClick={() => navigate(objective.panelId, objective.focusTarget ?? undefined)}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${tone.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-100">{objective.title}</span>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded border ${tone.badge}`}>{tone.label}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">{objective.detail}</div>
                  </div>
                  <span className="text-[9px] text-amber-300 shrink-0">{objective.actionLabel}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-700/25 bg-slate-950/45 p-3 flex flex-col gap-2">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500">Nearest Unlocks</div>
            <div className="text-xs text-slate-300 mt-0.5">Chain-aware ETAs include missing prerequisite skills, not just the final target skill.</div>
          </div>

          {imminentUnlocks.length > 0 ? imminentUnlocks.map(unlock => (
            <button
              key={unlock.unlockId}
              className="w-full rounded-lg border px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
              style={{ background: 'rgba(255,255,255,0.02)', borderColor: `${unlock.accentColor}2f` }}
              onClick={() => navigate(unlock.panelId, unlock.focusTarget)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: unlock.accentColor }}>
                    {unlock.title}
                  </div>
                  <div className="text-[11px] text-white font-semibold mt-1">{skillTargetLabel(unlock.skillId, unlock.targetLevel)}</div>
                </div>
                <span className="text-[8px] px-1.5 py-0.5 rounded border text-amber-300 border-amber-500/30 bg-amber-900/15 shrink-0">
                  {formatTrainingEta(unlock.etaSeconds)}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-2 leading-relaxed">{unlock.summary}</div>
              <div className="text-[10px] mt-1" style={{ color: unlock.accentColor }}>{unlock.payoff}</div>
            </button>
          )) : (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-900/10 px-3 py-3">
              <div className="text-[10px] font-semibold text-emerald-300">Early branch systems are online.</div>
              <div className="text-xs text-slate-400 mt-1">Use the progression guide below to decide which lane to deepen next rather than chasing the first unlock.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function recommendationToneClass(tone: 'recommended' | 'strong' | 'later'): string {
  if (tone === 'recommended') return 'text-emerald-300 border-emerald-500/30 bg-emerald-900/15';
  if (tone === 'strong') return 'text-cyan-300 border-cyan-500/30 bg-cyan-950/20';
  return 'text-slate-400 border-slate-700/30 bg-slate-900/20';
}

function AdvisoryLanesCard() {
  const state = useGameStore(s => s.state);
  const navigate = useUiStore(s => s.navigate);
  const lanes = buildSpecializationAdvice(state).slice(0, 3);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.96) 0%, rgba(167,139,250,0.04) 100%)',
        border: '1px solid rgba(167,139,250,0.14)',
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="text-[10px] text-violet-400 uppercase tracking-widest font-bold">Advisory Lanes</div>
        <h3 className="text-slate-100 text-sm font-semibold">Recommended next directions for this corp state.</h3>
        <p className="text-xs text-slate-400 max-w-3xl">
          These do not lock you into a branch. They rank the best near-term lanes by current inventory, unlock state, and how close each path is to a meaningful payoff.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {lanes.map(lane => (
          <button
            key={lane.id}
            className="rounded-xl border px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
            style={{ background: 'rgba(3,8,20,0.6)', borderColor: `${lane.accentColor}22` }}
            onClick={() => navigate(lane.panelId, { entityType: 'skill', entityId: lane.skillId })}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] uppercase tracking-widest font-bold" style={{ color: lane.accentColor }}>
                  {lane.icon} {lane.title}
                </div>
                <div className="text-[11px] mt-1 text-slate-100 font-semibold">{skillTargetLabel(lane.skillId, lane.targetLevel)}</div>
              </div>
              <span className={`text-[8px] px-1.5 py-0.5 rounded border shrink-0 ${recommendationToneClass(lane.tone)}`}>
                {lane.tone === 'recommended' ? 'best fit' : lane.tone === 'strong' ? 'strong fit' : 'later'}
              </span>
            </div>
            <div className="mt-2 text-[10px] text-slate-400 leading-relaxed">{lane.summary}</div>
            <div className="mt-2 text-[10px]" style={{ color: lane.accentColor }}>{lane.payoff}</div>
            {lane.reasons.length > 0 && (
              <div className="mt-3 rounded-lg border border-slate-700/25 bg-slate-950/45 px-2.5 py-2">
                <div className="text-[8px] uppercase tracking-widest text-slate-500">Why now</div>
                <div className="mt-1 text-[10px] text-slate-300">{lane.reasons[0]}</div>
                {lane.reasons[1] && <div className="text-[9px] text-slate-500 mt-1">{lane.reasons[1]}</div>}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Corp card ────────────────────────────────────────────────────────────────

function CorpCard() {
  const state  = useGameStore(s => s.state);
  const rename = useGameStore(s => s.renameCorpName);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const age = Date.now() - state.corp.foundedAt;
  const credits = state.resources['credits'] ?? 0;
  const totalSkillLevels = Object.values(state.systems.skills.levels).reduce((a, b) => a + b, 0);
  const fleetCount = Object.keys(state.systems.fleet.fleets).length;

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== state.corp.name) rename(trimmed);
    setEditing(false);
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.95) 0%, rgba(34,211,238,0.04) 100%)',
        border: '1px solid rgba(34,211,238,0.15)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-lg font-bold"
            style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee' }}
          >
            {state.corp.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            {editing ? (
              <input
                autoFocus
                className="bg-transparent border-b border-cyan-500 text-white text-sm font-bold focus:outline-none w-40"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditing(false);
                }}
                maxLength={40}
              />
            ) : (
              <button
                className="text-white font-bold text-base leading-tight hover:text-cyan-300 transition-colors text-left"
                onClick={() => {
                  setDraftName(state.corp.name);
                  setEditing(true);
                }}
                title="Click to rename"
              >
                {state.corp.name}
              </button>
            )}
            <div className="text-slate-500 text-xs mt-0.5">
              Corporation · Founded {fmtDuration(age)} ago
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-amber-400 font-bold font-mono text-sm">{formatCredits(credits)}</div>
          <div className="text-slate-600 text-[10px] mt-0.5">{fleetCount} fleet{fleetCount !== 1 ? 's' : ''} · {totalSkillLevels} SP</div>
        </div>
      </div>
    </div>
  );
}

// ─── Corp HQ card ─────────────────────────────────────────────────────────────

function CorpHQCard() {
  const state = useGameStore(s => s.state);
  const hqSystemId = state.systems.factions.homeStationSystemId;

  if (!hqSystemId) {
    return (
      <div
        className="rounded-xl p-4 text-center"
        style={{ background: 'rgba(3,8,20,0.6)', border: '1px dashed rgba(255,255,255,0.08)' }}
      >
        <p className="text-slate-600 text-xs">No Corp HQ. Open System panel, dock at a station, or deploy a POS core to establish headquarters.</p>
      </div>
    );
  }

  const systemObj = getSystemById(state.galaxy.seed, hqSystemId);
  const homeOutpost = getHomeOutpost(state);
  const systemIndex = hqSystemId === 'home' ? 0 : parseInt(hqSystemId.replace('sys-', ''), 10);
  const station = homeOutpost ? null : getStationInSystem(systemObj, state.galaxy.seed, systemIndex);
  const hqBonus = getCorpHqBonus(station);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.95), rgba(34,211,238,0.04))',
        border: '1px solid rgba(34,211,238,0.18)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[9px] text-cyan-400 uppercase tracking-widest mb-0.5 font-bold">🏢 Corp HQ</div>
      </div>
      <div className="flex items-center gap-2">
        <NavTag entityType="system" entityId={hqSystemId} label={systemObj.name} />
        {homeOutpost && <span className="text-xs text-slate-400">• {homeOutpost.name}</span>}
        {station && <span className="text-xs text-slate-400">• {station.name}</span>}
      </div>
      <div className="text-slate-500 text-xs">
        {homeOutpost ? (
          <div className="flex flex-col gap-0.5">
            <div className="text-[10px]">• Player-owned outpost</div>
            <div className="text-[10px]">• Level {homeOutpost.level} command core</div>
            <div className="text-[10px] text-cyan-300">• Full HQ access without faction station requirements</div>
          </div>
        ) : station ? (
          <div className="flex flex-col gap-0.5">
            {station.services.map((svc: string) => (
              <div key={svc} className="text-[10px]">• {svc}</div>
            ))}
            {hqBonus && <div className="text-[10px] text-cyan-300">• {hqBonus.description}</div>}
          </div>
        ) : 'Standard station services'}
      </div>
    </div>
  );
}

// ─── Alerts card ─────────────────────────────────────────────────────────────

function AlertsCard() {
  const state = useGameStore(s => s.state);
  const fleets = Object.values(state.systems.fleet.fleets);
  const ships = state.systems.fleet.ships;

  const alerts: Array<{ type: 'cargo' | 'hull' | 'idle' | 'escort'; fleetId: string; fleetName: string; detail: string }> = [];

  for (const fleet of fleets) {
    // Cargo ≥80% with no haul order
    const cargoUsed = getFleetStoredCargo(fleet);
    const cargoCap = getFleetStorageCapacity(fleet, ships, state.systems.fleet.pilots);
    const cargoFill = cargoCap > 0 ? (cargoUsed / cargoCap) * 100 : 0;

    if (cargoFill >= 80 && fleet.fleetOrder === null) {
      alerts.push({ type: 'cargo', fleetId: fleet.id, fleetName: fleet.name, detail: `${Math.round(cargoFill)}% full` });
    }

    // Hull damage >30%
    const avgHull = fleet.shipIds.length > 0
      ? fleet.shipIds.reduce((sum, sid) => sum + (ships[sid]?.hullDamage ?? 0), 0) / fleet.shipIds.length
      : 0;
    if (avgHull > 30) {
      alerts.push({ type: 'hull', fleetId: fleet.id, fleetName: fleet.name, detail: `${Math.round(avgHull)}% damaged` });
    }

    for (const wing of getHaulingWings(fleet).filter(candidate => candidate.isDispatched && hasActiveEscortWing(fleet, candidate))) {
      const convoySystemId = getWingCurrentSystemId(fleet, wing, ships);
      if (!convoySystemId) continue;
      const threats = getAliveNpcGroupsInSystem(state, convoySystemId);
      if (threats.length === 0) continue;
      const systemName = getSystemById(state.galaxy.seed, convoySystemId).name;
      alerts.push({ type: 'escort', fleetId: fleet.id, fleetName: fleet.name, detail: `${wing.name} engaging ${threats.length} threat${threats.length !== 1 ? 's' : ''} in ${systemName}` });
    }

    // Idle with ships
    const operationalShipIds = getOperationalFleetShipIds(fleet);
    if (operationalShipIds.length > 0 && fleet.fleetOrder === null && !fleet.combatOrder) {
      const anyMining = operationalShipIds.some(sid => ships[sid]?.assignedBeltId);
      if (!anyMining && !fleet.isScanning) {
        alerts.push({ type: 'idle', fleetId: fleet.id, fleetName: fleet.name, detail: 'No orders' });
      }
    }
  }

  if (alerts.length === 0) return null;

  const iconMap = { cargo: 'cargo', hull: 'shield', idle: 'idle', escort: 'combat' } as const;
  const colorMap = { cargo: 'text-amber-400', hull: 'text-rose-400', idle: 'text-slate-500', escort: 'text-rose-300' };

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: 'rgba(3,8,20,0.7)', border: '1px solid rgba(251,146,60,0.2)' }}
    >
      <div className="text-[10px] text-amber-400 uppercase tracking-widest font-bold flex items-center gap-2"><ThemedIcon icon="warning" size={14} tone="#fbbf24" interactive />Alerts</div>
      {alerts.slice(0, 6).map((alert, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className={colorMap[alert.type]}><ThemedIcon icon={iconMap[alert.type]} size={14} tone={alert.type === 'cargo' ? '#f59e0b' : alert.type === 'hull' ? '#fb7185' : alert.type === 'escort' ? '#f87171' : '#64748b'} interactive /></span>
          <NavTag entityType="fleet" entityId={alert.fleetId} label={alert.fleetName} />
          <span className="text-slate-400">— {alert.detail}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Active skill card ────────────────────────────────────────────────────────

function ActiveSkillCard() {
  const skillsState = useGameStore(s => s.state.systems.skills);
  const [, forceUpdate] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    timerRef.current = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  if (!skillsState.activeSkillId) {
    return (
      <div
        className="rounded-xl p-4 text-center"
        style={{ background: 'rgba(3,8,20,0.6)', border: '1px dashed rgba(255,255,255,0.08)' }}
      >
        <p className="text-slate-600 text-xs">No skill training active. Open Skills to add skills to queue.</p>
      </div>
    );
  }

  const def   = SKILL_DEFINITIONS[skillsState.activeSkillId];
  const level = (skillsState.levels[skillsState.activeSkillId] ?? 0) + 1;
  const total = def ? skillTrainingSeconds(def.rank, level) : 1;
  const pct   = Math.min(1, skillsState.activeProgress / total);
  const eta   = activeTrainingEta(skillsState);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2.5"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.95), rgba(34,211,238,0.04))',
        border: '1px solid rgba(34,211,238,0.18)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] text-cyan-400 uppercase tracking-widest mb-0.5 font-bold">⚡ Corp Research</div>
          <div className="text-white font-bold text-sm">{def?.name ?? skillsState.activeSkillId}</div>
          <div className="text-slate-400 text-xs">Level {level - 1} → {level}</div>
        </div>
        <div className="text-right">
          <div className="text-cyan-400 font-bold font-mono text-sm">{formatTrainingEta(eta)}</div>
          <div className="text-slate-600 text-[10px]">{(pct * 100).toFixed(1)}%</div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[9px] text-cyan-400 uppercase tracking-widest font-bold"><ThemedIcon icon="skills" size={13} tone="#22d3ee" interactive />Corp Research</div>
      <FlairProgressBar value={pct} color="cyan" label="Training progress" valueLabel={`${(pct * 100).toFixed(1)}%`} />
      {skillsState.queue.length > 0 && (
        <div className="text-slate-600 text-xs">
          +{skillsState.queue.length} skill{skillsState.queue.length !== 1 ? 's' : ''} queued
        </div>
      )}
    </div>
  );
}

// ─── Manufacturing card ────────────────────────────────────────────────────────

function ManufacturingCard() {
  const state      = useGameStore(s => s.state);
  const navigate   = useUiStore(s => s.navigate);
  const slowMult   = getManufacturingSpeedMultiplier(state);
  const { queue }  = state.systems.manufacturing;
  const job        = queue[0];
  const recipe     = job ? MANUFACTURING_RECIPES[job.recipeId] : null;
  const researchLoad = state.systems.manufacturing.researchJobs.length;
  const copyLoad = state.systems.manufacturing.copyJobs.length;
  const blueprintCount = state.systems.manufacturing.blueprints.length;

  const totalCompleted = Object.values(state.systems.manufacturing.completedCount).reduce((a, b) => a + b, 0);
  const speedGrade = slowMult >= 1.8 ? 'S' : slowMult >= 1.45 ? 'A' : slowMult >= 1.15 ? 'B' : slowMult >= 1 ? 'C' : 'D';

  if (!state.unlocks['system-manufacturing']) {
    return (
      <button
        onClick={() => navigate('skills', { entityType: 'skill', entityId: 'industry' })}
        className="rounded-xl p-4 flex flex-col gap-2"
        style={{ background: 'rgba(3,8,20,0.7)', border: '1px solid rgba(255,255,255,0.07)', opacity: 0.5 }}
      >
        <div className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-2"><ThemedIcon icon="manufacturing" size={13} tone="#fbbf24" interactive />Manufacturing</div>
        <p className="text-slate-600 text-xs italic">Locked — train Industry I to unlock.</p>
      </button>
    );
  }

  if (!job || !recipe) {
    return (
      <button
        onClick={() => navigate('manufacturing', { entityType: 'panel', entityId: 'manufacturing-jobs', panelSection: 'jobs' })}
        className="rounded-xl p-4 flex flex-col gap-3 text-left hover:bg-white/[0.03] transition-colors"
        style={{ background: 'rgba(3,8,20,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${researchLoad + copyLoad > 0 ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
            <div className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-2"><ThemedIcon icon="manufacturing" size={13} tone="#fbbf24" interactive />Manufacturing</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-violet-700/30 bg-violet-950/15 text-violet-300 font-mono">grade {speedGrade}</span>
            <span className="text-xs font-mono text-violet-400">×{slowMult.toFixed(2)} speed</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[9px]">
          <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-slate-500">
            Queue <span className="text-slate-300 font-mono ml-1">0</span>
          </div>
          <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-slate-500">
            Lab <span className="text-cyan-300 font-mono ml-1">{researchLoad + copyLoad}</span>
          </div>
          <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-slate-500">
            BPs <span className="text-amber-300 font-mono ml-1">{blueprintCount}</span>
          </div>
        </div>
        <p className="text-slate-600 text-xs italic">Fabrication queue is empty. Blueprint work can keep the industrial line moving.</p>
        <ActivityBar active={researchLoad + copyLoad > 0} rate={Math.min(1, (researchLoad + copyLoad) / 3)} color={researchLoad + copyLoad > 0 ? 'cyan' : 'violet'} label="Lab load" valueLabel={researchLoad + copyLoad > 0 ? `${researchLoad + copyLoad} lab jobs` : 'idle'} />
        {totalCompleted > 0 && (
          <div className="text-[10px] text-slate-600">{totalCompleted} items produced all time</div>
        )}
      </button>
    );
  }

  const totalTime   = recipe.timeCost * job.quantity;
  const progressPct = totalTime > 0 ? job.progress / totalTime : 0;
  const remaining   = Math.max(0, totalTime - job.progress) / Math.max(slowMult, 0.001);

  return (
    <button
      onClick={() => navigate('manufacturing', { entityType: 'panel', entityId: 'manufacturing-jobs', panelSection: 'jobs' })}
      className="rounded-xl p-4 flex flex-col gap-3 text-left hover:bg-white/[0.03] transition-colors"
      style={{ background: 'rgba(3,8,20,0.7)', border: '1px solid rgba(167,139,250,0.15)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shrink-0" />
          <div className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-2"><ThemedIcon icon="manufacturing" size={13} tone="#a78bfa" interactive />Manufacturing</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-violet-700/30 bg-violet-950/15 text-violet-300 font-mono">grade {speedGrade}</span>
          <span className="text-xs font-mono text-violet-400">{queue.length} job{queue.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[9px]">
        <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-slate-500">
          Queue <span className="text-violet-300 font-mono ml-1">{queue.length}</span>
        </div>
        <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-slate-500">
          Lab <span className="text-cyan-300 font-mono ml-1">{researchLoad + copyLoad}</span>
        </div>
        <div className="rounded border border-slate-700/20 bg-slate-950/20 px-2 py-1.5 text-slate-500">
          BPs <span className="text-amber-300 font-mono ml-1">{blueprintCount}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs gap-2">
        <div className="min-w-0">
          <div className="text-white font-bold truncate">{recipe.name}</div>
          <div className="text-slate-500">×{job.quantity} batch · {totalCompleted} lifetime output</div>
        </div>
        <span className="text-violet-300 font-mono shrink-0">{fmtSec(remaining)}</span>
      </div>

      <FlairProgressBar value={progressPct} color="violet" label="Fabrication progress" valueLabel={`${Math.round(progressPct * 100)}%`} />
      <ActivityBar active rate={Math.min(1, Math.max(progressPct, slowMult / 2))} color="violet" label="Production rate" valueLabel={`x${slowMult.toFixed(2)} speed`} />
      <div className="text-[10px] text-slate-500">
        {researchLoad + copyLoad > 0
          ? `${researchLoad} research and ${copyLoad} copy jobs are running alongside fabrication.`
          : 'No lab work running. Blueprint operations are available from the full manufacturing panel.'}
      </div>
    </button>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow() {
  const state = useGameStore(s => s.state);

  const skillsLearned   = Object.values(state.systems.skills.levels).filter(l => l > 0).length;
  const maxSkillLevel   = Math.max(0, ...Object.values(state.systems.skills.levels));
  const fleetCount      = Object.keys(state.systems.fleet.fleets).length;
  const totalShips      = Object.keys(state.systems.fleet.ships).length;

  const stats = [
    { label: 'Skills Known',    value: skillsLearned.toString(),          color: '#22d3ee' },
    { label: 'Highest Level',   value: maxSkillLevel > 0 ? `Lv ${maxSkillLevel}` : '—', color: '#22d3ee' },
    { label: 'Fleets',          value: fleetCount.toString(),             color: '#fbbf24' },
    { label: 'Total Ships',     value: totalShips.toString(),            color: '#fbbf24' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {stats.map(s => (
        <div
          key={s.label}
          className="rounded-lg px-3 py-2.5 flex flex-col"
          style={{ background: 'rgba(3,8,20,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Discoveries card ────────────────────────────────────────────────────────

function anomalyIcon(type: AnomalyType): string {
  switch (type) {
    case 'ore-pocket':  return '◆';
    case 'data-site':   return '⬡';
    case 'relic-site':  return '⧖';
    case 'combat-site': return '☩';
    case 'wormhole':    return '⊕';
  }
}

function anomalyColor(type: AnomalyType): string {
  switch (type) {
    case 'ore-pocket':  return 'text-cyan-400';
    case 'data-site':   return 'text-violet-400';
    case 'relic-site':  return 'text-amber-400';
    case 'combat-site': return 'text-red-400';
    case 'wormhole':    return 'text-purple-400';
  }
}

function DiscoveriesCard() {
  const discoveries = useGameStore(s => s.state.systems.fleet.discoveries ?? []);
  if (discoveries.length === 0) return null;

  const recent = discoveries.slice(0, 8);

  function timeAgo(ms: number): string {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  return (
    <div className="panel-card">
      <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">⊕ Recent Discoveries</h3>
      <div className="flex flex-col gap-1.5">
        {recent.map(entry => (
          <div key={entry.id} className="flex items-center gap-2 py-1 border-b border-slate-800/50 last:border-0">
            <span className={`text-[10px] shrink-0 ${anomalyColor(entry.anomalyType)}`}>
              {anomalyIcon(entry.anomalyType)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[9px] text-slate-300 truncate">{entry.anomalyName}</span>
                <span className="text-[8px] text-slate-600 shrink-0">{timeAgo(entry.timestamp)}</span>
              </div>
              <span className="text-[8px] text-slate-500">{entry.systemName}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Combat log card ─────────────────────────────────────────────────────────

function CombatLogCard() {
  const combatLog = useGameStore(s => s.state.systems.fleet.combatLog ?? []);
  if (combatLog.length === 0) return null;

  const recent = combatLog.slice(0, 10);

  function timeAgo(ms: number): string {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  return (
    <div className="panel-card">
      <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2"><ThemedIcon icon="combat" size={13} tone="#f87171" interactive />Recent Combat</h3>
      <div className="flex flex-col gap-1.5">
        {recent.map(entry => (
          <div key={entry.id} className="flex items-start gap-2 py-1 border-b border-slate-800/50 last:border-0">
            <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 font-semibold ${
              entry.victory ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'
            }`}>
              {entry.victory ? 'WIN' : 'LOSS'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[9px] text-slate-300 truncate">{entry.npcName}</span>
                <span className="text-[8px] text-slate-600 shrink-0">{timeAgo(entry.timestamp)}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-[8px] text-slate-500">{entry.systemName}</span>
                {entry.victory && entry.bountyEarned > 0 && (
                  <span className="text-[8px] text-amber-300/80">+{entry.bountyEarned.toLocaleString()} ISK</span>
                )}
                {entry.victory && Object.keys(entry.lootGained).length > 0 && (
                  <span className="text-[8px] text-cyan-300/70" title={Object.entries(entry.lootGained).map(([r, q]) => `${r}: ${q}`).join(', ')}>
                    +{Object.keys(entry.lootGained).length} loot
                  </span>
                )}
                <span className={`text-[8px] ${entry.avgHullDamage > 30 ? 'text-rose-400/70' : 'text-slate-600'}`}>
                  {Math.round(entry.avgHullDamage)}% hull dmg
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Fleet status card ────────────────────────────────────────────────────────

function FleetStatusCard() {
  const state  = useGameStore(s => s.state);
  const fleets = Object.values(state.systems.fleet.fleets ?? {});
  if (fleets.length === 0) return null;

  const galaxy = state.galaxy;
  const ships = state.systems.fleet.ships;

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: 'rgba(3,8,20,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold flex items-center gap-2"><ThemedIcon icon="fleet" size={13} tone="#22d3ee" interactive />Fleets</div>
        <span className="text-[9px] font-mono text-slate-600">{fleets.length} fleet{fleets.length !== 1 ? 's' : ''}</span>
      </div>
      {fleets.map(fleet => {
        const sysName = galaxy ? (() => {
          try { return getSystemById(galaxy.seed, fleet.currentSystemId).name; } catch { return fleet.currentSystemId; }
        })() : fleet.currentSystemId;
        const status = describeFleetActivity(state, fleet, systemId => {
          if (!galaxy) return systemId;
          try { return getSystemById(galaxy.seed, systemId).name; } catch { return systemId; }
        });
        const dispatchedHaulingWings = getHaulingWings(fleet).filter(wing => wing.isDispatched);
        const escortedHaulingWings = dispatchedHaulingWings.filter(wing => hasActiveEscortWing(fleet, wing));
        const operationalShipIds = getOperationalFleetShipIds(fleet);
        const hullPct = fleet.shipIds.length > 0
          ? fleet.shipIds.reduce((sum, sid) => {
              const ship = ships[sid];
              return sum + (ship ? (ship.hullDamage ?? 0) : 0);
            }, 0) / fleet.shipIds.length
          : 0;

        // Cargo fill %
        const cargoUsed = getFleetStoredCargo(fleet);
        const cargoCap = getFleetStorageCapacity(fleet, ships, state.systems.fleet.pilots);
        const cargoFillPct = cargoCap > 0 ? Math.round((cargoUsed / cargoCap) * 100) : 0;

        return (
          <div key={fleet.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dotClass}`} />
            <NavTag entityType="fleet" entityId={fleet.id} label={fleet.name} />
            <span className="text-[9px] font-mono shrink-0" style={{ color: status.tone === 'cyan' ? '#22d3ee' : status.tone === 'amber' ? '#f59e0b' : status.tone === 'emerald' ? '#34d399' : status.tone === 'violet' ? '#a78bfa' : status.tone === 'rose' ? '#f43f5e' : '#475569' }}>{status.shortLabel}</span>
            <span className="text-[8px] text-slate-500 truncate min-w-0">{status.detail}</span>
            {cargoFillPct > 0 && (
              <span className={`text-[8px] font-mono shrink-0 ${cargoFillPct >= 80 ? 'text-amber-400' : 'text-slate-600'}`}>
                cargo {cargoFillPct}%
              </span>
            )}
            {dispatchedHaulingWings.length > 0 && (
              <span className={`text-[8px] font-mono shrink-0 ${escortedHaulingWings.length > 0 ? 'text-amber-300/80' : 'text-cyan-300/75'}`}>
                haul {dispatchedHaulingWings.length}{escortedHaulingWings.length > 0 ? ` · escort ${escortedHaulingWings.length}` : ' · safe route'}
              </span>
            )}
            <span className="text-[8px] font-mono text-slate-600 shrink-0">
              ops {operationalShipIds.length}/{fleet.shipIds.length}
            </span>
            <span className="flex-1" />
            {hullPct > 0 && (
              <span className={`text-[8px] font-mono shrink-0 ${hullPct > 50 ? 'text-rose-400' : hullPct > 20 ? 'text-amber-400' : 'text-slate-600'}`}>
                {Math.round(hullPct)}% hull dmg
              </span>
            )}
            <span className="text-[9px] text-slate-600 shrink-0">
              <NavTag entityType="system" entityId={fleet.currentSystemId} label={sysName} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Resource income card ─────────────────────────────────────────────────────

function ResourceIncomeCard() {
  const rates  = useResourceRates();
  const creditsRate = rates['credits'] ?? 0;

  // Gather all positive resource rates
  const resourceRates: Array<{ id: string; rate: number }> = [];
  for (const [id, rate] of Object.entries(rates)) {
    if (rate > 0 && id !== 'credits') {
      resourceRates.push({ id, rate });
    }
  }

  if (resourceRates.length === 0 && creditsRate === 0) return null;

  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-wrap gap-3"
      style={{ background: 'rgba(3,8,20,0.55)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <span className="text-[9px] text-slate-600 uppercase tracking-widest self-center w-full sm:w-auto">Income / sec</span>
      {resourceRates.slice(0, 5).map(({ id, rate }) => (
        <div key={id} className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
          <span className="text-[10px] text-slate-400">{RESOURCE_REGISTRY[id]?.name ?? id}</span>
          <span className="text-[10px] font-mono text-cyan-300">+{rate.toFixed(2)}/s</span>
        </div>
      ))}
      {creditsRate > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          <span className="text-[10px] text-slate-400">Credits</span>
          <span className="text-[10px] font-mono text-amber-300">+{formatCredits(creditsRate)}/s</span>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function OverviewPanel() {
  const overviewState = useUiStore(s => s.panelStates.overview);
  const mode = overviewState.mode ?? 'operations';

  return (
    <div className="flex flex-col gap-4">
      <h2 className="panel-header"><ThemedIcon icon="overview" size={18} tone="#22d3ee" interactive />Corp Command Center</h2>
      <OverviewModeTabs />

      {mode === 'operations' ? (
        <>
          <OperationsCommandDeck />
          <CorpCard />
          <CorpHQCard />
          <ProgressPromptStrip />
          <AlertsCard />
          <ActiveSkillCard />
          <ResourceIncomeCard />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FleetStatusCard />
            <ManufacturingCard />
          </div>

          <StatsRow />

          <PanelInfoSection
            sectionId="overview-operations-feeds"
            title="Activity Feeds"
            subtitle="Secondary ambient updates stay available without crowding the command layer."
            accentColor="#94a3b8"
            defaultCollapsed
          >
            <div className="flex flex-col gap-4">
              <DiscoveriesCard />
              <CombatLogCard />
            </div>
          </PanelInfoSection>
        </>
      ) : (
        <>
          <ProgressPromptStrip />
          <OpeningOperationsCard />
          <AdvisoryLanesCard />
          <ProgressionGuideSection />
        </>
      )}
    </div>
  );
}
