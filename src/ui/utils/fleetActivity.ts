import { ORE_BELTS } from '@/game/systems/mining/mining.config';
import { getHaulingWings, getWingByShipId, getWingCargoUsed, getWingCurrentSystemId, getWingDispatchShipIds } from '@/game/systems/fleet/wings.logic';
import type { GameState, PlayerFleet, FleetWing } from '@/types/game.types';

export type FleetActivityTone = 'cyan' | 'amber' | 'emerald' | 'violet' | 'slate' | 'rose';

export interface FleetActivitySummary {
  shortLabel: string;
  detail: string;
  tone: FleetActivityTone;
  dotClass: string;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function getBeltLabel(beltId: string): string {
  return ORE_BELTS[beltId]?.name ?? beltId;
}

function getMiningBeltIdsForWing(state: GameState, fleet: PlayerFleet, wing: FleetWing): string[] {
  return unique(
    wing.shipIds
      .map(shipId => state.systems.fleet.ships[shipId])
      .filter(ship => ship?.activity === 'mining' && !!ship.assignedBeltId && getWingByShipId(fleet, ship.id)?.id === wing.id)
      .map(ship => ship.assignedBeltId as string),
  );
}

function buildMiningSummary(beltIds: string[]): FleetActivitySummary {
  if (beltIds.length === 1) {
    return {
      shortLabel: 'Mining',
      detail: `Mining on ${getBeltLabel(beltIds[0])}`,
      tone: 'cyan',
      dotClass: 'bg-cyan-400 animate-pulse',
    };
  }

  return {
    shortLabel: 'Mining',
    detail: `Mining across ${beltIds.length} belts`,
    tone: 'cyan',
    dotClass: 'bg-cyan-400 animate-pulse',
  };
}

function buildTransitSummary(
  destinationSystemId: string,
  getSystemName: (systemId: string) => string,
  options?: { headingToHq?: boolean; returningAfterUnload?: boolean },
): FleetActivitySummary {
  if (options?.headingToHq) {
    return {
      shortLabel: 'Return To HQ',
      detail: `Returning to ${getSystemName(destinationSystemId)} to unload cargo`,
      tone: 'amber',
      dotClass: 'bg-amber-400 animate-pulse',
    };
  }

  if (options?.returningAfterUnload) {
    return {
      shortLabel: 'Return Trip',
      detail: `Heading back to ${getSystemName(destinationSystemId)} after unload`,
      tone: 'cyan',
      dotClass: 'bg-cyan-400 animate-pulse',
    };
  }

  return {
    shortLabel: 'En Route',
    detail: `Heading to ${getSystemName(destinationSystemId)}`,
    tone: 'cyan',
    dotClass: 'bg-cyan-400 animate-pulse',
  };
}

function summarizeWingActivities(
  state: GameState,
  fleet: PlayerFleet,
  getSystemName: (systemId: string) => string,
): FleetActivitySummary | null {
  const wingSummaries = (fleet.wings ?? [])
    .filter(wing => wing.shipIds.length > 0)
    .map(wing => describeWingActivity(state, fleet, wing, getSystemName));

  if (wingSummaries.length === 0) return null;

  const meaningfulSummaries = wingSummaries.filter(summary => summary.shortLabel !== 'Configured' && summary.shortLabel !== 'Idle');
  if (meaningfulSummaries.length === 1) return meaningfulSummaries[0];

  if (meaningfulSummaries.length > 1) {
    const detail = meaningfulSummaries
      .slice(0, 2)
      .map(summary => summary.detail)
      .join(' · ');
    const extraCount = meaningfulSummaries.length - 2;
    const tone = meaningfulSummaries.some(summary => summary.tone === 'cyan')
      ? 'cyan'
      : meaningfulSummaries.some(summary => summary.tone === 'amber')
        ? 'amber'
        : meaningfulSummaries.some(summary => summary.tone === 'rose')
          ? 'rose'
          : meaningfulSummaries.some(summary => summary.tone === 'violet')
            ? 'violet'
            : 'emerald';

    return {
      shortLabel: 'Mixed Wings',
      detail: extraCount > 0 ? `${detail} · +${extraCount} more wing states` : detail,
      tone,
      dotClass: tone === 'amber'
        ? 'bg-amber-400 animate-pulse'
        : tone === 'rose'
          ? 'bg-rose-400 animate-pulse'
          : tone === 'violet'
            ? 'bg-violet-400 animate-pulse'
            : tone === 'emerald'
              ? 'bg-emerald-400'
              : 'bg-cyan-400 animate-pulse',
    };
  }

  const configuredCount = wingSummaries.filter(summary => summary.shortLabel === 'Configured').length;
  if (configuredCount > 0) {
    return {
      shortLabel: configuredCount > 1 ? 'Wings Ready' : 'Configured',
      detail: configuredCount > 1
        ? `${configuredCount} wings are standing by in ${getSystemName(fleet.currentSystemId)}`
        : `Standing by in ${getSystemName(fleet.currentSystemId)}`,
      tone: 'emerald',
      dotClass: 'bg-emerald-400',
    };
  }

  return wingSummaries[0] ?? null;
}

export function describeFleetActivity(
  state: GameState,
  fleet: PlayerFleet,
  getSystemName: (systemId: string) => string,
): FleetActivitySummary {
  const homeSystemId = state.systems.factions.homeStationSystemId;

  if (fleet.fleetOrder) {
    const destinationSystemId = fleet.fleetOrder.destinationSystemId;
    return buildTransitSummary(destinationSystemId, getSystemName, {
      headingToHq: !!homeSystemId && !!fleet.miningOriginSystemId && destinationSystemId === homeSystemId,
      returningAfterUnload: !!fleet.miningOriginSystemId && destinationSystemId === fleet.miningOriginSystemId,
    });
  }

  const dispatchedHaulingWings = getHaulingWings(fleet).filter(wing => wing.isDispatched);
  if (dispatchedHaulingWings.length > 0) {
    const primaryWing = describeWingActivity(state, fleet, dispatchedHaulingWings[0], getSystemName);
    return dispatchedHaulingWings.length === 1
      ? primaryWing
      : {
          shortLabel: `${dispatchedHaulingWings.length} Wings Active`,
          detail: `${dispatchedHaulingWings.length} hauling wings are in motion. Primary lane: ${primaryWing.detail.toLowerCase()}`,
          tone: primaryWing.tone,
          dotClass: primaryWing.dotClass,
        };
  }

  if (fleet.combatOrder?.type === 'patrol') {
    return {
      shortLabel: 'Patrolling',
      detail: `Patrolling ${getSystemName(fleet.currentSystemId)}`,
      tone: 'rose',
      dotClass: 'bg-rose-400 animate-pulse',
    };
  }

  if (fleet.combatOrder?.type === 'raid') {
    return {
      shortLabel: 'Raiding',
      detail: `Raiding from ${getSystemName(fleet.currentSystemId)}`,
      tone: 'rose',
      dotClass: 'bg-rose-400 animate-pulse',
    };
  }

  if (fleet.isScanning) {
    return {
      shortLabel: 'Scanning',
      detail: `Scanning ${getSystemName(fleet.currentSystemId)}`,
      tone: 'violet',
      dotClass: 'bg-violet-400 animate-pulse',
    };
  }

  if (homeSystemId && fleet.currentSystemId === homeSystemId && fleet.miningOriginSystemId) {
    return {
      shortLabel: 'At HQ',
      detail: `At ${getSystemName(homeSystemId)} to unload cargo before returning`,
      tone: 'amber',
      dotClass: 'bg-amber-400 animate-pulse',
    };
  }

  const wingSummary = summarizeWingActivities(state, fleet, getSystemName);
  if (wingSummary) return wingSummary;

  return {
    shortLabel: 'Idle',
    detail: `Holding at ${getSystemName(fleet.currentSystemId)}`,
    tone: 'slate',
    dotClass: 'bg-slate-600',
  };
}

export function describeWingActivity(
  state: GameState,
  fleet: PlayerFleet,
  wing: FleetWing,
  getSystemName: (systemId: string) => string,
): FleetActivitySummary {
  const homeSystemId = state.systems.factions.homeStationSystemId;

  if (fleet.fleetOrder && wing.shipIds.length > 0) {
    const destinationSystemId = fleet.fleetOrder.destinationSystemId;
    return buildTransitSummary(destinationSystemId, getSystemName, {
      headingToHq: !!homeSystemId && !!fleet.miningOriginSystemId && destinationSystemId === homeSystemId,
      returningAfterUnload: !!fleet.miningOriginSystemId && destinationSystemId === fleet.miningOriginSystemId,
    });
  }

  if (fleet.combatOrder && wing.shipIds.length > 0) {
    if (fleet.combatOrder.type === 'patrol') {
      return {
        shortLabel: wing.type === 'combat' ? 'Patrolling' : 'Attached',
        detail: wing.type === 'combat'
          ? `Patrolling ${getSystemName(fleet.currentSystemId)}`
          : `Attached to patrol formation in ${getSystemName(fleet.currentSystemId)}`,
        tone: 'rose',
        dotClass: 'bg-rose-400 animate-pulse',
      };
    }

    return {
      shortLabel: wing.type === 'combat' ? 'Raiding' : 'Attached',
      detail: wing.type === 'combat'
        ? `Raiding from ${getSystemName(fleet.currentSystemId)}`
        : `Attached to raid formation in ${getSystemName(fleet.currentSystemId)}`,
      tone: 'rose',
      dotClass: 'bg-rose-400 animate-pulse',
    };
  }

  if (fleet.isScanning && wing.shipIds.length > 0) {
    return {
      shortLabel: wing.type === 'recon' ? 'Scanning' : 'Scan Support',
      detail: wing.type === 'recon'
        ? `Scanning ${getSystemName(fleet.currentSystemId)}`
        : `Supporting scan posture in ${getSystemName(fleet.currentSystemId)}`,
      tone: 'violet',
      dotClass: 'bg-violet-400 animate-pulse',
    };
  }

  if (wing.type === 'hauling') {
    if (wing.isDispatched) {
      const dispatchedShips = getWingDispatchShipIds(fleet, wing)
        .map(shipId => state.systems.fleet.ships[shipId])
        .filter(Boolean);
      const activeOrder = dispatchedShips.find(ship => ship.fleetOrder)?.fleetOrder ?? null;

      if (activeOrder) {
        const destinationSystemId = activeOrder.destinationSystemId;
        return buildTransitSummary(destinationSystemId, getSystemName, {
          headingToHq: !!homeSystemId && destinationSystemId === homeSystemId,
          returningAfterUnload: !!wing.haulingOriginSystemId && destinationSystemId === wing.haulingOriginSystemId,
        });
      }

      const wingSystemId = getWingCurrentSystemId(fleet, wing, state.systems.fleet.ships);
      if (homeSystemId && wingSystemId === homeSystemId) {
        return {
          shortLabel: 'At HQ',
          detail: `Docked at ${getSystemName(homeSystemId)} and unloading cargo`,
          tone: 'amber',
          dotClass: 'bg-amber-400 animate-pulse',
        };
      }

      if (wing.haulingOriginSystemId && wingSystemId === wing.haulingOriginSystemId) {
        return {
          shortLabel: 'Recovered',
          detail: `Returned to ${getSystemName(wing.haulingOriginSystemId)}`,
          tone: 'emerald',
          dotClass: 'bg-emerald-400',
        };
      }

      return {
        shortLabel: 'Hauling',
        detail: 'Convoy is in motion',
        tone: 'cyan',
        dotClass: 'bg-cyan-400 animate-pulse',
      };
    }

    if (getWingCargoUsed(wing) > 0 && homeSystemId && fleet.currentSystemId !== homeSystemId) {
      return {
        shortLabel: 'Ready To Haul',
        detail: `Cargo staged for ${getSystemName(homeSystemId)}`,
        tone: 'amber',
        dotClass: 'bg-amber-400/70',
      };
    }
  }

  if (wing.type === 'mining') {
    const miningBeltIds = getMiningBeltIdsForWing(state, fleet, wing);
    if (miningBeltIds.length > 0) return buildMiningSummary(miningBeltIds);
  }

  const wingShips = wing.shipIds
    .map(shipId => state.systems.fleet.ships[shipId])
    .filter(Boolean);
  const shipOrder = wingShips.find(ship => ship.fleetOrder)?.fleetOrder ?? null;
  if (shipOrder) {
    return buildTransitSummary(shipOrder.destinationSystemId, getSystemName);
  }

  if (wing.shipIds.length > 0) {
    return {
      shortLabel: 'Configured',
      detail: `Standing by in ${getSystemName(fleet.currentSystemId)}`,
      tone: 'emerald',
      dotClass: 'bg-emerald-400',
    };
  }

  return {
    shortLabel: 'Idle',
    detail: 'No ships assigned',
    tone: 'slate',
    dotClass: 'bg-slate-600',
  };
}