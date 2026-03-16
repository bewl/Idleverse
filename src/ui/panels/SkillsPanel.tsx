import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useUiStore, type PanelId } from '@/stores/uiStore';
import { SKILL_DEFINITIONS, SKILL_CATEGORIES, SKILL_CATEGORY_LABELS, SKILL_CATEGORY_ICONS } from '@/game/systems/skills/skills.config';
import {
  canTrainSkill,
  activeTrainingEta,
  formatTrainingEta,
  trainingSecondsForNextLevel,
} from '@/game/systems/skills/skills.logic';
import { skillTrainingSeconds } from '@/game/balance/constants';
import type { SkillCategory } from '@/types/game.types';
import { StarfieldBackground } from '@/ui/effects/StarfieldBackground';
import { StatTooltip } from '@/ui/tooltip/StatTooltip';
import { NavTag } from '@/ui/components/NavTag';
import { getTrainingEtaToLevel } from '@/ui/components/SystemUnlockCard';

// ─── Design tokens ─────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<SkillCategory, string> = {
  mining:       '#22d3ee', // cyan
  spaceship:    '#a78bfa', // violet
  industry:     '#fbbf24', // amber
  science:      '#34d399', // emerald
  electronics:  '#60a5fa', // blue
  trade:        '#fb7185', // rose
};

const TIER_CHIP = ['', 'I', 'II', 'III', 'IV', 'V'];

const RANK_LABEL: Record<number, string> = { 1: 'Rank I', 2: 'Rank II', 3: 'Rank III', 4: 'Rank IV', 5: 'Rank V' };

const PANEL_FOR_UNLOCK: Partial<Record<string, PanelId>> = {
  'system-manufacturing': 'manufacturing',
  'system-reprocessing': 'reprocessing',
  'system-market': 'market',
  'system-exploration': 'system',
};

const UNLOCK_LABELS: Partial<Record<string, string>> = {
  'system-manufacturing': 'Manufacturing system',
  'system-reprocessing': 'Reprocessing system',
  'system-market': 'Market system',
  'system-exploration': 'Exploration scanning',
  'recipe-ship-frigate': 'Frigate blueprint recipe',
  'recipe-ship-mining-frigate': 'Mining Frigate blueprint recipe',
  'recipe-ship-hauler': 'Hauler blueprint recipe',
  'recipe-ship-destroyer': 'Destroyer blueprint recipe',
  'combat-raid': 'Raid fleet order',
  'loot-relic-sites': 'Relic site access',
  'loot-data-sites': 'Data site access',
};

interface SkillPathCardDef {
  id: string;
  title: string;
  icon: string;
  accent: string;
  summary: string;
  skillId: string;
  targetLevel: 1 | 2 | 3 | 4 | 5;
  payoff: string;
  panelId: PanelId;
}

const SKILL_PATH_CARDS: SkillPathCardDef[] = [
  {
    id: 'mining',
    title: 'Mining Specialist',
    icon: '⛏',
    accent: '#22d3ee',
    summary: 'Scale raw extraction first, then push into richer belts and heavier mining hulls.',
    skillId: 'astrogeology',
    targetLevel: 1,
    payoff: 'Astrogeology is the first real yield and belt-quality multiplier after basic mining.',
    panelId: 'mining',
  },
  {
    id: 'industry',
    title: 'Industrial Builder',
    icon: '🏭',
    accent: '#fbbf24',
    summary: 'Turn ore into components, ships, and later research instead of selling everything raw.',
    skillId: 'industry',
    targetLevel: 1,
    payoff: 'Industry I is the shortest jump from starter mining into a compounding production loop.',
    panelId: 'manufacturing',
  },
  {
    id: 'trade',
    title: 'Trader / Logistician',
    icon: '📈',
    accent: '#fb7185',
    summary: 'Optimize liquidity first, then grow into route automation and escorted hauling.',
    skillId: 'trade',
    targetLevel: 1,
    payoff: 'Trade I opens the market immediately; Trade III turns that into automation.',
    panelId: 'market',
  },
  {
    id: 'combat',
    title: 'Fleet Operator',
    icon: '⚔',
    accent: '#a78bfa',
    summary: 'Move from passive fleet ownership into patrols, raids, doctrine choices, and route security.',
    skillId: 'spaceship-command',
    targetLevel: 2,
    payoff: 'Spaceship Command II is the first active operations breakpoint for patrol gameplay.',
    panelId: 'fleet',
  },
  {
    id: 'exploration',
    title: 'Explorer',
    icon: '⊕',
    accent: '#34d399',
    summary: 'Break away from the ore loop and start scanning for anomalies, then specialise into site access.',
    skillId: 'astrometrics',
    targetLevel: 1,
    payoff: 'Astrometrics I is the gate into scanning and a very different early-game rhythm.',
    panelId: 'system',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function totalQueueEta(
  levels: Record<string, number>,
  queue: Array<{ skillId: string; targetLevel: number }>,
  activeSkillId: string | null,
  activeProgress: number,
): number {
  let total = 0;
  // remaining active skill time
  if (activeSkillId) {
    const currentLv = levels[activeSkillId] ?? 0;
    const def = SKILL_DEFINITIONS[activeSkillId];
    if (def) {
      const needed = skillTrainingSeconds(def.rank, currentLv + 1);
      total += Math.max(0, needed - activeProgress);
    }
  }
  // queue entries
  const projectedLevels = { ...levels };
  if (activeSkillId) projectedLevels[activeSkillId] = (projectedLevels[activeSkillId] ?? 0) + 1;
  for (const entry of queue) {
    const startLv  = projectedLevels[entry.skillId] ?? 0;
    const targetLv = entry.targetLevel;
    const def = SKILL_DEFINITIONS[entry.skillId];
    if (!def) continue;
    for (let lv = startLv + 1; lv <= targetLv; lv++) {
      total += skillTrainingSeconds(def.rank, lv);
    }
    projectedLevels[entry.skillId] = targetLv;
  }
  return total;
}

function unlockLabel(unlockKey: string) {
  return UNLOCK_LABELS[unlockKey] ?? unlockKey.replace(/-/g, ' ');
}

function skillBestFor(skillId: string): string | null {
  const map: Partial<Record<string, string>> = {
    mining: 'Immediate ore income',
    astrogeology: 'Richer belt access and stronger extraction',
    'advanced-mining': 'Lowsec ore path',
    'mining-barge': 'Heavy mining hulls and haul speed',
    industry: 'Manufacturing entry point',
    reprocessing: 'Ore-to-mineral conversion',
    science: 'Research and exploration branch setup',
    astrometrics: 'Anomaly scanning',
    trade: 'Sale value and route economy',
    'broker-relations': 'High-volume market efficiency',
    'spaceship-command': 'Patrol and core ship operations',
    'military-operations': 'Raid capability',
    gunnery: 'Combat throughput',
    electronics: 'Sensor and fitting support',
    'cpu-management': 'Future fitting headroom',
  };
  return map[skillId] ?? null;
}

function skillOutcomeSummary(skillId: string): string {
  const def = SKILL_DEFINITIONS[skillId];
  if (!def) return '';
  if (def.unlocks?.includes('system-manufacturing')) return 'Unlocks a new production panel and turns minerals into components and ships.';
  if (def.unlocks?.includes('system-reprocessing')) return 'Unlocks ore refinement so mining output can feed industry or higher-value sales.';
  if (def.unlocks?.includes('system-market')) return 'Unlocks the market so raw output can turn into credits immediately.';
  if (def.unlocks?.includes('system-exploration')) return 'Unlocks scanning so fleets can chase anomalies instead of only fixed resource loops.';
  if (def.unlocks?.includes('combat-raid')) return 'Upgrades fleet combat from passive patrol capability into targeted raid operations.';
  if (def.category === 'mining') return 'Improves extraction throughput or unlocks the next mining tier.';
  if (def.category === 'trade') return 'Improves sale efficiency and sets up larger market or route play.';
  if (def.category === 'industry') return 'Improves industrial throughput and deepens the mine-to-build chain.';
  if (def.category === 'spaceship') return 'Improves hull capability, combat readiness, or fleet operations.';
  if (def.category === 'science') return 'Improves scanning, research, or resource intelligence.';
  return 'Supports a broader specialization path through modifiers and prerequisites.';
}

function PathGuideCard() {
  const state = useGameStore(s => s.state);
  const navigate = useUiStore(s => s.navigate);

  return (
    <div
      className="shrink-0 mx-4 mb-3 rounded-xl p-3 flex flex-col gap-3"
      style={{ background: 'rgba(3,8,20,0.68)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div>
        <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">Specialization Guide</div>
        <p className="text-slate-400 text-xs mt-1">Use this as a map of consequences, not a fixed order. Every path stays valid if you decide to pivot later.</p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-2">
        {SKILL_PATH_CARDS.map(card => {
          const eta = getTrainingEtaToLevel(state, card.skillId, card.targetLevel);
          const isReady = eta === 0;
          return (
            <button
              key={card.id}
              onClick={() => navigate(card.panelId, { entityType: 'skill', entityId: card.skillId })}
              className="rounded-lg border px-3 py-3 text-left transition-colors hover:bg-white/[0.03]"
              style={{ background: 'rgba(255,255,255,0.02)', borderColor: `${card.accent}2f` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: card.accent }}>
                    {card.icon} {card.title}
                  </div>
                  <div className="text-[11px] text-white font-semibold mt-1">{unlockLabel(card.skillId)} {TIER_CHIP[card.targetLevel]}</div>
                </div>
                <span className={`text-[8px] px-1.5 py-0.5 rounded border ${isReady ? 'text-emerald-300 border-emerald-500/30 bg-emerald-900/15' : 'text-amber-300 border-amber-500/30 bg-amber-900/15'}`}>
                  {isReady ? 'ready' : formatTrainingEta(eta)}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-2 leading-relaxed">{card.summary}</div>
              <div className="text-[10px] mt-2" style={{ color: card.accent }}>{card.payoff}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Queue ETA badge ───────────────────────────────────────────────────────

function QueueEtaBadge() {
  const skillsState = useGameStore(s => s.state.systems.skills);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const t = setInterval(() => forceUpdate(n => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const totalEta = totalQueueEta(
    skillsState.levels,
    skillsState.queue,
    skillsState.activeSkillId,
    skillsState.activeProgress,
  );
  const queueLen = skillsState.queue.length + (skillsState.activeSkillId ? 1 : 0);
  if (queueLen === 0) return null;

  return (
    <span className="text-[9px] font-mono text-cyan-600 px-2 py-0.5 rounded border border-cyan-800/40 bg-cyan-950/30">
      {queueLen} training · {formatTrainingEta(totalEta)} total
    </span>
  );
}

// ─── Skill pip row ─────────────────────────────────────────────────────────

function SkillPips({ level, pendingLevel, color }: { level: number; pendingLevel: number; color: string }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => {
        const filled  = i <= level;
        const pending = !filled && i <= pendingLevel;
        return (
          <div
            key={i}
            className={`h-2.5 w-2.5 rounded-sm ${pending ? 'animate-pulse' : ''}`}
            style={{
              background: filled  ? color
                        : pending ? `${color}55`
                        : 'rgba(255,255,255,0.08)',
              boxShadow: filled ? `0 0 4px ${color}88` : pending ? `0 0 4px ${color}44` : 'none',
              transition: 'background 0.3s, box-shadow 0.3s',
              border: pending ? `1px solid ${color}66` : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Active training card ──────────────────────────────────────────────────

function ActiveTrainingCard() {
  const skillsState = useGameStore(s => s.state.systems.skills);
  const [, forceUpdate] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    timerRef.current = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  if (!skillsState.activeSkillId) {
    return (
      <div
        className="rounded-lg border border-dashed border-slate-700/50 p-4 text-center"
        style={{ background: 'rgba(3,8,20,0.5)' }}
      >
        <p className="text-slate-500 text-sm">No skill training. Add skills to the queue below.</p>
      </div>
    );
  }

  const def      = SKILL_DEFINITIONS[skillsState.activeSkillId];
  const level    = (skillsState.levels[skillsState.activeSkillId] ?? 0) + 1;
  const total    = def ? skillTrainingSeconds(def.rank, level) : 1;
  const progress = skillsState.activeProgress;
  const pct      = Math.min(1, progress / total);
  const eta      = activeTrainingEta(skillsState);
  const color    = def ? CATEGORY_COLOR[def.category] : '#22d3ee';

  return (
    <div
      className="rounded-xl p-4 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, rgba(3,8,20,0.95) 0%, rgba(${
          color === '#22d3ee' ? '34,211,238' :
          color === '#a78bfa' ? '167,139,250' :
          color === '#fbbf24' ? '251,191,36' :
          color === '#34d399' ? '52,211,153' :
          color === '#60a5fa' ? '96,165,250' : '251,113,133'
        },0.07) 100%)`,
        border: `1px solid ${color}33`,
        boxShadow: `0 0 24px ${color}18`,
      }}
    >
      {/* shimmer overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${color}08 50%, transparent 100%)`,
          animation: 'flair-shimmer 4s linear infinite',
        }}
      />

      <div className="relative flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
              {SKILL_CATEGORY_ICONS[def?.category ?? 'mining']} Training
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
            >
              {RANK_LABEL[def?.rank ?? 1]}
            </span>
          </div>
          <h3 className="text-white font-bold text-base leading-tight">
            {def?.name ?? skillsState.activeSkillId}
          </h3>
          <p className="text-slate-400 text-xs mt-0.5">Level {TIER_CHIP[level - 1]} → Level {TIER_CHIP[level]}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-white font-mono text-sm font-bold" style={{ color }}>
            {formatTrainingEta(eta)}
          </div>
          <div className="text-slate-500 text-[10px] mt-0.5">{(pct * 100).toFixed(1)}% done</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct * 100}%`,
            background: `linear-gradient(90deg, ${color}bb, ${color})`,
            boxShadow: `0 0 8px ${color}66`,
          }}
        />
      </div>

      {/* Skill effects preview */}
      {def && def.effects.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {def.effects.map(e => (
            <span
              key={e.modifier}
              className="text-[10px] px-2 py-0.5 rounded-full font-mono"
              style={{ background: `${color}15`, color: `${color}cc`, border: `1px solid ${color}22` }}
            >
              +{(e.valuePerLevel * 100).toFixed(0)}% {e.modifier}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Queue list ────────────────────────────────────────────────────────────

function TrainingQueue() {
  const skillsState = useGameStore(s => s.state.systems.skills);
  const removeSkillFromQueue = useGameStore(s => s.removeSkillFromQueue);
  const clearSkillQueue = useGameStore(s => s.clearSkillQueue);

  const { queue, levels, activeSkillId, activeProgress } = skillsState;
  const totalEta = totalQueueEta(levels, queue, activeSkillId, activeProgress);

  // The active skill occupies queue[0] — hide it here since it's shown in ActiveTrainingCard
  const displayQueue = activeSkillId && queue[0]?.skillId === activeSkillId
    ? queue.slice(1)
    : queue;

  if (displayQueue.length === 0) {
    return (
      <div className="text-slate-600 text-xs text-center py-3">
        Queue is empty. Click a skill to add it.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400 text-xs">
          {displayQueue.length} skill{displayQueue.length !== 1 ? 's' : ''} • {formatTrainingEta(totalEta)} total
        </span>
        <button
          onClick={clearSkillQueue}
          className="text-[10px] text-slate-500 hover:text-rose-400 transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="space-y-1">
        {displayQueue.map((entry, i) => {
          const def   = SKILL_DEFINITIONS[entry.skillId];
          const color = def ? CATEGORY_COLOR[def.category] : '#22d3ee';
          // Find the real index in the original queue for removal
          const realIndex = queue.indexOf(entry);
          return (
            <div
              key={`${entry.skillId}-${entry.targetLevel}-${i}`}
              className="flex items-center justify-between px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] w-4 text-center text-slate-600">{i + 1}</span>
                <span className="text-white text-xs font-medium">{def?.name ?? entry.skillId}</span>
                <span className="text-[10px] font-mono" style={{ color }}>
                  → {TIER_CHIP[entry.targetLevel]}
                </span>
              </div>
              <button
                onClick={() => removeSkillFromQueue(realIndex)}
                className="text-slate-600 hover:text-rose-400 text-xs transition-colors px-1"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Single skill row ──────────────────────────────────────────────────────

function SkillRow({
  skillId,
  selected,
  onClick,
}: {
  skillId: string;
  selected: boolean;
  onClick: () => void;
}) {
  const state        = useGameStore(s => s.state);
  const def          = SKILL_DEFINITIONS[skillId];
  if (!def) return null;

  const level        = state.systems.skills.levels[skillId] ?? 0;
  const isTraining   = state.systems.skills.activeSkillId === skillId;
  const canTrain     = canTrainSkill(state, skillId);
  const color        = CATEGORY_COLOR[def.category];
  const isMaxed      = level >= 5;

  // Pending level for pip display
  const queueMax     = state.systems.skills.queue
    .filter(e => e.skillId === skillId)
    .reduce((max, e) => Math.max(max, e.targetLevel), 0);
  const pendingLevel = Math.max(level, isTraining ? level + 1 : 0, queueMax);

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 group"
      style={{
        background: selected
          ? `linear-gradient(135deg, ${color}18, ${color}08)`
          : isTraining
          ? `${color}10`
          : 'rgba(255,255,255,0.02)',
        border: selected
          ? `1px solid ${color}55`
          : isTraining
          ? `1px solid ${color}33`
          : '1px solid transparent',
        opacity: !canTrain && !isMaxed ? 0.45 : 1,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isTraining && (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
          )}
          <span
            className="text-sm font-medium truncate"
            style={{ color: isMaxed ? `${color}99` : canTrain ? 'white' : '#475569' }}
          >
            {def.name}
          </span>
          {isMaxed && (
            <span className="text-[9px] px-1 rounded font-mono shrink-0"
              style={{ background: `${color}22`, color }}>MAX</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SkillPips level={level} pendingLevel={pendingLevel} color={color} />
          <span className="text-[10px] text-slate-500 w-6 text-center font-mono">{RANK_LABEL[def.rank]}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Skill detail pane ─────────────────────────────────────────────────────

function SkillDetail({ skillId }: { skillId: string }) {
  const state        = useGameStore(s => s.state);
  const addSkillToQueue = useGameStore(s => s.addSkillToQueue);
  const navigate = useUiStore(s => s.navigate);
  const def          = SKILL_DEFINITIONS[skillId];
  if (!def) return null;

  const level        = state.systems.skills.levels[skillId] ?? 0;
  const canTrain     = canTrainSkill(state, skillId);
  const color        = CATEGORY_COLOR[def.category];

  // Compute pendingLevel: highest level already queued or actively training for this skill
  const skillsState  = state.systems.skills;
  const isActive     = skillsState.activeSkillId === skillId;
  const queueMax     = skillsState.queue
    .filter(e => e.skillId === skillId)
    .reduce((max, e) => Math.max(max, e.targetLevel), 0);
  const pendingLevel = Math.max(level, isActive ? level + 1 : 0, queueMax);

  const isMaxed      = pendingLevel >= 5;
  const isFullyDone  = level >= 5; // actually completed, not just queued

  const trainingTimes = [1, 2, 3, 4, 5].map(lv => ({
    lv,
    seconds:  skillTrainingSeconds(def.rank, lv),
    unlocked: lv <= level,
    queued:   lv > level && lv <= pendingLevel,
    next:     lv === pendingLevel + 1,
  }));

  return (
    <div
      className="rounded-xl p-4 h-full min-h-0 flex flex-col gap-4 overflow-y-auto"
      style={{
        background: `linear-gradient(160deg, rgba(3,8,20,0.98) 0%, ${color}06 100%)`,
        border: `1px solid ${color}25`,
      }}
    >
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color }}>
            {SKILL_CATEGORY_ICONS[def.category]} {SKILL_CATEGORY_LABELS[def.category]}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-slate-400"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {RANK_LABEL[def.rank]}
          </span>
        </div>
        <h2 className="text-white font-bold text-lg leading-tight">{def.name}</h2>
        <p className="text-slate-400 text-sm mt-1 leading-relaxed">{def.description}</p>
        <div className="mt-2 rounded-lg border border-slate-700/25 bg-slate-950/45 px-3 py-2">
          <div className="text-[9px] uppercase tracking-widest text-slate-500">Outcome</div>
          <div className="text-xs text-slate-300 mt-1">{skillOutcomeSummary(skillId)}</div>
          {skillBestFor(skillId) && (
            <div className="text-[10px] mt-1" style={{ color }}>
              Best for: {skillBestFor(skillId)}
            </div>
          )}
        </div>
      </div>

      {/* Current level */}
      <div className="flex items-center gap-3">
        <SkillPips level={level} pendingLevel={pendingLevel} color={color} />
        <span className="text-slate-300 text-sm">
          {isFullyDone ? (
            <span style={{ color }}>Fully trained</span>
          ) : pendingLevel > level ? (
            <>
              Level <strong style={{ color }}>{level}</strong>
              <span className="text-slate-500 mx-1">→</span>
              <strong style={{ color }}>{pendingLevel}</strong>
              <span className="text-[10px] text-slate-500 ml-1 font-mono">(queued)</span>
            </>
          ) : (
            <>Level <strong style={{ color }}>{level}</strong> / 5</>
          )}
        </span>
      </div>

      {/* Effects */}
      {def.effects.length > 0 && (
        <div>
          <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1.5">Per level</p>
          <div className="space-y-1">
            {def.effects.map(e => (
              <div key={e.modifier} className="flex items-center gap-2">
                <span className="text-xs font-mono" style={{ color }}>
                  +{(e.valuePerLevel * 100).toFixed(0)}%
                </span>
                <StatTooltip modifierKey={e.modifier}>
                  <span className="text-slate-300 text-xs border-b border-dotted border-slate-700">{e.modifier.replace(/-/g, ' ')}</span>
                </StatTooltip>
                {level > 0 && (
                  <span className="text-[10px] text-slate-500 font-mono ml-auto">
                    now: +{(e.valuePerLevel * level * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unlocks */}
      {def.unlocks && def.unlocks.length > 0 && (
        <div>
          <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1.5">Unlocks at Lv1</p>
          <div className="flex flex-wrap gap-1.5">
            {def.unlocks.map(u => (
              PANEL_FOR_UNLOCK[u] ? (
                <button
                  key={u}
                  onClick={() => navigate(PANEL_FOR_UNLOCK[u]!, { entityType: 'skill', entityId: skillId })}
                  className="text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors hover:bg-white/[0.05]"
                  style={{ background: `${color}15`, color, border: `1px solid ${color}33` }}
                >
                  {unlockLabel(u)}
                </button>
              ) : (
                <span key={u} className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                  style={{ background: `${color}15`, color, border: `1px solid ${color}33` }}>
                  {unlockLabel(u)}
                </span>
              )
            ))}
          </div>
        </div>
      )}

      {/* Prerequisites */}
      {def.prerequisiteSkills && Object.keys(def.prerequisiteSkills).length > 0 && (
        <div>
          <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1.5">Prerequisites</p>
          <div className="space-y-1">
            {Object.entries(def.prerequisiteSkills).map(([req, minLv]) => {
              const reqDef = SKILL_DEFINITIONS[req];
              const reqLv  = state.systems.skills.levels[req] ?? 0;
              const met    = reqLv >= minLv;
              return (
                <div key={req} className="flex items-center gap-2">
                  <span className={`text-xs font-mono ${met ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {met ? '✓' : '✗'}
                  </span>
                  <NavTag entityType="skill" entityId={req} label={reqDef?.name ?? req} />
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${met ? 'text-emerald-400 border-emerald-800/40 bg-emerald-900/10' : 'text-rose-400 border-rose-800/40 bg-rose-900/10'}`}>
                    Lv {minLv}
                  </span>
                  <span className="text-slate-600 text-xs font-mono ml-auto">
                    ({reqLv}/{minLv})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Training time ladder */}
      <div>
        <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1.5">Training times</p>
        <div className="grid grid-cols-5 gap-1">
          {trainingTimes.map(({ lv, seconds, unlocked, queued, next }) => (
            <div
              key={lv}
              className="flex flex-col items-center py-1.5 px-1 rounded-lg"
              style={{
                background: unlocked
                  ? `${color}18`
                  : queued
                  ? `${color}0d`
                  : next
                  ? `${color}08`
                  : 'rgba(255,255,255,0.03)',
                border: queued
                  ? `1px solid ${color}44`
                  : next
                  ? `1px dashed ${color}33`
                  : `1px solid rgba(255,255,255,0.05)`,
              }}
            >
              <span className="text-[9px] font-bold mb-0.5" style={{
                color: unlocked ? color : queued ? `${color}99` : '#475569',
              }}>
                {TIER_CHIP[lv]}
                {queued && <span className="ml-0.5 opacity-60">⏳</span>}
              </span>
              <span className="text-[9px] text-center text-slate-400 leading-tight font-mono">
                {formatTrainingEta(seconds)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Train button(s) */}
      {!isMaxed && canTrain && (
        <div className="mt-auto flex flex-wrap gap-2">
          {Array.from({ length: 5 - pendingLevel }, (_, i) => pendingLevel + 1 + i)
            .map(targetLv => (
            <button
              key={targetLv}
              onClick={() => addSkillToQueue(skillId, targetLv as 1 | 2 | 3 | 4 | 5)}
              className="flex-1 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: targetLv === pendingLevel + 1
                  ? `linear-gradient(135deg, ${color}44, ${color}33)`
                  : `${color}18`,
                border: `1px solid ${color}${targetLv === pendingLevel + 1 ? '66' : '33'}`,
                color,
                boxShadow: targetLv === pendingLevel + 1 ? `0 0 12px ${color}33` : 'none',
              }}
            >
              Train to {TIER_CHIP[targetLv]}
            </button>
          ))}
        </div>
      )}

      {!canTrain && !isMaxed && (
        <div
          className="mt-auto py-2 px-3 rounded-lg text-xs text-slate-500 text-center"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          Prerequisites not met
        </div>
      )}
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────

export function SkillsPanel() {
  const [activeCategory, setActiveCategory] = useState<SkillCategory>('mining');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(
    () => SKILL_CATEGORIES['mining']?.[0] ?? null
  );

  const focusTarget = useUiStore(s => s.focusTarget);
  const clearFocus  = useUiStore(s => s.clearFocus);

  useEffect(() => {
    if (focusTarget?.entityType !== 'skill') return;
    const skillId = focusTarget.entityId;
    const cat = (Object.entries(SKILL_CATEGORIES) as [SkillCategory, string[]][]).find(([, ids]) => ids.includes(skillId))?.[0];
    if (cat) setActiveCategory(cat);
    setSelectedSkillId(skillId);
    clearFocus();
  }, [focusTarget, clearFocus]);

  const categorySkills = SKILL_CATEGORIES[activeCategory] ?? [];

  return (
    <div
      data-skills-panel
      className="relative flex flex-col h-full overflow-hidden"
      style={{ minHeight: '520px' }}
    >
      <StarfieldBackground />

      <div className="relative z-10 flex flex-col h-full overflow-y-auto pb-20 lg:pb-0">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="shrink-0 px-4 pt-4 pb-3">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h1
              className="text-cyan-400 font-bold text-xs uppercase tracking-widest"
              style={{ textShadow: '0 0 14px rgba(34,211,238,0.45)' }}
            >
              ⚡ Skill Queue
            </h1>
            <QueueEtaBadge />
          </div>
          <p className="text-slate-500 text-xs">
            Skills train in real time, even offline. Use the guide below to compare paths by payoff instead of reading the tree as one required order.
          </p>
        </div>

        {/* ── Active training ──────────────────────────────────────────── */}
        <div className="shrink-0 px-4 pb-3">
          <ActiveTrainingCard />
        </div>

        <PathGuideCard />

        {/* ── Queue ────────────────────────────────────────────────────── */}
        <div
          className="shrink-0 mx-4 mb-3 rounded-xl p-3"
          style={{ background: 'rgba(3,8,20,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <TrainingQueue />
        </div>

        {/* ── Skill browser ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col lg:flex-row gap-3 px-4 pb-4 min-h-0">

          {/* Left: categories + skill list */}
          <div className="lg:w-64 flex flex-col gap-2 shrink-0">

            {/* Category tabs */}
            <div className="grid grid-cols-3 gap-1">
              {(Object.keys(SKILL_CATEGORIES) as SkillCategory[]).map(cat => {
                const isActive = cat === activeCategory;
                const color    = CATEGORY_COLOR[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => { setActiveCategory(cat); setSelectedSkillId(SKILL_CATEGORIES[cat]?.[0] ?? null); }}
                    className="py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-150 text-center"
                    style={{
                      background: isActive ? `${color}22` : 'rgba(255,255,255,0.03)',
                      border: isActive ? `1px solid ${color}44` : '1px solid rgba(255,255,255,0.06)',
                      color: isActive ? color : '#475569',
                      boxShadow: isActive ? `0 0 8px ${color}22` : 'none',
                    }}
                  >
                    {SKILL_CATEGORY_ICONS[cat]}
                    <span className="block mt-0.5">{SKILL_CATEGORY_LABELS[cat].split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>

            {/* Skill list */}
            <div
              className="flex-1 rounded-xl overflow-y-auto"
              style={{ background: 'rgba(3,8,20,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="p-2 space-y-0.5">
                <p className="text-[10px] uppercase tracking-widest text-slate-600 px-1 py-1 font-bold">
                  {SKILL_CATEGORY_ICONS[activeCategory]} {SKILL_CATEGORY_LABELS[activeCategory]}
                </p>
                {categorySkills.map(id => (
                  <SkillRow
                    key={id}
                    skillId={id}
                    selected={selectedSkillId === id}
                    onClick={() => setSelectedSkillId(id === selectedSkillId ? null : id)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: skill detail */}
          <div className="flex-1 min-w-0 min-h-0">
            {selectedSkillId ? (
              <SkillDetail skillId={selectedSkillId} />
            ) : (
              <div
                className="h-full flex items-center justify-center rounded-xl"
                style={{ background: 'rgba(3,8,20,0.5)', border: '1px dashed rgba(255,255,255,0.08)' }}
              >
                <p className="text-slate-600 text-sm text-center px-8">
                  Select a skill to view details<br />and add it to your training queue
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
