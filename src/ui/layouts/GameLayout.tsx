import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useUiStore, type NavigationHistoryEntry, type PanelId, type PanelStateMap } from '@/stores/uiStore';
import { playUiConfirm, playUiNavigate, playUiSave, syncAudioSettings, unlockAudio } from '@/game/audio/soundEvents';
import { StarField } from '@/ui/effects/StarField';
import { ResourceBar } from '@/ui/panels/ResourceBar';
import { MiningPanel } from '@/ui/panels/MiningPanel';
import { ManufacturingPanel } from '@/ui/panels/ManufacturingPanel';
import { OverviewPanel } from '@/ui/panels/OverviewPanel';
import { SkillsPanel } from '@/ui/panels/SkillsPanel';
import { ReprocessingPanel } from '@/ui/panels/ReprocessingPanel';
import { MarketPanel } from '@/ui/panels/MarketPanel';
import { FleetPanel } from '@/ui/panels/FleetPanel';
import { InboxPanel } from '@/ui/panels/InboxPanel';
import { DevPanel } from '@/ui/dev/DevPanel';
import StarMapPanel from '@/ui/panels/StarMapPanel';
import { SystemPanel } from '@/ui/panels/SystemPanel';
import { ThemedIcon } from '@/ui/components/ThemedIcon';
import { NotificationDrawer, NotificationToastStack, getUnreadNotificationCount } from '@/ui/components/NotificationCenter';
import { TutorialOverlay } from '@/ui/components/TutorialOverlay';
import { useResponsiveViewport } from '@/ui/hooks/useResponsiveViewport';
import { formatResourceAmount, RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import {
  getTutorialProgressSummary,
  getTutorialStepPresentation,
  getTutorialStepDefinition,
  isTutorialActive,
  TUTORIAL_ENABLED,
  TUTORIAL_STEP_ORDER,
} from '@/game/progression/tutorialSequence';

interface TutorialCutoutRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface TutorialAnchorRect {
  id: string;
  rect: TutorialCutoutRect;
}

interface TutorialDimSegment {
  top: number;
  left: number;
  width: number;
  height: number;
}

const EMPTY_TUTORIAL_IDS: string[] = [];

function tutorialRectEquals(left: TutorialCutoutRect, right: TutorialCutoutRect) {
  return left.top === right.top
    && left.left === right.left
    && left.right === right.right
    && left.bottom === right.bottom;
}

function tutorialAnchorRectListEquals(left: TutorialAnchorRect[], right: TutorialAnchorRect[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index].id !== right[index].id) return false;
    if (!tutorialRectEquals(left[index].rect, right[index].rect)) return false;
  }

  return true;
}

function mergeIntervals(intervals: Array<{ left: number; right: number }>) {
  if (intervals.length === 0) return [] as Array<{ left: number; right: number }>;

  const sorted = [...intervals].sort((left, right) => left.left - right.left);
  const merged: Array<{ left: number; right: number }> = [sorted[0]];

  for (const interval of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    if (interval.left <= current.right) {
      current.right = Math.max(current.right, interval.right);
      continue;
    }
    merged.push({ ...interval });
  }

  return merged;
}

function buildTutorialDimSegments(
  viewportWidth: number,
  viewportHeight: number,
  rects: TutorialCutoutRect[],
): TutorialDimSegment[] {
  if (rects.length === 0) {
    return [{ top: 0, left: 0, width: viewportWidth, height: viewportHeight }];
  }

  const boundaries = Array.from(new Set([
    0,
    viewportHeight,
    ...rects.flatMap(rect => [rect.top, rect.bottom]),
  ])).sort((left, right) => left - right);

  const segments: TutorialDimSegment[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const bandTop = boundaries[index];
    const bandBottom = boundaries[index + 1];
    const bandHeight = bandBottom - bandTop;
    if (bandHeight <= 0) continue;

    const overlappingIntervals = mergeIntervals(
      rects
        .filter(rect => rect.top < bandBottom && rect.bottom > bandTop)
        .map(rect => ({ left: rect.left, right: rect.right })),
    );

    if (overlappingIntervals.length === 0) {
      segments.push({ top: bandTop, left: 0, width: viewportWidth, height: bandHeight });
      continue;
    }

    let cursor = 0;
    for (const interval of overlappingIntervals) {
      if (interval.left > cursor) {
        segments.push({
          top: bandTop,
          left: cursor,
          width: interval.left - cursor,
          height: bandHeight,
        });
      }
      cursor = Math.max(cursor, interval.right);
    }

    if (cursor < viewportWidth) {
      segments.push({
        top: bandTop,
        left: cursor,
        width: viewportWidth - cursor,
        height: bandHeight,
      });
    }
  }

  return segments;
}

interface NavEntry {
  id: PanelId;
  label: string;
  short: string;
  unlockKey: string;
  icon: string;
}

const NAV: NavEntry[] = [
  { id: 'overview',       label: 'Overview',        short: 'Home',   unlockKey: 'system-mining',        icon: '📊' },
  { id: 'inbox',          label: 'Inbox',           short: 'Inbox',  unlockKey: 'system-mining',        icon: 'inbox' },
  { id: 'skills',         label: 'Skill Queue',     short: 'Skills', unlockKey: 'system-skills',        icon: '⚡' },
  { id: 'fleet',          label: 'Fleet',           short: 'Fleet',  unlockKey: 'system-fleet',         icon: '🚀' },
  { id: 'starmap',        label: 'Galaxy Map',      short: 'Map',    unlockKey: 'system-mining',        icon: '🗺️' },
  { id: 'system',         label: 'Star System',     short: 'System', unlockKey: 'system-mining',        icon: '🪐' },
  { id: 'mining',         label: 'Asteroid Mining', short: 'Mining', unlockKey: 'system-mining',        icon: '⛏' },
  { id: 'manufacturing',  label: 'Manufacturing',   short: 'Craft',  unlockKey: 'system-manufacturing', icon: '🏭' },
  { id: 'reprocessing',   label: 'Reprocessing',    short: 'Refine', unlockKey: 'system-reprocessing',  icon: '⚗️' },
  { id: 'market',         label: 'Market',          short: 'Market', unlockKey: 'system-market',        icon: '📈' },
];

const PANELS: Record<PanelId, React.ReactNode> = {
  overview:      <OverviewPanel />,
  inbox:         <InboxPanel />,
  skills:        <SkillsPanel />,
  fleet:         <FleetPanel />,
  starmap:       <StarMapPanel />,
  system:        <SystemPanel />,
  mining:        <MiningPanel />,
  manufacturing: <ManufacturingPanel />,
  reprocessing:  <ReprocessingPanel />,
  market:        <MarketPanel />,
};

function panelLabel(panelId: PanelId): string {
  if (panelId === 'inbox') return 'Inbox';
  return NAV.find(entry => entry.id === panelId)?.label ?? panelId;
}

function routeContextLabel(
  entry: { panelId: PanelId; focusTarget: NavigationHistoryEntry['focusTarget']; panelState: PanelStateMap[PanelId] },
  state: ReturnType<typeof useGameStore.getState>['state'],
): string | null {
  if (entry.focusTarget) {
    const { entityType, entityId } = entry.focusTarget;
    if (entityType === 'skill') return SKILL_DEFINITIONS[entityId]?.name ?? entityId;
    if (entityType === 'resource') return RESOURCE_REGISTRY[entityId]?.name ?? entityId;
    if (entityType === 'system') {
      try {
        return getSystemById(state.galaxy.seed, entityId).name;
      } catch {
        return entityId;
      }
    }
    if (entityType === 'fleet') return state.systems.fleet.fleets[entityId]?.name ?? entityId;
    if (entityType === 'pilot') return state.systems.fleet.pilots[entityId]?.name ?? entityId;
    if (entityType === 'ship') return state.systems.fleet.ships[entityId]?.customName ?? entityId;
    if (entityType === 'wing') {
      for (const fleet of Object.values(state.systems.fleet.fleets)) {
        const wing = (fleet.wings ?? []).find(candidate => candidate.id === entityId);
        if (wing) return wing.name;
      }
      return entityId;
    }
  }

  if (entry.panelId === 'skills') {
    const selectedSkillId = (entry.panelState as PanelStateMap['skills']).selectedSkillId;
    if (selectedSkillId) return SKILL_DEFINITIONS[selectedSkillId]?.name ?? selectedSkillId;
  }

  if (entry.panelId === 'overview') {
    const mode = (entry.panelState as PanelStateMap['overview']).mode;
    if (mode === 'guidance') return 'Guidance';
    if (mode === 'operations') return 'Operations';
  }

  if (entry.panelId === 'inbox') {
    const inboxState = entry.panelState as PanelStateMap['inbox'];
    if (inboxState.activeView === 'alerts') return 'Alerts';
    if (inboxState.activeView === 'messages') return 'Messages';
    if (inboxState.activeView === 'unread') return 'Unread';
    return 'All Traffic';
  }

  if (entry.panelId === 'market') {
    const activeTab = (entry.panelState as PanelStateMap['market']).activeTab;
    if (activeTab === 'routes') return 'Trade Routes';
    if (activeTab === 'listings') return 'Listings';
  }

  if (entry.panelId === 'manufacturing') {
    const tab = (entry.panelState as PanelStateMap['manufacturing']).tab;
    if (tab === 'blueprints') return 'Blueprints';
    if (tab === 'jobs') return 'Jobs';
  }

  if (entry.panelId === 'system') {
    const systemState = entry.panelState as PanelStateMap['system'];
    if (systemState.viewingSystemId) {
      try {
        return getSystemById(state.galaxy.seed, systemState.viewingSystemId).name;
      } catch {
        return systemState.viewingSystemId;
      }
    }
  }

  if (entry.panelId === 'starmap') {
    const selectedId = (entry.panelState as PanelStateMap['starmap']).selectedId;
    if (selectedId) {
      try {
        return getSystemById(state.galaxy.seed, selectedId).name;
      } catch {
        return selectedId;
      }
    }
  }

  return null;
}

export function GameLayout() {
  const activePanel = useUiStore(s => s.activePanel);
  const navigate    = useUiStore(s => s.navigate);
  const goBack      = useUiStore(s => s.goBack);
  const restoreHistory = useUiStore(s => s.restoreHistory);
  const setPanelState = useUiStore(s => s.setPanelState);
  const navigationHistory = useUiStore(s => s.navigationHistory);
  const panelStates = useUiStore(s => s.panelStates);
  const focusTarget = useUiStore(s => s.focusTarget);
  const notificationDrawerOpen = useUiStore(s => s.notificationDrawerOpen);
  const toggleNotificationDrawer = useUiStore(s => s.toggleNotificationDrawer);
  const closeNotificationDrawer = useUiStore(s => s.closeNotificationDrawer);
  const activeToasts = useUiStore(s => s.activeToasts);
  const dismissNotificationToast = useUiStore(s => s.dismissNotificationToast);
  const pruneNotificationToasts = useUiStore(s => s.pruneNotificationToasts);
  const tutorialOverlayOpen = useUiStore(s => s.tutorialOverlayOpen);
  const openTutorialOverlay = useUiStore(s => s.openTutorialOverlay);
  const closeTutorialOverlay = useUiStore(s => s.closeTutorialOverlay);
  const [devOpen,     setDevOpen]       = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wipePending, setWipePending] = useState(false);
  const [tutorialVisibleRects, setTutorialVisibleRects] = useState<TutorialAnchorRect[]>([]);
  const [tutorialAllowedRects, setTutorialAllowedRects] = useState<TutorialAnchorRect[]>([]);
  const viewport = useResponsiveViewport();

  const state               = useGameStore(s => s.state);
  const notifications       = useGameStore(s => s.state.notifications.entries);
  const unlocks             = useGameStore(s => s.state.unlocks);
  const saveToStorage       = useGameStore(s => s.saveToStorage);
  const completeTutorialStep = useGameStore(s => s.completeTutorialStep);
  const skipTutorial = useGameStore(s => s.skipTutorial);
  const restartTutorial = useGameStore(s => s.restartTutorial);
  const markNotificationRead = useGameStore(s => s.markNotificationRead);
  const markAllNotificationsRead = useGameStore(s => s.markAllNotificationsRead);
  const audioEnabled        = useGameStore(s => s.state.settings.audioEnabled);
  const masterVolume        = useGameStore(s => s.state.settings.masterVolume);
  const setAudioEnabled     = useGameStore(s => s.setAudioEnabled);
  const setMasterVolume     = useGameStore(s => s.setMasterVolume);
  const clearSave           = useGameStore(s => s.clearSave);
  const offlineSummary      = useGameStore(s => s.offlineSummary);
  const dismissOfflineSummary = useGameStore(s => s.dismissOfflineSummary);
  const didRouteSoundMount = useRef(false);
  const notificationDrawerRef = useRef<HTMLDivElement | null>(null);
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);

  const visibleNav = NAV.filter(n => unlocks[n.unlockKey]);
  const tutorialActive = isTutorialActive(state.tutorial);
  const tutorialCompleted = state.tutorial.completedAt !== null;
  const tutorialStep = getTutorialStepDefinition(state, state.tutorial.currentStepId);
  const tutorialPresentation = tutorialStep ? getTutorialStepPresentation(state, tutorialStep.id) : null;
  const tutorialSummary = getTutorialProgressSummary(state);
  const tutorialStepIndex = tutorialStep ? TUTORIAL_STEP_ORDER.indexOf(tutorialStep.id) + 1 : tutorialSummary.completedCount;
  const tutorialSpotlightIds = tutorialPresentation?.spotlightIds ?? EMPTY_TUTORIAL_IDS;
  const tutorialAllowedInteractionIds = tutorialPresentation?.allowedInteractionIds ?? EMPTY_TUTORIAL_IDS;
  const tutorialSpotlightKey = tutorialSpotlightIds.join('|');
  const tutorialAllowedInteractionKey = tutorialAllowedInteractionIds.join('|');
  const tutorialVisibleAnchorIds = useMemo(
    () => Array.from(new Set([...tutorialSpotlightIds, ...tutorialAllowedInteractionIds])),
    [tutorialAllowedInteractionKey, tutorialSpotlightKey],
  );
  const tutorialVisibleAnchorKey = tutorialVisibleAnchorIds.join('|');
  const tutorialOverlayDesktopSide = useMemo<'left' | 'right'>(() => {
    if (tutorialVisibleRects.length === 0) return 'right';

    const averageCenterX = tutorialVisibleRects.reduce((sum, entry) => {
      const rectCenterX = (entry.rect.left + entry.rect.right) / 2;
      return sum + rectCenterX;
    }, 0) / tutorialVisibleRects.length;

    return averageCenterX >= window.innerWidth * 0.55 ? 'left' : 'right';
  }, [tutorialVisibleRects]);
  const tutorialDimSegments = useMemo(
    () => buildTutorialDimSegments(window.innerWidth, window.innerHeight, tutorialVisibleRects.map(entry => entry.rect)),
    [tutorialVisibleRects],
  );
  const unreadNotificationCount = useMemo(() => getUnreadNotificationCount(notifications), [notifications]);
  const toastEntries = useMemo(
    () => activeToasts
      .map(toast => notifications.find(entry => entry.id === toast.notificationId) ?? null)
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [activeToasts, notifications],
  );
  const breadcrumbs = useMemo(() => {
    const current = {
      id: 'current',
      panelId: activePanel,
      focusTarget,
      panelState: panelStates[activePanel],
    };
    return [...navigationHistory.slice(-4), current];
  }, [activePanel, focusTarget, navigationHistory, panelStates]);

  useEffect(() => {
    if (tutorialActive && !tutorialOverlayOpen) {
      openTutorialOverlay();
    }
  }, [openTutorialOverlay, tutorialActive, tutorialOverlayOpen]);

  useEffect(() => {
    if (!tutorialActive || !tutorialOverlayOpen || !tutorialPresentation?.anchorId) return;

    const rafId = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-tutorial-anchor="${tutorialPresentation.anchorId}"]`);
      target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [activePanel, tutorialActive, tutorialOverlayOpen, tutorialPresentation?.anchorId]);

  useEffect(() => {
    if (!tutorialActive || !tutorialOverlayOpen || tutorialVisibleAnchorIds.length === 0) {
      setTutorialVisibleRects(current => (current.length === 0 ? current : []));
      setTutorialAllowedRects(current => (current.length === 0 ? current : []));
      return;
    }

    let rafId = 0;

    const updateCutout = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const nodes = tutorialAllowedInteractionIds
          .map(id => ({ id, node: document.querySelector<HTMLElement>(`[data-tutorial-anchor="${id}"]`) }))
          .filter((entry): entry is { id: string; node: HTMLElement } => entry.node !== null);
        const visibleNodes = tutorialVisibleAnchorIds
          .map(id => ({ id, node: document.querySelector<HTMLElement>(`[data-tutorial-anchor="${id}"]`) }))
          .filter((entry): entry is { id: string; node: HTMLElement } => entry.node !== null);

        if (visibleNodes.length === 0) {
          setTutorialVisibleRects(current => (current.length === 0 ? current : []));
          setTutorialAllowedRects(current => (current.length === 0 ? current : []));
          return;
        }

        const padding = 12;
        const mapNodeToRect = ({ id, node }: { id: string; node: HTMLElement }): TutorialAnchorRect => {
          const rect = node.getBoundingClientRect();
          return {
            id,
            rect: {
              top: Math.max(0, rect.top - padding),
              left: Math.max(0, rect.left - padding),
              right: Math.min(window.innerWidth, rect.right + padding),
              bottom: Math.min(window.innerHeight, rect.bottom + padding),
            },
          };
        };

        const nextVisibleRects = visibleNodes.map(mapNodeToRect);
        const nextAllowedRects = nodes.map(mapNodeToRect);

        setTutorialVisibleRects(current => (
          tutorialAnchorRectListEquals(current, nextVisibleRects) ? current : nextVisibleRects
        ));
        setTutorialAllowedRects(current => (
          tutorialAnchorRectListEquals(current, nextAllowedRects) ? current : nextAllowedRects
        ));
      });
    };

    updateCutout();
    window.addEventListener('resize', updateCutout);
    window.addEventListener('scroll', updateCutout, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateCutout);
      window.removeEventListener('scroll', updateCutout, true);
    };
  }, [activePanel, tutorialActive, tutorialAllowedInteractionKey, tutorialOverlayOpen, tutorialVisibleAnchorKey]);

  useEffect(() => {
    if (!didRouteSoundMount.current) {
      didRouteSoundMount.current = true;
      return;
    }
    playUiNavigate();
  }, [activePanel, focusTarget?.entityId, focusTarget?.entityType]);

  useEffect(() => {
    if (!notificationDrawerOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (notificationDrawerRef.current?.contains(target)) return;
      if (notificationButtonRef.current?.contains(target)) return;
      closeNotificationDrawer();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNotificationDrawer();
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeNotificationDrawer, notificationDrawerOpen]);

  useEffect(() => {
    if (!settingsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (settingsMenuRef.current?.contains(target)) return;
      if (settingsButtonRef.current?.contains(target)) return;
      setSettingsOpen(false);
      setWipePending(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSettingsOpen(false);
      setWipePending(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (activeToasts.length === 0) return;
    const intervalId = window.setInterval(() => pruneNotificationToasts(), 1000);
    return () => window.clearInterval(intervalId);
  }, [activeToasts.length, pruneNotificationToasts]);

  const handleOpenNotificationSource = (notificationId: string) => {
    const entry = notifications.find(candidate => candidate.id === notificationId);
    if (!entry) return;

    markNotificationRead(entry.id);
    dismissNotificationToast(entry.id);
    closeNotificationDrawer();

    if (entry.focusTarget) {
      navigate(entry.focusTarget.panelId, {
        entityType: entry.focusTarget.entityType,
        entityId: entry.focusTarget.entityId,
        panelSection: entry.focusTarget.panelSection,
        parentEntityId: entry.focusTarget.parentEntityId,
      });
      return;
    }

    setPanelState('inbox', { selectedNotificationId: entry.id });
    navigate('inbox');
  };

  const handleOpenInboxPanel = () => {
    closeNotificationDrawer();
    navigate('inbox');
  };

  const handleOpenTutorialTarget = () => {
    if (!tutorialStep) return;

    if (tutorialStep.panelId === 'overview' && tutorialStep.focusTarget?.panelSection === 'guidance') {
      setPanelState('overview', { mode: 'guidance' });
    }
    if (tutorialStep.panelId === 'market' && tutorialStep.focusTarget?.panelSection === 'listings') {
      setPanelState('market', { activeTab: 'listings' });
    }
    if (tutorialStep.panelId === 'skills' && tutorialStep.focusTarget?.entityType === 'skill') {
      setPanelState('skills', { selectedSkillId: tutorialStep.focusTarget.entityId });
    }
    if (tutorialStep.panelId === 'fleet') {
      setPanelState('fleet', {
        activeTab: tutorialStep.focusTarget?.panelSection === 'operations' ? 'operations' : 'fleets',
        expandedId: tutorialStep.focusTarget?.entityType === 'fleet' ? tutorialStep.focusTarget.entityId : null,
      });
    }
    if (tutorialStep.panelId === 'starmap') {
      setPanelState('starmap', {
        selectedId: tutorialStep.focusTarget?.entityType === 'system' ? tutorialStep.focusTarget.entityId : null,
        rightTab: tutorialStep.focusTarget?.panelSection === 'route' ? 'route' : 'intel',
      });
    }
    if (tutorialStep.panelId === 'system') {
      setPanelState('system', {
        viewingSystemId: tutorialStep.focusTarget?.entityType === 'system' ? tutorialStep.focusTarget.entityId : undefined,
        selectedBodyId: tutorialStep.focusTarget?.parentEntityId ?? null,
        activeTab: tutorialStep.focusTarget?.panelSection === 'anomalies' ? 'anomalies' : 'orrery',
      });
    }

    navigate(
      tutorialStep.panelId,
      tutorialStep.focusTarget
        ? {
            entityType: tutorialStep.focusTarget.entityType,
            entityId: tutorialStep.focusTarget.entityId,
            panelSection: tutorialStep.focusTarget.panelSection,
            parentEntityId: tutorialStep.focusTarget.parentEntityId,
          }
        : undefined,
    );

    if (tutorialStep.completionMode === 'acknowledge') {
      if (activePanel !== tutorialStep.panelId) {
        return;
      }
      completeTutorialStep(tutorialStep.id);
    }
  };

  const handleTutorialButton = () => {
    if (!TUTORIAL_ENABLED) {
      setSettingsOpen(false);
      return;
    }

    if (tutorialActive) {
      skipTutorial();
      closeTutorialOverlay();
      setSettingsOpen(false);
      return;
    }
    if (tutorialCompleted) return;
    restartTutorial();
    openTutorialOverlay();
    setSettingsOpen(false);
  };

  const handleSave = async () => {
    await unlockAudio();
    playUiSave();
    saveToStorage();
  };

  const handleToggleAudio = async () => {
    const nextEnabled = !audioEnabled;
    syncAudioSettings({ audioEnabled: nextEnabled, masterVolume });
    setAudioEnabled(nextEnabled);
    if (nextEnabled) {
      await unlockAudio();
      playUiConfirm();
    }
  };

  const handleMasterVolumeChange = (nextVolume: number) => {
    syncAudioSettings({ audioEnabled, masterVolume: nextVolume });
    setMasterVolume(nextVolume);
  };

  const handleConfirmWipeSave = async () => {
    await unlockAudio();
    playUiConfirm();
    clearSave();
    navigate('overview');
    closeNotificationDrawer();
    setSettingsOpen(false);
    setWipePending(false);
  };

  return (
    <div
      className="flex flex-col overflow-hidden relative"
      data-viewport={viewport.isPhone ? 'phone' : viewport.isTablet ? 'tablet' : 'desktop'}
      data-input-mode={viewport.isCoarsePointer ? 'coarse' : 'fine'}
      style={{ height: '100dvh', zIndex: 1 }}
    >
      <StarField />

      {/* ── Top bar ── */}
      <div
        className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2"
        style={{
          background: 'rgba(3, 5, 14, 0.97)',
          borderBottom: '1px solid rgba(22, 30, 52, 0.8)',
          boxShadow: 'inset 0 -1px 0 rgba(34, 211, 238, 0.04)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-cyan-400 font-bold tracking-widest text-sm uppercase title-glow select-none">
            IDLEVERSE
          </span>
          <span className="text-slate-700 text-[10px] hidden sm:block tracking-wider select-none">
            Galactic Civilization Simulator
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            ref={notificationButtonRef}
            className={`btn-secondary relative flex items-center gap-2 py-1 px-2.5 text-xs ${notificationDrawerOpen ? 'border-cyan-500/45 text-cyan-100' : unreadNotificationCount > 0 ? 'border-cyan-500/35 text-cyan-200' : 'text-slate-400'}`}
            onClick={toggleNotificationDrawer}
            title="Open notification inbox"
          >
            <ThemedIcon icon="inbox" size={16} tone={unreadNotificationCount > 0 ? '#22d3ee' : '#94a3b8'} interactive />
            <span className="hidden sm:inline">Inbox</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono ${unreadNotificationCount > 0 ? 'bg-cyan-500/15 text-cyan-100' : 'bg-slate-900/70 text-slate-500'}`}>
              {unreadNotificationCount}
            </span>
          </button>
          {import.meta.env.DEV && (
            <button
              onClick={() => setDevOpen(o => !o)}
              title="Dev Admin Panel — Ctrl+`"
              className={devOpen ? 'btn-secondary text-xs py-1 px-2 border-amber-600/50 text-amber-400' : 'btn-secondary text-xs py-1 px-2 text-slate-600'}
            >
              DEV
            </button>
          )}
          <div className="relative">
            <button
              ref={settingsButtonRef}
              className={`btn-secondary relative flex items-center gap-2 py-1 px-2.5 text-xs ${settingsOpen ? 'border-cyan-500/45 text-cyan-100' : 'text-slate-400'}`}
              onClick={() => {
                setSettingsOpen(open => !open);
                setWipePending(false);
              }}
              title="Open settings"
            >
              <ThemedIcon icon="tool" size={15} tone={settingsOpen ? '#67e8f9' : '#94a3b8'} interactive />
              <span className="hidden sm:inline">Settings</span>
            </button>
            {settingsOpen && (
              <div
                ref={settingsMenuRef}
                className="absolute right-0 top-[calc(100%+0.5rem)] z-[66] w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-cyan-500/20 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur-xl"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">Settings</div>

                <div className="mt-3 rounded-xl border border-slate-800/80 bg-slate-950/55 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Tutorial</div>
                      <div className="mt-1 text-[11px] text-slate-300">
                        {!TUTORIAL_ENABLED
                          ? 'The guided tour is temporarily disabled while onboarding is being revised.'
                          : tutorialCompleted
                          ? 'Tour completed for this save.'
                          : tutorialActive
                            ? 'The guided tour is currently active.'
                            : 'Resume the guided tour for this save.'}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-mono ${!TUTORIAL_ENABLED ? 'bg-slate-900/70 text-slate-400' : tutorialCompleted ? 'bg-emerald-500/15 text-emerald-200' : tutorialActive ? 'bg-amber-500/15 text-amber-200' : 'bg-slate-900/70 text-slate-400'}`}>
                      {!TUTORIAL_ENABLED ? 'OFF' : tutorialCompleted ? `${tutorialSummary.totalCount}/${tutorialSummary.totalCount}` : `${tutorialSummary.completedCount}/${tutorialSummary.totalCount}`}
                    </span>
                  </div>
                  {TUTORIAL_ENABLED && !tutorialCompleted && (
                    <button
                      className={`mt-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-[11px] font-semibold transition-colors ${tutorialActive ? 'border-amber-500/35 bg-amber-950/25 text-amber-100 hover:border-amber-400/50' : 'border-cyan-500/25 bg-cyan-950/20 text-cyan-100 hover:border-cyan-400/45'}`}
                      onClick={handleTutorialButton}
                    >
                      <span>{tutorialActive ? 'Skip Tour' : 'Resume Tour'}</span>
                      <ThemedIcon icon={tutorialActive ? 'data' : 'overview'} size={14} tone={tutorialActive ? '#fbbf24' : '#67e8f9'} interactive />
                    </button>
                  )}
                </div>

                <div className="mt-3 rounded-xl border border-slate-800/80 bg-slate-950/55 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">SFX</div>
                      <div className="mt-1 text-[11px] text-slate-300">Toggle UI sound effects and adjust master volume.</div>
                    </div>
                    <button
                      className={`rounded-lg border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] transition-colors ${audioEnabled ? 'border-cyan-500/35 bg-cyan-950/20 text-cyan-100 hover:border-cyan-400/45' : 'border-slate-700/70 bg-slate-900/80 text-slate-400 hover:text-slate-200'}`}
                      onClick={handleToggleAudio}
                    >
                      {audioEnabled ? 'On' : 'Off'}
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <ThemedIcon icon={audioEnabled ? 'audio-on' : 'audio-off'} size={15} tone={audioEnabled ? '#67e8f9' : '#64748b'} interactive />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(masterVolume * 100)}
                      onChange={e => handleMasterVolumeChange(Number(e.target.value) / 100)}
                      onPointerDown={() => { void unlockAudio(); }}
                      className="h-1 w-full accent-cyan-400"
                      title={`Master volume: ${Math.round(masterVolume * 100)}%`}
                    />
                    <span className="w-9 text-right text-[10px] font-mono text-slate-400">{Math.round(masterVolume * 100)}%</span>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-red-500/20 bg-red-950/15 p-3">
                  <div className="flex items-start gap-2">
                    <ThemedIcon icon="warning" size={15} tone="#f87171" interactive />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-red-200/80">Wipe Save</div>
                      <div className="mt-1 text-[11px] leading-relaxed text-slate-300">
                        Delete the current save and reset the game to a fresh new state. This cannot be undone.
                      </div>
                    </div>
                  </div>
                  {wipePending ? (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        className="flex-1 rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-[11px] font-semibold text-red-100 transition-colors hover:border-red-400/55"
                        onClick={() => { void handleConfirmWipeSave(); }}
                      >
                        Yes, wipe save
                      </button>
                      <button
                        className="rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-[11px] font-semibold text-slate-300 transition-colors hover:text-slate-100"
                        onClick={() => setWipePending(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="mt-3 w-full rounded-xl border border-red-500/35 bg-red-950/25 px-3 py-2 text-[11px] font-semibold text-red-200 transition-colors hover:border-red-400/50"
                      onClick={() => setWipePending(true)}
                    >
                      Wipe Save
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <button className="btn-secondary text-xs py-1 px-3" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>

      {/* ── Resource / status bar ── */}
      <ResourceBar />

      {notificationDrawerOpen && (
        <div ref={notificationDrawerRef} className="absolute right-3 top-[5rem] z-[65] sm:right-4 sm:top-[5.5rem]">
          <NotificationDrawer
            entries={notifications}
            galaxySeed={state.galaxy.seed}
            activeView={panelStates.inbox.activeView ?? 'all'}
            unreadCount={unreadNotificationCount}
            onChangeView={(view) => setPanelState('inbox', { activeView: view })}
            onSelect={(entry) => handleOpenNotificationSource(entry.id)}
            onOpenInbox={handleOpenInboxPanel}
            onMarkAllRead={markAllNotificationsRead}
          />
        </div>
      )}

      <div
        className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 overflow-x-auto"
        style={{
          background: 'rgba(3, 5, 14, 0.92)',
          borderBottom: '1px solid rgba(22, 30, 52, 0.7)',
        }}
      >
        <button
          className="btn-secondary text-xs py-1 px-2 shrink-0 disabled:opacity-30"
          disabled={navigationHistory.length === 0}
          onClick={goBack}
          title="Go back to previous view"
        >
          Back
        </button>
        <div className="flex items-center gap-1.5 min-w-0">
          {breadcrumbs.map((entry, index) => {
            const context = routeContextLabel(entry, state);
            const isCurrent = entry.id === 'current';
            return (
              <div key={entry.id} className="flex items-center gap-1.5 shrink-0">
                {index > 0 && <span className="text-[10px] text-slate-700">/</span>}
                {isCurrent ? (
                  <span className="text-[10px] text-cyan-300 font-semibold whitespace-nowrap">
                    {panelLabel(entry.panelId)}{context ? ` · ${context}` : ''}
                  </span>
                ) : (
                  <button
                    className="text-[10px] text-slate-400 hover:text-white transition-colors whitespace-nowrap"
                    onClick={() => restoreHistory(entry.id)}
                    title={`Return to ${panelLabel(entry.panelId)}`}
                  >
                    {panelLabel(entry.panelId)}{context ? ` · ${context}` : ''}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Offline progress banner ── */}
      {offlineSummary && (
        <div className="bg-violet-900/25 border-b border-violet-700/35 px-4 py-2 flex items-center justify-between gap-4 shrink-0">
          <div className="text-xs text-violet-300 leading-relaxed">
            <span className="font-bold">Welcome back!</span>{' '}
            {Math.floor(offlineSummary.elapsedSeconds / 60)}m of offline progress applied.
            {offlineSummary.wasCapped && ' (capped at 24h)'}
            {offlineSummary.skillsAdvanced.length > 0 && (
              <> · Skills trained: {offlineSummary.skillsAdvanced.map(s => s.skillId).join(', ')}</>
            )}
            {' '}Gained:{' '}
            {Object.entries(offlineSummary.resourcesGained)
              .slice(0, 4)
              .map(([id, amt]) => `${formatResourceAmount(amt, 1)} ${id}`)
              .join(', ')}
            {Object.keys(offlineSummary.resourcesGained).length > 4 && ' …'}
          </div>
          <button className="btn-secondary text-xs shrink-0 py-1" onClick={dismissOfflineSummary}>
            Dismiss
          </button>
        </div>
      )}

      {/* ── Body: sidebar + panel ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Panel content — full width with responsive max-width */}
        <main className={`flex-1 min-h-0 overscroll-contain ${['starmap', 'system', 'fleet', 'skills'].includes(activePanel) ? 'overflow-hidden' : 'overflow-y-auto'} ${(tutorialActive && tutorialStep?.panelId === activePanel) ? 'focus-pulse' : ''}`}>
          {(['starmap', 'system', 'fleet', 'skills'] as PanelId[]).includes(activePanel) ? (
            <div style={{ height: '100%', minHeight: 0 }}>{PANELS[activePanel]}</div>
          ) : (
            /* Bottom nav is always present, so keep content clear of it at every size. */
            <div className="w-full p-3 pb-20 sm:p-4 sm:pb-20 lg:p-5 lg:pb-20">
              {PANELS[activePanel]}
            </div>
          )}
        </main>
      </div>

      {/* ── Dev Admin Panel — removed from production builds by Vite ── */}
      {import.meta.env.DEV && <DevPanel open={devOpen} onToggle={() => setDevOpen(o => !o)} />}

      {tutorialActive && tutorialOverlayOpen && tutorialVisibleRects.length > 0 && (
        <>
          {tutorialDimSegments.map((segment, index) => (
            <div
              key={`tutorial-dim-${index}`}
              className="pointer-events-auto fixed z-[71] bg-[rgba(2,6,23,0.50)]"
              style={{
                top: segment.top,
                left: segment.left,
                width: segment.width,
                height: segment.height,
              }}
              aria-hidden="true"
            />
          ))}
          {tutorialVisibleRects
            .filter(entry => !tutorialAllowedRects.some(allowed => allowed.id === entry.id))
            .map(entry => (
              <div
                key={`tutorial-visible-${entry.id}`}
                className="pointer-events-none fixed z-[71] rounded-2xl"
                style={{
                  top: entry.rect.top,
                  left: entry.rect.left,
                  width: Math.max(0, entry.rect.right - entry.rect.left),
                  height: Math.max(0, entry.rect.bottom - entry.rect.top),
                  background: 'radial-gradient(circle at center, rgba(148,163,184,0.08), rgba(148,163,184,0.025) 62%, rgba(148,163,184,0.00) 100%)',
                  backdropFilter: 'brightness(1.08)',
                  WebkitBackdropFilter: 'brightness(1.08)',
                }}
                aria-hidden="true"
              />
            ))}
        </>
      )}

      {tutorialActive && tutorialOverlayOpen && tutorialVisibleRects.length === 0 && (
        <div className="pointer-events-auto fixed inset-0 z-[71] bg-[rgba(2,6,23,0.50)]" aria-hidden="true" />
      )}

      <div className="pointer-events-none absolute right-3 top-24 z-[75] sm:right-4 sm:top-28">
        <NotificationToastStack
          entries={toastEntries}
          galaxySeed={state.galaxy.seed}
          onOpen={(entry) => handleOpenNotificationSource(entry.id)}
          onDismiss={dismissNotificationToast}
        />
      </div>

      {/* ── Bottom navigation — used at every screen size ── */}
      <nav className="shrink-0 mob-nav flex items-stretch" style={{ zIndex: 50 }}>
        {visibleNav.map(n => {
          const isActive = activePanel === n.id;
          const isTutorialTarget = tutorialActive && tutorialStep?.panelId === n.id;
          return (
            <button
              key={n.id}
              className={`${isActive ? 'mob-nav-btn mob-nav-active' : 'mob-nav-btn'} ${isTutorialTarget ? 'focus-pulse' : ''}`}
              onClick={() => navigate(n.id)}
            >
              <span className="leading-none inline-flex items-center justify-center"><ThemedIcon icon={n.icon} size={18} tone={isActive ? '#67e8f9' : '#475569'} interactive /></span>
              <span
                className="text-[9px] leading-none font-mono tracking-wide"
                style={{ color: isActive ? '#22d3ee' : '#334155' }}
              >
                {n.short}
              </span>
            </button>
          );
        })}
      </nav>

      {tutorialActive && tutorialOverlayOpen && tutorialStep && (
        <TutorialOverlay
          eyebrow={tutorialStep.eyebrow}
          title={tutorialStep.title}
          description={tutorialStep.description}
          helperText={tutorialPresentation?.helperText ?? 'Follow the highlighted tutorial target.'}
          lockMessage={tutorialPresentation?.lockMessage ?? 'The rest of the game is temporarily locked during onboarding.'}
          metrics={tutorialPresentation?.metrics ?? []}
          checklist={tutorialPresentation?.checklist ?? []}
          progress={tutorialPresentation?.progress ?? null}
          uiTerms={tutorialPresentation?.uiTerms ?? []}
          icon={tutorialStep.icon}
          stepIndex={tutorialStepIndex}
          stepCount={tutorialSummary.totalCount}
          actionLabel={tutorialStep.actionLabel}
          completionMode={tutorialStep.completionMode}
          desktopSide={tutorialOverlayDesktopSide}
          onAction={handleOpenTutorialTarget}
          onSkip={() => {
            skipTutorial();
            closeTutorialOverlay();
          }}
        />
      )}
    </div>
  );
}
