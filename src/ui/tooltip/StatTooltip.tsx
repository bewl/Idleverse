import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useModifierBreakdown } from '@/ui/hooks/useModifierBreakdown';

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

function StatSheet({
  modifierKey,
  pinned,
  onClose,
}: {
  modifierKey: string;
  pinned: boolean;
  onClose: () => void;
}) {
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
        {pinned && (
          <button
            onMouseDown={(e) => { e.stopPropagation(); onClose(); }}
            style={{ color: '#475569', fontSize: 16, lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none', padding: '0 0 0 8px', alignSelf: 'flex-start', flexShrink: 0 }}
            title="Close"
          >
            ×
          </button>
        )}
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
              <span style={{ fontSize: 10, color: src.type === 'skill' ? '#a78bfa' : '#fb923c', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 8 }}>{src.type === 'skill' ? '⚡' : '🔧'}</span>
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
              <span style={{ color: imp.type === 'skill' ? '#6d28d9' : '#92400e' }}>
                {imp.type === 'skill' ? '⚡' : '🔧'} {imp.name} Lv{imp.level + 1}
              </span>
              <span style={{ color: '#1e3a3a' }}>+{(imp.bonusPerLevel * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Pin hint ── */}
      {!pinned && (
        <div style={{ fontSize: 8, color: '#1e293b', textAlign: 'center', marginTop: 6, borderTop: '1px solid rgba(15,23,42,0.5)', paddingTop: 4 }}>
          Click to pin
        </div>
      )}
    </div>
  );
}

// ─── StatTooltip ────────────────────────────────────────────────────────────

export function StatTooltip({ modifierKey, children, className }: StatTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [visible, setVisible] = useState(false);
  const [pinned,  setPinned]  = useState(false);
  const [pos,     setPos]     = useState({ top: 0, left: 0 });

  // ── Position calculator ─────────────────────────────────────────────────
  const computePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect  = triggerRef.current.getBoundingClientRect();
    const vpW   = window.innerWidth;
    const vpH   = window.innerHeight;
    const TW    = 300;  // estimated tooltip width
    const TH    = 320;  // estimated tooltip height

    let left = rect.left;
    let top  = rect.bottom + 6;

    if (left + TW > vpW - 8) left = vpW - TW - 8;
    if (left < 8)             left = 8;
    if (top  + TH > vpH - 8) top  = rect.top - TH - 6;
    if (top  < 8)             top  = 8;

    setPos({ top, left });
  }, []);

  // ── Mouse handlers ──────────────────────────────────────────────────────
  const handleMouseEnter = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      computePos();
      setVisible(true);
    }, 80);
  }, [computePos]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (!pinned) setVisible(false);
  }, [pinned]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!visible) {
      computePos();
      setVisible(true);
      setPinned(true);
    } else if (!pinned) {
      setPinned(true);
    } else {
      // Already pinned — toggle off
      setPinned(false);
      setVisible(false);
    }
  }, [visible, pinned, computePos]);

  const close = useCallback(() => {
    setPinned(false);
    setVisible(false);
  }, []);

  // ── Click-outside detection (only when pinned) ──────────────────────────
  useEffect(() => {
    if (!pinned) return;
    const handler = (e: MouseEvent) => {
      const inTrigger = triggerRef.current?.contains(e.target as Node);
      const inTooltip = tooltipRef.current?.contains(e.target as Node);
      if (!inTrigger && !inTooltip) close();
    };
    // Use capture phase so we see the click before children stop propagation
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [pinned, close]);

  // ── ESC to close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pinned) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [pinned, close]);

  // ── Cleanup hover timer on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); };
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className={className}
        style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center' }}
      >
        {children}
      </span>

      {visible && createPortal(
        <div
          ref={tooltipRef}
          className="tooltip-popup"
          style={{
            top:            pos.top,
            left:           pos.left,
            pointerEvents:  pinned ? 'auto' : 'none',
            zIndex:         pinned ? 10001 : 9999,
            minWidth:       260,
            maxWidth:       320,
            borderColor:    pinned ? 'rgba(34,211,238,0.45)' : 'rgba(100,116,139,0.45)',
            boxShadow:      pinned
              ? '0 8px 40px rgba(0,0,0,0.85), 0 0 0 1px rgba(34,211,238,0.1), 0 0 24px rgba(34,211,238,0.06)'
              : undefined,
          }}
        >
          <StatSheet modifierKey={modifierKey} pinned={pinned} onClose={close} />
        </div>,
        document.body,
      )}
    </>
  );
}
