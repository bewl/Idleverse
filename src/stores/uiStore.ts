import { create } from 'zustand';

const INFO_SECTION_STORAGE_KEY = 'idleverse-ui-collapsed-info-sections';
const DISMISSED_PROGRESS_PROMPTS_STORAGE_KEY = 'idleverse-ui-dismissed-progress-prompts';

function loadCollapsedInfoSections(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(INFO_SECTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === 'boolean'),
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function persistCollapsedInfoSections(next: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INFO_SECTION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}

function loadDismissedProgressPrompts(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DISMISSED_PROGRESS_PROMPTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === 'boolean'),
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function persistDismissedProgressPrompts(next: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISSED_PROGRESS_PROMPTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────

export type PanelId =
  | 'overview'
  | 'skills'
  | 'mining'
  | 'manufacturing'
  | 'reprocessing'
  | 'market'
  | 'fleet'
  | 'starmap'
  | 'system';

export type EntityType = 'fleet' | 'pilot' | 'ship' | 'wing' | 'skill' | 'resource' | 'system' | 'anomaly' | 'panel';

export type FocusTarget = {
  entityType: EntityType;
  entityId: string;
  panelSection?: string;
  parentEntityId?: string;
};

export interface PanelStateMap {
  overview: {
    mode?: 'operations' | 'guidance';
  };
  skills: {
    activeCategory?: string;
    selectedSkillId?: string | null;
  };
  mining: Record<string, never>;
  manufacturing: {
    tab?: 'jobs' | 'blueprints';
  };
  reprocessing: {
    selectedOre?: string;
  };
  market: {
    activeTab?: 'listings' | 'routes';
  };
  fleet: {
    activeTab?: 'fleets' | 'pilots' | 'ships' | 'operations';
    expandedId?: string | null;
  };
  starmap: {
    selectedId?: string | null;
    rightTab?: 'intel' | 'route';
  };
  system: {
    viewingSystemId?: string;
    selectedBodyId?: string | null;
    activeTab?: 'orrery' | 'anomalies';
  };
}

export interface NavigationHistoryEntry {
  id: string;
  panelId: PanelId;
  focusTarget: FocusTarget | null;
  panelState: PanelStateMap[PanelId];
}

const DEFAULT_PANEL_STATES: PanelStateMap = {
  overview: {
    mode: 'operations',
  },
  skills: {},
  mining: {},
  manufacturing: {},
  reprocessing: {},
  market: {},
  fleet: {},
  starmap: {},
  system: {},
};

function createHistoryEntry(
  panelId: PanelId,
  focusTarget: FocusTarget | null,
  panelState: PanelStateMap[PanelId],
): NavigationHistoryEntry {
  return {
    id: `${panelId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    panelId,
    focusTarget,
    panelState,
  };
}

function focusTargetEquals(left: FocusTarget | null, right: FocusTarget | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.entityType === right.entityType
    && left.entityId === right.entityId
    && left.panelSection === right.panelSection
    && left.parentEntityId === right.parentEntityId;
}

function routeEquals(left: NavigationHistoryEntry, right: NavigationHistoryEntry): boolean {
  return left.panelId === right.panelId
    && focusTargetEquals(left.focusTarget, right.focusTarget)
    && JSON.stringify(left.panelState) === JSON.stringify(right.panelState);
}

// ─── Store ─────────────────────────────────────────────────────────────────

interface UiStore {
  activePanel: PanelId;
  focusTarget: FocusTarget | null;
  /** DEV-only: multiplier applied to the 1 s tick interval. Default 1.0. */
  devTimeScale: number;
  collapsedInfoSections: Record<string, boolean>;
  dismissedProgressPrompts: Record<string, boolean>;
  panelStates: PanelStateMap;
  navigationHistory: NavigationHistoryEntry[];
  navigate(panelId: PanelId, focus?: FocusTarget): void;
  goBack(): void;
  restoreHistory(historyId: string): void;
  clearFocus(): void;
  setDevTimeScale(scale: number): void;
  setInfoSectionCollapsed(sectionId: string, collapsed: boolean): void;
  toggleInfoSection(sectionId: string): void;
  dismissProgressPrompt(promptId: string): void;
  restoreProgressPrompt(promptId: string): void;
  setPanelState<K extends PanelId>(panelId: K, nextState: Partial<PanelStateMap[K]>): void;
}

export const useUiStore = create<UiStore>((set) => ({
  activePanel: 'overview',
  focusTarget: null,
  devTimeScale: 1.0,
  collapsedInfoSections: loadCollapsedInfoSections(),
  dismissedProgressPrompts: loadDismissedProgressPrompts(),
  panelStates: DEFAULT_PANEL_STATES,
  navigationHistory: [],
  navigate: (panelId, focus) => set((state) => {
    const currentEntry = createHistoryEntry(
      state.activePanel,
      state.focusTarget,
      state.panelStates[state.activePanel],
    );
    const nextEntry = createHistoryEntry(panelId, focus ?? null, state.panelStates[panelId]);
    const lastEntry = state.navigationHistory[state.navigationHistory.length - 1] ?? null;
    const shouldPush = !routeEquals(currentEntry, nextEntry)
      && (!lastEntry || !routeEquals(lastEntry, currentEntry));

    return {
      activePanel: panelId,
      focusTarget: focus ?? null,
      navigationHistory: shouldPush
        ? [...state.navigationHistory, currentEntry].slice(-24)
        : state.navigationHistory,
    };
  }),
  goBack: () => set((state) => {
    if (state.navigationHistory.length === 0) return state;
    const previousEntry = state.navigationHistory[state.navigationHistory.length - 1];
    return {
      activePanel: previousEntry.panelId,
      focusTarget: previousEntry.focusTarget,
      panelStates: {
        ...state.panelStates,
        [previousEntry.panelId]: previousEntry.panelState,
      },
      navigationHistory: state.navigationHistory.slice(0, -1),
    };
  }),
  restoreHistory: (historyId) => set((state) => {
    const index = state.navigationHistory.findIndex(entry => entry.id === historyId);
    if (index < 0) return state;
    const targetEntry = state.navigationHistory[index];
    return {
      activePanel: targetEntry.panelId,
      focusTarget: targetEntry.focusTarget,
      panelStates: {
        ...state.panelStates,
        [targetEntry.panelId]: targetEntry.panelState,
      },
      navigationHistory: state.navigationHistory.slice(0, index),
    };
  }),
  clearFocus: () => set({ focusTarget: null }),
  setDevTimeScale: (scale) => set({ devTimeScale: scale }),
  setInfoSectionCollapsed: (sectionId, collapsed) => set((state) => {
    const next = { ...state.collapsedInfoSections, [sectionId]: collapsed };
    persistCollapsedInfoSections(next);
    return { collapsedInfoSections: next };
  }),
  toggleInfoSection: (sectionId) => set((state) => {
    const next = { ...state.collapsedInfoSections, [sectionId]: !state.collapsedInfoSections[sectionId] };
    persistCollapsedInfoSections(next);
    return { collapsedInfoSections: next };
  }),
  dismissProgressPrompt: (promptId) => set((state) => {
    const next = { ...state.dismissedProgressPrompts, [promptId]: true };
    persistDismissedProgressPrompts(next);
    return { dismissedProgressPrompts: next };
  }),
  restoreProgressPrompt: (promptId) => set((state) => {
    const next = { ...state.dismissedProgressPrompts };
    delete next[promptId];
    persistDismissedProgressPrompts(next);
    return { dismissedProgressPrompts: next };
  }),
  setPanelState: (panelId, nextState) => set((state) => ({
    panelStates: {
      ...state.panelStates,
      [panelId]: {
        ...state.panelStates[panelId],
        ...nextState,
      },
    },
  })),
}));
