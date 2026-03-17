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
import { DevPanel } from '@/ui/dev/DevPanel';
import StarMapPanel from '@/ui/panels/StarMapPanel';
import { SystemPanel } from '@/ui/panels/SystemPanel';
import { ThemedIcon } from '@/ui/components/ThemedIcon';
import { formatResourceAmount, RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { getSystemById } from '@/game/galaxy/galaxy.gen';

interface NavEntry {
  id: PanelId;
  label: string;
  short: string;
  unlockKey: string;
  icon: string;
}

const NAV: NavEntry[] = [
  { id: 'overview',       label: 'Overview',        short: 'Home',   unlockKey: 'system-mining',        icon: '📊' },
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
  const navigationHistory = useUiStore(s => s.navigationHistory);
  const panelStates = useUiStore(s => s.panelStates);
  const focusTarget = useUiStore(s => s.focusTarget);
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [devOpen,     setDevOpen]       = useState(false);
  const state               = useGameStore(s => s.state);
  const unlocks             = useGameStore(s => s.state.unlocks);
  const saveToStorage       = useGameStore(s => s.saveToStorage);
  const audioEnabled        = useGameStore(s => s.state.settings.audioEnabled);
  const masterVolume        = useGameStore(s => s.state.settings.masterVolume);
  const setAudioEnabled     = useGameStore(s => s.setAudioEnabled);
  const setMasterVolume     = useGameStore(s => s.setMasterVolume);
  const offlineSummary      = useGameStore(s => s.offlineSummary);
  const dismissOfflineSummary = useGameStore(s => s.dismissOfflineSummary);
  const didRouteSoundMount = useRef(false);

  const visibleNav = NAV.filter(n => unlocks[n.unlockKey]);
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
    if (!didRouteSoundMount.current) {
      didRouteSoundMount.current = true;
      return;
    }
    playUiNavigate();
  }, [activePanel, focusTarget?.entityId, focusTarget?.entityType]);

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

  return (
    <div
      className="flex flex-col overflow-hidden relative"
      style={{ height: '100dvh', zIndex: 1 }}
    >
      <StarField />

      {/* ── Top bar ── */}
      <div
        className="shrink-0 flex items-center justify-between px-3 sm:px-4 py-2"
        style={{
          background: 'rgba(3, 5, 14, 0.97)',
          borderBottom: '1px solid rgba(22, 30, 52, 0.8)',
          boxShadow: 'inset 0 -1px 0 rgba(34, 211, 238, 0.04)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Desktop sidebar toggle */}
          <button
            className="hidden lg:flex sidebar-collapse-btn"
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <span className="text-[11px]">
              {sidebarOpen ? '‹' : '›'}
            </span>
          </button>
          <span className="text-cyan-400 font-bold tracking-widest text-sm uppercase title-glow select-none">
            IDLEVERSE
          </span>
          <span className="text-slate-700 text-[10px] hidden sm:block tracking-wider select-none">
            Galactic Civilization Simulator
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 rounded border border-slate-700/40 bg-slate-950/50 px-2 py-1">
            <button
              className={`text-xs font-semibold transition-colors ${audioEnabled ? 'text-cyan-300 hover:text-cyan-200' : 'text-slate-500 hover:text-slate-300'}`}
              onClick={handleToggleAudio}
              title={audioEnabled ? 'Mute audio' : 'Enable audio'}
            >
              {audioEnabled ? 'SFX ON' : 'SFX OFF'}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(masterVolume * 100)}
              onChange={e => handleMasterVolumeChange(Number(e.target.value) / 100)}
              onPointerDown={() => { void unlockAudio(); }}
              className="h-1 w-20 accent-cyan-400"
              title={`Master volume: ${Math.round(masterVolume * 100)}%`}
            />
          </div>
          <button
            className={`sm:hidden btn-secondary text-xs py-1 px-2 ${audioEnabled ? 'text-cyan-300' : 'text-slate-500'}`}
            onClick={handleToggleAudio}
            title={audioEnabled ? 'Mute audio' : 'Enable audio'}
          >
            <ThemedIcon icon={audioEnabled ? 'audio-on' : 'audio-off'} size={15} tone={audioEnabled ? '#67e8f9' : '#64748b'} interactive />
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
          <button className="btn-secondary text-xs py-1 px-3" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>

      {/* ── Resource / status bar ── */}
      <ResourceBar />

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
      <div className="flex flex-1 overflow-hidden">

        {/* Desktop sidebar — hidden on mobile */}
        {sidebarOpen && (
          <aside
            className="hidden lg:flex w-52 shrink-0 flex-col py-3 px-2 gap-0.5 overflow-y-auto"
            style={{
              background: 'rgba(3, 5, 16, 0.95)',
              borderRight: '1px solid rgba(22, 30, 52, 0.8)',
            }}
          >
            <div className="text-[9px] text-slate-700 uppercase tracking-widest px-2 mb-2 select-none">
              Systems
            </div>
            {visibleNav.map(n => {
              const isActive     = activePanel === n.id;
              return (
                <button
                  key={n.id}
                  className={isActive ? 'nav-btn-active' : 'nav-btn'}
                  onClick={() => navigate(n.id)}
                >
                  <span className="mr-2 inline-flex items-center justify-center"><ThemedIcon icon={n.icon} size={16} tone={isActive ? '#67e8f9' : '#94a3b8'} interactive /></span>
                  <span className="flex-1 text-left">{n.label}</span>
                </button>
              );
            })}
          </aside>
        )}

        {/* Panel content — full width with responsive max-width */}
        <main className={`flex-1 overscroll-contain ${['starmap', 'system', 'fleet', 'skills'].includes(activePanel) ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {(['starmap', 'system', 'fleet', 'skills'] as PanelId[]).includes(activePanel) ? (
            <div style={{ height: '100%' }}>{PANELS[activePanel]}</div>
          ) : (
            /* pb-20 on mobile so bottom nav doesn't clip content */
            <div className="p-3 sm:p-4 lg:p-5 pb-20 lg:pb-6 w-full">
              {PANELS[activePanel]}
            </div>
          )}
        </main>
      </div>

      {/* ── Dev Admin Panel — removed from production builds by Vite ── */}
      {import.meta.env.DEV && <DevPanel open={devOpen} onToggle={() => setDevOpen(o => !o)} />}

      {/* ── Mobile bottom navigation — hidden lg+ ── */}
      <nav className="lg:hidden shrink-0 mob-nav flex items-stretch" style={{ zIndex: 50 }}>
        {visibleNav.map(n => {
          const isActive = activePanel === n.id;
          return (
            <button
              key={n.id}
              className={isActive ? 'mob-nav-btn mob-nav-active' : 'mob-nav-btn'}
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
    </div>
  );
}
