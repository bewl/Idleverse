import { useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import { MINING_UPGRADES } from '@/game/systems/mining/mining.config';
import { MODIFIER_REGISTRY, type ModifierMeta } from '@/ui/tooltip/modifierRegistry';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ModifierSource {
  type: 'skill' | 'upgrade';
  id: string;
  name: string;
  level: number;
  maxLevel: number;
  /** Additive bonus this source contributes (e.g. 0.15 = +15%). */
  contribution: number;
}

export interface ModifierBreakdown {
  meta: ModifierMeta;
  /** Base value (1.0 for multipliers, 0 for additive modifiers). */
  baseValue: number;
  /** All skill and upgrade sources currently contributing. */
  sources: ModifierSource[];
  /** Sum of skill contributions. */
  skillBonus: number;
  /** Sum of upgrade contributions (note: mining-yield upgrades are multiplicative, not additive). */
  upgradeBonus: number;
  /** Effective total for display. For mining-yield: (1+skillBonus)×(1+upgradeBonus). For others: base+skillBonus+upgradeBonus. */
  total: number;
  /** Formatted effective label, e.g. '×1.35', '+12.0%', '+3'. */
  effectiveLabel: string;
  /** Skills/upgrades that could still improve this modifier (not at max level). */
  improvements: Array<{ type: 'skill' | 'upgrade'; id: string; name: string; level: number; maxLevel: number; bonusPerLevel: number }>;
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useModifierBreakdown(modifierKey: string): ModifierBreakdown {
  const skillLevels    = useGameStore(s => s.state.systems.skills.levels);
  const upgradelevels  = useGameStore(s => s.state.systems.mining.upgrades);
  const stateModifiers = useGameStore(s => s.state.modifiers);

  return useMemo(() => {
    const meta: ModifierMeta = MODIFIER_REGISTRY[modifierKey] ?? {
      key: modifierKey,
      label: modifierKey,
      description: '',
      unit: 'multiplier',
      baseValue: 1,
      affectedSystems: [],
      formula: '1 + bonuses',
    };

    const base = meta.baseValue;
    const sources: ModifierSource[] = [];

    // ── Skill contributions ─────────────────────────────────────────────
    for (const [skillId, def] of Object.entries(SKILL_DEFINITIONS)) {
      for (const effect of def.effects) {
        if (effect.modifier !== modifierKey) continue;
        const lvl = skillLevels[skillId] ?? 0;
        if (lvl === 0) continue;
        sources.push({
          type:         'skill',
          id:            skillId,
          name:          def.name,
          level:         lvl,
          maxLevel:      5,
          contribution:  effect.valuePerLevel * lvl,
        });
      }
    }

    // ── Upgrade contributions ───────────────────────────────────────────
    for (const [upgradeId, def] of Object.entries(MINING_UPGRADES)) {
      const perLevel = def.effects[modifierKey];
      if (!perLevel) continue;
      const lvl = upgradelevels[upgradeId] ?? 0;
      if (lvl === 0) continue;
      sources.push({
        type:         'upgrade',
        id:            upgradeId,
        name:          def.name,
        level:         lvl,
        maxLevel:      def.maxLevel,
        contribution:  perLevel * lvl,
      });
    }

    const skillBonus   = sources.filter(s => s.type === 'skill').reduce((sum, s) => sum + s.contribution, 0);
    const upgradeBonus = sources.filter(s => s.type === 'upgrade').reduce((sum, s) => sum + s.contribution, 0);

    // For mining-yield: upgrades are multiplicative with skills in the engine
    const isMiningYield = modifierKey === 'mining-yield';
    const total = isMiningYield
      ? (1 + skillBonus) * (1 + upgradeBonus)
      : base + skillBonus + upgradeBonus;

    // ── Format display label ────────────────────────────────────────────
    let effectiveLabel: string;
    if (meta.unit === 'multiplier') {
      effectiveLabel = `×${total.toFixed(2)}`;
    } else if (meta.unit === 'percent') {
      const pct = (skillBonus + upgradeBonus) * 100;
      effectiveLabel = pct > 0 ? `+${pct.toFixed(1)}%` : '0%';
    } else if (meta.unit === 'flat') {
      effectiveLabel = `+${(skillBonus + upgradeBonus).toFixed(0)}`;
    } else {
      effectiveLabel = `${total.toFixed(2)}s`;
    }

    // ── Improvable sources ──────────────────────────────────────────────
    const improvements: ModifierBreakdown['improvements'] = [];
    for (const [skillId, def] of Object.entries(SKILL_DEFINITIONS)) {
      for (const effect of def.effects) {
        if (effect.modifier !== modifierKey) continue;
        const lvl = skillLevels[skillId] ?? 0;
        if (lvl < 5) {
          improvements.push({ type: 'skill', id: skillId, name: def.name, level: lvl, maxLevel: 5, bonusPerLevel: effect.valuePerLevel });
        }
      }
    }
    for (const [upgradeId, def] of Object.entries(MINING_UPGRADES)) {
      const perLevel = def.effects[modifierKey];
      if (!perLevel) continue;
      const lvl = upgradelevels[upgradeId] ?? 0;
      if (lvl < def.maxLevel) {
        improvements.push({ type: 'upgrade', id: upgradeId, name: def.name, level: lvl, maxLevel: def.maxLevel, bonusPerLevel: perLevel });
      }
    }

    return { meta, baseValue: base, sources, skillBonus, upgradeBonus, total, effectiveLabel, improvements };
  }, [modifierKey, skillLevels, upgradelevels, stateModifiers]);
}
