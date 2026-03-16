import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

// ─── Depth context — enables nested tooltips ────────────────────────────────
// Each GameTooltip increments the depth for its content, so children can
// hold deeper tooltips with a higher z-index automatically.

export const TooltipDepthContext = createContext(0);

// ─── GameTooltip ─────────────────────────────────────────────────────────────

export interface GameTooltipProps {
  /** What to show inside the popup. Can itself contain nested <GameTooltip>s. */
  content: ReactNode;
  /** The element that triggers the tooltip on hover / click-to-pin. */
  children: ReactNode;
  /**
   * When true, the tooltip can be pinned open with a click and dismissed via
   * ESC or click-outside. Default false.
   */
  pinnable?: boolean;
  /** Hover-in delay in milliseconds. Default 80. */
  delay?: number;
  /** Fixed pixel width for the popup, or 'auto'. Default 260. */
  width?: number | 'auto';
}

const SMART_CLOSE_DELAY = 150; // ms to wait after mouse leaves before closing

export function GameTooltip({
  content,
  children,
  pinnable = false,
  delay = 80,
  width = 260,
}: GameTooltipProps) {
  const depth = useContext(TooltipDepthContext);

  const [visible, setVisible] = useState(false);
  const [pinned,  setPinned]  = useState(false);
  const [pos,     setPos]     = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLSpanElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);
  const openTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const zIndex = 9998 + depth * 4;

  // ── Position calculator ──────────────────────────────────────────────────
  const computePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vpW  = window.innerWidth;
    const vpH  = window.innerHeight;
    const estW = typeof width === 'number' ? width : 280;
    const estH = 340;

    let left = rect.left;
    let top  = rect.bottom + 6;

    if (left + estW > vpW - 8) left = vpW - estW - 8;
    if (left < 8)              left = 8;
    if (top  + estH > vpH - 8) top  = rect.top - estH - 6;
    if (top  < 8)              top  = 8;

    setPos({ top, left });
  }, [width]);

  // ── Open / close helpers ─────────────────────────────────────────────────
  const scheduleOpen = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    openTimer.current = setTimeout(() => {
      computePos();
      setVisible(true);
    }, delay);
  }, [delay, computePos]);

  const scheduleClose = useCallback(() => {
    if (openTimer.current)  { clearTimeout(openTimer.current);  openTimer.current  = null; }
    if (pinned) return;
    closeTimer.current = setTimeout(() => setVisible(false), SMART_CLOSE_DELAY);
  }, [pinned]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);

  const close = useCallback(() => {
    setPinned(false);
    setVisible(false);
  }, []);

  // ── Trigger handlers ──────────────────────────────────────────────────────
  const handleTriggerEnter = scheduleOpen;
  const handleTriggerLeave = scheduleClose;

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!pinnable) return;
    e.stopPropagation();
    if (!visible) {
      computePos();
      setVisible(true);
      setPinned(true);
    } else if (!pinned) {
      setPinned(true);
    } else {
      close();
    }
  }, [pinnable, visible, pinned, computePos, close]);

  // ── Popup handlers (smart-close bridge) ──────────────────────────────────
  const handlePopupEnter = cancelClose;
  const handlePopupLeave = scheduleClose;

  // ── Click-outside (pin mode only) ────────────────────────────────────────
  useEffect(() => {
    if (!pinned) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !popupRef.current?.contains(t)) close();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [pinned, close]);

  // ── ESC to close (pin mode only) ─────────────────────────────────────────
  useEffect(() => {
    if (!pinned) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [pinned, close]);

  // ── Cleanup timers on unmount ─────────────────────────────────────────────
  useEffect(() => () => {
    if (openTimer.current)  clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleTriggerLeave}
        onClick={pinnable ? handleClick : undefined}
        style={{ display: 'inline-flex', alignItems: 'center', cursor: pinnable ? 'help' : 'default' }}
      >
        {children}
      </span>

      {visible && createPortal(
        <div
          ref={popupRef}
          className="tooltip-popup"
          style={{
            top:        pos.top,
            left:       pos.left,
            zIndex,
            pointerEvents: 'auto',
            width:      typeof width === 'number' ? width : undefined,
            minWidth:   200,
            maxWidth:   typeof width === 'number' ? undefined : 320,
            borderColor: pinned ? 'rgba(34,211,238,0.45)' : undefined,
            boxShadow:  pinned
              ? '0 8px 40px rgba(0,0,0,0.85), 0 0 0 1px rgba(34,211,238,0.1), 0 0 24px rgba(34,211,238,0.06)'
              : undefined,
          } as CSSProperties}
          onMouseEnter={handlePopupEnter}
          onMouseLeave={handlePopupLeave}
        >
          <TooltipDepthContext.Provider value={depth + 1}>
            {content}
          </TooltipDepthContext.Provider>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── TT — composable tooltip primitives ──────────────────────────────────────
// Stateless building blocks for rich tooltip content.
// Mix and match freely; they work at any nesting depth.

function TTHeader({ title, subtitle, color = '#22d3ee' }: {
  title: string;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div style={{
      marginBottom: 8,
      paddingBottom: 6,
      borderBottom: '1px solid rgba(15,23,42,0.8)',
    }}>
      <div style={{ fontWeight: 700, color, fontSize: 12, letterSpacing: '0.04em' }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 10, color: '#475569', marginTop: 2, lineHeight: 1.4 }}>{subtitle}</div>
      )}
    </div>
  );
}

function TTSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        fontSize: 9,
        color: '#334155',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 3,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function TTGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
      {children}
    </div>
  );
}

function TTRow({ label, value, valueColor }: { label: string; value: ReactNode; valueColor?: string }) {
  return (
    <>
      <span style={{ fontSize: 10, color: '#475569' }}>{label}</span>
      <span style={{ fontSize: 10, color: valueColor ?? '#94a3b8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </>
  );
}

function TTDivider() {
  return (
    <div style={{
      height: 1,
      background: 'rgba(15,23,42,0.8)',
      margin: '6px 0',
    }} />
  );
}

function TTProgressBar({ value, max, color = '#22d3ee', label }: {
  value: number;
  max: number;
  color?: string;
  label?: string;
}) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div style={{ marginBottom: 4 }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#475569', marginBottom: 2 }}>
          <span>{label}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(pct)}%</span>
        </div>
      )}
      <div style={{ height: 4, background: 'rgba(15,23,42,0.8)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function TTBadgeRow({ badges }: { badges: Array<{ label: string; color?: string }> }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
      {badges.map((b, i) => (
        <span key={i} style={{
          fontSize: 9,
          padding: '1px 5px',
          borderRadius: 3,
          background: `${b.color ?? '#334155'}22`,
          border: `1px solid ${b.color ?? '#334155'}44`,
          color: b.color ?? '#94a3b8',
          letterSpacing: '0.04em',
        }}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

function TTFooter({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 8,
      color: '#1e293b',
      textAlign: 'center',
      marginTop: 6,
      borderTop: '1px solid rgba(15,23,42,0.5)',
      paddingTop: 4,
    }}>
      {children}
    </div>
  );
}

function TTSpacer({ size = 4 }: { size?: number }) {
  return <div style={{ height: size }} />;
}

export const TT = {
  Header:      TTHeader,
  Section:     TTSection,
  Grid:        TTGrid,
  Row:         TTRow,
  Divider:     TTDivider,
  ProgressBar: TTProgressBar,
  BadgeRow:    TTBadgeRow,
  Footer:      TTFooter,
  Spacer:      TTSpacer,
};
