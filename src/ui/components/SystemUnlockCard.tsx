import { NavTag } from '@/ui/components/NavTag';
import { useGameStore } from '@/stores/gameStore';
import { useUiStore, type PanelId } from '@/stores/uiStore';
import { getTrainingEtaToLevel } from '@/game/progression/specializationAdvisor';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { formatTrainingEta } from '@/game/systems/skills/skills.logic';

import type { GameState } from '@/types/game.types';

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'] as const;

interface SystemUnlockCardProps {
  icon: string;
  title: string;
  skillId: string;
  targetLevel?: 1 | 2 | 3 | 4 | 5;
  summary: string;
  benefits: string[];
  accentColor: string;
  previewPanel?: PanelId;
  previewLabel?: string;
}

export function SystemUnlockCard({
  icon,
  title,
  skillId,
  targetLevel = 1,
  summary,
  benefits,
  accentColor,
  previewPanel,
  previewLabel,
}: SystemUnlockCardProps) {
  const state = useGameStore(s => s.state);
  const navigate = useUiStore(s => s.navigate);
  const def = SKILL_DEFINITIONS[skillId];
  const etaSeconds = getTrainingEtaToLevel(state, skillId, targetLevel);

  if (!def) return null;

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-xl border px-5 py-5 text-left"
      style={{
        background: 'linear-gradient(135deg, rgba(3,8,20,0.94) 0%, rgba(255,255,255,0.02) 100%)',
        borderColor: `${accentColor}44`,
        boxShadow: `0 0 20px ${accentColor}14`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
          style={{ background: `${accentColor}14`, border: `1px solid ${accentColor}33` }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accentColor }}>
            Locked System Preview
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-100 tracking-tight">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{summary}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700/30 bg-slate-950/50 px-3 py-3">
        <div className="text-[9px] uppercase tracking-widest text-slate-500">Unlock Requirement</div>
        <div className="mt-1 text-xs text-slate-300">
          Train <NavTag entityType="skill" entityId={skillId} label={`${def.name} ${ROMAN[targetLevel]}`} />
        </div>
        <div className="mt-1 text-[10px] font-mono" style={{ color: accentColor }}>
          ETA from current corp skills: {formatTrainingEta(etaSeconds)}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[9px] uppercase tracking-widest text-slate-500">Why It Matters</div>
        {benefits.map(benefit => (
          <div key={benefit} className="flex items-start gap-2 text-xs text-slate-300">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accentColor }} />
            <span>{benefit}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
          style={{ background: `${accentColor}1a`, border: `1px solid ${accentColor}33`, color: accentColor }}
          onClick={() => navigate('skills', { entityType: 'skill', entityId: skillId })}
        >
          Open Skill Queue
        </button>
        {previewPanel && (
          <button
            className="rounded-lg border border-slate-700/30 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-slate-600/50 hover:text-white"
            onClick={() => navigate(previewPanel)}
          >
            {previewLabel ?? 'Open Related Panel'}
          </button>
        )}
      </div>
    </div>
  );
}