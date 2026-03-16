import { useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useUiStore, type PanelId } from '@/stores/uiStore';
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
import { formatResourceAmount } from '@/game/resources/resourceRegistry';

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

export function GameLayout() {
  const activePanel = useUiStore(s => s.activePanel);
  const navigate    = useUiStore(s => s.navigate);
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [devOpen,     setDevOpen]       = useState(false);
  const unlocks             = useGameStore(s => s.state.unlocks);
  const saveToStorage       = useGameStore(s => s.saveToStorage);
  const offlineSummary      = useGameStore(s => s.offlineSummary);
  const dismissOfflineSummary = useGameStore(s => s.dismissOfflineSummary);

  const visibleNav = NAV.filter(n => unlocks[n.unlockKey]);

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
          {import.meta.env.DEV && (
            <button
              onClick={() => setDevOpen(o => !o)}
              title="Dev Admin Panel — Ctrl+`"
              className={devOpen ? 'btn-secondary text-xs py-1 px-2 border-amber-600/50 text-amber-400' : 'btn-secondary text-xs py-1 px-2 text-slate-600'}
            >
              DEV
            </button>
          )}
          <button className="btn-secondary text-xs py-1 px-3" onClick={saveToStorage}>
            Save
          </button>
        </div>
      </div>

      {/* ── Resource / status bar ── */}
      <ResourceBar />

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
                  <span className="mr-2 text-sm">{n.icon}</span>
                  <span className="flex-1 text-left">{n.label}</span>
                </button>
              );
            })}
          </aside>
        )}

        {/* Panel content — full width with responsive max-width */}
        <main className={`flex-1 overscroll-contain ${activePanel === 'starmap' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {activePanel === 'starmap' ? (
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
              <span className="text-lg leading-none">{n.icon}</span>
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
