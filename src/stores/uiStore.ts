import { create } from 'zustand';

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

export type EntityType = 'fleet' | 'pilot' | 'ship' | 'skill' | 'resource' | 'system' | 'anomaly';

export type FocusTarget = { entityType: EntityType; entityId: string };

// ─── Store ─────────────────────────────────────────────────────────────────

interface UiStore {
  activePanel: PanelId;
  focusTarget: FocusTarget | null;
  /** DEV-only: multiplier applied to the 1 s tick interval. Default 1.0. */
  devTimeScale: number;
  navigate(panelId: PanelId, focus?: FocusTarget): void;
  clearFocus(): void;
  setDevTimeScale(scale: number): void;
}

export const useUiStore = create<UiStore>((set) => ({
  activePanel: 'overview',
  focusTarget: null,
  devTimeScale: 1.0,
  navigate: (panelId, focus) => set({ activePanel: panelId, focusTarget: focus ?? null }),
  clearFocus: () => set({ focusTarget: null }),
  setDevTimeScale: (scale) => set({ devTimeScale: scale }),
}));
