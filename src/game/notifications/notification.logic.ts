import { MANUFACTURING_RECIPES } from '@/game/systems/manufacturing/manufacturing.config';
import { RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { getSystemById } from '@/game/galaxy/galaxy.gen';

import type { TickResult } from '@/game/core/tickRunner';
import type { RecruitmentOfferDirective } from '@/game/progression/recruitmentAdvisor';
import type { CombatLogEntry } from '@/types/combat.types';
import type { DiscoveryEntry, GameState, NotificationEntry, NotificationFocusTarget } from '@/types/game.types';

const MAX_NOTIFICATION_ENTRIES = 250;

function createNotificationId(prefix: string, index: number) {
  return `ntf-${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

function createEntry(
  index: number,
  payload: Omit<NotificationEntry, 'id' | 'readAt' | 'archivedAt'>,
): NotificationEntry {
  return {
    id: createNotificationId(payload.sourceSystem, index),
    readAt: null,
    archivedAt: null,
    ...payload,
  };
}

function humanList(items: string[]) {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function totalLifetimeSales(state: GameState) {
  return Object.values(state.systems.market.lifetimeSold).reduce((sum, value) => sum + value, 0);
}

function cargoUsed(cargoHold: Record<string, number> | undefined) {
  return Object.values(cargoHold ?? {}).reduce((sum, amount) => sum + amount, 0);
}

function buildFocusTarget(panelId: NotificationFocusTarget['panelId'], entityType: NotificationFocusTarget['entityType'], entityId: string, panelSection?: string, parentEntityId?: string): NotificationFocusTarget {
  return { panelId, entityType, entityId, panelSection, parentEntityId };
}

function getNewCombatEntries(previousState: GameState, nextState: GameState): CombatLogEntry[] {
  const previousIds = new Set((previousState.systems.fleet.combatLog ?? []).map(entry => entry.id));
  return (nextState.systems.fleet.combatLog ?? []).filter(entry => !previousIds.has(entry.id));
}

function getNewDiscoveries(previousState: GameState, nextState: GameState): DiscoveryEntry[] {
  const previousIds = new Set((previousState.systems.fleet.discoveries ?? []).map(entry => entry.id));
  return (nextState.systems.fleet.discoveries ?? []).filter(entry => !previousIds.has(entry.id));
}

export function appendNotificationEntries(existingEntries: NotificationEntry[], nextEntries: NotificationEntry[]) {
  return [...nextEntries, ...existingEntries].slice(0, MAX_NOTIFICATION_ENTRIES);
}

export function shouldToastNotification(entry: NotificationEntry) {
  if (entry.severity === 'critical') return true;
  if (entry.kind === 'alert') return true;
  if (entry.category === 'progression') return true;
  if (entry.category === 'exploration') return true;
  if (entry.category === 'industry' && entry.severity === 'success') return true;
  return false;
}

export function buildTickNotifications(
  previousState: GameState,
  nextState: GameState,
  tickResult: TickResult,
  directives: RecruitmentOfferDirective[],
) {
  const entries: NotificationEntry[] = [];
  let index = 0;

  for (const advanced of tickResult.skillsAdvanced) {
    const skillName = SKILL_DEFINITIONS[advanced.skillId]?.name ?? advanced.skillId;
    entries.push(createEntry(index++, {
      category: 'progression',
      kind: 'update',
      severity: 'success',
      title: `${skillName} advanced`,
      body: `${skillName} reached level ${advanced.toLevel}.`,
      createdAt: nextState.lastUpdatedAt,
      sourceSystem: 'skills',
      sourceKey: advanced.skillId,
      actionLabel: 'Open skill queue',
      focusTarget: buildFocusTarget('skills', 'skill', advanced.skillId),
    }));
  }

  const newlyUnlocked = Object.keys(nextState.unlocks).filter(unlockId => nextState.unlocks[unlockId] && !previousState.unlocks[unlockId]);
  if (newlyUnlocked.length > 0) {
    entries.push(createEntry(index++, {
      category: 'progression',
      kind: 'alert',
      severity: 'success',
      title: newlyUnlocked.length === 1 ? 'New system unlocked' : 'New unlocks available',
      body: newlyUnlocked.length === 1
        ? `${newlyUnlocked[0].replace(/^system-/, '').replace(/-/g, ' ')} is now online.`
        : `${humanList(newlyUnlocked.slice(0, 3).map(unlockId => unlockId.replace(/^system-/, '').replace(/-/g, ' ')))} are now online.`,
      createdAt: nextState.lastUpdatedAt,
      sourceSystem: 'progression',
      sourceKey: newlyUnlocked[0],
      actionLabel: 'Review unlocks',
      focusTarget: buildFocusTarget('overview', 'panel', 'overview-guidance'),
    }));
  }

  const completedManufacturingEntries = Object.entries(tickResult.completedManufacturing);
  if (completedManufacturingEntries.length > 0) {
    const labels = completedManufacturingEntries.map(([recipeId, qty]) => {
      const recipeName = MANUFACTURING_RECIPES[recipeId]?.name ?? recipeId;
      return qty > 1 ? `${qty}x ${recipeName}` : recipeName;
    });
    entries.push(createEntry(index++, {
      category: 'industry',
      kind: 'update',
      severity: 'success',
      title: 'Manufacturing complete',
      body: `${humanList(labels.slice(0, 3))} finished in your production queue.`,
      createdAt: nextState.lastUpdatedAt,
      sourceSystem: 'manufacturing',
      sourceKey: completedManufacturingEntries[0][0],
      actionLabel: 'Open jobs',
      focusTarget: buildFocusTarget('manufacturing', 'panel', 'manufacturing-jobs', 'jobs'),
    }));
  }

  for (const job of tickResult.completedResearch) {
    const blueprintItemId = nextState.systems.manufacturing.blueprints.find(blueprint => blueprint.id === job.blueprintId)?.itemId;
    const blueprintName = (blueprintItemId && MANUFACTURING_RECIPES[blueprintItemId]?.name) ?? job.blueprintId;
    entries.push(createEntry(index++, {
      category: 'industry',
      kind: 'message',
      severity: 'success',
      title: 'Research complete',
      body: `${blueprintName} research reached level ${job.targetLevel}.`,
      createdAt: nextState.lastUpdatedAt,
      sourceSystem: 'manufacturing',
      sourceKey: job.blueprintId,
      actionLabel: 'Open blueprints',
      focusTarget: buildFocusTarget('manufacturing', 'panel', 'manufacturing-blueprints', 'blueprints'),
    }));
  }

  for (const job of tickResult.completedCopies) {
    const blueprintItemId = nextState.systems.manufacturing.blueprints.find(blueprint => blueprint.id === job.blueprintId)?.itemId;
    const blueprintName = (blueprintItemId && MANUFACTURING_RECIPES[blueprintItemId]?.name) ?? job.blueprintId;
    entries.push(createEntry(index++, {
      category: 'industry',
      kind: 'message',
      severity: 'success',
      title: 'Blueprint copies ready',
      body: `${job.runs}-run copies of ${blueprintName} are available.`,
      createdAt: nextState.lastUpdatedAt,
      sourceSystem: 'manufacturing',
      sourceKey: job.blueprintId,
      actionLabel: 'Open blueprints',
      focusTarget: buildFocusTarget('manufacturing', 'panel', 'manufacturing-blueprints', 'blueprints'),
    }));
  }

  for (const batch of tickResult.completedReprocessing) {
    const oreName = RESOURCE_REGISTRY[batch.oreId]?.name ?? batch.oreId;
    entries.push(createEntry(index++, {
      category: 'industry',
      kind: 'update',
      severity: 'info',
      title: 'Refinery batch complete',
      body: `${batch.amount.toLocaleString()} units of ${oreName} were reprocessed into minerals.`,
      createdAt: nextState.lastUpdatedAt,
      sourceSystem: 'reprocessing',
      sourceKey: batch.oreId,
      actionLabel: 'Open refinery',
      focusTarget: buildFocusTarget('reprocessing', 'panel', 'reprocessing-panel'),
    }));
  }

  for (const directive of directives) {
    entries.push(createEntry(index++, {
      category: 'progression',
      kind: 'alert',
      severity: 'warning',
      title: directive.sourceLabel,
      body: directive.recommendationReason,
      createdAt: nextState.lastUpdatedAt,
      sourceSystem: 'recruitment',
      sourceKey: directive.milestoneId,
      actionLabel: 'Open recruitment',
      focusTarget: buildFocusTarget('fleet', 'panel', 'fleet-operations', 'operations'),
    }));
  }

  for (const [fleetId, fleet] of Object.entries(nextState.systems.fleet.fleets)) {
    const previousFleet = previousState.systems.fleet.fleets[fleetId];
    if (!previousFleet) continue;
    if (previousFleet.currentSystemId !== fleet.currentSystemId) {
      const systemName = (() => {
        try {
          return getSystemById(nextState.galaxy.seed, fleet.currentSystemId).name;
        } catch {
          return fleet.currentSystemId;
        }
      })();
      entries.push(createEntry(index++, {
        category: 'fleet',
        kind: 'update',
        severity: 'info',
        title: `${fleet.name} arrived`,
        body: `${fleet.name} reached ${systemName}.`,
        createdAt: nextState.lastUpdatedAt,
        sourceSystem: 'fleet-travel',
        sourceKey: fleetId,
        actionLabel: 'Open fleet',
        focusTarget: buildFocusTarget('fleet', 'fleet', fleetId, 'fleets'),
      }));
    }

    const previousWings = new Map((previousFleet.wings ?? []).map(wing => [wing.id, wing]));
    for (const wing of fleet.wings ?? []) {
      const previousWing = previousWings.get(wing.id);
      if (!previousWing) continue;
      const completedDelivery = previousWing.isDispatched && !wing.isDispatched && cargoUsed(previousWing.cargoHold) > 0 && cargoUsed(wing.cargoHold) === 0;
      if (completedDelivery) {
        entries.push(createEntry(index++, {
          category: 'fleet',
          kind: 'message',
          severity: 'success',
          title: `${wing.name} completed delivery`,
          body: `${wing.name} returned from its HQ run and emptied its cargo into corp inventory.`,
          createdAt: nextState.lastUpdatedAt,
          sourceSystem: 'fleet-logistics',
          sourceKey: wing.id,
          actionLabel: 'Inspect wing',
          focusTarget: buildFocusTarget('fleet', 'wing', wing.id, 'fleets', fleetId),
        }));
      }
    }
  }

  for (const combatEntry of getNewCombatEntries(previousState, nextState)) {
    entries.push(createEntry(index++, {
      category: 'combat',
      kind: combatEntry.victory ? 'update' : 'alert',
      severity: combatEntry.victory ? 'success' : 'warning',
      title: combatEntry.victory ? 'Combat victory' : 'Combat losses sustained',
      body: combatEntry.victory
        ? `${combatEntry.fleetName} defeated ${combatEntry.npcName} in ${combatEntry.systemName}.`
        : `${combatEntry.fleetName} was forced off by ${combatEntry.npcName} in ${combatEntry.systemName}.`,
      createdAt: combatEntry.timestamp,
      sourceSystem: 'combat',
      sourceKey: combatEntry.id,
      actionLabel: 'Open combat log',
      focusTarget: buildFocusTarget('fleet', 'fleet', combatEntry.fleetId, 'fleets'),
    }));
  }

  for (const discovery of getNewDiscoveries(previousState, nextState)) {
    entries.push(createEntry(index++, {
      category: 'exploration',
      kind: 'alert',
      severity: 'success',
      title: `${discovery.anomalyName} revealed`,
      body: `${discovery.systemName} now has a revealed ${discovery.anomalyType.replace(/-/g, ' ')}.`,
      createdAt: discovery.timestamp,
      sourceSystem: 'exploration',
      sourceKey: discovery.id,
      actionLabel: 'Open system',
      focusTarget: buildFocusTarget('system', 'system', discovery.systemId),
    }));
  }

  const previousLifetimeSales = totalLifetimeSales(previousState);
  const nextLifetimeSales = totalLifetimeSales(nextState);
  if (previousLifetimeSales <= 0 && nextLifetimeSales > 0) {
    entries.push(createEntry(index++, {
      category: 'economy',
      kind: 'alert',
      severity: 'success',
      title: 'First sale completed',
      body: 'The corp has completed its first market sale. The credit loop is now live.',
      createdAt: nextState.lastUpdatedAt,
      sourceSystem: 'market',
      sourceKey: 'first-sale',
      actionLabel: 'Open market',
      focusTarget: buildFocusTarget('market', 'panel', 'market-listings', 'listings'),
    }));
  } else if (nextLifetimeSales - previousLifetimeSales >= 10_000) {
    entries.push(createEntry(index++, {
      category: 'economy',
      kind: 'message',
      severity: 'info',
      title: 'Market sales posted',
      body: `${Math.round(nextLifetimeSales - previousLifetimeSales).toLocaleString()} credits were realized from recent market activity.`,
      createdAt: nextState.lastUpdatedAt,
      sourceSystem: 'market',
      sourceKey: 'market-sales',
      actionLabel: 'Open market',
      focusTarget: buildFocusTarget('market', 'panel', 'market-listings', 'listings'),
    }));
  }

  for (const route of nextState.systems.fleet.tradeRoutes) {
    const previousRoute = previousState.systems.fleet.tradeRoutes.find(candidate => candidate.id === route.id);
    if (!previousRoute) continue;
    if (route.totalRunsCompleted > previousRoute.totalRunsCompleted && route.lastRunProfit !== null) {
      entries.push(createEntry(index++, {
        category: 'economy',
        kind: 'update',
        severity: route.lastRunProfit > 0 ? 'success' : 'warning',
        title: `${route.name} completed a run`,
        body: route.lastRunProfit > 0
          ? `${route.name} booked ${Math.round(route.lastRunProfit).toLocaleString()} credits profit on its latest cycle.`
          : `${route.name} completed a cycle with a weak margin. Review pricing and route posture.`,
        createdAt: nextState.lastUpdatedAt,
        sourceSystem: 'trade-routes',
        sourceKey: route.id,
        actionLabel: 'Open routes',
        focusTarget: buildFocusTarget('market', 'panel', 'market-routes', 'routes'),
      }));
    }
  }

  const toastIds = entries.filter(shouldToastNotification).map(entry => entry.id);
  return { entries, toastIds };
}