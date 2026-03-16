/**
 * Dev / QA Admin Panel — DEVELOPMENT ONLY
 *
 * Gate: import.meta.env.DEV (Vite constant). Vite replaces this with `false` in
 * production builds, making the entire module dead code that the bundler removes.
 *
 * Toggle: Ctrl+` (backtick) — the de-facto game developer console key (Quake, Source,
 * Skyrim, etc.). A persistent "DEV" badge is also rendered top-right for mouse access.
 *
 * UX pattern: floating draggable panel with tabbed sections, rendered into document.body
 * via a portal so it escapes any parent z-index stacking context.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '@/stores/gameStore';
import {
  SKILL_DEFINITIONS,
  SKILL_CATEGORIES,
  SKILL_CATEGORY_LABELS,
} from '@/game/systems/skills/skills.config';
import {
  RESOURCE_REGISTRY,
  ORE_IDS,
  MINERAL_IDS,
  SHIP_RESOURCE_IDS,
} from '@/game/resources/resourceRegistry';
import {
  buildModifiersFromSkills,
  buildUnlocksFromSkills,
} from '@/game/systems/skills/skills.logic';
import { HULL_DEFINITIONS } from '@/game/systems/fleet/fleet.config';
import { generatePilot } from '@/game/systems/fleet/fleet.gen';
import type { GameState, SkillsState, ShipInstance } from '@/types/game.types';

// ─── Static data ────────────────────────────────────────────────────────────

const COMPONENT_IDS = [
  'hull-plate', 'thruster-node', 'condenser-coil',
  'sensor-cluster', 'mining-laser', 'shield-emitter',
];

const ALL_SYSTEM_UNLOCKS = [
  'system-mining', 'system-skills', 'system-manufacturing',
  'system-market', 'system-reprocessing', 'system-fleet',
];

const ALL_BELT_UNLOCKS = [
  'belt-ferrock', 'belt-corite', 'belt-silisite', 'belt-platonite',
  'belt-darkstone', 'belt-hematite', 'belt-voidite', 'belt-arkonite', 'belt-crokitite',
];

const ALL_RECIPE_UNLOCKS = [
  'recipe-ship-shuttle', 'recipe-ship-frigate', 'recipe-ship-mining-frigate',
  'recipe-ship-hauler', 'recipe-ship-destroyer', 'recipe-ship-exhumer',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFullSkillsState(levels: Record<string, number>): SkillsState {
  return { levels, activeSkillId: null, activeProgress: 0, queue: [] };
}

function applySkillsToState(
  s: GameState,
  levels: Record<string, number>,
  extraUnlocks: string[] = [],
): Partial<GameState> {
  const skillsState = buildFullSkillsState(levels);
  const mods = buildModifiersFromSkills(skillsState);
  const skillUnlocks = buildUnlocksFromSkills(skillsState);
  const unlocks: Record<string, boolean> = { ...s.unlocks, ...skillUnlocks };
  extraUnlocks.forEach(k => { unlocks[k] = true; });
  return {
    systems: { ...s.systems, skills: skillsState },
    modifiers: mods,
    unlocks,
  };
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

interface ScenarioDef {
  id: string;
  label: string;
  desc: string;
  color: string;
  build: (current: GameState) => Partial<GameState>;
}

const SCENARIOS: ScenarioDef[] = [
  {
    id: 'starter',
    label: 'New Capsuleer',
    desc: 'Mining Lv1, 5K ISK. Mirrors a freshly-created character.',
    color: '#22d3ee',
    build: (s) => {
      const levels = { mining: 1 };
      const patch = applySkillsToState(s, levels, ['system-mining', 'system-skills', 'belt-ferrock', 'belt-corite']);
      const resources = Object.fromEntries(Object.keys(s.resources).map(k => [k, 0]));
      resources['credits'] = 5_000;
      resources['ferrock']  = 500;
      resources['corite']   = 200;
      return { ...patch, resources };
    },
  },
  {
    id: 'mid',
    label: 'Rising Industrialist',
    desc: 'Core mining + trade + industry Lv3. Manufacturing & market unlocked. Moderate stockpile.',
    color: '#a78bfa',
    build: (s) => {
      const levels: Record<string, number> = {
        mining: 3, astrogeology: 2, science: 1,
        industry: 3, reprocessing: 1,
        trade: 1, 'spaceship-command': 1, frigate: 1,
      };
      const patch = applySkillsToState(s, levels, ['system-mining', 'system-skills']);
      const resources = Object.fromEntries(Object.keys(s.resources).map(k => [k, 0]));
      resources['credits'] = 500_000;
      ORE_IDS.slice(0, 4).forEach(id => { resources[id] = 5_000; });
      MINERAL_IDS.slice(0, 4).forEach(id => { resources[id] = 10_000; });
      return { ...patch, resources };
    },
  },
  {
    id: 'industrialist',
    label: 'Full Industrialist',
    desc: 'All mining + industry skills Lv5. 100K all ores & minerals, 1K components, 10M ISK.',
    color: '#fb923c',
    build: (s) => {
      const skillIds = [
        'mining', 'astrogeology', 'advanced-mining', 'mining-barge', 'drone-interfacing', 'ice-harvesting',
        'industry', 'advanced-industry', 'reprocessing', 'reprocessing-efficiency',
        'science', 'metallurgy', 'survey',
        'spaceship-command', 'frigate', 'mining-frigate', 'industrial',
        'trade', 'broker-relations', 'accounting',
        'electronics', 'cpu-management',
      ];
      const levels = Object.fromEntries(skillIds.map(id => [id, 5]));
      const allUnlocks = [...ALL_SYSTEM_UNLOCKS, ...ALL_BELT_UNLOCKS, ...ALL_RECIPE_UNLOCKS];
      const patch = applySkillsToState(s, levels, allUnlocks);
      const resources = Object.fromEntries(Object.keys(s.resources).map(k => [k, 0]));
      resources['credits'] = 10_000_000;
      ORE_IDS.forEach(id => { resources[id] = 100_000; });
      MINERAL_IDS.forEach(id => { resources[id] = 500_000; });
      COMPONENT_IDS.forEach(id => { resources[id] = 1_000; });
      return { ...patch, resources };
    },
  },
  {
    id: 'omega',
    label: 'Omega Capsuleer',
    desc: 'All skills Lv5. All unlocks. 100M ISK. 1M of every resource.',
    color: '#facc15',
    build: (s) => {
      const levels = Object.fromEntries(Object.keys(SKILL_DEFINITIONS).map(id => [id, 5]));
      const allUnlocks = [...ALL_SYSTEM_UNLOCKS, ...ALL_BELT_UNLOCKS, ...ALL_RECIPE_UNLOCKS];
      const patch = applySkillsToState(s, levels, allUnlocks);
      const resources: Record<string, number> = {};
      Object.keys(s.resources).forEach(k => { resources[k] = 1_000_000; });
      resources['credits'] = 100_000_000;
      return { ...patch, resources };
    },
  },
];

// ─── Shared micro-components ─────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: '#44403c', fontFamily: 'monospace', padding: '6px 0 2px',
      borderTop: '1px solid rgba(30,41,59,0.5)', marginTop: 4,
    }}>
      {children}
    </div>
  );
}

function InjectButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '2px 5px', fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
        border: '1px solid rgba(34,211,238,0.25)', borderRadius: 3,
        background: 'rgba(8,51,68,0.5)', color: '#67e8f9', cursor: 'pointer',
        transition: 'background 0.1s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(8,51,68,0.9)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(8,51,68,0.5)'; }}
    >
      {label}
    </button>
  );
}

// ─── Resources Tab ───────────────────────────────────────────────────────────

function ResourceRow({ id }: { id: string }) {
  const def = RESOURCE_REGISTRY[id];
  const amount = useGameStore(s => s.state.resources[id] ?? 0);

  const add = useCallback((n: number) => {
    useGameStore.setState(s => ({
      state: {
        ...s.state,
        resources: { ...s.state.resources, [id]: (s.state.resources[id] ?? 0) + n },
      },
    }));
  }, [id]);

  const set0 = useCallback(() => {
    useGameStore.setState(s => ({
      state: { ...s.state, resources: { ...s.state.resources, [id]: 0 } },
    }));
  }, [id]);

  if (!def) return null;

  const isCurrency = def.category === 'currency';
  const increments = isCurrency
    ? [10_000, 100_000, 1_000_000, 10_000_000]
    : [1_000, 10_000, 100_000, 1_000_000];

  function fmtIncrement(n: number) {
    if (n >= 1_000_000) return `+${n / 1_000_000}M`;
    if (n >= 1_000)    return `+${n / 1_000}K`;
    return `+${n}`;
  }

  function fmtAmount(n: number) {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000)    return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}>
      <span style={{ fontSize: 10, color: '#94a3b8', width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={def.name}>
        {def.name}
      </span>
      <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#64748b', width: 56, textAlign: 'right', flexShrink: 0 }}>
        {fmtAmount(amount)}
      </span>
      <div style={{ display: 'flex', gap: 2, marginLeft: 'auto', flexShrink: 0 }}>
        <button onClick={set0} style={{ padding: '1px 4px', fontSize: 8, fontFamily: 'monospace', border: '1px solid rgba(127,29,29,0.4)', borderRadius: 2, background: 'rgba(69,10,10,0.3)', color: '#f87171', cursor: 'pointer' }}>×0</button>
        {increments.map(n => (
          <InjectButton key={n} label={fmtIncrement(n)} onClick={() => add(n)} />
        ))}
      </div>
    </div>
  );
}

function ResourcesTab() {
  const injectAll = useCallback(() => {
    useGameStore.setState(s => {
      const r: Record<string, number> = { ...s.state.resources };
      [...ORE_IDS, ...MINERAL_IDS, ...COMPONENT_IDS, ...SHIP_RESOURCE_IDS].forEach(id => {
        r[id] = (r[id] ?? 0) + 50_000;
      });
      r['credits'] = (r['credits'] ?? 0) + 10_000_000;
      return { state: { ...s.state, resources: r } };
    });
  }, []);

  return (
    <div>
      <button
        onClick={injectAll}
        style={{
          width: '100%', padding: '5px 0', fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
          letterSpacing: '0.08em', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 4,
          background: 'rgba(120,53,15,0.3)', color: '#fbbf24', cursor: 'pointer', marginBottom: 2,
        }}
      >
        ⚡ INJECT +50K ALL RESOURCES + 10M ISK
      </button>

      <div style={{ fontSize: 8, color: '#44403c', fontFamily: 'monospace', marginBottom: 4 }}>
        Click column headers to sort. ×0 zeroes out.
      </div>

      {/* Currency */}
      <div style={{ marginBottom: 0 }}>
        <SectionLabel>Currency</SectionLabel>
        <ResourceRow id="credits" />
      </div>

      <SectionLabel>Highsec Ores</SectionLabel>
      {['ferrock', 'corite', 'silisite', 'platonite'].map(id => <ResourceRow key={id} id={id} />)}

      <SectionLabel>Lowsec Ores</SectionLabel>
      {['darkstone', 'hematite', 'voidite'].map(id => <ResourceRow key={id} id={id} />)}

      <SectionLabel>Nullsec Ores</SectionLabel>
      {['arkonite', 'crokitite'].map(id => <ResourceRow key={id} id={id} />)}

      <SectionLabel>Minerals</SectionLabel>
      {MINERAL_IDS.map(id => <ResourceRow key={id} id={id} />)}

      <SectionLabel>Components</SectionLabel>
      {COMPONENT_IDS.map(id => <ResourceRow key={id} id={id} />)}

      <SectionLabel>Ships</SectionLabel>
      {SHIP_RESOURCE_IDS.map(id => <ResourceRow key={id} id={id} />)}
    </div>
  );
}

// ─── Skills Tab ───────────────────────────────────────────────────────────────

function SkillsTab() {
  const levels = useGameStore(s => s.state.systems.skills.levels);

  const setSkillLevel = useCallback((skillId: string, level: number) => {
    useGameStore.setState(s => {
      const newLevels = { ...s.state.systems.skills.levels, [skillId]: level };
      const newSkillsState = buildFullSkillsState(newLevels);
      const newMods    = buildModifiersFromSkills(newSkillsState);
      const newUnlocks = buildUnlocksFromSkills(newSkillsState);
      return {
        state: {
          ...s.state,
          systems:   { ...s.state.systems, skills: newSkillsState },
          modifiers: newMods,
          unlocks:   { ...s.state.unlocks, ...newUnlocks },
        },
      };
    });
  }, []);

  const maxAll = useCallback(() => {
    useGameStore.setState(s => {
      const newLevels = Object.fromEntries(Object.keys(SKILL_DEFINITIONS).map(id => [id, 5]));
      const newSkillsState = buildFullSkillsState(newLevels);
      const newMods    = buildModifiersFromSkills(newSkillsState);
      const newUnlocks = buildUnlocksFromSkills(newSkillsState);
      const unlocks: Record<string, boolean> = { ...s.state.unlocks, ...newUnlocks };
      [...ALL_SYSTEM_UNLOCKS, ...ALL_BELT_UNLOCKS, ...ALL_RECIPE_UNLOCKS].forEach(k => { unlocks[k] = true; });
      return {
        state: {
          ...s.state,
          systems:   { ...s.state.systems, skills: newSkillsState },
          modifiers: newMods,
          unlocks,
        },
      };
    });
  }, []);

  const resetAll = useCallback(() => {
    useGameStore.setState(s => ({
      state: {
        ...s.state,
        systems:   { ...s.state.systems, skills: buildFullSkillsState({}) },
        modifiers: {},
      },
    }));
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button
          onClick={maxAll}
          style={{
            flex: 1, padding: '5px 0', fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
            letterSpacing: '0.06em', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 4,
            background: 'rgba(120,53,15,0.3)', color: '#fbbf24', cursor: 'pointer',
          }}
        >
          ⚡ MAX ALL (Lv5)
        </button>
        <button
          onClick={resetAll}
          style={{
            flex: 1, padding: '5px 0', fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
            letterSpacing: '0.06em', border: '1px solid rgba(127,29,29,0.35)', borderRadius: 4,
            background: 'rgba(69,10,10,0.2)', color: '#f87171', cursor: 'pointer',
          }}
        >
          RESET ALL (Lv0)
        </button>
      </div>

      {Object.entries(SKILL_CATEGORIES).map(([cat, skillIds]) => (
        <div key={cat}>
          <SectionLabel>{SKILL_CATEGORY_LABELS[cat]}</SectionLabel>
          {skillIds.map(skillId => {
            const def = SKILL_DEFINITIONS[skillId];
            const lv  = levels[skillId] ?? 0;
            return (
              <div key={skillId} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 0' }}>
                <span style={{
                  fontSize: 10, color: lv > 0 ? '#cbd5e1' : '#475569',
                  width: 116, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={def.description}>
                  {def.name}
                </span>
                <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                  {/* Level 0 button */}
                  <button
                    onClick={() => setSkillLevel(skillId, 0)}
                    style={{
                      width: 20, height: 18, fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
                      border: `1px solid ${lv === 0 ? 'rgba(148,163,184,0.5)' : 'rgba(30,41,59,0.6)'}`,
                      borderRadius: 2,
                      background: lv === 0 ? 'rgba(51,65,85,0.8)' : 'rgba(15,23,42,0.6)',
                      color: lv === 0 ? '#94a3b8' : '#334155',
                      cursor: 'pointer', transition: 'all 0.1s',
                    }}
                  >0</button>
                  {/* Levels 1–5 */}
                  {([1, 2, 3, 4, 5] as const).map(n => (
                    <button
                      key={n}
                      onClick={() => setSkillLevel(skillId, n)}
                      style={{
                        width: 20, height: 18, fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
                        border: `1px solid ${
                          lv === n ? 'rgba(34,211,238,0.6)' :
                          lv > n   ? 'rgba(34,211,238,0.2)' :
                                     'rgba(30,41,59,0.5)'
                        }`,
                        borderRadius: 2,
                        background: lv === n ? 'rgba(8,51,68,0.8)' : lv > n ? 'rgba(8,51,68,0.3)' : 'rgba(15,23,42,0.6)',
                        color: lv >= n ? '#22d3ee' : '#334155',
                        cursor: 'pointer', transition: 'all 0.1s',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Unlocks Tab ─────────────────────────────────────────────────────────────

const UNLOCK_GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: 'Systems',                ids: ALL_SYSTEM_UNLOCKS  },
  { label: 'Ore Belts',              ids: ALL_BELT_UNLOCKS    },
  { label: 'Manufacturing Recipes',  ids: ALL_RECIPE_UNLOCKS  },
];

function UnlocksTab() {
  const unlocks = useGameStore(s => s.state.unlocks);

  const toggle = useCallback((id: string) => {
    useGameStore.setState(s => ({
      state: { ...s.state, unlocks: { ...s.state.unlocks, [id]: !s.state.unlocks[id] } },
    }));
  }, []);

  const unlockAll = useCallback(() => {
    useGameStore.setState(s => {
      const all = { ...s.state.unlocks };
      [...ALL_SYSTEM_UNLOCKS, ...ALL_BELT_UNLOCKS, ...ALL_RECIPE_UNLOCKS].forEach(k => { all[k] = true; });
      return { state: { ...s.state, unlocks: all } };
    });
  }, []);

  const lockAll = useCallback(() => {
    useGameStore.setState(s => {
      const all = { ...s.state.unlocks };
      [...ALL_SYSTEM_UNLOCKS, ...ALL_BELT_UNLOCKS, ...ALL_RECIPE_UNLOCKS].forEach(k => { all[k] = false; });
      return { state: { ...s.state, unlocks: all } };
    });
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button onClick={unlockAll} style={{ flex: 1, padding: '5px 0', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, background: 'rgba(5,46,22,0.4)', color: '#4ade80', cursor: 'pointer' }}>
          UNLOCK ALL
        </button>
        <button onClick={lockAll} style={{ flex: 1, padding: '5px 0', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, border: '1px solid rgba(127,29,29,0.35)', borderRadius: 4, background: 'rgba(69,10,10,0.2)', color: '#f87171', cursor: 'pointer' }}>
          LOCK ALL
        </button>
      </div>

      {UNLOCK_GROUPS.map(({ label, ids }) => (
        <div key={label}>
          <SectionLabel>{label}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            {ids.map(id => {
              const active = !!unlocks[id];
              const shortLabel = id.replace(/^(system-|belt-|recipe-)/, '');
              return (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  title={id}
                  style={{
                    padding: '4px 6px', fontSize: 9, fontFamily: 'monospace', textAlign: 'left',
                    border: `1px solid ${active ? 'rgba(34,197,94,0.35)' : 'rgba(30,41,59,0.5)'}`,
                    borderRadius: 3,
                    background: active ? 'rgba(5,46,22,0.3)' : 'rgba(15,23,42,0.5)',
                    color: active ? '#4ade80' : '#475569',
                    cursor: 'pointer', transition: 'all 0.1s',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {active ? '▣' : '□'} {shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Scenarios Tab ────────────────────────────────────────────────────────────

function ScenariosTab() {
  const [applied, setApplied] = useState<string | null>(null);

  const apply = useCallback((scenario: ScenarioDef) => {
    // Always read fresh state at the moment the button is clicked
    const { state } = useGameStore.getState();
    const patch = scenario.build(state);
    useGameStore.setState(s => ({ state: { ...s.state, ...patch } }));
    setApplied(scenario.id);
    setTimeout(() => setApplied(null), 2500);
  }, []);

  return (
    <div>
      <p style={{ fontSize: 9, color: '#57534e', fontFamily: 'monospace', lineHeight: 1.5, marginBottom: 8 }}>
        Presets instantly reconfigure game state for testing specific progression stages.
        Saves are NOT automatically overwritten — click Save manually to persist.
      </p>

      {SCENARIOS.map(scenario => {
        const isApplied = applied === scenario.id;
        return (
          <div
            key={scenario.id}
            style={{
              marginBottom: 6, padding: '8px 10px', borderRadius: 5,
              border: `1px solid ${isApplied ? 'rgba(34,197,94,0.35)' : `${scenario.color}22`}`,
              background: isApplied ? 'rgba(5,46,22,0.2)' : 'rgba(15,23,42,0.5)',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: isApplied ? '#4ade80' : scenario.color }}>
                {scenario.label}
              </span>
              <button
                onClick={() => apply(scenario)}
                style={{
                  padding: '2px 10px', fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
                  border: `1px solid ${isApplied ? 'rgba(34,197,94,0.5)' : `${scenario.color}50`}`,
                  borderRadius: 3,
                  background: isApplied ? 'rgba(5,46,22,0.5)' : `${scenario.color}18`,
                  color: isApplied ? '#4ade80' : scenario.color,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {isApplied ? '✓ Applied' : 'Apply'}
              </button>
            </div>
            <p style={{ fontSize: 9, color: '#78716c', margin: 0, lineHeight: 1.4 }}>{scenario.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Fleet Tab ───────────────────────────────────────────────────────────────

function FleetTab() {
  const [withPilot, setWithPilot] = useState(true);
  const [lastSpawned, setLastSpawned] = useState<string | null>(null);

  const ships  = useGameStore(s => s.state.systems.fleet.ships);
  const system = useGameStore(s => s.state.galaxy.currentSystemId);

  const spawnShip = useCallback((hullId: string) => {
    const hull = HULL_DEFINITIONS[hullId];
    if (!hull) return;

    const ts = Date.now();
    const shipId = `dev-ship-${ts.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const ship: ShipInstance = {
      id: shipId,
      shipDefinitionId: hullId,
      customName: undefined,
      activity: 'idle',
      assignedPilotId: null,
      systemId: system,
      fittedModules: { high: [], mid: [], low: [] },
      deployedAt: ts,
      fleetOrder: null,
      fleetId: null,
      role: 'unassigned',
      hullDamage: 0,
    };

    useGameStore.setState(s => {
      const newFleet = { ...s.state.systems.fleet, ships: { ...s.state.systems.fleet.ships, [shipId]: ship } };
      let newPilots = s.state.systems.fleet.pilots;

      if (withPilot) {
        const pilotSeed = ts + Math.floor(Math.random() * 999983);
        const pilot = generatePilot(pilotSeed ^ 0xdeadbeef, pilotSeed);
        const pilotWithShip = { ...pilot, assignedShipId: shipId, status: 'active' as const };
        const shipWithPilot = { ...ship, assignedPilotId: pilot.id };
        newPilots = { ...newPilots, [pilot.id]: pilotWithShip };
        newFleet.ships = { ...newFleet.ships, [shipId]: shipWithPilot };
      }

      return { state: { ...s.state, systems: { ...s.state.systems, fleet: { ...newFleet, pilots: newPilots } } } };
    });

    setLastSpawned(hullId);
    setTimeout(() => setLastSpawned(null), 1800);
  }, [withPilot, system]);

  const spawnAll = useCallback(() => {
    Object.keys(HULL_DEFINITIONS).forEach(id => spawnShip(id));
  }, [spawnShip]);

  const purgeDevShips = useCallback(() => {
    useGameStore.setState(s => {
      const ships = { ...s.state.systems.fleet.ships };
      const pilots = { ...s.state.systems.fleet.pilots };
      Object.keys(ships).filter(id => id.startsWith('dev-ship-')).forEach(id => {
        const pilotId = ships[id].assignedPilotId;
        if (pilotId) delete pilots[pilotId];
        delete ships[id];
      });
      return { state: { ...s.state, systems: { ...s.state.systems, fleet: { ...s.state.systems.fleet, ships, pilots } } } };
    });
  }, []);

  const shipCount = Object.keys(ships).length;
  const devCount  = Object.keys(ships).filter(id => id.startsWith('dev-ship-')).length;

  return (
    <div>
      {/* Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#64748b' }}>
          Fleet: <span style={{ color: '#22d3ee' }}>{shipCount}</span> ships active
          {devCount > 0 && <span style={{ color: '#f59e0b' }}> ({devCount} dev)</span>}
        </span>
        {devCount > 0 && (
          <button
            onClick={purgeDevShips}
            style={{ padding: '2px 8px', fontSize: 8, fontFamily: 'monospace', fontWeight: 700, border: '1px solid rgba(127,29,29,0.4)', borderRadius: 3, background: 'rgba(69,10,10,0.3)', color: '#f87171', cursor: 'pointer' }}
          >
            PURGE DEV SHIPS
          </button>
        )}
      </div>

      {/* Options */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '5px 8px', border: '1px solid rgba(30,41,59,0.6)', borderRadius: 4, background: 'rgba(15,23,42,0.4)' }}>
        <button
          onClick={() => setWithPilot(v => !v)}
          style={{
            padding: '2px 8px', fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
            border: `1px solid ${withPilot ? 'rgba(34,211,238,0.4)' : 'rgba(30,41,59,0.5)'}`,
            borderRadius: 3,
            background: withPilot ? 'rgba(8,51,68,0.6)' : 'rgba(15,23,42,0.6)',
            color: withPilot ? '#22d3ee' : '#475569',
            cursor: 'pointer',
          }}
        >
          {withPilot ? '▣' : '□'} Auto-assign pilot
        </button>
        <span style={{ fontSize: 8, color: '#44403c', fontFamily: 'monospace' }}>pilots bypass hiring cost</span>
      </div>

      {/* Spawn all */}
      <button
        onClick={spawnAll}
        style={{
          width: '100%', padding: '5px 0', fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
          letterSpacing: '0.08em', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 4,
          background: 'rgba(120,53,15,0.3)', color: '#fbbf24', cursor: 'pointer', marginBottom: 8,
        }}
      >
        ⚡ SPAWN ONE OF EACH HULL
      </button>

      {/* Per-hull buttons */}
      <SectionLabel>Hull Types</SectionLabel>
      {Object.values(HULL_DEFINITIONS).map(hull => {
        const isSpawned = lastSpawned === hull.id;
        return (
          <div
            key={hull.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '5px 7px', marginBottom: 3, borderRadius: 4,
              border: `1px solid ${isSpawned ? 'rgba(34,211,238,0.35)' : 'rgba(30,41,59,0.5)'}`,
              background: isSpawned ? 'rgba(8,51,68,0.3)' : 'rgba(15,23,42,0.4)',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: isSpawned ? '#22d3ee' : '#cbd5e1' }}>{hull.name}</div>
              <div style={{ fontSize: 8, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                ⚔ {hull.baseCombatRating}  ⛏ {hull.baseMiningBonus}  ▣ {hull.moduleSlots.high}H/{hull.moduleSlots.mid}M/{hull.moduleSlots.low}L
              </div>
            </div>
            <button
              onClick={() => spawnShip(hull.id)}
              style={{
                padding: '3px 12px', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, flexShrink: 0,
                border: `1px solid ${isSpawned ? 'rgba(34,211,238,0.5)' : 'rgba(34,211,238,0.25)'}`,
                borderRadius: 3,
                background: isSpawned ? 'rgba(8,51,68,0.8)' : 'rgba(8,51,68,0.4)',
                color: '#22d3ee', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {isSpawned ? '✓' : 'SPAWN'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main DevPanel ─────────────────────────────────────────────────────────

type Tab = 'resources' | 'skills' | 'unlocks' | 'scenarios' | 'fleet';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'resources', label: 'Resources' },
  { id: 'skills',    label: 'Skills'    },
  { id: 'unlocks',   label: 'Unlocks'   },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'fleet',     label: 'Fleet'     },
];

interface DevPanelProps {
  open: boolean;
  onToggle: () => void;
}

export function DevPanel({ open, onToggle }: DevPanelProps) {
  const [tab,  setTab]    = useState<Tab>('resources');
  const [pos, setPos]   = useState({ x: 0, y: 0 });
  const posInitialised  = useRef(false);

  const dragging    = useRef(false);
  const dragOffset  = useRef({ x: 0, y: 0 });

  // Initialise position once (client-side only, avoids SSR issues)
  useEffect(() => {
    if (!posInitialised.current) {
      setPos({ x: Math.max(0, window.innerWidth - 360), y: 60 });
      posInitialised.current = true;
    }
  }, []);

  // Ctrl+` — same key used by Quake, Source Engine, Skyrim, most game consoles
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToggle]);

  // Drag-to-move
  const onHeaderMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return; // don't drag on close btn
    dragging.current   = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - 340, ev.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight -  60, ev.clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  const clearSave = useGameStore(s => s.clearSave);

  const handleReset = useCallback(() => {
    if (window.confirm('[DEV] Hard-reset game to initial state? This cannot be undone.')) {
      clearSave();
    }
  }, [clearSave]);

  return createPortal(
    <>


      {/* ── Floating panel ─────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: 'fixed', left: pos.x, top: pos.y, width: 340,
            maxHeight: '82vh', zIndex: 19999,
            display: 'flex', flexDirection: 'column',
            borderRadius: 7,
            border: '1px solid rgba(245,158,11,0.22)',
            background: 'rgba(6,9,20,0.97)',
            boxShadow: '0 0 0 1px rgba(245,158,11,0.04), 0 24px 64px rgba(0,0,0,0.85), 0 0 50px rgba(245,158,11,0.03)',
            backdropFilter: 'blur(18px)',
          }}
        >
          {/* Header / drag handle */}
          <div
            onMouseDown={onHeaderMouseDown}
            style={{
              padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(245,158,11,0.12)',
              background: 'rgba(120,53,15,0.12)', borderRadius: '7px 7px 0 0',
              cursor: 'grab', userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: '#f59e0b', fontFamily: 'monospace' }}>
                ◈ DEV CONSOLE
              </span>
              <span style={{ fontSize: 8, color: '#57534e', fontFamily: 'monospace' }}>
                Ctrl+` to toggle · drag to move
              </span>
            </div>
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => onToggle()}
              style={{ background: 'none', border: 'none', color: '#57534e', cursor: 'pointer', fontSize: 16, lineHeight: '1', padding: '0 2px' }}
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', padding: '5px 7px', gap: 3, borderBottom: '1px solid rgba(30,41,59,0.7)', flexShrink: 0 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.05em',
                  fontWeight: tab === t.id ? 700 : 500, textTransform: 'uppercase',
                  border: `1px solid ${tab === t.id ? 'rgba(245,158,11,0.4)' : 'rgba(30,41,59,0.55)'}`,
                  borderRadius: 3,
                  background: tab === t.id ? 'rgba(120,53,15,0.35)' : 'rgba(15,23,42,0.6)',
                  color: tab === t.id ? '#fbbf24' : '#475569',
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div style={{ overflowY: 'auto', padding: '6px 10px 10px', flex: 1 }}>
            {tab === 'resources' && <ResourcesTab />}
            {tab === 'skills'    && <SkillsTab    />}
            {tab === 'unlocks'   && <UnlocksTab   />}
            {tab === 'scenarios' && <ScenariosTab />}
            {tab === 'fleet'     && <FleetTab     />}
          </div>

          {/* Footer */}
          <div style={{
            padding: '5px 10px', borderTop: '1px solid rgba(30,41,59,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
          }}>
            <span style={{ fontSize: 8, color: '#292524', fontFamily: 'monospace' }}>
              DEV BUILD — not included in production
            </span>
            <button
              onClick={handleReset}
              style={{
                fontSize: 8, fontFamily: 'monospace', fontWeight: 700, padding: '2px 8px',
                border: '1px solid rgba(239,68,68,0.3)', borderRadius: 3,
                background: 'rgba(127,29,29,0.2)', color: '#f87171',
                cursor: 'pointer', letterSpacing: '0.08em',
              }}
            >
              RESET GAME
            </button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
