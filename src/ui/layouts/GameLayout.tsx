import { useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { StarField } from '@/ui/effects/StarField';
import { ResourceBar } from '@/ui/panels/ResourceBar';
import { MiningPanel } from '@/ui/panels/MiningPanel';
import { EnergyPanel } from '@/ui/panels/EnergyPanel';
import { ResearchPanel } from '@/ui/panels/ResearchPanel';
import { ManufacturingPanel } from '@/ui/panels/ManufacturingPanel';
import { PrestigePanel } from '@/ui/panels/PrestigePanel';
import { formatResourceAmount } from '@/game/resources/resourceRegistry';

type PanelId = 'mining' | 'energy' | 'research' | 'manufacturing' | 'prestige';

interface NavEntry {
  id: PanelId;
  label: string;
  unlockKey: string;
  icon: string;
}

const NAV: NavEntry[] = [
  { id: 'mining',         label: 'Asteroid Mining',   unlockKey: 'system-mining',         icon: '⛏' },
  { id: 'energy',         label: 'Energy Grid',        unlockKey: 'system-energy',         icon: '⚡' },
  { id: 'research',       label: 'Research Lab',       unlockKey: 'system-research',       icon: '🔬' },
  { id: 'manufacturing',  label: 'Manufacturing',      unlockKey: 'system-manufacturing',  icon: '🏭' },
  { id: 'prestige',       label: 'Timeline Prestige',  unlockKey: 'system-prestige',       icon: '♾' },
];

const PANELS: Record<PanelId, React.ReactNode> = {
  mining:        <MiningPanel />,
  energy:        <EnergyPanel />,
  research:      <ResearchPanel />,
  manufacturing: <ManufacturingPanel />,
  prestige:      <PrestigePanel />,
};

export function GameLayout() {
  const [activePanel, setActivePanel] = useState<PanelId>('mining');
  const unlocks = useGameStore(s => s.state.unlocks);
  const mastery = useGameStore(s => s.state.mastery);
  const saveToStorage = useGameStore(s => s.saveToStorage);
  const offlineSummary = useGameStore(s => s.offlineSummary);
  const dismissOfflineSummary = useGameStore(s => s.dismissOfflineSummary);

  const visibleNav = NAV.filter(n => unlocks[n.unlockKey]);

  return (
    <div className="flex flex-col h-screen overflow-hidden relative" style={{ zIndex: 1 }}>
      <StarField />
      {/* Top bar */}
      <div className="bg-space-800 border-b border-slate-700/60 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-cyan-400 font-bold tracking-widest text-sm uppercase">IDLEVERSE</span>
          <span className="text-slate-600 text-xs hidden sm:block">Galactic Civilization Simulator</span>
        </div>
        <button className="btn-secondary text-xs" onClick={saveToStorage}>Save</button>
      </div>

      {/* Resource bar */}
      <ResourceBar />

      {/* Offline summary banner */}
      {offlineSummary && (
        <div className="bg-violet-900/30 border-b border-violet-700/40 px-4 py-2 flex items-center justify-between gap-4 shrink-0">
          <div className="text-xs text-violet-300">
            <span className="font-bold">Welcome back!</span> {Math.floor(offlineSummary.elapsedSeconds / 60)}m of offline progress applied.
            {offlineSummary.wasCapped && ' (capped at 24h)'}
            {' '}Gained:&nbsp;
            {Object.entries(offlineSummary.resourcesGained)
              .slice(0, 4)
              .map(([id, amt]) => `${formatResourceAmount(amt, 1)} ${id}`)
              .join(', ')}
            {Object.keys(offlineSummary.resourcesGained).length > 4 && ' …'}
          </div>
          <button className="btn-secondary text-xs shrink-0" onClick={dismissOfflineSummary}>Dismiss</button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 shrink-0 bg-space-800 border-r border-slate-700/60 flex flex-col py-3 px-2 gap-1 overflow-y-auto">
          <div className="text-xs text-slate-600 uppercase tracking-widest px-2 mb-1">Systems</div>
          {visibleNav.map(n => {
            const masteryLevel = mastery[n.id]?.level ?? 1;
            return (
              <button
                key={n.id}
                className={activePanel === n.id ? 'nav-btn-active' : 'nav-btn'}
                onClick={() => setActivePanel(n.id)}
              >
                <span className="mr-1.5">{n.icon}</span>
                {n.label}
                <span className="ml-auto text-xs text-slate-600">Lv{masteryLevel}</span>
              </button>
            );
          })}
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl">
            {PANELS[activePanel]}
          </div>
        </div>
      </div>
    </div>
  );
}
