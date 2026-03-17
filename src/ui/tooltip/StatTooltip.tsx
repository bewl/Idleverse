import React from 'react';
import { useModifierBreakdown } from '@/ui/hooks/useModifierBreakdown';
import { GameTooltip } from '@/ui/components/GameTooltip';
import { ThemedIcon } from '@/ui/components/ThemedIcon';

// ─── Types ─────────────────────────────────────────────────────────────────

interface StatTooltipProps {
  /** The modifier key (e.g. 'mining-yield') to look up in the registry. */
  modifierKey: string;
  /** The trigger element — what the user hovers/clicks on. */
  children: React.ReactNode;
  /** Optional extra class on the wrapper span. */
  className?: string;
}

// ─── Stat Sheet Content ─────────────────────────────────────────────────────

function StatSheet({ modifierKey }: { modifierKey: string }) {
  const bd = useModifierBreakdown(modifierKey);
  const { meta, sources, skillBonus, upgradeBonus, total, improvements } = bd;

  const isMiningYield = modifierKey === 'mining-yield';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: '#22d3ee', fontSize: 12, letterSpacing: '0.04em' }}>{meta.label}</div>
          <div style={{ fontSize: 10, color: '#475569', marginTop: 2, lineHeight: 1.4 }}>{meta.description}</div>
        </div>
      </div>

      {/* ── Effective value ── */}
      <div style={{
        background: 'rgba(34,211,238,0.07)',
        border: '1px solid rgba(34,211,238,0.18)',
        borderRadius: 5,
        padding: '6px 9px',
        marginBottom: 8,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.01em' }}>
          {meta.unit === 'multiplier' && `×${total.toFixed(2)}`}
          {meta.unit === 'percent' && `+${((skillBonus + upgradeBonus) * 100).toFixed(1)}%`}
          {meta.unit === 'flat' && `+${(skillBonus + upgradeBonus).toFixed(0)}`}
          {meta.unit === 'seconds' && `${total.toFixed(0)}s`}
        </div>
        <div style={{ fontSize: 9, color: '#334155', marginTop: 2 }}>{meta.formula}</div>
        {isMiningYield && sources.length > 0 && (
          <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
            ×{(1 + skillBonus).toFixed(2)} skill × ×{(1 + upgradeBonus).toFixed(2)} upgrades
          </div>
        )}
      </div>

      {/* ── Contributors ── */}
      {sources.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Contributors
          </div>
          {sources.map((src, i) => (
            <div key={`${src.id}-${i}`} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '2px 0',
              borderTop: i > 0 ? '1px solid rgba(15,23,42,0.7)' : undefined,
            }}>
              <span style={{ fontSize: 10, color: src.type === 'skill' ? '#a78bfa' : '#fb923c', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ThemedIcon icon={src.type === 'skill' ? 'skills' : 'tool'} size={11} tone={src.type === 'skill' ? '#a78bfa' : '#fb923c'} />
                {src.name}
              </span>
              <span style={{ fontSize: 10, color: '#64748b', letterSpacing: '-0.02em' }}>
                Lv{src.level}/{src.maxLevel}
                <span style={{ color: '#94a3b8', marginLeft: 4 }}>
                  +{(src.contribution * 100).toFixed(1)}%
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 10, color: '#1e293b', marginBottom: 8, textAlign: 'center', fontStyle: 'italic' }}>
          No active contributors
        </div>
      )}

      {/* ── Affects ── */}
      {meta.affectedSystems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Affects
          </div>
          {meta.affectedSystems.map((sys, i) => (
            <div key={i} style={{ fontSize: 10, color: '#475569', padding: '1px 0', display: 'flex', gap: 4 }}>
              <span style={{ color: '#1e3a3a' }}>→</span>
              <span>{sys}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── How to improve ── */}
      {improvements.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(15,23,42,0.7)', paddingTop: 6, marginTop: 2 }}>
          <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            How to improve
          </div>
          {improvements.slice(0, 3).map((imp, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#334155', padding: '1px 0' }}>
              <span style={{ color: imp.type === 'skill' ? '#6d28d9' : '#92400e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ThemedIcon icon={imp.type === 'skill' ? 'skills' : 'tool'} size={11} tone={imp.type === 'skill' ? '#6d28d9' : '#f59e0b'} />
                {imp.name} Lv{imp.level + 1}
              </span>
              <span style={{ color: '#1e3a3a' }}>+{(imp.bonusPerLevel * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Pin hint ── */}
      <div style={{ fontSize: 8, color: '#1e293b', textAlign: 'center', marginTop: 6, borderTop: '1px solid rgba(15,23,42,0.5)', paddingTop: 4 }}>
        Click to pin · ESC to close
      </div>
    </div>
  );
}

// ─── StatTooltip ────────────────────────────────────────────────────────────

export function StatTooltip({ modifierKey, children, className }: StatTooltipProps) {
  return (
    <GameTooltip content={<StatSheet modifierKey={modifierKey} />} pinnable width={300}>
      <span className={className} style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center' }}>
        {children}
      </span>
    </GameTooltip>
  );
}
