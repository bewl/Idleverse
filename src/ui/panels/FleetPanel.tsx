import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '@/stores/gameStore';
import type { PilotInstance, ShipInstance, PilotTrainingFocus, ShipRole, FleetDoctrine, FleetWing, WingType, PlayerFleet } from '@/types/game.types';
import { HULL_DEFINITIONS, PILOT_SKILL_FOCUS_TREES, DOCTRINE_DEFINITIONS, MODULE_DEFINITIONS } from '@/game/systems/fleet/fleet.config';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import {
  getPilotMiningBonus, getPilotCombatBonus, getPilotHaulingBonus,
  getPilotMoraleMultiplier, pilotTrainingEta, canPilotFlyShip, getPilotDisplayState,
} from '@/game/systems/fleet/pilot.logic';
import { formatTrainingEta } from '@/game/systems/skills/skills.logic';
import { formatEta } from '@/game/galaxy/travel.logic';
import { getTotalFleetPayroll, suggestDoctrine, getDoctrineRequirementsMet, computeFleetCargoCapacity } from '@/game/systems/fleet/fleet.logic';
import { getFleetOrderEtaSeconds, getFleetOrderProgress, getShipOrderEtaSeconds } from '@/game/systems/fleet/fleet.orders';
import { getAliveNpcGroupsInSystem } from '@/game/systems/combat/combat.logic';
import { StarfieldBackground } from '@/ui/effects/StarfieldBackground';
import { generateGalaxy } from '@/game/galaxy/galaxy.gen';
import type { RouteSecurityFilter } from '@/types/faction.types';
import { NavTag } from '@/ui/components/NavTag';
import { GameDropdown, type DropdownOption } from '@/ui/components/GameDropdown';
import { useUiStore } from '@/stores/uiStore';
import { COMMANDER_SKILL_DEFINITIONS, COMMANDER_BONUS_LABELS } from '@/game/systems/fleet/commander.config';
import { commanderSkillEtaSeconds, getCombinedCommanderBonus } from '@/game/systems/fleet/commander.logic';
import { getEscortWing, getFleetStoredCargo, getFleetStorageCapacity, getHaulingWingEffectiveSecurityFilter, getOperationalFleetShipIds, getWingCargoCapacity, getWingCargoTotals, getWingCargoUsed, getWingCurrentSystemId, getWingDispatchShipIds, hasActiveEscortWing, hasDispatchedHaulingWing } from '@/game/systems/fleet/wings.logic';
import { describeFleetActivity, describeWingActivity } from '@/ui/utils/fleetActivity';
import { FLEET_COLOURS } from '@/ui/utils/fleetColors';
import { ThemedIcon, splitIconLabel } from '@/ui/components/ThemedIcon';
import { getTutorialFleetTravelContext, isTutorialStepCurrent } from '@/game/progression/tutorialSequence';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

// ─── Types ─────────────────────────────────────────────────────────────────

type Tab = 'fleets' | 'pilots' | 'ships' | 'operations';
type FleetDestinationSortMode = 'distance-asc' | 'name' | 'security' | 'belts' | 'threat';
type FleetDestinationSecurityFilter = 'all' | 'highsec' | 'lowsec' | 'nullsec';
type FleetDestinationThreatFilter = 'all' | 'quiet' | 'hostile';

const FOCUS_LABEL: Record<PilotTrainingFocus, string> = {
  mining: 'Mining', combat: 'Combat', hauling: 'Hauling',
  exploration: 'Exploration', balanced: 'Balanced',
};
const FOCUS_COLOR: Record<PilotTrainingFocus, string> = {
  mining: 'text-cyan-400', combat: 'text-red-400', hauling: 'text-amber-400',
  exploration: 'text-emerald-400', balanced: 'text-violet-400',
};

const FLEET_ROLE_LABELS: Record<ShipRole, string> = {
  tank: 'T', dps: 'D', support: 'S', scout: 'SC', unassigned: '?',
};
const FLEET_ROLE_FULL: Record<ShipRole, string> = {
  tank: 'Tank', dps: 'DPS', support: 'Support', scout: 'Scout', unassigned: 'Unassigned',
};
const FLEET_ROLE_COLOR: Record<ShipRole, string> = {
  tank: '#4ade80', dps: '#f87171', support: '#60a5fa', scout: '#a78bfa', unassigned: '#475569',
};
const WING_LABELS: Record<WingType, string> = {
  mining: 'Mining', hauling: 'Hauling', combat: 'Combat', recon: 'Recon', industrial: 'Industrial',
};
const WING_TINT: Record<WingType, string> = {
  mining: '#22d3ee', hauling: '#f59e0b', combat: '#f87171', recon: '#34d399', industrial: '#c084fc',
};
const ROUTE_FILTER_LABELS: Record<RouteSecurityFilter, string> = {
  shortest: 'Direct route',
  safest: 'Safest route',
  'avoid-null': 'No-null route',
  'avoid-low': 'High-sec route',
};

const ROUTE_FILTER_EXPLANATIONS: Record<RouteSecurityFilter, string> = {
  shortest: 'Fastest operational posture. Fewer hops, but no security bias.',
  safest: 'Slowest but most conservative posture. Strongly prefers highsec links.',
  'avoid-null': 'Middle-ground posture. Keeps nullsec out of the route where possible.',
  'avoid-low': 'Strictest posture. Favors highsec-only chains when they exist.',
};

function fleetSecColor(security: 'highsec' | 'lowsec' | 'nullsec') {
  if (security === 'highsec') return '#4ade80';
  if (security === 'lowsec') return '#fb923c';
  return '#f87171';
}

function fleetSecLabel(security: 'highsec' | 'lowsec' | 'nullsec') {
  if (security === 'highsec') return 'High-Sec';
  if (security === 'lowsec') return 'Low-Sec';
  return 'Null-Sec';
}

function getStorageTargetCopy(haulingWingCount: number) {
  if (haulingWingCount <= 0) {
    return {
      label: 'Shared Storage',
      detail: 'No hauling wing is configured, so mining output remains in the fleet\'s shared storage pool.',
    };
  }
  if (haulingWingCount === 1) {
    return {
      label: 'Hauling Wing Storage',
      detail: 'Mining output is currently routed into the fleet\'s single hauling wing cargo hold.',
    };
  }
  return {
    label: 'Hauling Network',
    detail: `Mining output is distributed across ${haulingWingCount} hauling wings in the fleet storage network.`,
  };
}

function CommandMetric({
  label,
  value,
  meta,
  tone = 'slate',
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: 'cyan' | 'violet' | 'amber' | 'emerald' | 'slate';
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

  return (
    <div className={`rounded-md border px-2 py-1.5 ${toneClass}`}>
      <div className="text-[7px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-0.5 text-[11px] font-semibold font-mono leading-tight">{value}</div>
      {meta && <div className="mt-0.5 text-[8px] leading-tight text-slate-500">{meta}</div>}
    </div>
  );
}

function FleetSectionCard({
  eyebrow,
  title,
  meta,
  actions,
  children,
  tone = 'slate',
  className = '',
  onHeaderClick,
  headerExpanded,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'cyan' | 'violet' | 'amber' | 'emerald' | 'rose' | 'slate';
  className?: string;
  onHeaderClick?: () => void;
  headerExpanded?: boolean;
}) {
  const toneClass =
    tone === 'cyan'
      ? 'border-cyan-500/20 bg-cyan-950/10'
      : tone === 'violet'
        ? 'border-violet-500/20 bg-violet-950/10'
        : tone === 'amber'
          ? 'border-amber-500/20 bg-amber-950/10'
          : tone === 'emerald'
            ? 'border-emerald-500/20 bg-emerald-950/10'
            : tone === 'rose'
              ? 'border-rose-500/20 bg-rose-950/10'
              : 'border-slate-800/80 bg-slate-950/55';

  return (
    <section className={`rounded-lg border ${toneClass} ${className}`.trim()}>
      <div
        className={`flex items-start justify-between gap-3 border-b border-slate-800/70 px-2.5 py-2 ${onHeaderClick ? 'cursor-pointer select-none transition-colors hover:bg-white/[0.03]' : ''}`.trim()}
        onClick={onHeaderClick}
      >
        <div className="min-w-0">
          <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">{eyebrow}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-100">{title}</span>
            {meta && <span className="text-[8px] font-mono text-slate-500">{meta}</span>}
            {onHeaderClick && <span className="text-[10px] text-slate-600">{headerExpanded ? '▴' : '▾'}</span>}
          </div>
        </div>
        {actions ? <div className="shrink-0" onClick={event => event.stopPropagation()}>{actions}</div> : null}
      </div>
      <div className="flex flex-col gap-2 px-2.5 py-2.5">{children}</div>
    </section>
  );
}

function WingDetailCard({
  eyebrow,
  title,
  tone = 'slate',
  children,
  className = '',
}: {
  eyebrow: string;
  title: string;
  tone?: 'cyan' | 'violet' | 'amber' | 'emerald' | 'rose' | 'slate';
  children: React.ReactNode;
  className?: string;
}) {
  const toneClass =
    tone === 'cyan'
      ? 'border-cyan-500/15 bg-cyan-950/10'
      : tone === 'violet'
        ? 'border-violet-500/15 bg-violet-950/10'
        : tone === 'amber'
          ? 'border-amber-500/15 bg-amber-950/10'
          : tone === 'emerald'
            ? 'border-emerald-500/15 bg-emerald-950/10'
            : tone === 'rose'
              ? 'border-rose-500/15 bg-rose-950/10'
              : 'border-slate-800/80 bg-slate-950/55';

  return (
    <section className={`rounded-lg border px-2.5 py-2.5 ${toneClass} ${className}`.trim()}>
      <div className="flex flex-col gap-0.5">
        <span className="text-[8px] uppercase tracking-[0.14em] text-slate-500">{eyebrow}</span>
        <span className="text-[10px] font-semibold text-slate-200">{title}</span>
      </div>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </section>
  );
}

function FleetWingAssignmentPicker({
  ship,
  fleets,
  maxFleets,
  onAddToFleet,
  onAssignShipToWing,
  onCreateFleet,
  buttonClassName,
  buttonTitle,
  children,
}: {
  ship: ShipInstance;
  fleets: PlayerFleet[];
  maxFleets: number;
  onAddToFleet: (fleetId: string, shipId: string) => boolean;
  onAssignShipToWing: (fleetId: string, shipId: string, wingId: string | null) => boolean;
  onCreateFleet: (name: string, shipIds: string[]) => string | null;
  buttonClassName: string;
  buttonTitle?: string;
  children: React.ReactNode;
}) {
  const VIEWPORT_MENU_MARGIN = 12;
  const MENU_VERTICAL_GAP = 6;
  const MENU_HEADER_HEIGHT = 67;
  const MENU_FOOTER_HEIGHT = 58;
  const SUBMENU_MIN_TOP = 8;
  const [open, setOpen] = useState(false);
  const [activeFleetId, setActiveFleetId] = useState<string | null>(null);
  const [submenuTop, setSubmenuTop] = useState(48);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuMetrics, setMenuMetrics] = useState({ top: 0, left: 0, maxHeight: 320 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
  const shipLabel = ship.customName ?? hull?.name ?? ship.shipDefinitionId;
  const eligibleFleets = fleets.filter(
    fleet =>
      fleet.id !== ship.fleetId &&
      fleet.currentSystemId === ship.systemId &&
      fleet.fleetOrder === null &&
      !hasDispatchedHaulingWing(fleet),
  );
  const activeFleet = eligibleFleets.find(fleet => fleet.id === activeFleetId) ?? eligibleFleets[0] ?? null;
  const canFormFleet = ship.fleetId === null && fleets.length < maxFleets;

  const closeMenu = () => {
    setOpen(false);
    setActionError(null);
  };

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const flyoutWidth = 456;
    const preferredFlyoutHeight = 320;
    const nextLeft = Math.max(12, Math.min(rect.left, window.innerWidth - flyoutWidth - 12));
    const preferredTop = rect.bottom + MENU_VERTICAL_GAP;
    const nextTop = Math.max(
      VIEWPORT_MENU_MARGIN,
      Math.min(preferredTop, window.innerHeight - preferredFlyoutHeight - VIEWPORT_MENU_MARGIN),
    );
    const maxHeight = Math.max(216, window.innerHeight - nextTop - VIEWPORT_MENU_MARGIN);
    setMenuMetrics({ top: nextTop, left: nextLeft, maxHeight });
  };

  useEffect(() => {
    if (eligibleFleets.length === 0) {
      setActiveFleetId(null);
      setSubmenuTop(48);
      return;
    }
    if (!activeFleetId || !eligibleFleets.some(fleet => fleet.id === activeFleetId)) {
      setActiveFleetId(eligibleFleets[0].id);
      setSubmenuTop(48);
    }
  }, [activeFleetId, eligibleFleets]);

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();

    const handleWindowChange = () => updateMenuPosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const submenu = submenuRef.current;
    if (!submenu) return;
    const submenuHeight = submenu.offsetHeight;
    const clampedTop = Math.max(
      SUBMENU_MIN_TOP,
      Math.min(submenuTop, Math.max(SUBMENU_MIN_TOP, menuMetrics.maxHeight - submenuHeight - SUBMENU_MIN_TOP)),
    );
    if (clampedTop !== submenuTop) {
      setSubmenuTop(clampedTop);
    }
  }, [activeFleet, menuMetrics.maxHeight, open, submenuTop]);

  const selectFleetRow = (fleetId: string, rowIndex: number) => {
    setActiveFleetId(fleetId);
    setSubmenuTop(46 + rowIndex * 44);
  };

  const joinFleetReserve = (fleetId: string) => {
    setActionError(null);
    if (!onAddToFleet(fleetId, ship.id)) {
      setActionError('Unable to join that fleet from this system right now.');
      return;
    }
    closeMenu();
  };

  const assignToWing = (fleetId: string, wingId: string) => {
    setActionError(null);
    if (!onAddToFleet(fleetId, ship.id)) {
      setActionError('Unable to join that fleet from this system right now.');
      return;
    }
    if (!onAssignShipToWing(fleetId, ship.id, wingId)) {
      setActionError('That wing cannot accept hull changes while dispatched or in transit.');
      return;
    }
    closeMenu();
  };

  const formNewFleet = () => {
    setActionError(null);
    if (!onCreateFleet(`Fleet ${fleets.length + 1}`, [ship.id])) {
      setActionError(`Unable to form a new fleet. Current cap is ${maxFleets}.`);
      return;
    }
    closeMenu();
  };

  const activeFleetIndex = activeFleet ? fleets.findIndex(fleet => fleet.id === activeFleet.id) : -1;
  const activeFleetColor = activeFleetIndex >= 0 ? FLEET_COLOURS[activeFleetIndex % FLEET_COLOURS.length] : '#94a3b8';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={buttonClassName}
        title={buttonTitle}
        onClick={event => {
          event.stopPropagation();
          if (open) {
            closeMenu();
            return;
          }
          updateMenuPosition();
          setOpen(true);
        }}
      >
        {children}
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[10020]"
          style={{ top: menuMetrics.top, left: menuMetrics.left }}
        >
          <div className="relative flex items-start">
            <div
              className="flex w-[236px] flex-col overflow-hidden rounded-l-xl rounded-r-md border border-slate-700/70 bg-slate-950/96 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur-xl"
              style={{ maxHeight: menuMetrics.maxHeight }}
            >
              <div className="border-b border-slate-800/80 px-3 py-2.5">
                <div className="text-[8px] uppercase tracking-[0.18em] text-slate-500">Assign Hull</div>
                <div className="mt-1 truncate text-[11px] font-semibold text-cyan-200">{shipLabel}</div>
                <div className="mt-0.5 text-[8px] leading-relaxed text-slate-500">Pick a fleet first. Wings open in the flyout beside it.</div>
              </div>

              <div
                className="flex flex-col overflow-y-auto py-1"
                style={{ maxHeight: Math.max(104, menuMetrics.maxHeight - MENU_HEADER_HEIGHT - MENU_FOOTER_HEIGHT) }}
              >
                {eligibleFleets.length > 0 ? eligibleFleets.map((fleet, index) => {
                  const fleetIndex = fleets.findIndex(candidate => candidate.id === fleet.id);
                  const fleetColor = FLEET_COLOURS[fleetIndex % FLEET_COLOURS.length] ?? '#94a3b8';
                  const isActive = activeFleet?.id === fleet.id;
                  const staffedWingCount = (fleet.wings ?? []).filter(wing => wing.shipIds.length > 0).length;
                  return (
                    <button
                      key={fleet.id}
                      type="button"
                      onMouseEnter={() => selectFleetRow(fleet.id, index)}
                      onFocus={() => selectFleetRow(fleet.id, index)}
                      onClick={() => selectFleetRow(fleet.id, index)}
                      className={`flex items-center justify-between gap-2 border-l-2 px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'border-cyan-400 bg-cyan-950/25 text-cyan-100'
                          : 'border-transparent text-slate-300 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: fleetColor }} />
                          <span className="truncate text-[10px] font-semibold">{fleet.name}</span>
                        </div>
                        <div className="mt-0.5 text-[8px] text-slate-500">
                          {(fleet.wings ?? []).length} wing{(fleet.wings ?? []).length !== 1 ? 's' : ''} · {staffedWingCount} staffed
                        </div>
                      </div>
                      <span className={`text-[11px] ${isActive ? 'text-cyan-300' : 'text-slate-600'}`}>›</span>
                    </button>
                  );
                }) : (
                  <div className="px-3 py-3 text-[9px] leading-relaxed text-slate-500">
                    No stationary fleets in this hull's system are currently eligible for reassignment.
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800/80 px-2 py-2">
                {canFormFleet ? (
                  <button
                    type="button"
                    onClick={formNewFleet}
                    className="flex w-full items-center justify-between rounded-md border border-violet-400/20 bg-violet-950/15 px-3 py-2 text-left text-violet-200 transition-colors hover:border-violet-300/35 hover:text-violet-100"
                  >
                    <div>
                      <div className="text-[10px] font-semibold">Form New Fleet</div>
                      <div className="mt-0.5 text-[8px] text-violet-200/65">Create a dedicated command shell for this hull.</div>
                    </div>
                    <span className="text-[11px] text-violet-300">＋</span>
                  </button>
                ) : (
                  <div className="px-1 py-1 text-[8px] text-slate-600">Fleet cap reached. Join an existing fleet to continue.</div>
                )}
                {actionError && (
                  <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-950/15 px-2 py-1.5 text-[8px] leading-relaxed text-amber-300">
                    {actionError}
                  </div>
                )}
              </div>
            </div>

            <div
              ref={submenuRef}
              className="absolute left-[calc(100%-1px)] w-[224px] overflow-hidden rounded-r-xl rounded-l-md border border-slate-700/70 bg-slate-950/98 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur-xl"
              style={{ top: submenuTop, maxHeight: menuMetrics.maxHeight - SUBMENU_MIN_TOP }}
            >
              {activeFleet ? (
                <>
                  <div className="border-b border-slate-800/80 px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: activeFleetColor }} />
                      <span className="truncate text-[10px] font-semibold text-slate-100">{activeFleet.name}</span>
                    </div>
                    <div className="mt-0.5 text-[8px] text-slate-500">Choose a wing or keep the hull as reserve stock.</div>
                  </div>

                  <div className="flex max-h-[inherit] flex-col overflow-y-auto py-1">
                    <button
                      type="button"
                      onClick={() => joinFleetReserve(activeFleet.id)}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-left text-slate-300 transition-colors hover:bg-white/[0.04]"
                    >
                      <div>
                        <div className="text-[10px] font-semibold text-slate-100">Reserve Hull</div>
                        <div className="mt-0.5 text-[8px] text-slate-500">Join {activeFleet.name} without wing assignment.</div>
                      </div>
                    </button>

                    {(activeFleet.wings ?? []).length > 0 ? activeFleet.wings.map(wing => {
                      const blocked = wing.isDispatched;
                      return (
                        <button
                          key={wing.id}
                          type="button"
                          disabled={blocked}
                          onClick={() => assignToWing(activeFleet.id, wing.id)}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-left text-slate-300 transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: WING_TINT[wing.type] }} />
                              <span className="truncate text-[10px] font-semibold text-slate-100">{wing.name}</span>
                            </div>
                            <div className="mt-0.5 text-[8px] text-slate-500">
                              {WING_LABELS[wing.type]} wing · {wing.shipIds.length} hull{wing.shipIds.length !== 1 ? 's' : ''}
                              {blocked ? ' · dispatched' : ''}
                            </div>
                          </div>
                        </button>
                      );
                    }) : (
                      <div className="px-3 py-3 text-[9px] leading-relaxed text-slate-500">
                        This fleet has no wings configured yet. Add the hull as reserve first, then assign it from the fleet card.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="px-3 py-3 text-[9px] leading-relaxed text-slate-500">Pick a fleet to open its wing menu.</div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Role minibar ──────────────────────────────────────────────────────────

function RoleMinibar({ ships }: { ships: ShipInstance[] }) {
  const roles: ShipRole[] = ['tank', 'dps', 'support', 'scout'];
  return (
    <div className="flex items-center gap-0.5">
      {roles.map(role => {
        const count = ships.filter(s => s.role === role).length;
        if (count === 0) return null;
        return (
          <span
            key={role}
            className="text-[8px] font-mono px-1 rounded"
            style={{ color: FLEET_ROLE_COLOR[role], background: FLEET_ROLE_COLOR[role] + '22' }}
            title={`${FLEET_ROLE_FULL[role]}: ${count}`}
          >
            {FLEET_ROLE_LABELS[role]}{count}
          </span>
        );
      })}
      {ships.filter(s => s.role === 'unassigned').length > 0 && (
        <span className="text-[8px] font-mono px-1 rounded text-slate-500" title="Unassigned">
          ?{ships.filter(s => s.role === 'unassigned').length}
        </span>
      )}
    </div>
  );
}

type WingSurfaceProps = {
  fleetId: string;
  fleet: PlayerFleet;
  wing: FleetWing;
  wings: FleetWing[];
  fleetShips: ShipInstance[];
  allShips: Record<string, ShipInstance>;
  allPilots: Record<string, PilotInstance>;
  gameState: ReturnType<typeof useGameStore.getState>['state'];
  allSystems: ReturnType<typeof generateGalaxy>;
  nowMs: number;
  homeSystemId: string | null;
  onRename: (fleetId: string, wingId: string, name: string) => boolean;
  onDelete: (fleetId: string, wingId: string) => boolean;
  onDesignateCommander: (fleetId: string, wingId: string, pilotId: string | null) => boolean;
  onAssignShip: (fleetId: string, shipId: string, wingId: string | null) => boolean;
  onSetEscort: (fleetId: string, wingId: string, escortWingId: string | null) => boolean;
  onDispatch: (fleetId: string, wingId: string) => boolean;
  focused?: boolean;
};

function buildWingPresentationModel({
  fleet,
  wing,
  wings,
  fleetShips,
  allShips,
  allPilots,
  gameState,
  allSystems,
  nowMs,
  homeSystemId,
}: Omit<WingSurfaceProps, 'fleetId' | 'onRename' | 'onDelete' | 'onDesignateCommander' | 'onAssignShip' | 'onSetEscort' | 'onDispatch' | 'focused'>) {
  const wingShips = wing.shipIds.map(id => allShips[id]).filter(Boolean) as ShipInstance[];
  const wingPilots = wingShips
    .map(ship => ship.assignedPilotId ? allPilots[ship.assignedPilotId] : null)
    .filter(Boolean) as PilotInstance[];
  const wingCommander = wing.commanderId ? allPilots[wing.commanderId] ?? null : null;
  const escortWing = wing.type === 'hauling' ? getEscortWing(fleet, wing) : null;
  const escortActive = wing.type === 'hauling' ? hasActiveEscortWing(fleet, wing) : false;
  const escortOptions = wings.filter(candidate => candidate.type === 'combat' && candidate.id !== wing.id);
  const cargoCommanderBonus = getCombinedCommanderBonus(allPilots, fleet, wing, 'commander-cargo-capacity');
  const haulingCapacity = wing.type === 'hauling' ? getWingCargoCapacity(wing, allShips, cargoCommanderBonus) : 0;
  const haulingUsed = wing.type === 'hauling' ? getWingCargoUsed(wing) : 0;
  const haulingPct = haulingCapacity > 0 ? haulingUsed / haulingCapacity : 0;
  const routePolicy = wing.type === 'hauling' ? getHaulingWingEffectiveSecurityFilter(fleet, wing, allShips) : null;
  const wingEtaSeconds = wing.isDispatched
    ? getWingDispatchShipIds(fleet, wing).reduce((longestEta, shipId) => {
        const ship = allShips[shipId];
        if (!ship?.fleetOrder) return longestEta;
        return Math.max(longestEta, getShipOrderEtaSeconds(gameState, ship, ship.fleetOrder, allSystems, nowMs));
      }, 0)
    : 0;
  const wingLabel = WING_LABELS[wing.type];
  const wingTint = WING_TINT[wing.type];
  const getSystemName = (systemId: string) => allSystems.find(system => system.id === systemId)?.name ?? systemId;
  const wingActivity = describeWingActivity(gameState, fleet, wing, getSystemName);
  const dotClass = wingActivity.dotClass;
  const wingTone: 'cyan' | 'amber' | 'emerald' | 'violet' | 'rose' | 'slate' =
    wingActivity.tone === 'cyan' ? 'cyan' :
    wingActivity.tone === 'amber' ? 'amber' :
    wingActivity.tone === 'emerald' ? 'emerald' :
    wingActivity.tone === 'violet' ? 'violet' :
    wingActivity.tone === 'rose' ? 'rose' :
    'slate';
  const currentWingSystemId = getWingCurrentSystemId(fleet, wing, allShips) ?? fleet.currentSystemId;
  const currentWingSystemName = getSystemName(currentWingSystemId);
  const canDeleteWing = !wing.isDispatched;
  const unassignedFleetShips = fleetShips.filter(ship => !wings.some(candidate => candidate.shipIds.includes(ship.id)));
  const shipsAssignedHere = fleetShips.filter(ship => wing.shipIds.includes(ship.id));
  const movableShips = shipsAssignedHere.length > 0 ? shipsAssignedHere : unassignedFleetShips;
  const rosterTitle = shipsAssignedHere.length > 0 ? 'Assigned hulls' : 'Assign hulls';
  const rosterTone: 'violet' | 'slate' = shipsAssignedHere.length > 0 ? 'violet' : 'slate';
  const headerSurface = `${wingTint}18`;
  const headerBorder = `${wingTint}3a`;
  const readinessLabel = wing.type === 'hauling' && haulingCapacity > 0 ? 'Convoy readiness' : 'Wing readiness';
  const readinessValue = wing.type === 'hauling' && haulingCapacity > 0
    ? `${Math.round(haulingUsed).toLocaleString()} / ${Math.round(haulingCapacity).toLocaleString()} m3`
    : `${wing.shipIds.length} assigned hull${wing.shipIds.length !== 1 ? 's' : ''}`;
  const readinessPct = wing.type === 'hauling' && haulingCapacity > 0
    ? Math.min(1, haulingPct)
    : wing.shipIds.length > 0
      ? 1
      : 0.08;
  const readinessBarClass = wing.type === 'hauling' && haulingCapacity > 0
    ? wing.isDispatched
      ? 'bg-cyan-500/70'
      : haulingPct >= 0.9
        ? 'bg-amber-600/60'
        : 'bg-emerald-500'
    : wing.isDispatched
      ? 'bg-cyan-500/70'
      : wing.shipIds.length > 0
        ? 'bg-violet-500/70'
        : 'bg-slate-700';
  const postureSummary = wing.type === 'hauling' && routePolicy
    ? escortActive
      ? 'Escort-covered direct bias'
      : ROUTE_FILTER_LABELS[routePolicy]
    : wing.isDispatched
      ? 'Detached operation'
      : 'Standing by';
  const rosterShips = shipsAssignedHere.length > 0 ? [...shipsAssignedHere, ...unassignedFleetShips] : movableShips;
  const canDispatchToHq = wing.type === 'hauling' && haulingUsed > 0 && !wing.isDispatched && homeSystemId !== null && fleet.currentSystemId !== homeSystemId;

  const wingCommanderOptions: DropdownOption[] = wingPilots.map(pilot => {
    const assignedShip = wingShips.find(ship => ship.assignedPilotId === pilot.id);
    const focus = pilot.skills.idleTrainingFocus ?? 'balanced';
    return {
      value: pilot.id,
      label: pilot.name,
      description: assignedShip ? `${assignedShip.customName ?? HULL_DEFINITIONS[assignedShip.shipDefinitionId]?.name ?? assignedShip.id} · ${FOCUS_LABEL[focus]}` : FOCUS_LABEL[focus],
      meta: `Morale ${Math.round(pilot.morale ?? 0)}%`,
      group: FOCUS_LABEL[focus],
      tone: 'amber',
      badges: pilot.id === wing.commanderId ? [{ label: 'Assigned', color: '#fbbf24' }] : undefined,
      keywords: [focus, assignedShip?.shipDefinitionId ?? ''],
    };
  });

  const escortDropdownOptions: DropdownOption[] = escortOptions.map(option => ({
    value: option.id,
    label: option.name,
    description: `${option.shipIds.length} ships · ${WING_LABELS[option.type]} wing`,
    meta: option.commanderId ? 'Commander assigned' : 'No commander',
    group: 'Combat Escorts',
    tone: 'rose',
    badges: option.commanderId ? [{ label: 'Cmd', color: '#f87171' }] : undefined,
    keywords: [option.name, option.type],
  }));

  const shipAssignmentOptions: DropdownOption[] = wings.map(option => ({
    value: option.id,
    label: option.name,
    description: `${WING_LABELS[option.type]} wing · ${option.shipIds.length} ships`,
    group: WING_LABELS[option.type],
    meta: option.commanderId ? 'Commander assigned' : 'No commander',
    tone: option.type === 'mining' ? 'cyan' : option.type === 'hauling' ? 'amber' : option.type === 'combat' ? 'rose' : option.type === 'recon' ? 'emerald' : 'violet',
    badges: option.id === wing.id ? [{ label: 'Current', color: wingTint }] : undefined,
    keywords: [option.name, option.type],
  }));

  return {
    wingShips,
    wingCommander,
    escortWing,
    escortActive,
    haulingCapacity,
    haulingUsed,
    haulingPct,
    routePolicy,
    wingEtaSeconds,
    wingLabel,
    wingTint,
    wingActivity,
    dotClass,
    wingTone,
    currentWingSystemName,
    canDeleteWing,
    rosterTitle,
    rosterTone,
    headerSurface,
    headerBorder,
    readinessLabel,
    readinessValue,
    readinessPct,
    readinessBarClass,
    postureSummary,
    rosterShips,
    canDispatchToHq,
    wingCommanderOptions,
    escortDropdownOptions,
    shipAssignmentOptions,
  };
}

function WingSummaryRow({
  selected,
  onSelect,
  focused,
  ...props
}: WingSurfaceProps & { selected: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const {
    wingShips,
    wingCommander,
    wingEtaSeconds,
    wingLabel,
    wingTint,
    wingActivity,
    dotClass,
    wingTone,
    currentWingSystemName,
    canDeleteWing,
    headerSurface,
    headerBorder,
    readinessLabel,
    readinessValue,
    readinessPct,
    readinessBarClass,
    postureSummary,
  } = buildWingPresentationModel(props);
  const highlighted = hovered || selected || !!focused;

  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/35 shadow-[0_18px_40px_rgba(2,6,23,0.22)] transition-all duration-150"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={highlighted ? {
        borderColor: `${wingTint}55`,
        background: `linear-gradient(180deg, ${wingTint}10 0%, rgba(2,6,23,0.38) 100%)`,
        boxShadow: `0 22px 42px rgba(2,6,23,0.28), 0 0 0 1px ${wingTint}22, 0 0 18px ${wingTint}18`,
      } : undefined}
    >
      <div
        className="cursor-pointer select-none px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
        onClick={onSelect}
        style={{
          background: `linear-gradient(135deg, ${highlighted ? `${wingTint}24` : headerSurface} 0%, rgba(2,6,23,0) 65%)`,
          borderBottom: selected ? '1px solid rgba(30, 41, 59, 0.7)' : '1px solid transparent',
        }}
      >
        <div className="flex items-start gap-2">
          <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[11px] font-semibold" style={{ color: wingTint }}>
                    {props.wing.name}
                  </span>
                  <span className="rounded-full border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-slate-200" style={{ borderColor: headerBorder, background: headerSurface }}>
                    {wingLabel}
                  </span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] ${
                    wingTone === 'cyan' ? 'border-cyan-400/25 bg-cyan-950/25 text-cyan-200' :
                    wingTone === 'amber' ? 'border-amber-400/25 bg-amber-950/25 text-amber-200' :
                    wingTone === 'emerald' ? 'border-emerald-400/25 bg-emerald-950/25 text-emerald-200' :
                    wingTone === 'violet' ? 'border-violet-400/25 bg-violet-950/25 text-violet-200' :
                    wingTone === 'rose' ? 'border-rose-400/25 bg-rose-950/25 text-rose-200' :
                    'border-slate-700/60 bg-slate-900/80 text-slate-300'
                  }`}>
                    {wingActivity.shortLabel}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[8px] text-slate-500">
                  <span>{wingActivity.detail}</span>
                  <span className="text-slate-700">•</span>
                  <span>{currentWingSystemName}</span>
                  {wingCommander && (
                    <>
                      <span className="text-slate-700">•</span>
                      <span>cmdr {wingCommander.name}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 pl-1">
                <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-[0.12em] ${selected ? 'border-cyan-500/30 bg-cyan-950/25 text-cyan-200' : 'border-slate-700/60 bg-slate-900/70 text-slate-500'}`}>
                  {selected ? 'Inspecting' : 'Inspect'}
                </span>
                <button
                  onClick={event => {
                    event.stopPropagation();
                    if (canDeleteWing) props.onDelete(props.fleetId, props.wing.id);
                  }}
                  disabled={!canDeleteWing}
                  className="pl-1 text-[10px] text-red-500/40 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:text-slate-700"
                  title={canDeleteWing ? 'Delete wing' : 'Wing cannot be deleted while dispatched'}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/55 px-2 py-1.5">
                <div className="text-[8px] uppercase tracking-[0.12em] text-slate-600">Ships</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-200">{props.wing.shipIds.length}</span>
                  <RoleMinibar ships={wingShips} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/55 px-2 py-1.5">
                <div className="text-[8px] uppercase tracking-[0.12em] text-slate-600">Command</div>
                <div className="mt-1 truncate text-[10px] text-slate-300">{wingCommander ? wingCommander.name : 'No commander'}</div>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/55 px-2 py-1.5">
                <div className="text-[8px] uppercase tracking-[0.12em] text-slate-600">Posture</div>
                <div className="mt-1 truncate text-[10px] text-slate-300">{postureSummary}</div>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/55 px-2 py-1.5">
                <div className="text-[8px] uppercase tracking-[0.12em] text-slate-600">Transit</div>
                <div className="mt-1 truncate text-[10px] text-slate-300">
                  {props.wing.isDispatched && wingEtaSeconds > 0 ? `ETA ${formatEta(wingEtaSeconds)}` : 'No active convoy'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center justify-between gap-3 pb-1 text-[8px] uppercase tracking-[0.12em] text-slate-600">
          <span>{readinessLabel}</span>
          <span className="font-mono text-slate-500">{readinessValue}</span>
        </div>
        <div className="flex-1 overflow-hidden rounded-full bg-slate-800/70 h-1">
          <div className={`h-full rounded-full transition-all duration-500 ${readinessBarClass}`} style={{ width: `${Math.max(readinessPct, 0.08) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function WingDetailPane(props: WingSurfaceProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(props.wing.name);

  useEffect(() => {
    setNameInput(props.wing.name);
  }, [props.wing.name]);

  const {
    wingShips,
    wingCommander,
    escortWing,
    escortActive,
    haulingCapacity,
    haulingUsed,
    haulingPct,
    routePolicy,
    wingEtaSeconds,
    wingLabel,
    wingTint,
    wingActivity,
    wingTone,
    currentWingSystemName,
    rosterTitle,
    rosterTone,
    readinessLabel,
    readinessValue,
    readinessPct,
    readinessBarClass,
    canDispatchToHq,
    wingCommanderOptions,
    escortDropdownOptions,
    shipAssignmentOptions,
    rosterShips,
  } = buildWingPresentationModel(props);

  const saveName = () => {
    const nextName = nameInput.trim();
    if (!nextName) {
      setNameInput(props.wing.name);
      setEditingName(false);
      return;
    }
    props.onRename(props.fleetId, props.wing.id, nextName);
    setEditingName(false);
  };

  return (
    <div className="rounded-xl border border-violet-500/20 bg-slate-950/60 px-3 py-3 shadow-[0_18px_40px_rgba(2,6,23,0.26)]" data-tutorial-anchor={props.focused ? 'fleet-wing-detail' : undefined}>
      <div className="flex flex-col gap-3 border-b border-slate-800/70 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">Selected Wing</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold" style={{ color: wingTint }}>{props.wing.name}</span>
            <span className="rounded-full border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-slate-200" style={{ borderColor: `${wingTint}3a`, background: `${wingTint}18` }}>
              {wingLabel}
            </span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] ${
              wingTone === 'cyan' ? 'border-cyan-400/25 bg-cyan-950/25 text-cyan-200' :
              wingTone === 'amber' ? 'border-amber-400/25 bg-amber-950/25 text-amber-200' :
              wingTone === 'emerald' ? 'border-emerald-400/25 bg-emerald-950/25 text-emerald-200' :
              wingTone === 'violet' ? 'border-violet-400/25 bg-violet-950/25 text-violet-200' :
              wingTone === 'rose' ? 'border-rose-400/25 bg-rose-950/25 text-rose-200' :
              'border-slate-700/60 bg-slate-900/80 text-slate-300'
            }`}>
              {wingActivity.shortLabel}
            </span>
          </div>
          <div className="mt-1 text-[9px] text-slate-500">{wingActivity.detail}</div>
        </div>
        <div className="min-w-[180px] rounded-lg border border-slate-800/80 bg-slate-950/45 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2 text-[8px] uppercase tracking-[0.12em] text-slate-600">
            <span>{readinessLabel}</span>
            <span className="font-mono text-slate-500">{readinessValue}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800/70">
            <div className={`h-full rounded-full transition-all duration-500 ${readinessBarClass}`} style={{ width: `${Math.max(readinessPct, 0.08) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]">
        <WingDetailCard eyebrow="Identity" title="Wing Profile" tone={wingTone}>
          <div className="flex items-center gap-2">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Name</span>
            {editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={event => setNameInput(event.target.value)}
                onBlur={saveName}
                onKeyDown={event => {
                  if (event.key === 'Enter') saveName();
                  if (event.key === 'Escape') {
                    setNameInput(props.wing.name);
                    setEditingName(false);
                  }
                }}
                className="min-w-0 flex-1 border-b border-slate-600 bg-transparent text-[10px] font-semibold focus:border-cyan-500 focus:outline-none"
                style={{ color: wingTint }}
                maxLength={32}
              />
            ) : (
              <button onClick={() => setEditingName(true)} className="text-left text-[10px] text-slate-300 hover:text-white">
                {props.wing.name}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 text-[8px] text-slate-500">
            <span className="rounded-full border border-slate-700/60 bg-slate-900/80 px-1.5 py-0.5">{props.wing.shipIds.length} hulls</span>
            <span className="rounded-full border border-slate-700/60 bg-slate-900/80 px-1.5 py-0.5">{currentWingSystemName}</span>
            {wingCommander && (
              <span className="rounded-full border border-amber-400/20 bg-amber-950/20 px-1.5 py-0.5 text-amber-300/80">
                cmdr {wingCommander.name}
              </span>
            )}
          </div>
          <div className="text-[9px] text-slate-500">{wingActivity.detail}</div>
          {props.wing.type === 'hauling' && haulingCapacity > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[8px] uppercase tracking-widest text-slate-500">Cargo Hold</span>
                <span className="text-[9px] font-mono text-slate-500">{Math.round(haulingUsed).toLocaleString()} / {Math.round(haulingCapacity).toLocaleString()} m3</span>
              </div>
              {props.wing.isDispatched && wingEtaSeconds > 0 && (
                <div className="text-[8px] text-cyan-300/70">Convoy ETA {formatEta(wingEtaSeconds)}</div>
              )}
              <div className="flex-1 overflow-hidden rounded-full bg-slate-800/70 h-1">
                <div className={`h-full rounded-full transition-all duration-500 ${props.wing.isDispatched ? 'bg-cyan-500/70' : haulingPct >= 0.9 ? 'bg-amber-600/60' : 'bg-emerald-500'}`} style={{ width: `${Math.min(1, haulingPct) * 100}%` }} />
              </div>
            </div>
          )}
        </WingDetailCard>

        <WingDetailCard eyebrow="Control" title="Wing Command" tone="amber">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Commander</span>
            <div className="min-w-[170px] max-w-[240px]">
              <GameDropdown
                value={props.wing.commanderId ?? ''}
                onChange={nextValue => props.onDesignateCommander(props.fleetId, props.wing.id, nextValue || null)}
                options={wingCommanderOptions}
                placeholder="No wing commander"
                emptyOptionLabel="No wing commander"
                emptyOptionDescription="Run the wing without command bonuses."
                searchPlaceholder="Find wing pilot..."
                size="compact"
                triggerTone="amber"
                buttonStyle={{ minHeight: 26 }}
              />
            </div>
          </div>
          <div className="text-[8px] text-slate-500">
            {wingCommander
              ? 'Commander bonuses apply only to hulls assigned to this wing.'
              : 'Assign a commander to specialize output and give the wing a clearer operational role.'}
          </div>
          {props.wing.type === 'hauling' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[8px] uppercase tracking-widest text-slate-500">Escort</span>
                <div className="min-w-[170px] max-w-[240px]">
                  <GameDropdown
                    value={props.wing.escortWingId ?? ''}
                    onChange={nextValue => props.onSetEscort(props.fleetId, props.wing.id, nextValue || null)}
                    options={escortDropdownOptions}
                    placeholder="No escort"
                    emptyOptionLabel="No escort"
                    emptyOptionDescription="Hauling wings will travel alone."
                    searchPlaceholder="Find escort wing..."
                    size="compact"
                    triggerTone="rose"
                    buttonStyle={{ minHeight: 26 }}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border border-slate-800/80 bg-slate-950/50 px-2 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] ${escortActive ? 'border-rose-400/25 bg-rose-950/25 text-rose-300/80' : routePolicy ? 'border-cyan-400/25 bg-cyan-950/25 text-cyan-300/80' : 'border-slate-700/60 bg-slate-900/70 text-slate-400'}`}>
                    {escortActive ? 'Escort cover active' : routePolicy ? ROUTE_FILTER_LABELS[routePolicy] : 'No route posture'}
                  </span>
                  {props.wing.escortWingId && (
                    <span className="text-[8px] text-slate-500">
                      {escortActive
                        ? `${escortWing?.name ?? 'Escort wing'} travels with this convoy and prefers direct routing when possible.`
                        : 'Escort wing is assigned, but it needs active hulls before it can cover haul trips.'}
                    </span>
                  )}
                  {!props.wing.escortWingId && routePolicy && (
                    <span className="text-[8px] text-slate-500">Unescorted convoys automatically bias toward the safest route available.</span>
                  )}
                </div>
                {routePolicy && !escortActive && (
                  <div className="text-[8px] text-slate-600">{ROUTE_FILTER_EXPLANATIONS[routePolicy]}</div>
                )}
              </div>
            </>
          )}
        </WingDetailCard>

        <WingDetailCard eyebrow="Operations" title="Activity & Dispatch" tone={wingTone}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded border px-1.5 py-0.5 text-[9px] ${
              wingActivity.tone === 'cyan' ? 'border-cyan-400/25 bg-cyan-950/25 text-cyan-300/80' :
              wingActivity.tone === 'amber' ? 'border-amber-400/25 bg-amber-950/25 text-amber-300/80' :
              wingActivity.tone === 'emerald' ? 'border-emerald-400/25 bg-emerald-950/25 text-emerald-300/80' :
              wingActivity.tone === 'violet' ? 'border-violet-400/25 bg-violet-950/25 text-violet-300/80' :
              wingActivity.tone === 'rose' ? 'border-rose-400/25 bg-rose-950/25 text-rose-300/80' :
              'border-slate-600 bg-slate-900/50 text-slate-400'
            }`}>
              {wingActivity.shortLabel}
            </span>
            <span className="text-[8px] text-slate-500">{wingActivity.detail}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-2 py-2">
              <div className="text-[8px] uppercase tracking-[0.12em] text-slate-600">Position</div>
              <div className="mt-1 text-[10px] text-slate-300">{currentWingSystemName}</div>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-2 py-2">
              <div className="text-[8px] uppercase tracking-[0.12em] text-slate-600">Transit</div>
              <div className="mt-1 text-[10px] text-slate-300">{props.wing.isDispatched && wingEtaSeconds > 0 ? formatEta(wingEtaSeconds) : 'No active ETA'}</div>
            </div>
          </div>
          {canDispatchToHq && (
            <button
              onClick={() => props.onDispatch(props.fleetId, props.wing.id)}
              className="self-start rounded border border-amber-400/30 px-2 py-1 text-[9px] text-amber-300 hover:border-amber-300 hover:text-amber-200"
            >
              ↵ Dispatch Wing To HQ
            </button>
          )}
        </WingDetailCard>

        <WingDetailCard eyebrow="Roster" title={rosterTitle} tone={rosterTone} className="xl:col-span-2">
          <div className="grid gap-1.5 xl:grid-cols-2">
            {rosterShips.map(ship => {
              const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
              const assignedWing = props.wings.find(candidate => candidate.shipIds.includes(ship.id));
              return (
                <div key={ship.id} className="rounded-lg border border-slate-800/80 bg-slate-950/45 px-2 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-[9px] text-slate-300">
                      {ship.customName ?? hull?.name ?? ship.id}
                    </span>
                    <span className="shrink-0 text-[8px] text-slate-600">{assignedWing?.name ?? 'Unassigned'}</span>
                  </div>
                  <div className="mt-1.5 min-w-[148px] max-w-[220px]">
                    <GameDropdown
                      value={assignedWing?.id ?? ''}
                      onChange={nextValue => props.onAssignShip(props.fleetId, ship.id, nextValue || null)}
                      options={shipAssignmentOptions}
                      placeholder="Unassigned"
                      emptyOptionLabel="Unassigned"
                      emptyOptionDescription="Ships outside a wing remain non-operational."
                      searchPlaceholder="Assign to wing..."
                      size="compact"
                      triggerTone="cyan"
                      buttonStyle={{ minHeight: 26 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {wingShips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {wingShips.map(ship => (
                <span key={ship.id} className="rounded border border-slate-700 px-1.5 py-0.5 text-[8px] text-slate-400">
                  {ship.customName ?? HULL_DEFINITIONS[ship.shipDefinitionId]?.name ?? ship.id}
                </span>
              ))}
            </div>
          )}
        </WingDetailCard>
      </div>
    </div>
  );
}

// ─── Fleet card ────────────────────────────────────────────────────────────

function FleetCard({
  fleetId,
  expanded,
  isFirst,
  isLast,
  onToggle,
  state,
  galaxy,
  systemNameById,
  focusedWingId,
  selectedWingId,
  onSelectedWingChange,
}: {
  fleetId: string;
  expanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  state: ReturnType<typeof useGameStore.getState>['state'];
  galaxy: ReturnType<typeof generateGalaxy>;
  systemNameById: Record<string, string>;
  focusedWingId?: string | null;
  selectedWingId?: string | null;
  onSelectedWingChange: (wingId: string | null) => void;
}) {
  const setShipRole     = useGameStore(s => s.setShipRole);
  const setDoctrine     = useGameStore(s => s.setFleetDoctrine);
  const addShip         = useGameStore(s => s.addShipToFleet);
  const removeShip      = useGameStore(s => s.removeShipFromFleet);
  const disband         = useGameStore(s => s.disbandPlayerFleet);
  const renameFleet     = useGameStore(s => s.renamePlayerFleet);
  const moveFleet       = useGameStore(s => s.movePlayerFleet);
  const issuePatrol     = useGameStore(s => s.issuePatrolOrder);
  const issueRaid       = useGameStore(s => s.issueCombatRaidOrder);
  const cancelCombat     = useGameStore(s => s.cancelCombatOrder);
  const issueGroupOrder  = useGameStore(s => s.issueFleetGroupOrder);
  const cancelGroupOrder = useGameStore(s => s.cancelFleetGroupOrder);
  const haulFleetToHQ = useGameStore(s => s.haulFleetToHQ);
  const setFleetScanning = useGameStore(s => s.setFleetScanning);
  const designateCommander     = useGameStore(s => s.designateFleetCommander);
  const queueCmdSkill          = useGameStore(s => s.queueCommanderSkill);
  const removeCmdSkillFromQueue = useGameStore(s => s.removeCommanderSkillFromQueue);
  const createFleetWing = useGameStore(s => s.createFleetWing);
  const renameFleetWing = useGameStore(s => s.renameFleetWing);
  const deleteFleetWing = useGameStore(s => s.deleteFleetWing);
  const designateWingCommander = useGameStore(s => s.designateWingCommander);
  const assignShipToWing = useGameStore(s => s.assignShipToWing);
  const setWingEscort = useGameStore(s => s.setWingEscort);
  const dispatchHaulingWingToHQ = useGameStore(s => s.dispatchHaulingWingToHQ);

  const [editingName,  setEditingName]  = useState(false);
  const [nameInput,    setNameInput]    = useState('');
  const [destSystemId, setDestSystemId] = useState('');
  const [secFilter,    setSecFilter]    = useState<RouteSecurityFilter>('shortest');
  const [destinationSort, setDestinationSort] = useState<FleetDestinationSortMode>('distance-asc');
  const [destinationSecurity, setDestinationSecurity] = useState<FleetDestinationSecurityFilter>('all');
  const [destinationThreat, setDestinationThreat] = useState<FleetDestinationThreatFilter>('all');
  const [destinationVisitedOnly, setDestinationVisitedOnly] = useState(false);
  const [destinationReachableOnly, setDestinationReachableOnly] = useState(false);
  const [destinationStationsOnly, setDestinationStationsOnly] = useState(false);
  const [destinationBeltsOnly, setDestinationBeltsOnly] = useState(false);
  const [destinationSameRegionOnly, setDestinationSameRegionOnly] = useState(false);
  const [wingsExpanded, setWingsExpanded] = useState(false);
  const [deleteReviewOpen, setDeleteReviewOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const nowMs = state.lastUpdatedAt;

  const fleet = state.systems.fleet.fleets[fleetId];
  if (!fleet) return null;

  const tutorialFleetContext = getTutorialFleetTravelContext(state);
  const highlightFleetIntro = isTutorialStepCurrent(state, 'fleet-command-intro') && fleetId === tutorialFleetContext.starterFleetId;
  const highlightTransit = isTutorialStepCurrent(state, 'fleet-arrival-watch') && fleetId === tutorialFleetContext.starterFleetId;

  const allShips   = state.systems.fleet.ships;
  const allPilots  = state.systems.fleet.pilots;
  const fleetShips = fleet.shipIds.map(id => allShips[id]).filter(Boolean) as ShipInstance[];
  const wings = fleet.wings ?? [];
  const haulingWings = wings.filter(wing => wing.type === 'hauling');
  const dispatchedHaulingWings = haulingWings.filter(wing => wing.isDispatched);
  const escortedDispatchedWingCount = dispatchedHaulingWings.filter(wing => hasActiveEscortWing(fleet, wing)).length;
  const escortResponses = dispatchedHaulingWings
    .map(wing => {
      if (!hasActiveEscortWing(fleet, wing)) return null;
      const systemId = getWingCurrentSystemId(fleet, wing, allShips);
      if (!systemId) return null;
      const threats = getAliveNpcGroupsInSystem(state, systemId);
      if (threats.length === 0) return null;
      return { wingId: wing.id, systemId, threatCount: threats.length };
    })
    .filter(Boolean) as Array<{ wingId: string; systemId: string; threatCount: number }>;
  const hasWingDispatch = hasDispatchedHaulingWing(fleet);
  const operationalShipIds = getOperationalFleetShipIds(fleet);
  const operationalFleetShips = operationalShipIds.map(id => allShips[id]).filter(Boolean) as ShipInstance[];
  const doctrine   = fleet.doctrine ?? 'balanced'; // guard stale persisted state
  const docDef     = DOCTRINE_DEFINITIONS[doctrine] ?? DOCTRINE_DEFINITIONS['balanced'];
  const docMet     = getDoctrineRequirementsMet(doctrine, fleetShips);
  const suggested  = suggestDoctrine(fleetShips);

  const fleetIdx   = Object.keys(state.systems.fleet.fleets).indexOf(fleetId);
  const fleetColor = FLEET_COLOURS[fleetIdx % FLEET_COLOURS.length];

  const isMoving   = fleet.fleetOrder !== null;

  // Cargo hold
  const cargoTotals = haulingWings.length > 0
    ? Object.entries(fleet.cargoHold).reduce((totals, [resourceId, qty]) => ({
        ...totals,
        [resourceId]: (totals[resourceId] ?? 0) + qty,
      }), getWingCargoTotals(fleet))
    : fleet.cargoHold;
  const cargoCapacity = getFleetStorageCapacity(fleet, allShips, allPilots);
  const cargoUsed     = haulingWings.length > 0
    ? haulingWings.reduce((sum, wing) => sum + getWingCargoUsed(wing), 0) + Object.values(fleet.cargoHold).reduce((sum, qty) => sum + qty, 0)
    : getFleetStoredCargo(fleet);
  const cargoPct      = cargoCapacity > 0 ? Math.min(1, cargoUsed / cargoCapacity) : 0;
  const storageTarget = getStorageTargetCopy(haulingWings.length);
  const hqSystemId    = state.systems.factions.homeStationSystemId;
  const nextFleetStopId = fleet.fleetOrder ? fleet.fleetOrder.route[fleet.fleetOrder.currentLeg + 1] ?? null : null;
  const fleetEtaSeconds = fleet.fleetOrder
    ? getFleetOrderEtaSeconds(state, fleet, allShips, fleet.fleetOrder, galaxy, nowMs)
    : 0;
  const fleetLegProgress = fleet.fleetOrder
    ? getFleetOrderProgress(state, fleet, allShips, fleet.fleetOrder, galaxy, nowMs)
    : 0;
  const canHaulNow    = haulingWings.length === 1
    ? !haulingWings[0].isDispatched && hqSystemId !== null && hqSystemId !== fleet.currentSystemId && cargoUsed > 0
    : haulingWings.length === 0 && !isMoving && hqSystemId !== null && hqSystemId !== fleet.currentSystemId && cargoUsed > 0;
  const commander = fleet.commanderId ? allPilots[fleet.commanderId] ?? null : null;
  const readinessRate = fleetShips.length > 0 ? operationalFleetShips.length / fleetShips.length : 0;
  const fleetActivity = describeFleetActivity(state, fleet, systemId => systemNameById[systemId] ?? systemId);
  const currentSystem = galaxy.find(system => system.id === fleet.currentSystemId) ?? null;
  const maxJumpRangeLy = useMemo(() => {
    let maxBonus = 0;
    for (const ship of fleetShips) {
      const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
      if (hull && hull.warpSpeedBonus > maxBonus) maxBonus = hull.warpSpeedBonus;
    }
    return Math.round(15 + maxBonus * 100);
  }, [fleetShips]);
  const destinationIntel = useMemo(() => {
    return galaxy
      .filter(system => system.id !== fleet.currentSystemId)
      .map(system => {
        const isVisited = !!state.galaxy.visitedSystems[system.id];
        const beltCount = system.bodies.filter(body => body.type === 'asteroid-belt').length;
        const threatCount = isVisited ? getAliveNpcGroupsInSystem(state, system.id).length : 0;
        const distanceLy = currentSystem
          ? Math.hypot(system.x - currentSystem.x, system.y - currentSystem.y, system.z - currentSystem.z) * 200
          : 0;
        const directReachable = currentSystem !== null && distanceLy <= maxJumpRangeLy;
        const sameRegion = currentSystem !== null && system.regionName === currentSystem.regionName;

        return {
          system,
          isVisited,
          beltCount,
          threatCount,
          distanceLy,
          directReachable,
          sameRegion,
        };
      });
  }, [currentSystem, fleet.currentSystemId, galaxy, maxJumpRangeLy, state]);
  const destinationOptions = useMemo<DropdownOption[]>(() => {
    const filtered = destinationIntel.filter(({ system, isVisited, beltCount, threatCount, directReachable, sameRegion }) => {
      if (destinationSecurity !== 'all' && system.security !== destinationSecurity) return false;
      if (destinationVisitedOnly && !isVisited) return false;
      if (destinationReachableOnly && !directReachable) return false;
      if (destinationStationsOnly && !system.stationId) return false;
      if (destinationBeltsOnly && beltCount === 0) return false;
      if (destinationSameRegionOnly && !sameRegion) return false;
      if (destinationThreat === 'quiet' && threatCount > 0) return false;
      if (destinationThreat === 'hostile' && threatCount === 0) return false;
      return true;
    });

    filtered.sort((left, right) => {
      if (destinationSort === 'distance-asc') {
        const delta = left.distanceLy - right.distanceLy;
        if (Math.abs(delta) > 0.01) return delta;
        return left.system.name.localeCompare(right.system.name);
      }
      if (destinationSort === 'security') {
        const rank = { highsec: 0, lowsec: 1, nullsec: 2 } as const;
        const delta = rank[left.system.security] - rank[right.system.security];
        if (delta !== 0) return delta;
        return left.system.name.localeCompare(right.system.name);
      }
      if (destinationSort === 'belts') {
        if (right.beltCount !== left.beltCount) return right.beltCount - left.beltCount;
        return left.distanceLy - right.distanceLy;
      }
      if (destinationSort === 'threat') {
        if (right.threatCount !== left.threatCount) return right.threatCount - left.threatCount;
        return left.distanceLy - right.distanceLy;
      }
      return left.system.name.localeCompare(right.system.name);
    });

    const mapped: DropdownOption[] = filtered.map(({ system, isVisited, beltCount, threatCount, distanceLy, directReachable, sameRegion }) => ({
      value: system.id,
      label: `${isVisited ? '' : '? '}${system.name}`,
      description: [isVisited ? fleetSecLabel(system.security) : 'Unvisited', sameRegion ? 'same region' : system.regionName].join(' · '),
      meta: [`${distanceLy.toFixed(1)} LY`, directReachable ? 'direct jump' : 'multi-hop'].join(' · '),
      group: isVisited ? fleetSecLabel(system.security) : 'Unvisited',
      tone: !isVisited ? 'slate' : system.security === 'highsec' ? 'emerald' : system.security === 'lowsec' ? 'amber' : 'rose',
      badges: [
        { label: fleetSecLabel(system.security), color: fleetSecColor(system.security) },
        { label: `${distanceLy.toFixed(1)} LY`, color: '#67e8f9' },
        { label: system.starType, color: '#94a3b8' },
        ...(beltCount > 0 ? [{ label: `${beltCount} Belts`, color: '#fb923c' }] : []),
        ...(system.stationId ? [{ label: 'Station', color: '#a78bfa' }] : []),
        ...(threatCount > 0 ? [{ label: `${threatCount} Threat`, color: '#f87171' }] : []),
        ...(directReachable ? [{ label: 'Direct', color: '#34d399' }] : []),
      ],
      keywords: [
        system.name,
        system.security,
        system.starType,
        system.regionName,
        isVisited ? 'visited' : 'unvisited',
        directReachable ? 'reachable direct' : 'multi hop',
        system.stationId ? 'station' : 'no station',
        beltCount > 0 ? 'belts mining' : 'no belts',
        threatCount > 0 ? 'hostile threat pirates' : 'quiet safe',
        sameRegion ? 'same region' : '',
      ].filter(Boolean),
    }));

    if (destSystemId && !mapped.some(option => option.value === destSystemId)) {
      const selected = destinationIntel.find(entry => entry.system.id === destSystemId);
      if (selected) {
        mapped.unshift({
          value: selected.system.id,
          label: `${selected.isVisited ? '' : '? '}${selected.system.name}`,
          description: 'Currently selected destination · hidden by active filters',
          meta: `${selected.distanceLy.toFixed(1)} LY`,
          group: 'Selected',
          tone: selected.isVisited ? 'cyan' : 'slate',
          badges: [{ label: 'Selected', color: '#22d3ee' }],
          keywords: [selected.system.name, 'selected'],
        });
      }
    }

    return mapped;
  }, [
    destSystemId,
    destinationBeltsOnly,
    destinationIntel,
    destinationReachableOnly,
    destinationSameRegionOnly,
    destinationSecurity,
    destinationSort,
    destinationStationsOnly,
    destinationThreat,
    destinationVisitedOnly,
  ]);
  const selectedDestinationOption = useMemo(
    () => destinationOptions.find(option => option.value === destSystemId) ?? null,
    [destSystemId, destinationOptions],
  );
  const destinationFilterCount = [
    destinationSecurity !== 'all',
    destinationThreat !== 'all',
    destinationVisitedOnly,
    destinationReachableOnly,
    destinationStationsOnly,
    destinationBeltsOnly,
    destinationSameRegionOnly,
  ].filter(Boolean).length;
  const destinationMenuHeader = useMemo(() => {
    const toggleChipClass = (active: boolean, activeClass: string) => `rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] transition-colors ${active ? activeClass : 'border-slate-700/50 bg-slate-900/70 text-slate-500 hover:border-slate-600 hover:text-slate-300'}`;

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[8px] uppercase tracking-[0.1em] text-slate-500">Destination Filters</span>
          <span className={`text-[8px] font-mono ${destinationFilterCount > 0 ? 'text-cyan-300' : 'text-slate-600'}`}>
            {destinationOptions.length} matches · {destinationFilterCount > 0 ? `${destinationFilterCount} active` : 'broad scan'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {[
            { value: 'distance-asc', label: 'Nearest', activeClass: 'border-cyan-500/40 bg-cyan-950/25 text-cyan-200' },
            { value: 'name', label: 'A-Z', activeClass: 'border-slate-500/40 bg-slate-900/80 text-slate-200' },
            { value: 'security', label: 'Security', activeClass: 'border-emerald-500/40 bg-emerald-950/25 text-emerald-200' },
            { value: 'belts', label: 'Belts', activeClass: 'border-amber-500/40 bg-amber-950/25 text-amber-200' },
            { value: 'threat', label: 'Threat', activeClass: 'border-rose-500/40 bg-rose-950/25 text-rose-200' },
          ].map(chip => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setDestinationSort(chip.value as FleetDestinationSortMode)}
              className={toggleChipClass(destinationSort === chip.value, chip.activeClass)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {[
            { value: 'all', label: 'Any Sec', activeClass: 'border-cyan-500/40 bg-cyan-950/25 text-cyan-200' },
            { value: 'highsec', label: 'High', activeClass: 'border-emerald-500/40 bg-emerald-950/25 text-emerald-200' },
            { value: 'lowsec', label: 'Low', activeClass: 'border-amber-500/40 bg-amber-950/25 text-amber-200' },
            { value: 'nullsec', label: 'Null', activeClass: 'border-rose-500/40 bg-rose-950/25 text-rose-200' },
          ].map(chip => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setDestinationSecurity(chip.value as FleetDestinationSecurityFilter)}
              className={toggleChipClass(destinationSecurity === chip.value, chip.activeClass)}
            >
              {chip.label}
            </button>
          ))}
          {[
            { value: 'all', label: 'Any Threat', activeClass: 'border-cyan-500/40 bg-cyan-950/25 text-cyan-200' },
            { value: 'quiet', label: 'Quiet', activeClass: 'border-emerald-500/40 bg-emerald-950/25 text-emerald-200' },
            { value: 'hostile', label: 'Hostile', activeClass: 'border-rose-500/40 bg-rose-950/25 text-rose-200' },
          ].map(chip => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setDestinationThreat(chip.value as FleetDestinationThreatFilter)}
              className={toggleChipClass(destinationThreat === chip.value, chip.activeClass)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {[
            { label: 'Visited', active: destinationVisitedOnly, onClick: () => setDestinationVisitedOnly(value => !value), activeClass: 'border-cyan-500/40 bg-cyan-950/25 text-cyan-200' },
            { label: 'Direct', active: destinationReachableOnly, onClick: () => setDestinationReachableOnly(value => !value), activeClass: 'border-emerald-500/40 bg-emerald-950/25 text-emerald-200' },
            { label: 'Stations', active: destinationStationsOnly, onClick: () => setDestinationStationsOnly(value => !value), activeClass: 'border-violet-500/40 bg-violet-950/25 text-violet-200' },
            { label: 'Belts', active: destinationBeltsOnly, onClick: () => setDestinationBeltsOnly(value => !value), activeClass: 'border-amber-500/40 bg-amber-950/25 text-amber-200' },
            { label: 'Same Region', active: destinationSameRegionOnly, onClick: () => setDestinationSameRegionOnly(value => !value), activeClass: 'border-cyan-500/40 bg-cyan-950/25 text-cyan-200' },
          ].map(chip => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.onClick}
              className={toggleChipClass(chip.active, chip.activeClass)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    );
  }, [
    destinationBeltsOnly,
    destinationFilterCount,
    destinationOptions.length,
    destinationReachableOnly,
    destinationSameRegionOnly,
    destinationSecurity,
    destinationSort,
    destinationStationsOnly,
    destinationThreat,
    destinationVisitedOnly,
  ]);

  const dotColor = fleetActivity.dotClass;

  useEffect(() => {
    if (focusedWingId) {
      setWingsExpanded(true);
    }
  }, [focusedWingId]);

  useEffect(() => {
    if (!wingsExpanded) return;
    if (focusedWingId && wings.some(wing => wing.id === focusedWingId)) {
      if (selectedWingId !== focusedWingId) onSelectedWingChange(focusedWingId);
      return;
    }
    if (wings.length === 0) {
      if (selectedWingId !== null) onSelectedWingChange(null);
      return;
    }
    if (selectedWingId && wings.some(wing => wing.id === selectedWingId)) return;
    onSelectedWingChange(wings[0].id);
  }, [focusedWingId, onSelectedWingChange, selectedWingId, wings, wingsExpanded]);

  // Ships in same system that can join
  const joinableShips = Object.values(allShips).filter(
    s => s.fleetId === null && s.systemId === fleet.currentSystemId,
  );
  const assignedWingShipIds = new Set(wings.flatMap(wing => wing.shipIds));
  const unassignedWingShips = fleetShips.filter(ship => !assignedWingShipIds.has(ship.id));
  const selectedWing = selectedWingId ? wings.find(wing => wing.id === selectedWingId) ?? null : null;
  const staffedWings = wings.filter(wing => wing.shipIds.length > 0);
  const staffedWingShipCount = staffedWings.reduce((sum, wing) => sum + wing.shipIds.length, 0);
  const emptyWingCount = Math.max(0, wings.length - staffedWings.length);
  const deleteBlockedReason = isMoving
    ? 'Fleet deletion is blocked while the formation is in transit.'
    : hasWingDispatch
      ? `${dispatchedHaulingWings.length} hauling wing${dispatchedHaulingWings.length !== 1 ? 's are' : ' is'} still dispatched. Recall ${dispatchedHaulingWings.length !== 1 ? 'them' : 'it'} before deleting this fleet.`
      : null;
  const deleteSummary = staffedWings.length > 0
    ? `Deleting this fleet will dissolve ${staffedWings.length} staffed wing${staffedWings.length !== 1 ? 's' : ''} and release ${staffedWingShipCount} assigned ship${staffedWingShipCount !== 1 ? 's' : ''} as idle standalone hulls in ${systemNameById[fleet.currentSystemId] ?? fleet.currentSystemId}.`
    : fleetShips.length > 0
      ? `Deleting this fleet will release ${fleetShips.length} ship${fleetShips.length !== 1 ? 's' : ''} as idle standalone hulls in ${systemNameById[fleet.currentSystemId] ?? fleet.currentSystemId}.`
      : 'Deleting this fleet will remove the command shell. No ships are assigned.';

  useEffect(() => {
    if (!expanded) {
      setDeleteReviewOpen(false);
      setDeleteError(null);
    }
  }, [expanded]);

  const openDeleteReview = () => {
    if (!expanded) onToggle();
    setDeleteReviewOpen(true);
    setDeleteError(null);
  };

  const closeDeleteReview = () => {
    setDeleteReviewOpen(false);
    setDeleteError(null);
  };

  const confirmDeleteFleet = () => {
    if (deleteBlockedReason) {
      setDeleteError(deleteBlockedReason);
      return;
    }
    const deleted = disband(fleetId);
    if (!deleted) {
      setDeleteError('Fleet deletion was rejected. Keep the fleet stationary and recall any dispatched hauling wing before trying again.');
      return;
    }
    onSelectedWingChange(null);
    setDeleteReviewOpen(false);
    setDeleteError(null);
  };

  return (
    <div
      className="rounded border bg-slate-900/40 overflow-hidden"
      style={{ borderColor: fleetColor + '44' }}
      data-tutorial-anchor={highlightFleetIntro ? 'fleet-starter-card' : undefined}
    >
      {/* Collapsed header */}
      <div
        className="flex items-center gap-2.5 px-3 py-2 cursor-pointer select-none transition-colors hover:bg-white/[0.03]"
        onClick={onToggle}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={() => { renameFleet(fleetId, nameInput); setEditingName(false); }}
              onKeyDown={e => {
                if (e.key === 'Enter') { renameFleet(fleetId, nameInput); setEditingName(false); }
                if (e.key === 'Escape') { setEditingName(false); setNameInput(fleet.name); }
              }}
              onClick={e => e.stopPropagation()}
              className="w-full text-[11px] font-semibold bg-transparent border-b border-slate-600 focus:outline-none focus:border-cyan-500"
              style={{ color: fleetColor }}
              maxLength={32}
            />
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="text-[11px] font-semibold truncate hover:opacity-80"
                style={{ color: fleetColor }}
                onClick={e => { e.stopPropagation(); setEditingName(true); setNameInput(fleet.name); }}
                title="Click to rename"
              >
                {fleet.name}
              </span>
              <span
                className="text-[8px] px-1.5 py-0.5 rounded border"
                style={{ color: docDef.color, borderColor: docDef.color + '44', background: docDef.color + '11' }}
                title={docMet ? docDef.description : `Requires ${DOCTRINE_DEFINITIONS[fleet.doctrine].requires} ship`}
              >
                {docDef.label}{!docMet && ' ⚠'}
              </span>
              <RoleMinibar ships={fleetShips} />
            </div>
          )}
          <div className="flex gap-2 mt-0.5">
            <span
              className="entity-tag"
              style={{ '--tag-color': '#ffe47a' } as React.CSSProperties}
              role="button"
              tabIndex={0}
              onClick={e => {
                e.stopPropagation();
                useUiStore.getState().navigate('system', { entityType: 'fleet', entityId: fleetId });
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  useUiStore.getState().navigate('system', { entityType: 'fleet', entityId: fleetId });
                }
              }}
              title="View fleet in star system"
            >
              {systemNameById[fleet.currentSystemId] ?? fleet.currentSystemId}
            </span>
            <span className="text-[9px] text-slate-600">·</span>
            <span className="text-[9px] text-slate-500">{fleetShips.length} ship{fleetShips.length !== 1 ? 's' : ''}</span>
            <span className="text-[9px] text-slate-600">· {operationalFleetShips.length} operational</span>
            <span className={`text-[9px] ${
              fleetActivity.tone === 'cyan' ? 'text-cyan-300/80' :
              fleetActivity.tone === 'amber' ? 'text-amber-300/80' :
              fleetActivity.tone === 'emerald' ? 'text-emerald-300/80' :
              fleetActivity.tone === 'violet' ? 'text-violet-300/80' :
              fleetActivity.tone === 'rose' ? 'text-rose-300/80' :
              'text-slate-500'
            }`}>· {fleetActivity.shortLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={openDeleteReview}
            className={`rounded border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] transition-colors ${deleteReviewOpen && expanded
              ? 'border-red-300/50 bg-red-950/35 text-red-200'
              : 'border-red-400/20 text-red-300/70 hover:border-red-300/40 hover:text-red-200'
            }`}
            title="Delete fleet"
          >
            Delete
          </button>
          <div className="flex flex-col">
            <button
              disabled={isFirst}
              onClick={() => moveFleet(fleetId, 'up')}
              className="px-1 py-0.5 text-[9px] leading-none text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-default transition-colors"
              title="Move up"
            >▲</button>
            <button
              disabled={isLast}
              onClick={() => moveFleet(fleetId, 'down')}
              className="px-1 py-0.5 text-[9px] leading-none text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-default transition-colors"
              title="Move down"
            >▼</button>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="border-t px-2.5 pb-2.5 pt-2.5"
          style={{ borderColor: fleetColor + '22' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex flex-col gap-2.5">
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/70 px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(148,163,184,0.05)]">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">Fleet Command Deck</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-100">
                    <span style={{ color: fleetColor }}>{fleet.name}</span>
                    <span className="rounded-full border border-slate-700/60 bg-slate-900/80 px-2 py-0.5 text-[8px] font-mono text-slate-400">
                      {systemNameById[fleet.currentSystemId] ?? fleet.currentSystemId}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[8px] font-mono ${
                      fleetActivity.tone === 'cyan' ? 'border-cyan-500/30 bg-cyan-950/25 text-cyan-200' :
                      fleetActivity.tone === 'amber' ? 'border-amber-500/30 bg-amber-950/25 text-amber-200' :
                      fleetActivity.tone === 'emerald' ? 'border-emerald-500/30 bg-emerald-950/25 text-emerald-200' :
                      fleetActivity.tone === 'violet' ? 'border-violet-500/30 bg-violet-950/25 text-violet-200' :
                      fleetActivity.tone === 'rose' ? 'border-rose-500/30 bg-rose-950/25 text-rose-200' :
                      'border-slate-700/60 bg-slate-900/80 text-slate-400'
                    }`}>
                      {fleetActivity.shortLabel}
                    </span>
                  </div>
                  <div className="mt-1 text-[9px] leading-relaxed text-slate-500">
                    {fleetActivity.detail}
                  </div>
                </div>
                <div className="text-[8px] font-mono text-slate-500">
                  {fleetShips.length} hulls · {operationalFleetShips.length} operational · {wings.length} wings
                </div>
              </div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                <CommandMetric
                  label="Readiness"
                  value={`${operationalFleetShips.length}/${fleetShips.length || 0}`}
                  meta={fleetShips.length > 0 ? `${Math.round(readinessRate * 100)}% hulls operational` : 'no hulls assigned'}
                  tone={operationalFleetShips.length > 0 ? 'cyan' : 'slate'}
                />
                <CommandMetric
                  label="Wings"
                  value={`${wings.length}`}
                  meta={haulingWings.length > 0 ? `${haulingWings.length} hauling lane${haulingWings.length !== 1 ? 's' : ''}` : 'no wing network'}
                  tone={wings.length > 0 ? 'violet' : 'slate'}
                />
                <CommandMetric
                  label="Commander"
                  value={commander ? commander.name : 'unassigned'}
                  meta={commander ? `${Object.keys(commander.commandSkills?.levels ?? {}).length} command tracks` : 'no command bonuses live'}
                  tone={commander ? 'amber' : 'slate'}
                />
                <CommandMetric
                  label="Cargo"
                  value={cargoCapacity > 0 ? `${Math.round(cargoPct * 100)}%` : 'idle'}
                  meta={cargoCapacity > 0 ? `${Math.round(cargoUsed).toLocaleString()} / ${Math.round(cargoCapacity).toLocaleString()} m3` : 'no storage online'}
                  tone={cargoPct >= 0.8 ? 'amber' : cargoUsed > 0 ? 'emerald' : 'slate'}
                />
              </div>
            </div>

            {deleteReviewOpen && (
              <div className={`rounded-lg border px-2.5 py-2 ${deleteBlockedReason ? 'border-amber-400/30 bg-amber-950/15' : 'border-red-400/25 bg-red-950/15'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className={`text-[8px] uppercase tracking-[0.16em] ${deleteBlockedReason ? 'text-amber-300' : 'text-red-300'}`}>
                      {deleteBlockedReason ? 'Delete Blocked' : 'Delete Fleet'}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold text-slate-100">
                      {deleteBlockedReason ? 'Resolve active wing movement before removing this command shell.' : 'This action removes the fleet and keeps its ships in-system as idle hulls.'}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[8px] font-mono ${deleteBlockedReason ? 'border-amber-400/25 bg-amber-950/30 text-amber-200' : staffedWings.length > 0 ? 'border-red-400/25 bg-red-950/30 text-red-200' : 'border-slate-700/60 bg-slate-900/80 text-slate-400'}`}>
                    {deleteBlockedReason ? 'hold' : staffedWings.length > 0 ? `${staffedWingShipCount} assigned hulls` : 'no winged hulls'}
                  </span>
                </div>
                <div className="mt-2 text-[9px] leading-relaxed text-slate-300">
                  {deleteSummary}
                </div>
                {(staffedWings.length > 0 || emptyWingCount > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {staffedWings.map(wing => (
                      <span key={wing.id} className="rounded-full border border-red-400/15 bg-red-950/20 px-2 py-0.5 text-[8px] text-red-200/80">
                        {wing.name} · {wing.shipIds.length} ship{wing.shipIds.length !== 1 ? 's' : ''}
                      </span>
                    ))}
                    {emptyWingCount > 0 && (
                      <span className="rounded-full border border-slate-700/50 bg-slate-900/80 px-2 py-0.5 text-[8px] text-slate-400">
                        {emptyWingCount} empty wing{emptyWingCount !== 1 ? 's' : ''} will also be removed
                      </span>
                    )}
                  </div>
                )}
                {deleteBlockedReason && (
                  <div className="mt-2 text-[8px] text-amber-200/80">{deleteBlockedReason}</div>
                )}
                {deleteError && (
                  <div className="mt-2 text-[8px] text-amber-200/80">{deleteError}</div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={closeDeleteReview}
                    className="rounded border border-slate-700/60 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
                  >
                    Keep Fleet
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteFleet}
                    disabled={!!deleteBlockedReason}
                    className="rounded border border-red-400/25 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-red-200 transition-colors hover:border-red-300/50 hover:text-red-100 disabled:cursor-not-allowed disabled:border-slate-700/60 disabled:text-slate-500"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            )}

            <div className="grid gap-2.5 xl:grid-cols-2">

          {/* Storage target */}
          {cargoCapacity > 0 && (
            <FleetSectionCard
              eyebrow="Logistics"
              title="Storage Target"
              meta={storageTarget.label}
              tone={cargoPct >= 0.8 ? 'amber' : cargoUsed > 0 ? 'emerald' : 'slate'}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-400">Live storage posture</span>
                <span className="text-[9px] font-mono text-slate-400">
                  {Math.round(cargoUsed).toLocaleString()} / {Math.round(cargoCapacity).toLocaleString()} m³
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    cargoPct >= 1 ? 'bg-rose-500' : cargoPct >= 0.8 ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${cargoPct * 100}%` }}
                />
              </div>
              <div className="text-[8px] text-slate-600">{storageTarget.detail}</div>
              {Object.entries(cargoTotals).filter(([, v]) => v > 0).length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {Object.entries(cargoTotals)
                    .filter(([, v]) => v > 0)
                    .map(([resId, qty]) => (
                      <span key={resId} className="text-[9px] text-slate-400">
                        <span className="text-slate-300">{Math.round(qty).toLocaleString()}</span> {resId}
                      </span>
                    ))}
                </div>
              )}
              {canHaulNow && (
                <button
                  onClick={() => {
                    if (!hqSystemId) return;
                    if (haulingWings.length === 1) {
                      dispatchHaulingWingToHQ(fleetId, haulingWings[0].id);
                    } else {
                      haulFleetToHQ(fleetId);
                    }
                  }}
                  className="text-[9px] px-2 py-0.5 rounded border border-amber-400/40 text-amber-300/80 hover:border-amber-300 hover:text-amber-200 self-start"
                >
                  {haulingWings.length === 1 ? '↵ Dispatch Hauling Wing' : '↵ Haul to HQ'}
                </button>
              )}
            </FleetSectionCard>
          )}

          {/* Current Activity */}
          <FleetSectionCard
            eyebrow="Operations"
            title="Current Activity"
            meta={fleetActivity.shortLabel}
            tone={fleetActivity.tone === 'slate' ? 'slate' : fleetActivity.tone === 'emerald' ? 'emerald' : fleetActivity.tone === 'amber' ? 'amber' : fleetActivity.tone === 'violet' ? 'violet' : fleetActivity.tone === 'rose' ? 'rose' : 'cyan'}
            actions={!isMoving ? (
              <button
                onClick={() => setFleetScanning(fleetId, !fleet.isScanning)}
                disabled={operationalFleetShips.length === 0}
                className={`text-[9px] px-2 py-1 rounded border self-start transition-all ${
                  fleet.isScanning
                    ? 'border-violet-400/30 text-violet-300/80 hover:text-violet-200 hover:border-violet-300'
                    : 'border-slate-600 text-slate-400 hover:border-violet-400/40 hover:text-violet-300'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {fleet.isScanning ? 'Stop Scan' : 'Start Scan'}
              </button>
            ) : undefined}
          >
            <div className="flex items-center gap-1.5 flex-wrap text-[8px] text-slate-600">
              <span>{fleetShips.length} total ship{fleetShips.length !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{operationalFleetShips.length} operational</span>
              {unassignedWingShips.length > 0 && (
                <>
                  <span>·</span>
                  <span>{unassignedWingShips.length} inactive</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[9px] px-2 py-0.5 rounded border ${
                fleetActivity.tone === 'cyan' ? 'bg-cyan-900/40 text-cyan-300 border-cyan-400/25' :
                fleetActivity.tone === 'amber' ? 'bg-amber-900/40 text-amber-300 border-amber-400/25' :
                fleetActivity.tone === 'emerald' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-400/25' :
                fleetActivity.tone === 'violet' ? 'bg-violet-900/40 text-violet-300 border-violet-400/25' :
                fleetActivity.tone === 'rose' ? 'bg-rose-900/40 text-rose-300 border-rose-400/25' :
                'bg-slate-900/40 text-slate-400 border-slate-700/30'
              }`}>
                {fleetActivity.shortLabel}
              </span>
              <span className="text-[8px] text-slate-500">{fleetActivity.detail}</span>
              {isMoving && (
                <div
                  className={highlightTransit ? 'tutorial-breathe flex flex-col gap-1 min-w-[220px] rounded-md border border-cyan-400/25 bg-cyan-950/10 p-2' : 'flex flex-col gap-1 min-w-[220px]'}
                  data-tutorial-anchor={highlightTransit ? 'fleet-starter-transit' : undefined}
                >
                  <span className="text-[9px] px-2 py-0.5 rounded bg-cyan-900/40 text-cyan-300 border border-cyan-400/25">
                    ▶ In transit → <NavTag entityType="system" entityId={fleet.fleetOrder?.destinationSystemId ?? ''} label={systemNameById[fleet.fleetOrder?.destinationSystemId ?? ''] ?? fleet.fleetOrder?.destinationSystemId ?? ''} />
                  </span>
                  <div className="flex items-center gap-2 flex-wrap text-[8px] text-cyan-200/70">
                    <span>ETA {formatEta(fleetEtaSeconds)}</span>
                    {nextFleetStopId && (
                      <span>
                        next jump → <NavTag entityType="system" entityId={nextFleetStopId} label={systemNameById[nextFleetStopId] ?? nextFleetStopId} />
                      </span>
                    )}
                  </div>
                  <div className="h-1 bg-slate-800/80 rounded-full overflow-hidden max-w-[220px]">
                    <div className="h-full bg-cyan-400/80 rounded-full transition-all" style={{ width: `${Math.max(4, fleetLegProgress * 100)}%` }} />
                  </div>
                </div>
              )}
              {!isMoving && fleet.combatOrder && (
                <span className={`text-[9px] px-2 py-0.5 rounded border ${
                  fleet.combatOrder.type === 'patrol'
                    ? 'bg-amber-900/40 text-amber-300 border-amber-400/25'
                    : 'bg-red-900/40 text-red-300 border-red-400/25'
                }`}>
                  {fleet.combatOrder.type === 'patrol' ? '⚔ Patrolling' : '🎯 Raiding'}
                </span>
              )}
              {!isMoving && !fleet.combatOrder && fleet.isScanning && (
                <span className="text-[9px] px-2 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-400/25">
                  ◉ Scanning <NavTag entityType="system" entityId={fleet.currentSystemId} label={galaxy.find(s => s.id === fleet.currentSystemId)?.name ?? fleet.currentSystemId} />
                </span>
              )}
              {!isMoving && !fleet.combatOrder && !fleet.isScanning && (
                <span className="text-[9px] text-slate-500">Idle</span>
              )}
              {!isMoving && dispatchedHaulingWings.length > 0 && (
                <span className="text-[9px] px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 border border-amber-400/25">
                  ↵ {dispatchedHaulingWings.length} hauling wing{dispatchedHaulingWings.length !== 1 ? 's' : ''} in transit{escortedDispatchedWingCount > 0 ? ` · ${escortedDispatchedWingCount} escorted` : ' · safe-route protocol'}
                </span>
              )}
              {escortResponses.length > 0 && (
                <span className="text-[9px] px-2 py-0.5 rounded bg-rose-900/35 text-rose-300 border border-rose-400/20">
                  ⚔ Escort response @ {galaxy.find(s => s.id === escortResponses[0].systemId)?.name ?? escortResponses[0].systemId} · {escortResponses[0].threatCount} threat{escortResponses[0].threatCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {!isMoving && operationalFleetShips.length === 0 && (
              <span className="text-[8px] text-slate-600">Scanning requires at least one ship assigned to a wing.</span>
            )}
          </FleetSectionCard>

          {/* Fleet Wings */}
          <FleetSectionCard
            eyebrow="Wing Network"
            title="Fleet Wings"
            meta={wings.length > 0 ? `${wings.length} configured · ${wingsExpanded ? (selectedWing ? `${selectedWing.name} selected` : 'expanded') : 'collapsed'}` : 'no active wings'}
            tone="violet"
            className="xl:col-span-2"
            onHeaderClick={() => setWingsExpanded(value => !value)}
            headerExpanded={wingsExpanded}
            actions={
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {(['mining', 'hauling', 'combat', 'recon', 'industrial'] as WingType[]).map(type => {
                  const count = wings.filter(wing => wing.type === type).length;
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        createFleetWing(fleetId, type, `${WING_LABELS[type]} Wing ${count + 1}`);
                        setWingsExpanded(true);
                      }}
                      className="text-[8px] px-1.5 py-0.5 rounded border text-slate-400 hover:text-slate-200 transition-all"
                      style={{ borderColor: WING_TINT[type] + '44' }}
                    >
                      + {WING_LABELS[type]}
                    </button>
                  );
                })}
              </div>
            }
          >

            {!wingsExpanded && wings.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded border border-slate-800 bg-slate-950/35 px-2.5 py-2 text-[9px] text-slate-500">
                <span>{wings.length} wing{wings.length !== 1 ? 's' : ''} configured.</span>
                <span className="text-slate-700">•</span>
                <span>{haulingWings.length > 0 ? `${haulingWings.length} hauling lane${haulingWings.length !== 1 ? 's' : ''}` : 'no hauling lane'}</span>
                {unassignedWingShips.length > 0 && (
                  <>
                    <span className="text-slate-700">•</span>
                    <span>{unassignedWingShips.length} hull{unassignedWingShips.length !== 1 ? 's' : ''} unassigned</span>
                  </>
                )}
              </div>
            )}

            {wingsExpanded && wings.length === 0 && (
              <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-2 text-[9px] text-slate-500">
                No wings configured. Ships can stay in the fleet, but they will not mine, scan, haul, or fight until assigned to a wing.
              </div>
            )}

            {wingsExpanded && wings.length > 0 && (
              <div className="grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <div className="flex flex-col gap-2">
                  {wings.map(wing => (
                    <WingSummaryRow
                      key={wing.id}
                      fleetId={fleetId}
                      fleet={fleet}
                      wing={wing}
                      wings={wings}
                      fleetShips={fleetShips}
                      allShips={allShips}
                      allPilots={allPilots}
                      gameState={state}
                      allSystems={galaxy}
                      nowMs={nowMs}
                      homeSystemId={hqSystemId}
                      onRename={renameFleetWing}
                      onDelete={deleteFleetWing}
                      onDesignateCommander={designateWingCommander}
                      onAssignShip={assignShipToWing}
                      onSetEscort={setWingEscort}
                      onDispatch={dispatchHaulingWingToHQ}
                      focused={focusedWingId === wing.id}
                      selected={selectedWing?.id === wing.id}
                      onSelect={() => onSelectedWingChange(wing.id)}
                    />
                  ))}
                </div>

                <div>
                  {selectedWing ? (
                    <WingDetailPane
                      fleetId={fleetId}
                      fleet={fleet}
                      wing={selectedWing}
                      wings={wings}
                      fleetShips={fleetShips}
                      allShips={allShips}
                      allPilots={allPilots}
                      gameState={state}
                      allSystems={galaxy}
                      nowMs={nowMs}
                      homeSystemId={hqSystemId}
                      onRename={renameFleetWing}
                      onDelete={deleteFleetWing}
                      onDesignateCommander={designateWingCommander}
                      onAssignShip={assignShipToWing}
                      onSetEscort={setWingEscort}
                      onDispatch={dispatchHaulingWingToHQ}
                      focused={focusedWingId === selectedWing.id}
                    />
                  ) : (
                    <div className="rounded-xl border border-slate-800/80 bg-slate-950/45 px-3 py-4 text-[9px] text-slate-500">
                      Select a wing to inspect command posture, assignments, and dispatch controls.
                    </div>
                  )}
                </div>
              </div>
            )}

            {wingsExpanded && unassignedWingShips.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[8px] uppercase tracking-widest text-slate-500">Unassigned</span>
                {unassignedWingShips.map(ship => (
                  <span key={ship.id} className="text-[8px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-500">
                    {ship.customName ?? HULL_DEFINITIONS[ship.shipDefinitionId]?.name ?? ship.id}
                  </span>
                ))}
                <span className="text-[8px] text-slate-600">inactive until assigned to a wing</span>
              </div>
            )}
          </FleetSectionCard>

          {/* Fleet Commander */}
          {(() => {
            const pilots   = state.systems.fleet.pilots;
            const cmdSkills = (skillId: string) => COMMANDER_SKILL_DEFINITIONS[skillId];

            // Pilots in this fleet (have a ship in fleet.shipIds)
            const pilotsInFleet = fleet.shipIds
              .map(sid => state.systems.fleet.ships[sid]?.assignedPilotId)
              .filter(Boolean)
              .map(pid => pilots[pid!])
              .filter(Boolean);

            // Active bonuses (non-zero) for display
            const bonusKeys = Object.keys(COMMANDER_BONUS_LABELS);
            const activeBonuses = commander
              ? bonusKeys.filter(key => {
                  const sk = Object.entries(COMMANDER_SKILL_DEFINITIONS);
                  return sk.some(([, def]) =>
                    def.effectPerLevel.some(e => e.key === key) &&
                    (commander.commandSkills?.levels[def.id] ?? 0) > 0,
                  );
                })
              : [];

            return (
              <FleetSectionCard
                eyebrow="Command"
                title="Fleet Commander"
                meta={commander ? commander.name : 'unassigned'}
                tone={commander ? 'amber' : 'slate'}
                actions={commander ? (
                  <button
                    onClick={() => designateCommander(fleetId, null)}
                    className="text-[8px] text-slate-600 hover:text-red-400 px-1"
                    title="Remove commander"
                  >
                    ✕
                  </button>
                ) : undefined}
              >

                {/* Commander pick / current */}
                {commander ? (
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-[10px] font-semibold text-amber-300">{commander.name}</span>
                    <span className="text-[8px] text-slate-500">· Fleet Commander</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-500 italic">None assigned</span>
                    {pilotsInFleet.length > 0 && (
                      <div className="min-w-[180px] max-w-[240px]">
                        <GameDropdown
                          value=""
                          onChange={nextValue => {
                            if (nextValue) designateCommander(fleetId, nextValue);
                          }}
                          options={pilotsInFleet.map(pilot => {
                            const focus = pilot.skills.idleTrainingFocus ?? 'balanced';
                            return {
                              value: pilot.id,
                              label: pilot.name,
                              description: FOCUS_LABEL[focus],
                              meta: `Morale ${Math.round(pilot.morale ?? 0)}%`,
                              group: FOCUS_LABEL[focus],
                              tone: 'amber' as const,
                              keywords: [focus, pilot.name],
                            };
                          })}
                          placeholder="+ Designate..."
                          searchPlaceholder="Find fleet pilot..."
                          size="compact"
                          triggerTone="amber"
                          buttonStyle={{ minHeight: 26 }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Active bonus chips */}
                {activeBonuses.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {activeBonuses.map(key => {
                      const val = commander
                        ? Object.entries(COMMANDER_SKILL_DEFINITIONS).reduce((acc, [, def]) => {
                            const eff = def.effectPerLevel.find(e => e.key === key);
                            const lvl = commander.commandSkills?.levels[def.id] ?? 0;
                            return acc + (eff ? eff.value * lvl : 0);
                          }, 0)
                        : 0;
                      return (
                        <span
                          key={key}
                          className="text-[8px] px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-900/20 text-amber-300"
                          title={COMMANDER_BONUS_LABELS[key]}
                        >
                          {(() => {
                            const parsed = splitIconLabel(COMMANDER_BONUS_LABELS[key]);
                            return (
                              <span className="inline-flex items-center gap-1.5">
                                {parsed.icon && <ThemedIcon icon={parsed.icon} size={11} tone="#fbbf24" interactive />}
                                <span>{parsed.text} +{Math.round(val * 100)}%</span>
                              </span>
                            );
                          })()}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Command skill queue */}
                {commander && (
                  <div className="flex flex-col gap-1">
                    {/* Active training */}
                    {commander.commandSkills?.activeSkillId && (() => {
                      const activeId = commander.commandSkills.activeSkillId!;
                      const def = COMMANDER_SKILL_DEFINITIONS[activeId];
                      const lvl = (commander.commandSkills.levels[activeId] ?? 0) + 1;
                      const totalTime = [7200, 14400, 28800, 57600, 172800][lvl - 1] ?? 7200;
                      const pct = totalTime > 0 ? Math.min(1, commander.commandSkills.activeProgress / totalTime) : 0;
                      const remaining = Math.max(0, totalTime - commander.commandSkills.activeProgress);
                      return (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-amber-300/80">{def?.name ?? activeId} {ROMAN[lvl]}</span>
                            <span className="text-[8px] font-mono text-slate-400">{formatTrainingEta(remaining)}</span>
                          </div>
                          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full transition-all"
                              style={{ width: `${pct * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Queue entries */}
                    {commander.commandSkills?.queue?.length > 0 && commander.commandSkills.queue.map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-1">
                        <span className="text-[9px] text-slate-400 flex-1">
                          {cmdSkills(entry.skillId)?.name ?? entry.skillId} {ROMAN[entry.targetLevel]}
                        </span>
                        <span className="text-[8px] font-mono text-slate-500">
                          {formatTrainingEta(commanderSkillEtaSeconds(commander, entry.skillId, entry.targetLevel))}
                        </span>
                        <button
                          onClick={() => removeCmdSkillFromQueue(commander.id, idx)}
                          className="text-[8px] text-slate-600 hover:text-red-400 px-0.5"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    {/* Add skill buttons */}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {Object.values(COMMANDER_SKILL_DEFINITIONS).map(def => {
                        const currentLvl = commander.commandSkills?.levels[def.id] ?? 0;
                        const nextLvl = Math.min(5, currentLvl + 1) as 1|2|3|4|5;
                        if (currentLvl >= 5) return null;
                        const alreadyQueued = commander.commandSkills?.queue?.some(
                          e => e.skillId === def.id,
                        );
                        return (
                          <button
                            key={def.id}
                            disabled={alreadyQueued}
                            onClick={() => queueCmdSkill(commander.id, def.id, nextLvl)}
                            className="text-[8px] px-1.5 py-0.5 rounded border transition-all"
                            style={alreadyQueued ? {
                              color: '#475569', borderColor: '#1e293b',
                            } : {
                              color: '#fbbf24', borderColor: '#78350f',
                            }}
                            title={`Train ${def.name} to level ${ROMAN[nextLvl]}`}
                          >
                            + {def.name} {ROMAN[nextLvl]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </FleetSectionCard>
            );
          })()}

          {/* Doctrine selector */}
          <FleetSectionCard
            eyebrow="Command"
            title="Doctrine"
            meta={docDef.label}
            tone={docMet ? 'violet' : 'amber'}
          >
            <div className="flex flex-wrap gap-1">
              {(Object.keys(DOCTRINE_DEFINITIONS) as FleetDoctrine[]).map(doc => {
                const def = DOCTRINE_DEFINITIONS[doc];
                const isCurrent = doctrine === doc;
                const isSuggested = suggested === doc;
                const reqMet = getDoctrineRequirementsMet(doc, fleetShips);
                return (
                  <button
                    key={doc}
                    onClick={() => setDoctrine(fleetId, doc)}
                    disabled={isMoving}
                    className="text-[9px] px-2 py-0.5 rounded border transition-all relative"
                    style={isCurrent ? {
                      color: def.color,
                      borderColor: def.color + '88',
                      background: def.color + '22',
                    } : {
                      color: reqMet ? '#64748b' : '#374151',
                      borderColor: '#1e293b',
                    }}
                    title={`${def.description}${!reqMet ? ` (needs ${def.requires} ship)` : ''}`}
                  >
                    {def.label}
                    {isSuggested && !isCurrent && (
                      <span className="absolute -top-1 -right-1 text-[6px] text-amber-400">★</span>
                    )}
                  </button>
                );
              })}
            </div>
            {!docMet && (
              <span className="text-[9px] text-amber-400/70">
                ⚠ Doctrine needs a {docDef.requires} ship
              </span>
            )}
          </FleetSectionCard>

          {/* Combat orders */}
          {(() => {
            const aliveGroups = getAliveNpcGroupsInSystem(state, fleet.currentSystemId);
            const combatOrder = fleet.combatOrder;
            const fleetPilots = operationalShipIds
              .map(id => state.systems.fleet.ships[id]?.assignedPilotId)
              .filter(Boolean)
              .map(pid => state.systems.fleet.pilots[pid!])
              .filter(Boolean);
            const hasPatrolReq = fleetPilots.some(p => (p.skills.levels['spaceship-command'] ?? 0) >= 2);
            const hasRaidReq   = fleetPilots.some(p => (p.skills.levels['military-operations'] ?? 0) >= 1);
            const systemSecurity = (() => {
              // Determine if current system is non-highsec
              const gs = getAliveNpcGroupsInSystem(state, fleet.currentSystemId);
              return gs.length > 0 || combatOrder;
            })();

            if (!systemSecurity && aliveGroups.length === 0) return null;

            return (
              <FleetSectionCard
                eyebrow="Combat"
                title="Threat Response"
                meta={combatOrder ? (combatOrder.type === 'patrol' ? 'patrolling' : 'raiding') : `${aliveGroups.length} hostile group${aliveGroups.length !== 1 ? 's' : ''}`}
                tone={combatOrder ? 'rose' : 'amber'}
              >
                {combatOrder && (
                  <span className={`self-start text-[8px] px-1.5 py-0.5 rounded ${
                    combatOrder.type === 'patrol' ? 'bg-amber-900/40 text-amber-300' : 'bg-red-900/40 text-red-300'
                  }`}>
                    {combatOrder.type === 'patrol' ? '⚔ Patrolling' : '🎯 Raiding'}
                  </span>
                )}

                {/* Threat list */}
                {aliveGroups.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {aliveGroups.map(group => (
                      <div key={group.id} className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-[9px] text-rose-300/80 truncate block">{group.name}</span>
                          <span className="text-[8px] text-slate-500">STR {group.strength} · {group.bounty.toLocaleString()} ISK</span>
                        </div>
                        {hasRaidReq && !combatOrder && !isMoving && (
                          <button
                            onClick={() => issueRaid(fleetId, group.id)}
                            className="text-[8px] px-1.5 py-0.5 rounded border border-red-400/30 text-red-300/70 hover:border-red-300 hover:text-red-200 shrink-0"
                          >
                            Raid
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  combatOrder && <span className="text-[9px] text-slate-500">No threats in current system</span>
                )}

                {/* Patrol / cancel buttons */}
                <div className="flex gap-1.5">
                  {!combatOrder && !isMoving && (
                    <button
                      onClick={() => issuePatrol(fleetId)}
                      disabled={!hasPatrolReq || hasWingDispatch}
                      className="text-[9px] px-2 py-0.5 rounded border border-amber-400/30 text-amber-300/70 hover:border-amber-300 hover:text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={hasWingDispatch ? 'Unavailable while a hauling wing is dispatched' : hasPatrolReq ? 'Continuously engage weakest NPC group' : 'Requires Spaceship Command II'}
                    >
                      ⚔ Patrol
                    </button>
                  )}
                  {combatOrder && (
                    <button
                      onClick={() => cancelCombat(fleetId)}
                      className="text-[9px] px-2 py-0.5 rounded border border-slate-600 text-slate-400 hover:text-slate-200"
                    >
                      Cancel order
                    </button>
                  )}
                </div>

                {!hasPatrolReq && !combatOrder && (
                  <span className="text-[8px] text-slate-600">Patrol: requires <NavTag entityType="skill" entityId="spaceship-command" label="Spaceship Command II" /> · Raid: requires <NavTag entityType="skill" entityId="military-operations" label="Military Operations I" /></span>
                )}
              </FleetSectionCard>
            );
          })()}

          {/* Navigation */}
          <FleetSectionCard
            eyebrow="Navigation"
            title="Movement Control"
            meta={isMoving ? 'in transit' : ROUTE_FILTER_LABELS[secFilter]}
            tone={isMoving ? 'cyan' : 'slate'}
            className="xl:col-span-2"
            actions={isMoving ? (
              <span className="text-[8px] font-mono text-cyan-400/70">
                → <NavTag entityType="system" entityId={fleet.fleetOrder?.destinationSystemId ?? ''} label={galaxy.find(s => s.id === fleet.fleetOrder?.destinationSystemId)?.name ?? fleet.fleetOrder?.destinationSystemId ?? ''} />
              </span>
            ) : undefined}
          >
            {isMoving ? (
              <button
                onClick={() => cancelGroupOrder(fleetId)}
                disabled={hasWingDispatch}
                className="text-[9px] px-2 py-0.5 rounded border border-red-400/30 text-red-300/70 hover:border-red-300 hover:text-red-200 self-start"
              >
                ✕ Cancel movement
              </button>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex gap-1">
                  <div className="flex-1">
                    <GameDropdown
                      value={destSystemId}
                      onChange={setDestSystemId}
                      options={destinationOptions}
                      placeholder="Destination..."
                      emptyOptionLabel="No destination"
                      emptyOptionDescription="Pick a target system for fleet movement"
                      searchPlaceholder="Search systems..."
                      size="compact"
                      menuWidth={420}
                      menuHeader={destinationMenuHeader}
                      detailTitle={selectedDestinationOption?.label ? `${selectedDestinationOption.label} intel` : 'Destination intel'}
                      detailEmpty="Hover a destination to inspect distance, risk, and mining value before selecting."
                      detailPlacement="bottom"
                      renderDetail={(option) => {
                        if (!option) {
                          return <div className="text-[10px] text-slate-500">Hover a destination to inspect travel, risk, and mining intel.</div>;
                        }
                        const intel = destinationIntel.find(entry => entry.system.id === option.value);
                        if (!intel) {
                          return <div className="text-[10px] text-slate-500">Destination intel unavailable.</div>;
                        }

                        const { system, isVisited, distanceLy, directReachable, beltCount, threatCount, sameRegion } = intel;
                        return (
                          <div className="flex flex-col gap-2">
                            <div>
                              <div className="text-[11px] font-semibold text-slate-100">{system.name}</div>
                              <div className="mt-0.5 text-[9px] text-slate-500">{system.regionName}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <div className="rounded border border-slate-700/40 bg-slate-900/60 px-2 py-1.5">
                                <div className="text-[8px] uppercase tracking-[0.08em] text-slate-500">Distance</div>
                                <div className="mt-0.5 font-mono text-[11px] text-cyan-300">{distanceLy.toFixed(1)} LY</div>
                              </div>
                              <div className="rounded border border-slate-700/40 bg-slate-900/60 px-2 py-1.5">
                                <div className="text-[8px] uppercase tracking-[0.08em] text-slate-500">Security</div>
                                <div className="mt-0.5 text-[11px]" style={{ color: fleetSecColor(system.security) }}>{fleetSecLabel(system.security)}</div>
                              </div>
                              <div className="rounded border border-slate-700/40 bg-slate-900/60 px-2 py-1.5">
                                <div className="text-[8px] uppercase tracking-[0.08em] text-slate-500">Travel</div>
                                <div className={`mt-0.5 text-[11px] ${directReachable ? 'text-emerald-300' : 'text-amber-300'}`}>{directReachable ? 'Direct jump' : 'Route solve needed'}</div>
                              </div>
                              <div className="rounded border border-slate-700/40 bg-slate-900/60 px-2 py-1.5">
                                <div className="text-[8px] uppercase tracking-[0.08em] text-slate-500">Threats</div>
                                <div className={`mt-0.5 text-[11px] ${threatCount > 0 ? 'text-rose-300' : 'text-slate-400'}`}>{threatCount > 0 ? `${threatCount} active` : 'Quiet'}</div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <span className="rounded-full border border-slate-700/40 bg-slate-900/60 px-2 py-0.5 text-[8px] text-slate-400">{isVisited ? 'Visited' : 'Unvisited'}</span>
                              <span className={`rounded-full border border-slate-700/40 bg-slate-900/60 px-2 py-0.5 text-[8px] ${beltCount > 0 ? 'text-amber-300' : 'text-slate-400'}`}>{beltCount > 0 ? `${beltCount} belts` : 'No belts'}</span>
                              <span className={`rounded-full border border-slate-700/40 bg-slate-900/60 px-2 py-0.5 text-[8px] ${system.stationId ? 'text-violet-300' : 'text-slate-400'}`}>{system.stationId ? 'Station' : 'No station'}</span>
                              <span className={`rounded-full border border-slate-700/40 bg-slate-900/60 px-2 py-0.5 text-[8px] ${sameRegion ? 'text-cyan-300' : 'text-slate-400'}`}>{sameRegion ? 'Same region' : 'Remote destination'}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                  </div>
                  <div className="w-32">
                    <GameDropdown
                      value={secFilter}
                      onChange={value => setSecFilter(value as RouteSecurityFilter)}
                      options={[
                        { value: 'shortest', label: 'Shortest', description: 'Fewest hops', group: 'Routing', tone: 'cyan' },
                        { value: 'safest', label: 'Safest', description: 'Prefer safer systems', group: 'Routing', tone: 'violet' },
                        { value: 'avoid-null', label: 'Avoid null', description: 'No nullsec intermediates', group: 'Routing', tone: 'amber' },
                        { value: 'avoid-low', label: 'Avoid low', description: 'Highsec only where possible', group: 'Routing', tone: 'emerald' },
                      ]}
                      placeholder="Route policy..."
                      searchPlaceholder="Search route policies..."
                      searchable={false}
                      filterable={false}
                      size="compact"
                      menuWidth={220}
                    />
                  </div>
                </div>
                <button
                  disabled={!destSystemId || hasWingDispatch}
                  onClick={() => { issueGroupOrder(fleetId, destSystemId, secFilter); setDestSystemId(''); }}
                  className="text-[9px] px-2 py-0.5 rounded border border-cyan-400/30 text-cyan-300/70 hover:border-cyan-300 hover:text-cyan-200 disabled:opacity-30 disabled:cursor-not-allowed self-start"
                >
                  ▶ Move Fleet
                </button>
                <div className="text-[8px] text-slate-500 leading-relaxed max-w-[22rem]">
                  <span className="text-slate-400">{ROUTE_FILTER_LABELS[secFilter]}:</span> {ROUTE_FILTER_EXPLANATIONS[secFilter]}
                </div>
                {hasWingDispatch && (
                  <span className="text-[8px] text-amber-400/70">Whole-fleet movement is locked while a hauling wing is in transit.</span>
                )}
              </div>
            )}
          </FleetSectionCard>

          <FleetSectionCard
            eyebrow="Assembly"
            title="Fleet Assembly"
            meta={`${fleetShips.length} hull${fleetShips.length !== 1 ? 's' : ''}`}
            tone="slate"
            className="xl:col-span-2"
          >
            {/* Ship roles */}
            {fleetShips.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[8px] uppercase tracking-widest text-slate-500">Ship Roles</span>
                {fleetShips.map(ship => {
                  const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
                  return (
                    <div key={ship.id} className="flex items-center gap-2">
                      <span className="text-[9px] text-slate-400 truncate flex-1 min-w-0">
                        {ship.customName ?? hull?.name ?? ship.shipDefinitionId}
                      </span>
                      {ship.hullDamage > 0 && (
                        <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden shrink-0" title={`Hull damage: ${Math.round(ship.hullDamage)}%`}>
                          <div
                            className={`h-full rounded-full transition-all ${ship.hullDamage >= 80 ? 'bg-red-500' : ship.hullDamage >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`}
                            style={{ width: `${ship.hullDamage}%` }}
                          />
                        </div>
                      )}
                      <div className="flex gap-0.5 shrink-0">
                        {(['tank', 'dps', 'support', 'scout', 'unassigned'] as ShipRole[]).map(role => (
                          <button
                            key={role}
                            onClick={() => setShipRole(ship.id, role)}
                            className="text-[8px] px-1 py-0.5 rounded border transition-all"
                            style={ship.role === role ? {
                              color: FLEET_ROLE_COLOR[role],
                              borderColor: FLEET_ROLE_COLOR[role] + '88',
                              background: FLEET_ROLE_COLOR[role] + '22',
                            } : {
                              color: '#475569',
                              borderColor: '#1e293b',
                            }}
                            title={FLEET_ROLE_FULL[role]}
                          >
                            {FLEET_ROLE_LABELS[role]}
                          </button>
                        ))}
                      </div>
                      {fleet.fleetOrder === null && (
                        <button
                          onClick={() => removeShip(fleetId, ship.id)}
                          className="text-[8px] text-slate-600 hover:text-red-400 border border-slate-800 rounded px-1 py-0.5"
                          title="Remove from fleet"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {joinableShips.length > 0 && fleet.fleetOrder === null && !hasWingDispatch && (
              <div className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-widest text-slate-500">Add Ship</span>
                <div className="flex flex-wrap gap-1">
                  {joinableShips.map(ship => {
                    const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
                    return (
                      <button
                        key={ship.id}
                        onClick={() => addShip(fleetId, ship.id)}
                        className="text-[9px] px-2 py-0.5 rounded border border-slate-700/40 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-300"
                      >
                        + {ship.customName ?? hull?.name ?? ship.shipDefinitionId}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {fleet.fleetOrder === null && (
              <button
                onClick={openDeleteReview}
                className="text-[9px] text-red-400/60 hover:text-red-300 border border-red-400/20 rounded px-2 py-0.5 self-start"
              >
                Review delete
              </button>
            )}
          </FleetSectionCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Fleets tab ─────────────────────────────────────────────────────────────

function FleetsTab({
  state,
  galaxy,
  systemNameById,
  focusId,
  focusWingId,
}: {
  state: ReturnType<typeof useGameStore.getState>['state'];
  galaxy: ReturnType<typeof generateGalaxy>;
  systemNameById: Record<string, string>;
  focusId?: string | null;
  focusWingId?: string | null;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedWingId, setSelectedWingId] = useState<string | null>(null);

  useEffect(() => {
    if (focusId) setExpandedId(focusId);
  }, [focusId]);

  useEffect(() => {
    if (focusWingId) setSelectedWingId(focusWingId);
  }, [focusWingId]);

  const addShipToFleet = useGameStore(s => s.addShipToFleet);
  const assignShipToWing = useGameStore(s => s.assignShipToWing);
  const createFleet = useGameStore(s => s.createPlayerFleet);

  const allShips  = state.systems.fleet.ships;
  const fleetIds  = Object.keys(state.systems.fleet.fleets);
  const maxFleets = state.systems.fleet.maxFleets;

  const unassignedShips = Object.values(allShips).filter(s => s.fleetId === null);
  const fleets = fleetIds.map(id => state.systems.fleet.fleets[id]).filter(Boolean) as PlayerFleet[];
  const totalAssignedShips = fleets.reduce((sum, fleet) => sum + fleet.shipIds.length, 0);
  const movingFleets = fleets.filter(fleet => fleet.fleetOrder !== null).length;
  const scanningFleets = fleets.filter(fleet => fleet.isScanning).length;
  const activeWings = fleets.reduce((sum, fleet) => sum + (fleet.wings ?? []).filter(wing => wing.isDispatched).length, 0);

  useEffect(() => {
    if (expandedId && !fleetIds.includes(expandedId)) {
      setExpandedId(null);
      setSelectedWingId(null);
      return;
    }
    if (!expandedId || !selectedWingId) return;
    const expandedFleet = state.systems.fleet.fleets[expandedId];
    if (!expandedFleet || !(expandedFleet.wings ?? []).some(wing => wing.id === selectedWingId)) {
      setSelectedWingId(null);
    }
  }, [expandedId, fleetIds, selectedWingId, state.systems.fleet.fleets]);

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="rounded-lg border border-slate-700/30 bg-slate-900/35 px-2.5 py-2">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] text-cyan-400 uppercase tracking-widest font-bold">Fleet Command Deck</div>
            <div className="mt-0.5 text-[9px] text-slate-500">Formation count, live posture, and reserve pressure.</div>
          </div>
          <div className="text-[9px] text-slate-500 text-right">
            Cap <span className="font-mono text-slate-300">{fleetIds.length}/{maxFleets}</span>
          </div>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          <CommandMetric label="Formed Fleets" value={`${fleetIds.length}`} meta={`${Math.max(0, maxFleets - fleetIds.length)} slots open`} tone={fleetIds.length > 0 ? 'cyan' : 'slate'} />
          <CommandMetric label="Assigned Hulls" value={`${totalAssignedShips}`} meta={`${unassignedShips.length} reserve hulls`} tone={totalAssignedShips > 0 ? 'emerald' : 'slate'} />
          <CommandMetric label="Transit Posture" value={`${movingFleets}`} meta={scanningFleets > 0 ? `${scanningFleets} scanning fleet${scanningFleets !== 1 ? 's' : ''}` : 'no scans active'} tone={movingFleets > 0 ? 'cyan' : scanningFleets > 0 ? 'violet' : 'slate'} />
          <CommandMetric label="Wing Traffic" value={`${activeWings}`} meta={activeWings > 0 ? 'dispatched support lanes live' : 'no dispatched wings'} tone={activeWings > 0 ? 'amber' : 'slate'} />
        </div>
      </div>

      {/* Fleet cards */}
      {fleetIds.length === 0 ? (
        <p className="text-[9px] text-slate-600">No fleets formed. Click a reserve hull below to open its assignment flyout, then deliberately form a new fleet from that menu.</p>
      ) : (
      fleetIds.map((id, idx) => (
          <FleetCard
            key={id}
            fleetId={id}
            expanded={expandedId === id}
            isFirst={idx === 0}
            isLast={idx === fleetIds.length - 1}
            onToggle={() => toggleExpand(id)}
            state={state}
            galaxy={galaxy}
            systemNameById={systemNameById}
            focusedWingId={focusId === id ? focusWingId : null}
            selectedWingId={expandedId === id ? selectedWingId : null}
            onSelectedWingChange={setSelectedWingId}
          />
        ))
      )}

      {/* Unassigned ships pool */}
      {unassignedShips.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-700/20">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">
              Unassigned Ships ({unassignedShips.length})
            </span>
            <span className="text-[9px] text-slate-600">Click a reserve hull to open a fleet flyout, then move into the wing submenu</span>
          </div>
          <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
            {unassignedShips.map(ship => {
              const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
              return (
                <FleetWingAssignmentPicker
                  key={ship.id}
                  ship={ship}
                  fleets={fleets}
                  maxFleets={maxFleets}
                  onAddToFleet={addShipToFleet}
                  onAssignShipToWing={assignShipToWing}
                  onCreateFleet={createFleet}
                  buttonClassName="flex w-full items-center justify-between gap-3 rounded border border-slate-700/40 bg-slate-900/35 px-2.5 py-2 text-left text-slate-400 transition-colors hover:border-cyan-400/35 hover:text-cyan-200"
                  buttonTitle="Assign hull to fleet or wing"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-cyan-400" />
                      <span className="text-[10px] font-semibold truncate">{ship.customName ?? hull?.name ?? ship.shipDefinitionId}</span>
                    </div>
                    <div className="text-[8px] text-slate-500 mt-0.5">{hull?.shipClass ?? 'unknown hull'} reserve</div>
                  </div>
                  <span className="text-[8px] uppercase tracking-widest text-slate-500">assign</span>
                </FleetWingAssignmentPicker>
              );
            })}
          </div>
          {fleetIds.length >= maxFleets && (
            <span className="text-[9px] text-amber-400/60">Max fleet cap ({maxFleets}) reached</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pilot portrait (seeded SVG avatar) ───────────────────────────────────

function PilotPortrait({ seed, size = 32 }: { seed: number; size?: number }) {
  const hue   = seed % 360;
  const hue2  = (seed * 137 + 90) % 360;
  const eyes  = (seed % 3) + 1; // 1–3 eye shapes
  const r     = size / 2;
  const eyeY  = r * 0.55;
  const eyeX  = r * 0.3;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 rounded-full">
      <circle cx={r} cy={r} r={r} fill={`hsl(${hue2}, 20%, 14%)`} />
      <circle cx={r} cy={r * 1.1} r={r * 0.62} fill={`hsl(${hue}, 40%, 28%)`} />
      {eyes >= 1 && <circle cx={r - eyeX} cy={eyeY} r={r * 0.10} fill={`hsl(${hue}, 70%, 70%)`} />}
      {eyes >= 1 && <circle cx={r + eyeX} cy={eyeY} r={r * 0.10} fill={`hsl(${hue}, 70%, 70%)`} />}
    </svg>
  );
}

// ─── Morale bar ────────────────────────────────────────────────────────────

function MoraleBar({ morale }: { morale: number }) {
  const color = morale >= 70 ? 'bg-emerald-500' : morale >= 30 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5" title={`Morale: ${Math.round(morale)}%`}>
      <span className="text-[9px] text-slate-500 uppercase tracking-widest w-10">Morale</span>
      <div className="flex-1 h-1 rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${morale}%` }} />
      </div>
      <span className="text-[9px] font-mono text-slate-400 w-7 text-right">{Math.round(morale)}%</span>
    </div>
  );
}

// ─── Pilot skill level row ─────────────────────────────────────────────────

function SkillPips({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <div
          key={i}
          className="h-1.5 w-1.5 rounded-sm"
          style={{
            background: i <= level ? '#22d3ee' : 'rgba(255,255,255,0.07)',
            boxShadow: i <= level ? '0 0 3px #22d3ee88' : 'none',
          }}
        />
      ))}
    </div>
  );
}

// ─── Pilot card ────────────────────────────────────────────────────────────

function PilotCard({
  pilot,
  expanded,
  onToggle,
  state,
}: {
  pilot: PilotInstance;
  expanded: boolean;
  onToggle: () => void;
  state: ReturnType<typeof useGameStore.getState>['state'];
}) {
  const setFocus             = useGameStore(s => s.setPilotTrainingFocus);
  const assignShip           = useGameStore(s => s.assignPilotToShip);
  const renamePilot          = useGameStore(s => s.renamePilotCharacter);
  const removeSkillFromQueue = useGameStore(s => s.removePilotSkillFromQueue);
  const unassignShip = () => assignShip(pilot.id, null);

  const [editingPilotName, setEditingPilotName] = useState(false);
  const [pilotNameInput,   setPilotNameInput]   = useState('');

  const displayState = getPilotDisplayState(pilot, state);
  const eta = pilotTrainingEta(pilot.skills);
  const activeSkillName = pilot.skills.activeSkillId
    ? SKILL_DEFINITIONS[pilot.skills.activeSkillId]?.name
    : null;
  const assignedShip = pilot.assignedShipId ? state.systems.fleet.ships[pilot.assignedShipId] : null;
  const assignedHull = assignedShip ? HULL_DEFINITIONS[assignedShip.shipDefinitionId] : null;
  const focus = pilot.skills.idleTrainingFocus ?? 'balanced';

  const isActive = pilot.status === 'active';
  const dotColor = isActive ? 'bg-cyan-400 animate-pulse' : pilot.status === 'docked' ? 'bg-emerald-400' : 'bg-slate-600';

  return (
    <div
      className="rounded border border-slate-700/30 bg-slate-900/40 overflow-hidden cursor-pointer transition-colors hover:border-slate-600/40 hover:bg-white/[0.03]"
      onClick={onToggle}
    >
      {/* Main row */}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        <PilotPortrait seed={pilot.portraitSeed} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-200 truncate">{pilot.name}</span>
            {pilot.isPlayerPilot && (
              <span className="text-[8px] uppercase tracking-widest text-amber-400/80 border border-amber-400/30 px-1 rounded">Dir.</span>
            )}
            <span className={`text-[8px] px-1.5 py-0.5 rounded border ${FOCUS_COLOR[focus]} border-current bg-current/10`}>
              {FOCUS_LABEL[focus]}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className="text-[9px] text-slate-500">{displayState}</span>
            <span className="text-[9px] text-slate-600">·</span>
            <span className="text-[9px] text-slate-500">Morale {Math.round(pilot.morale)}%</span>
            {assignedShip && (
              <>
                <span className="text-[9px] text-slate-600">·</span>
                <span className="text-[9px] text-slate-500 truncate">{assignedShip.customName ?? assignedHull?.name ?? assignedShip.id}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          {pilot.skills.activeSkillId && (
            <div className="text-[9px] text-cyan-400 truncate max-w-20">
              <NavTag entityType="skill" entityId={pilot.skills.activeSkillId} label={SKILL_DEFINITIONS[pilot.skills.activeSkillId]?.name ?? pilot.skills.activeSkillId} />
            </div>
          )}
          {eta > 0 && (
            <div className="text-[9px] font-mono text-slate-500">{formatTrainingEta(eta)}</div>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="px-3 pb-3 border-t border-slate-700/30 pt-2 flex flex-col gap-2"
          onClick={e => e.stopPropagation()}
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <CommandMetric label="Morale" value={`${Math.round(pilot.morale)}%`} meta={pilot.status} tone={pilot.morale >= 70 ? 'emerald' : pilot.morale >= 40 ? 'amber' : 'slate'} />
            <CommandMetric label="Assignment" value={assignedShip ? (assignedShip.customName ?? assignedHull?.name ?? assignedShip.id) : 'unassigned'} meta={assignedShip ? 'ship posted' : 'ready for posting'} tone={assignedShip ? 'cyan' : 'slate'} />
            <CommandMetric label="Training" value={activeSkillName ?? 'idle'} meta={eta > 0 ? formatTrainingEta(eta) : 'queue empty'} tone={pilot.skills.activeSkillId ? 'violet' : 'slate'} />
            <CommandMetric label="Output" value={`${Math.round(pilot.stats.oreMinedTotal).toLocaleString()}`} meta={!pilot.isPlayerPilot ? `${pilot.payrollPerDay.toLocaleString()} ISK / day` : 'director slot'} tone={!pilot.isPlayerPilot ? 'amber' : 'emerald'} />
          </div>

          {/* Rename pilot */}
          <div className="flex items-center gap-2">
            {editingPilotName ? (
              <input
                autoFocus
                value={pilotNameInput}
                onChange={e => setPilotNameInput(e.target.value)}
                onBlur={() => { renamePilot(pilot.id, pilotNameInput.trim() || pilot.name); setEditingPilotName(false); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { renamePilot(pilot.id, pilotNameInput.trim() || pilot.name); setEditingPilotName(false); }
                  if (e.key === 'Escape') setEditingPilotName(false);
                }}
                className="flex-1 text-[11px] font-semibold bg-transparent border-b border-slate-600 focus:outline-none focus:border-cyan-500 text-slate-200"
                maxLength={32}
              />
            ) : (
              <span
                className="text-[11px] font-semibold text-slate-200 flex-1 cursor-text hover:text-cyan-300 transition-colors"
                title="Click to rename"
                onClick={() => { setPilotNameInput(pilot.name); setEditingPilotName(true); }}
              >
                {pilot.name}
              </span>
            )}
            {pilot.isPlayerPilot && (
              <span className="text-[8px] uppercase tracking-widest text-amber-400/80 border border-amber-400/30 px-1 rounded shrink-0">Dir.</span>
            )}
          </div>

          <MoraleBar morale={pilot.morale} />

          {/* Backstory */}
          <p className="text-[9px] text-slate-500 leading-relaxed">{pilot.backstory}</p>

          {/* Key skill bonuses */}
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: 'Mine', value: getPilotMiningBonus(pilot), color: 'text-cyan-400' },
              { label: 'Combat', value: getPilotCombatBonus(pilot), color: 'text-red-400' },
              { label: 'Haul', value: getPilotHaulingBonus(pilot), color: 'text-amber-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex flex-col items-center bg-slate-800/40 rounded py-1">
                <span className="text-[8px] text-slate-500 uppercase tracking-widest">{label}</span>
                <span className={`text-[11px] font-semibold ${color}`}>+{(value * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>

          {/* Pilot personal skills */}
          {Object.keys(pilot.skills.levels).length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[8px] uppercase tracking-widest text-slate-500">Personal Skills</span>
              {Object.entries(pilot.skills.levels)
                .filter(([, lv]) => lv > 0)
                .map(([skillId, level]) => (
                  <div key={skillId} className="flex items-center justify-between">
                    <span className="text-[9px] text-slate-400">{SKILL_DEFINITIONS[skillId]?.name ?? skillId}</span>
                    <SkillPips level={level} />
                  </div>
                ))}
            </div>
          )}

          {/* Training queue */}
          {(pilot.skills.activeSkillId || pilot.skills.queue.length > 0) && (
            <div className="flex flex-col gap-1">
              <span className="text-[8px] uppercase tracking-widest text-slate-500">Training Queue</span>
              {pilot.skills.activeSkillId && (
                <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-800/40 border border-cyan-400/20">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                    <span className="text-[9px] text-cyan-400">
                      {SKILL_DEFINITIONS[pilot.skills.activeSkillId]?.name ?? pilot.skills.activeSkillId}
                    </span>
                  </div>
                  <span className="text-[8px] font-mono text-cyan-300/60">{formatTrainingEta(pilotTrainingEta(pilot.skills))}</span>
                </div>
              )}
              {pilot.skills.queue.map((entry, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-slate-800/30 border border-violet-400/10">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] text-violet-400/60 w-4 font-mono">{i + 1}.</span>
                    <span className="text-[9px] text-slate-400">
                      {SKILL_DEFINITIONS[entry.skillId]?.name ?? entry.skillId}
                    </span>
                    <span className="text-[8px] text-slate-600 font-mono">→ {entry.targetLevel}</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); removeSkillFromQueue(pilot.id, i); }}
                    className="text-[10px] text-red-500/40 hover:text-red-300 pl-2 transition-colors"
                    title="Remove from queue"
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Training focus selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Idle Training Focus</span>
            <div className="flex flex-wrap gap-1">
              {(['mining', 'combat', 'hauling', 'exploration', 'balanced'] as PilotTrainingFocus[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFocus(pilot.id, pilot.skills.idleTrainingFocus === f ? null : f)}
                  className={`text-[9px] px-2 py-0.5 rounded border transition-all ${
                    pilot.skills.idleTrainingFocus === f
                      ? `${FOCUS_COLOR[f]} border-current bg-current/10`
                      : 'text-slate-500 border-slate-700/40 hover:border-slate-500'
                  }`}
                >
                  {FOCUS_LABEL[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-x-4 text-[9px]">
            <div className="flex justify-between text-slate-500">
              <span>Ore Mined</span>
              <span className="font-mono text-slate-400">{pilot.stats.oreMinedTotal.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Experience</span>
              <span className="font-mono text-slate-400">{Math.floor(pilot.experience)}</span>
            </div>
            {!pilot.isPlayerPilot && (
              <div className="flex justify-between text-slate-500">
                <span>Payroll/day</span>
                <span className="font-mono text-amber-400">{pilot.payrollPerDay.toLocaleString()} ISK</span>
              </div>
            )}
          </div>

          {/* Pilot ↔ Ship assignment */}
          {pilot.assignedShipId ? (() => {
            return (
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-400">
                  Piloting: <span className="text-slate-200">{assignedShip?.customName ?? assignedHull?.name ?? pilot.assignedShipId}</span>
                </span>
                <button
                  onClick={unassignShip}
                  className="text-[9px] text-red-400/70 hover:text-red-300 border border-red-400/20 rounded px-2 py-0.5"
                >
                  Unassign
                </button>
              </div>
            );
          })() : (() => {
            const flyableShips = Object.values(state.systems.fleet.ships).filter(s => {
              if (s.assignedPilotId) return false;
              const hull = HULL_DEFINITIONS[s.shipDefinitionId];
              return canPilotFlyShip(pilot, hull?.requiredPilotSkill);
            });
            const allUnpilotedShips = Object.values(state.systems.fleet.ships).filter(s => !s.assignedPilotId);
            return (
              <div className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-widest text-slate-500">Assign to Ship</span>
                {flyableShips.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {flyableShips.map(s => {
                      const hull = HULL_DEFINITIONS[s.shipDefinitionId];
                      return (
                        <button
                          key={s.id}
                          onClick={() => assignShip(pilot.id, s.id)}
                          className="flex items-center gap-2 text-[9px] text-slate-300 hover:text-cyan-300 px-2 py-0.5 rounded border border-slate-700/30 hover:border-cyan-400/30 bg-slate-800/30 text-left"
                        >
                          <span className="text-[8px] px-1 rounded border border-violet-400/30 text-violet-400">{hull?.shipClass ?? '?'}</span>
                          {s.customName ?? hull?.name ?? s.shipDefinitionId}
                        </button>
                      );
                    })}
                  </div>
                ) : allUnpilotedShips.length > 0 ? (
                  <span className="text-[9px] text-amber-400/60">No ships meet this pilot's skill requirements</span>
                ) : (
                  <span className="text-[9px] text-slate-600">No unpiloted ships available</span>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Ship card ─────────────────────────────────────────────────────────────

function ShipCard({ ship, state, systemNameById, expanded, onToggle }: {
  ship: ShipInstance;
  state: ReturnType<typeof useGameStore.getState>['state'];
  systemNameById: Record<string, string>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const assignPilot      = useGameStore(s => s.assignPilotToShip);
  const setActivity      = useGameStore(s => s.setShipActivity);
  const recallShipAction = useGameStore(s => s.recallShip);
  const repairShip       = useGameStore(s => s.repairShip);
  const addToFleet       = useGameStore(s => s.addShipToFleet);
  const assignShipToWing = useGameStore(s => s.assignShipToWing);
  const removeFromFleet  = useGameStore(s => s.removeShipFromFleet);
  const createFleet      = useGameStore(s => s.createPlayerFleet);
  const fitMod           = useGameStore(s => s.fitModule);
  const removeMod        = useGameStore(s => s.removeModule);

  const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
  const assignedPilot = ship.assignedPilotId ? state.systems.fleet.pilots[ship.assignedPilotId] : null;
  const availablePilots = Object.values(state.systems.fleet.pilots).filter(
    p => !p.assignedShipId && canPilotFlyShip(p, hull?.requiredPilotSkill),
  );

  // Fleet helpers
  const allFleets = Object.values(state.systems.fleet.fleets);
  const assignedFleet = ship.fleetId ? state.systems.fleet.fleets[ship.fleetId] : null;
  const fleetColour = assignedFleet
    ? FLEET_COLOURS[allFleets.findIndex(f => f.id === assignedFleet.id) % FLEET_COLOURS.length]
    : null;
  const joinableFleets = allFleets.filter(
    f => f.currentSystemId === ship.systemId && f.fleetOrder === null && f.id !== ship.fleetId,
  );
  const fittedEffectTotals = (['high', 'mid', 'low'] as const).reduce<Record<string, number>>((totals, slot) => {
    for (const modId of ship.fittedModules[slot]) {
      const module = MODULE_DEFINITIONS[modId];
      if (!module) continue;
      for (const [effectKey, effectValue] of Object.entries(module.effects)) {
        totals[effectKey] = (totals[effectKey] ?? 0) + effectValue;
      }
    }
    return totals;
  }, {});
  const fittingFocusBadges = [
    fittedEffectTotals['mining-yield'] ? { label: `Mining +${Math.round(fittedEffectTotals['mining-yield'] * 100)}%`, color: '#22d3ee' } : null,
    fittedEffectTotals['combat-rating'] ? { label: `Combat +${Math.round(fittedEffectTotals['combat-rating'] * 100)}%`, color: '#f87171' } : null,
    fittedEffectTotals['cargo-capacity'] ? { label: `Cargo +${Math.round(fittedEffectTotals['cargo-capacity'] * 100)}%`, color: '#f59e0b' } : null,
    fittedEffectTotals['scan-strength'] ? { label: `Scan +${Math.round(fittedEffectTotals['scan-strength'] * 100)}%`, color: '#34d399' } : null,
    fittedEffectTotals['warp-speed'] ? { label: `Warp +${Math.round(fittedEffectTotals['warp-speed'] * 100)}%`, color: '#10b981' } : null,
  ].filter(Boolean) as Array<{ label: string; color: string }>;
  const fittedModuleCount = (['high', 'mid', 'low'] as const).reduce((sum, slot) => sum + ship.fittedModules[slot].length, 0);
  const maxModuleSlots = hull ? hull.moduleSlots.high + hull.moduleSlots.mid + hull.moduleSlots.low : 0;
  const integrity = Math.max(0, 100 - ship.hullDamage);
  const systemName = systemNameById[ship.systemId] ?? ship.systemId;

  const isActive = ship.activity !== 'idle';
  const dotColor = isActive ? 'bg-cyan-400 animate-pulse' : assignedPilot ? 'bg-emerald-400' : 'bg-slate-600';

  return (
    <div
      className="rounded border border-slate-700/30 bg-slate-900/40 overflow-hidden cursor-pointer transition-colors hover:border-slate-600/40 hover:bg-white/[0.03]"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-200 truncate">
              {ship.customName ?? hull?.name ?? ship.shipDefinitionId}
            </span>
            <span
              className="text-[8px] uppercase tracking-widest px-1 rounded border"
              style={{ color: '#a78bfa', borderColor: '#a78bfa44' }}
            >
              {hull?.shipClass ?? '?'}
            </span>
            {assignedFleet && fleetColour && (
              <span
                className="text-[8px] px-1 rounded border truncate max-w-[64px]"
                style={{ color: fleetColour, borderColor: fleetColour + '44' }}
                title={`Fleet: ${assignedFleet.name}`}
              >
                ⬡ {assignedFleet.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className="text-[9px] text-slate-500">
              {assignedPilot ? assignedPilot.name : <span className="text-amber-400/70">No pilot</span>} · {ship.activity}
            </span>
            <span className="text-[9px] text-slate-600">·</span>
            <span className="text-[9px] text-slate-500">Integrity {Math.round(integrity)}%</span>
            {hull?.requiredPilotSkill && (
              <span
                className="text-[8px] px-1 rounded border border-slate-700/40 text-slate-600"
                title={`Requires ${SKILL_DEFINITIONS[hull.requiredPilotSkill.skillId]?.name ?? hull.requiredPilotSkill.skillId} ${ROMAN[hull.requiredPilotSkill.minLevel]}`}
              >
                🎓 {SKILL_DEFINITIONS[hull.requiredPilotSkill.skillId]?.name ?? hull.requiredPilotSkill.skillId} {ROMAN[hull.requiredPilotSkill.minLevel]}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-slate-500">
            {systemName}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-700/30 pt-2 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <CommandMetric label="Integrity" value={`${Math.round(integrity)}%`} meta={ship.hullDamage > 0 ? 'repair attention required' : 'combat ready'} tone={ship.hullDamage >= 50 ? 'amber' : ship.hullDamage > 0 ? 'violet' : 'emerald'} />
            <CommandMetric label="Fitting" value={`${fittedModuleCount}/${maxModuleSlots || 0}`} meta={fittedEffectTotals['combat-rating'] ? 'combat fit leaning' : fittingFocusBadges.length > 0 ? 'specialized fit online' : 'baseline hull'} tone={fittedModuleCount > 0 ? 'violet' : 'slate'} />
            <CommandMetric label="Pilot" value={assignedPilot ? assignedPilot.name : 'vacant'} meta={assignedPilot ? 'crew assigned' : 'awaiting crew'} tone={assignedPilot ? 'cyan' : 'slate'} />
            <CommandMetric label="Fleet" value={assignedFleet ? assignedFleet.name : 'independent'} meta={assignedFleet ? 'linked to command network' : 'free hull'} tone={assignedFleet ? 'amber' : 'slate'} />
          </div>

          {/* Hull stats */}
          {hull && (
            <div className="flex flex-col gap-2">
              <div className="rounded border border-slate-700/25 bg-slate-950/35 px-3 py-2">
                <div className="text-[8px] uppercase tracking-widest text-slate-500">Hull Identity</div>
                <div className="text-[10px] text-slate-300 mt-1 leading-relaxed">{hull.description}</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[8px] px-1.5 py-0.5 rounded border border-slate-700/35 text-slate-400">
                    Warp +{Math.round(hull.warpSpeedBonus * 100)}%
                  </span>
                  <span className="text-[8px] px-1.5 py-0.5 rounded border border-slate-700/35 text-slate-400">
                    Slots H{hull.moduleSlots.high} / M{hull.moduleSlots.mid} / L{hull.moduleSlots.low}
                  </span>
                  {fittingFocusBadges.length > 0 ? fittingFocusBadges.map(badge => (
                    <span key={badge.label} className="text-[8px] px-1.5 py-0.5 rounded border" style={{ color: badge.color, borderColor: `${badge.color}44`, background: `${badge.color}12` }}>
                      {badge.label}
                    </span>
                  )) : (
                    <span className="text-[8px] px-1.5 py-0.5 rounded border border-slate-700/35 text-slate-500">
                      No fitting bonuses installed
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: 'Mine', value: hull.baseMiningBonus, color: 'text-cyan-400' },
                  { label: 'Combat', value: hull.baseCombatRating, color: 'text-red-400' },
                  { label: 'Cargo ×', value: hull.baseCargoMultiplier, color: 'text-amber-400' },
                  { label: 'Warp', value: 1 + hull.warpSpeedBonus, color: 'text-emerald-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center bg-slate-800/40 rounded py-1">
                    <span className="text-[8px] text-slate-500 uppercase tracking-widest">{label}</span>
                    <span className={`text-[11px] font-semibold ${color}`}>{value.toFixed(1)}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fitted modules */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Fitted Modules</span>
            {(['high', 'mid', 'low'] as const).map(slot => {
              const filled = ship.fittedModules[slot];
              const maxSlots = hull?.moduleSlots[slot] ?? 0;
              const availableForSlot = Object.values(MODULE_DEFINITIONS).filter(
                m => m.slotType === slot && (state.resources[m.id] ?? 0) > 0,
              );
              const moduleOptions: DropdownOption[] = availableForSlot.map(module => ({
                value: module.id,
                label: module.name,
                description: module.description,
                meta: `x${Math.floor(state.resources[module.id] ?? 0)} in stock`,
                group: `${slot.toUpperCase()} slot`,
                tone: slot === 'high' ? 'cyan' : slot === 'mid' ? 'emerald' : 'violet',
                badges: Object.entries(module.effects).map(([effectKey, effectValue]) => ({
                  label: `${effectKey.replace(/-/g, ' ')} +${Math.round(effectValue * 100)}%`,
                  color: slot === 'high' ? '#22d3ee' : slot === 'mid' ? '#34d399' : '#a78bfa',
                })),
                keywords: [module.id, module.name, ...Object.keys(module.effects)],
              }));
              return (
                <div key={slot} className="flex items-start gap-2">
                  <span className="text-[9px] text-slate-600 w-7 uppercase shrink-0 pt-0.5">{slot}</span>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: maxSlots }, (_, i) => {
                      const modId = filled[i];
                      return modId ? (
                        <div
                          key={i}
                          className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded border border-violet-400/20 bg-slate-800/30"
                        >
                          <span className="text-violet-300">
                            {MODULE_DEFINITIONS[modId]?.name ?? modId.replace(/-/g, ' ')}
                          </span>
                          <button
                            onClick={() => removeMod(ship.id, slot, i)}
                            className="text-red-500/40 hover:text-red-300 pl-0.5 transition-colors"
                            title="Remove module"
                          >✕</button>
                        </div>
                      ) : (
                        <div key={i} className="min-w-[182px] max-w-[240px]">
                          <GameDropdown
                            value=""
                            onChange={nextValue => {
                              if (nextValue) fitMod(ship.id, slot, nextValue);
                            }}
                            options={moduleOptions}
                            placeholder="+ fit..."
                            searchPlaceholder={`Fit ${slot} slot...`}
                            size="compact"
                            triggerTone={slot === 'high' ? 'cyan' : slot === 'mid' ? 'emerald' : 'violet'}
                            menuWidth={420}
                            renderDetail={option => {
                              const module = option ? MODULE_DEFINITIONS[option.value] : null;
                              if (!module) return null;
                              return (
                                <div className="flex flex-col gap-2 text-[10px]">
                                  <div>
                                    <div className="text-[11px] font-semibold text-slate-100">{module.name}</div>
                                    <div className="text-slate-500 leading-relaxed mt-1">{module.description}</div>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {Object.entries(module.effects).map(([effectKey, effectValue]) => (
                                      <span key={effectKey} className="px-1.5 py-0.5 rounded-full border border-slate-700/60 bg-slate-900/70 text-slate-300">
                                        {effectKey.replace(/-/g, ' ')} +{Math.round(effectValue * 100)}%
                                      </span>
                                    ))}
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <div className="text-[9px] uppercase tracking-widest text-slate-600">Build Cost</div>
                                    {Object.entries(module.buildCost).map(([resourceId, amount]) => (
                                      <div key={resourceId} className="flex items-center justify-between gap-2 text-slate-400">
                                        <span>{resourceId.replace(/-/g, ' ')}</span>
                                        <span className="font-mono text-slate-500">{amount}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }}
                            detailTitle="Module Intel"
                            detailEmpty={<div className="text-[10px] text-slate-600">Select a module to inspect its fit bonuses and build cost.</div>}
                            buttonStyle={{ minHeight: 24 }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Activity selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Activity</span>
            <div className="flex flex-wrap gap-1">
              {(['idle', 'mining', 'hauling'] as const).map(act => (
                <button
                  key={act}
                  disabled={!assignedPilot}
                  onClick={() => setActivity(ship.id, act)}
                  className={`text-[9px] px-2 py-0.5 rounded border transition-all capitalize ${
                    ship.activity === act
                      ? 'text-cyan-400 border-cyan-400/40 bg-cyan-400/10'
                      : 'text-slate-500 border-slate-700/40 hover:border-slate-500 disabled:opacity-30'
                  }`}
                >
                  {act}
                </button>
              ))}
            </div>
            {!assignedPilot && (
              <span className="text-[9px] text-amber-400/60">Assign a pilot to activate</span>
            )}
          </div>

          {/* Hull damage & repair */}
          {ship.hullDamage > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[8px] uppercase tracking-widest text-slate-500">Hull Integrity</span>
                <span className={`text-[9px] font-mono ${
                  ship.hullDamage >= 80 ? 'text-red-400' : ship.hullDamage >= 50 ? 'text-amber-400' : 'text-rose-300'
                }`}>{Math.round(100 - ship.hullDamage)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    ship.hullDamage >= 80 ? 'bg-red-500' : ship.hullDamage >= 50 ? 'bg-amber-400' : 'bg-rose-400'
                  }`}
                  style={{ width: `${100 - ship.hullDamage}%` }}
                />
              </div>
              {ship.hullDamage >= 80 && (
                <span className="text-[8px] text-red-400/70">⚠ Ship offline — hull damage critical</span>
              )}
              <div className="flex items-center gap-2">
                {(state.resources['hull-plate'] ?? 0) >= 1 ? (
                  <button
                    onClick={() => repairShip(ship.id)}
                    className="text-[9px] px-2 py-0.5 rounded border border-emerald-400/30 text-emerald-300/80 hover:border-emerald-300 hover:text-emerald-200"
                  >
                    🔧 Repair (1× hull-plate)
                  </button>
                ) : (
                  <span className="text-[8px] text-slate-600">No hull-plates — idle to repair slowly</span>
                )}
              </div>
            </div>
          )}

          {/* Pilot assignment */}
          {!assignedPilot && (
            <div className="flex flex-col gap-1">
              <span className="text-[8px] uppercase tracking-widest text-slate-500">Assign Pilot</span>
              {hull?.requiredPilotSkill && (
                <span className="text-[9px] text-slate-600">
                  Requires: <NavTag entityType="skill" entityId={hull.requiredPilotSkill.skillId} label={`${SKILL_DEFINITIONS[hull.requiredPilotSkill.skillId]?.name ?? hull.requiredPilotSkill.skillId} ${ROMAN[hull.requiredPilotSkill.minLevel]}`} />
                </span>
              )}
              {availablePilots.length > 0 ? (
                availablePilots.map(p => (
                  <button
                    key={p.id}
                    onClick={() => assignPilot(p.id, ship.id)}
                    className="flex items-center gap-2 text-[9px] text-slate-300 hover:text-cyan-300 px-2 py-0.5 rounded border border-slate-700/30 hover:border-cyan-400/30 bg-slate-800/30 text-left"
                  >
                    <PilotPortrait seed={p.portraitSeed} size={16} />
                    {p.name}
                  </button>
                ))
              ) : (
                <span className="text-[9px] text-amber-400/60">No pilots meet the skill requirement</span>
              )}
            </div>
          )}

          {/* Fleet assignment */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-widest text-slate-500">Fleet</span>
            {assignedFleet ? (
              <div className="flex items-center gap-2">
                <span
                  className="text-[9px] px-2 py-0.5 rounded border"
                  style={{ color: fleetColour!, borderColor: fleetColour! + '44', background: fleetColour! + '11' }}
                >
                  ⬡ {assignedFleet.name}
                </span>
                {assignedFleet.fleetOrder === null && (
                  <button
                    onClick={() => removeFromFleet(assignedFleet.id, ship.id)}
                    className="text-[9px] text-slate-500 hover:text-red-400 border border-slate-700/30 rounded px-1.5 py-0.5"
                  >
                    Leave
                  </button>
                )}
              </div>
            ) : joinableFleets.length > 0 || state.systems.fleet.maxFleets > allFleets.length ? (
              <FleetWingAssignmentPicker
                ship={ship}
                fleets={allFleets}
                maxFleets={state.systems.fleet.maxFleets}
                onAddToFleet={addToFleet}
                onAssignShipToWing={assignShipToWing}
                onCreateFleet={createFleet}
                buttonClassName="self-start rounded border border-cyan-400/20 px-2 py-0.5 text-[9px] text-cyan-400/70 transition-colors hover:border-cyan-300/35 hover:text-cyan-200"
                buttonTitle="Assign to fleet or wing"
              >
                + Assign to fleet...
              </FleetWingAssignmentPicker>
            ) : (
              <span className="text-[9px] text-slate-600">No eligible fleets in this system</span>
            )}
          </div>

          {/* Recall button */}
          {ship.activity === 'idle' && (
            <button
              onClick={() => recallShipAction(ship.id)}
              className="mt-1 text-[9px] text-red-400/70 hover:text-red-300 border border-red-400/20 rounded px-2 py-0.5 self-start"
            >
              Recall to hangar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Operations tab ────────────────────────────────────────────────────────

function OperationsTab({ state }: { state: ReturnType<typeof useGameStore.getState>['state'] }) {
  const deployShip = useGameStore(s => s.deployShip);
  const hirePilot  = useGameStore(s => s.hirePilot);
  const refreshOffers = useGameStore(s => s.refreshRecruitmentOffers);

  const deployableHulls = Object.values(HULL_DEFINITIONS).filter(hull => {
    const have = state.resources[hull.resourceId] ?? 0;
    return have >= 1;
  });

  const offers = state.systems.fleet.recruitmentOffers;
  const credits = state.resources['credits'] ?? 0;
  const payroll = getTotalFleetPayroll(state);
  const priorityOffers = offers.filter(offer => offer.source === 'milestone').length;
  const affordableOffers = offers.filter(offer => credits >= offer.hiringCost).length;
  const totalHangarHulls = deployableHulls.reduce((sum, hull) => sum + (state.resources[hull.resourceId] ?? 0), 0);
  const payrollCoverageDays = payroll > 0 ? credits / payroll : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-[9px] text-cyan-400 uppercase tracking-widest font-bold">Fleet Operations Deck</div>
            <div className="text-xs text-slate-400 mt-0.5">Hangar deployment, staffing pressure, and corp payroll posture in one place.</div>
          </div>
          <div className="text-[10px] text-slate-500 text-right">
            Balance <span className="font-mono text-emerald-400">{credits.toLocaleString()} ISK</span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 mb-3">
          <CommandMetric label="Hangar" value={`${totalHangarHulls}`} meta={`${deployableHulls.length} hull lines ready`} tone={totalHangarHulls > 0 ? 'cyan' : 'slate'} />
          <CommandMetric label="Recruitment" value={`${offers.length}`} meta={priorityOffers > 0 ? `${priorityOffers} priority contracts` : 'standard pool'} tone={priorityOffers > 0 ? 'cyan' : offers.length > 0 ? 'amber' : 'slate'} />
          <CommandMetric label="Affordable" value={`${affordableOffers}`} meta="candidates you can hire now" tone={affordableOffers > 0 ? 'emerald' : 'slate'} />
          <CommandMetric label="Payroll Runway" value={payroll > 0 ? `${payrollCoverageDays.toFixed(1)}d` : 'stable'} meta={`${payroll.toLocaleString()} ISK / day`} tone={payroll > 0 && payrollCoverageDays < 3 ? 'amber' : 'emerald'} />
        </div>
      </div>

      {deployableHulls.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[8px] uppercase tracking-widest text-slate-500">Deploy from Hangar</span>
          {deployableHulls.map(hull => {
            const count = state.resources[hull.resourceId] ?? 0;
            return (
              <button
                key={hull.id}
                onClick={() => deployShip(hull.id)}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-slate-700/30 bg-slate-900/40 hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-all text-left"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-[10px] font-semibold text-slate-200">{hull.name}</div>
                      <span className="text-[8px] px-1.5 py-0.5 rounded border border-cyan-700/30 bg-cyan-950/15 text-cyan-300 font-mono uppercase tracking-widest">
                        deployable
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-500">{hull.description.slice(0, 72)}…</div>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-slate-400 shrink-0">×{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] uppercase tracking-widest text-slate-500">Recruitment Office</span>
          {offers.length === 0 && (
            <button
              onClick={refreshOffers}
              className="text-[9px] text-cyan-400/70 hover:text-cyan-300 border border-cyan-400/20 rounded px-2 py-0.5"
            >
              Post contracts
            </button>
          )}
        </div>

        {offers.some(offer => offer.source === 'milestone') && (
          <div className="rounded border border-cyan-500/20 bg-cyan-950/10 px-3 py-2">
            <div className="text-[10px] font-semibold text-cyan-300">Priority contracts available</div>
            <div className="text-[9px] text-slate-400 mt-0.5">
              These candidates were posted automatically because your current progression state suggests a staffing bottleneck or a newly opened operational lane.
            </div>
          </div>
        )}

        {offers.length === 0 && (
          <p className="text-[9px] text-slate-600">No candidates on file. Post recruitment contracts to find pilots.</p>
        )}

        {offers.map(offer => {
          const canAfford = credits >= offer.hiringCost;
          return (
            <div
              key={offer.id}
              className="rounded border border-slate-700/30 bg-slate-900/40 overflow-hidden"
            >
              <div className="flex items-start gap-2.5 px-3 py-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${offer.source === 'milestone' ? 'bg-cyan-400 animate-pulse' : canAfford ? 'bg-emerald-400' : 'bg-amber-400/60'}`} />
                <PilotPortrait seed={offer.pilotSeed} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-200">{offer.name}</span>
                    <span className={`text-[8px] px-1 rounded border ${FOCUS_COLOR[offer.trainingFocus]} border-current`}>
                      {FOCUS_LABEL[offer.trainingFocus]}
                    </span>
                    {offer.sourceLabel && (
                      <span className={`text-[8px] px-1 rounded border ${offer.source === 'milestone' ? 'text-cyan-300 border-cyan-500/30 bg-cyan-950/30' : 'text-slate-400 border-slate-700/40 bg-slate-900/30'}`}>
                        {offer.sourceLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-slate-500 mt-0.5">{offer.backstory}</p>
                  {offer.recommendationReason && (
                    <p className="text-[9px] text-cyan-300/80 mt-1 leading-relaxed">{offer.recommendationReason}</p>
                  )}
                  {Object.keys(offer.previewSkills).length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {Object.entries(offer.previewSkills).map(([sid, lv]) => (
                        <div key={sid} className="flex items-center gap-1">
                          <span className="text-[8px] text-slate-500">{SKILL_DEFINITIONS[sid]?.name ?? sid}</span>
                          <SkillPips level={lv} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="px-3 py-1.5 border-t border-slate-700/30 flex items-center justify-between bg-slate-800/20">
                <div className="text-[9px] text-slate-500">
                  Hire: <span className={`font-mono ${canAfford ? 'text-emerald-400' : 'text-red-400/70'}`}>{offer.hiringCost.toLocaleString()} ISK</span>
                  <span className="ml-2">· Payroll: <span className="font-mono text-amber-400">{offer.payrollPerDay.toLocaleString()}/day</span></span>
                  <span className="ml-2">· Runway impact: <span className="font-mono text-slate-400">{payroll + offer.payrollPerDay > 0 ? `${(credits / (payroll + offer.payrollPerDay)).toFixed(1)}d` : 'stable'}</span></span>
                </div>
                <button
                  disabled={!canAfford}
                  onClick={() => hirePilot(offer.id)}
                  className={`text-[9px] px-3 py-0.5 rounded border transition-all ${
                    canAfford
                      ? 'text-cyan-400 border-cyan-400/40 hover:bg-cyan-400/10'
                      : 'text-slate-600 border-slate-700/30 cursor-not-allowed'
                  }`}
                >
                  Hire
                </button>
              </div>
            </div>
          );
        })}

        {offers.length > 0 && (
          <button
            onClick={refreshOffers}
            className="text-[9px] text-slate-500 hover:text-slate-300 border border-slate-700/30 rounded px-2 py-0.5 self-start"
          >
            Refresh candidates
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────

export function FleetPanel() {
  const savedPanelState = useUiStore(s => s.panelStates.fleet);
  const setPanelState = useUiStore(s => s.setPanelState);
  const [activeTab, setActiveTab] = useState<Tab>(() => savedPanelState.activeTab ?? 'fleets');
  const [expandedId, setExpandedId] = useState<string | null>(() => savedPanelState.expandedId ?? null);
  const [selectedWingId, setSelectedWingId] = useState<string | null>(() => savedPanelState.selectedWingId ?? null);
  const [focusFleetId, setFocusFleetId] = useState<string | null>(null);
  const [focusWingId, setFocusWingId] = useState<string | null>(null);
  const state = useGameStore(s => s.state);
  const galaxy = useMemo(() => generateGalaxy(state.galaxy.seed), [state.galaxy.seed]);
  const systemNameById = useMemo(
    () => Object.fromEntries(galaxy.map(system => [system.id, system.name])),
    [galaxy],
  );

  const focusTarget = useUiStore(s => s.focusTarget);
  const clearFocus  = useUiStore(s => s.clearFocus);

  useEffect(() => {
    if (!focusTarget) return;
    const requestedTab = focusTarget.panelSection;
    if (requestedTab === 'fleets' || requestedTab === 'pilots' || requestedTab === 'ships' || requestedTab === 'operations') {
      setActiveTab(requestedTab);
    }
    if (focusTarget.entityType === 'wing') {
      const ownerFleetId = focusTarget.parentEntityId
        ?? Object.values(state.systems.fleet.fleets).find(fleet => (fleet.wings ?? []).some(wing => wing.id === focusTarget.entityId))?.id
        ?? null;
      if (!ownerFleetId) return;
      setActiveTab('fleets');
      setExpandedId(ownerFleetId);
      setFocusFleetId(ownerFleetId);
      setFocusWingId(focusTarget.entityId);
      setSelectedWingId(focusTarget.entityId);
    } else if (focusTarget.entityType === 'fleet') {
      setActiveTab(requestedTab === 'operations' ? 'operations' : 'fleets');
      setExpandedId(focusTarget.entityId);
      setFocusFleetId(focusTarget.entityId);
      setFocusWingId(null);
    } else if (focusTarget.entityType === 'pilot') {
      setActiveTab('pilots');
      setExpandedId(focusTarget.entityId);
      setFocusFleetId(null);
      setFocusWingId(null);
    } else if (focusTarget.entityType === 'ship') {
      setActiveTab('ships');
      setExpandedId(focusTarget.entityId);
      setFocusFleetId(null);
      setFocusWingId(null);
    } else if (focusTarget.entityType === 'panel') {
      if (!requestedTab) return;
      setFocusFleetId(null);
      setFocusWingId(null);
    } else { return; }
    clearFocus();
  }, [focusTarget, clearFocus, state.systems.fleet.fleets]);

  useEffect(() => {
    if (savedPanelState.activeTab && savedPanelState.activeTab !== activeTab) {
      setActiveTab(savedPanelState.activeTab);
    }
    if (savedPanelState.expandedId !== undefined && savedPanelState.expandedId !== expandedId) {
      setExpandedId(savedPanelState.expandedId ?? null);
    }
    if (savedPanelState.selectedWingId !== undefined && savedPanelState.selectedWingId !== selectedWingId) {
      setSelectedWingId(savedPanelState.selectedWingId ?? null);
    }
  }, [savedPanelState.activeTab, savedPanelState.expandedId, savedPanelState.selectedWingId, expandedId, selectedWingId]);

  useEffect(() => {
    setPanelState('fleet', { activeTab, expandedId, selectedWingId });
  }, [activeTab, expandedId, selectedWingId, setPanelState]);
  const fleet = state.systems.fleet;

  const pilots = Object.values(fleet.pilots);
  const ships  = Object.values(fleet.ships);
  const fleets = Object.values(fleet.fleets);
  const assignedPilots = pilots.filter(pilot => pilot.assignedShipId !== null).length;
  const trainingPilots = pilots.filter(pilot => pilot.skills.activeSkillId !== null).length;
  const activeShips = ships.filter(ship => ship.activity !== 'idle').length;
  const damagedShips = ships.filter(ship => ship.hullDamage > 0).length;
  const movingFleets = fleets.filter(fleetEntry => fleetEntry.fleetOrder !== null).length;
  const scanningFleets = fleets.filter(fleetEntry => fleetEntry.isScanning).length;

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const TABS: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'fleets',     label: 'Fleets',     count: fleets.length },
    { id: 'pilots',     label: 'Pilots',     count: pilots.length },
    { id: 'ships',      label: 'Ships',      count: ships.length },
    { id: 'operations', label: 'Operations' },
  ];

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      <StarfieldBackground />

      {/* Tab bar */}
      <div
        className="relative z-10 flex gap-0 border-b border-slate-700/30 shrink-0"
        style={{ background: 'rgba(3, 5, 14, 0.80)' }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === tab.id
                ? 'text-cyan-400 border-cyan-400'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`text-[8px] rounded-full px-1.5 py-0.5 ${
                  activeTab === tab.id ? 'bg-cyan-400/20 text-cyan-300' : 'bg-slate-700/60 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {activeTab === 'fleets' && <FleetsTab state={state} galaxy={galaxy} systemNameById={systemNameById} focusId={focusFleetId} focusWingId={focusWingId} />}

        {activeTab === 'pilots' && (
          <>
            <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 px-3 py-2.5 mb-1">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-[9px] text-cyan-400 uppercase tracking-widest font-bold">Pilot Roster Deck</div>
                  <div className="text-xs text-slate-400 mt-0.5">Training load, assignments, and payroll pressure for the current roster.</div>
                </div>
                <div className="text-[10px] text-slate-500 text-right">
                  Active <span className="font-mono text-cyan-300">{assignedPilots}/{pilots.length}</span>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 mb-3">
                <CommandMetric label="Roster" value={`${pilots.length}`} meta={`${Math.max(0, pilots.length - assignedPilots)} unassigned`} tone={pilots.length > 0 ? 'cyan' : 'slate'} />
                <CommandMetric label="Training" value={`${trainingPilots}`} meta={trainingPilots > 0 ? 'queues currently running' : 'all queues idle'} tone={trainingPilots > 0 ? 'violet' : 'slate'} />
                <CommandMetric label="Morale Risk" value={`${pilots.filter(pilot => pilot.morale < 40).length}`} meta="pilots under 40% morale" tone={pilots.some(pilot => pilot.morale < 40) ? 'amber' : 'emerald'} />
                <CommandMetric label="Payroll" value={`${pilots.filter(pilot => !pilot.isPlayerPilot).reduce((sum, pilot) => sum + pilot.payrollPerDay, 0).toLocaleString()}`} meta="ISK / day contractor load" tone={pilots.some(pilot => !pilot.isPlayerPilot) ? 'amber' : 'slate'} />
              </div>
            </div>
            {pilots.length === 0 && (
              <p className="text-[10px] text-slate-600 text-center mt-8">No pilots in the roster.</p>
            )}
            {pilots.map(pilot => (
              <PilotCard
                key={pilot.id}
                pilot={pilot}
                state={state}
                expanded={expandedId === pilot.id}
                onToggle={() => toggleExpand(pilot.id)}
              />
            ))}
          </>
        )}

        {activeTab === 'ships' && (
          <>
            <div className="rounded-xl border border-slate-700/30 bg-slate-900/35 px-3 py-2.5 mb-1">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-[9px] text-cyan-400 uppercase tracking-widest font-bold">Ship Readiness Deck</div>
                  <div className="text-xs text-slate-400 mt-0.5">Crew coverage, fitting posture, and hull condition across deployed ships.</div>
                </div>
                <div className="text-[10px] text-slate-500 text-right">
                  Damaged <span className="font-mono text-amber-300">{damagedShips}</span>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 mb-3">
                <CommandMetric label="Deployed" value={`${ships.length}`} meta={`${ships.filter(ship => ship.fleetId !== null).length} linked to fleets`} tone={ships.length > 0 ? 'cyan' : 'slate'} />
                <CommandMetric label="Crewed" value={`${ships.filter(ship => ship.assignedPilotId !== null).length}`} meta={`${ships.filter(ship => ship.assignedPilotId === null).length} hulls vacant`} tone={ships.some(ship => ship.assignedPilotId !== null) ? 'emerald' : 'slate'} />
                <CommandMetric label="Active Sorties" value={`${activeShips}`} meta={movingFleets > 0 ? `${movingFleets} fleets in transit` : scanningFleets > 0 ? `${scanningFleets} scanning fleets` : 'no live sorties'} tone={activeShips > 0 ? 'cyan' : scanningFleets > 0 ? 'violet' : 'slate'} />
                <CommandMetric label="Integrity Alerts" value={`${damagedShips}`} meta={damagedShips > 0 ? 'repair queue should be watched' : 'all hulls nominal'} tone={damagedShips > 0 ? 'amber' : 'emerald'} />
              </div>
            </div>
            {ships.length === 0 && (
              <p className="text-[10px] text-slate-600 text-center mt-8">
                No ships deployed. Manufacture a hull and deploy it from Operations.
              </p>
            )}
            {ships.map(ship => (
              <ShipCard
                key={ship.id}
                ship={ship}
                state={state}
                systemNameById={systemNameById}
                expanded={expandedId === ship.id}
                onToggle={() => toggleExpand(ship.id)}
              />
            ))}
          </>
        )}

        {activeTab === 'operations' && (
          <OperationsTab state={state} />
        )}
      </div>
    </div>
  );
}
