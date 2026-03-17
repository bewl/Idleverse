import type { CSSProperties, ReactNode } from 'react';

export type ThemedIconName =
  | 'overview'
  | 'inbox'
  | 'skills'
  | 'fleet'
  | 'starmap'
  | 'system'
  | 'mining'
  | 'manufacturing'
  | 'reprocessing'
  | 'market'
  | 'exploration'
  | 'science'
  | 'electronics'
  | 'combat'
  | 'cargo'
  | 'shield'
  | 'idle'
  | 'audio-on'
  | 'audio-off'
  | 'tool'
  | 'warning'
  | 'warp'
  | 'scan'
  | 'success'
  | 'error'
  | 'transit'
  | 'data';

const LEGACY_ICON_MAP: Record<string, ThemedIconName> = {
  '📊': 'overview',
  '📬': 'inbox',
  '📈': 'market',
  '⚡': 'skills',
  '🚀': 'fleet',
  '🗺️': 'starmap',
  '🪐': 'system',
  '⛏': 'mining',
  '🏭': 'manufacturing',
  '⚗️': 'reprocessing',
  '⊕': 'exploration',
  '🔬': 'science',
  '⚔': 'combat',
  '⚔️': 'combat',
  '📦': 'cargo',
  '🛡': 'shield',
  '🛡️': 'shield',
  '💤': 'idle',
  '🔊': 'audio-on',
  '🔇': 'audio-off',
  '🔧': 'tool',
  '⚠': 'warning',
  '⚠️': 'warning',
  '🌀': 'warp',
  '📡': 'scan',
  '◉': 'scan',
  '♻': 'reprocessing',
  '✓': 'success',
  '✗': 'error',
  '▶': 'transit',
  '⬡': 'data',
};

const ICON_PALETTES: Record<ThemedIconName, { primary: string; secondary: string; accent: string; glow: string }> = {
  overview: { primary: '#60a5fa', secondary: '#22d3ee', accent: '#f8fafc', glow: '#38bdf8' },
  inbox: { primary: '#22d3ee', secondary: '#a78bfa', accent: '#f8fafc', glow: '#06b6d4' },
  skills: { primary: '#a78bfa', secondary: '#f59e0b', accent: '#fde68a', glow: '#8b5cf6' },
  fleet: { primary: '#22d3ee', secondary: '#f59e0b', accent: '#f8fafc', glow: '#06b6d4' },
  starmap: { primary: '#38bdf8', secondary: '#818cf8', accent: '#facc15', glow: '#60a5fa' },
  system: { primary: '#a78bfa', secondary: '#38bdf8', accent: '#fbbf24', glow: '#8b5cf6' },
  mining: { primary: '#22d3ee', secondary: '#f59e0b', accent: '#facc15', glow: '#06b6d4' },
  manufacturing: { primary: '#f59e0b', secondary: '#22d3ee', accent: '#f8fafc', glow: '#f59e0b' },
  reprocessing: { primary: '#2dd4bf', secondary: '#38bdf8', accent: '#f8fafc', glow: '#14b8a6' },
  market: { primary: '#4ade80', secondary: '#60a5fa', accent: '#f59e0b', glow: '#22c55e' },
  exploration: { primary: '#22d3ee', secondary: '#a78bfa', accent: '#f8fafc', glow: '#06b6d4' },
  science: { primary: '#a78bfa', secondary: '#38bdf8', accent: '#f472b6', glow: '#8b5cf6' },
  electronics: { primary: '#38bdf8', secondary: '#34d399', accent: '#f8fafc', glow: '#0ea5e9' },
  combat: { primary: '#f87171', secondary: '#fb7185', accent: '#fbbf24', glow: '#ef4444' },
  cargo: { primary: '#f59e0b', secondary: '#38bdf8', accent: '#f8fafc', glow: '#f59e0b' },
  shield: { primary: '#60a5fa', secondary: '#22d3ee', accent: '#f8fafc', glow: '#3b82f6' },
  idle: { primary: '#94a3b8', secondary: '#60a5fa', accent: '#f8fafc', glow: '#64748b' },
  'audio-on': { primary: '#22d3ee', secondary: '#34d399', accent: '#f8fafc', glow: '#06b6d4' },
  'audio-off': { primary: '#94a3b8', secondary: '#f87171', accent: '#f8fafc', glow: '#64748b' },
  tool: { primary: '#fb923c', secondary: '#fbbf24', accent: '#f8fafc', glow: '#f97316' },
  warning: { primary: '#fbbf24', secondary: '#f87171', accent: '#f8fafc', glow: '#f59e0b' },
  warp: { primary: '#818cf8', secondary: '#22d3ee', accent: '#f8fafc', glow: '#6366f1' },
  scan: { primary: '#22d3ee', secondary: '#60a5fa', accent: '#f8fafc', glow: '#0ea5e9' },
  success: { primary: '#4ade80', secondary: '#bbf7d0', accent: '#f8fafc', glow: '#22c55e' },
  error: { primary: '#f87171', secondary: '#fca5a5', accent: '#f8fafc', glow: '#ef4444' },
  transit: { primary: '#22d3ee', secondary: '#f8fafc', accent: '#f59e0b', glow: '#06b6d4' },
  data: { primary: '#38bdf8', secondary: '#a78bfa', accent: '#f8fafc', glow: '#0ea5e9' },
};

function renderIconGlyph(name: ThemedIconName): ReactNode {
  switch (name) {
    case 'overview':
      return (
        <>
          <circle cx="12" cy="12" r="7.5" className="idleverse-icon__stroke-primary" />
          <path d="M12 4.5v15M4.5 12h15" className="idleverse-icon__stroke-secondary" />
          <path d="M7 16.5h2.5M10.75 13.5h2.5M14.5 9.5H17" className="idleverse-icon__stroke-accent" />
        </>
      );
    case 'inbox':
      return (
        <>
          <path d="M5 8.2h14v7.8H5Z" className="idleverse-icon__stroke-primary" />
          <path d="M7.3 8.2 12 12.2l4.7-4" className="idleverse-icon__stroke-secondary" />
          <path d="M8 15.6h8" className="idleverse-icon__stroke-accent" />
        </>
      );
    case 'skills':
      return <path d="M13.2 2.8 6.7 12h4.2L9.8 21.2 17.3 10h-4.1Z" className="idleverse-icon__fill-primary" />;
    case 'fleet':
      return (
        <>
          <path d="M12 2.8 16.7 10.6 14.2 11.8 14.8 17.9 12 15.8 9.2 17.9 9.8 11.8 7.3 10.6Z" className="idleverse-icon__stroke-primary" />
          <path d="M12 15.8V21" className="idleverse-icon__stroke-secondary" />
        </>
      );
    case 'starmap':
      return (
        <>
          <path d="M4 18 9.3 6.4l5.2 2.1 5.5-2.8V18" className="idleverse-icon__stroke-secondary" />
          <circle cx="9.3" cy="6.4" r="1.2" className="idleverse-icon__fill-primary" />
          <circle cx="14.5" cy="8.5" r="1.2" className="idleverse-icon__fill-accent" />
          <circle cx="19.5" cy="5.8" r="1.2" className="idleverse-icon__fill-secondary" />
        </>
      );
    case 'system':
      return (
        <>
          <circle cx="12" cy="12" r="4.1" className="idleverse-icon__stroke-primary" />
          <ellipse cx="12" cy="12" rx="8.6" ry="3.5" className="idleverse-icon__stroke-secondary" />
          <path d="M17.2 8.7 19.4 7.9" className="idleverse-icon__stroke-accent" />
        </>
      );
    case 'mining':
      return (
        <>
          <path d="M7.2 6.2h9.7" className="idleverse-icon__stroke-secondary" />
          <path d="M12 6.2v10.2" className="idleverse-icon__stroke-primary" />
          <path d="m12 10.7-4 4" className="idleverse-icon__stroke-primary" />
          <path d="m12 10.7 4 4" className="idleverse-icon__stroke-primary" />
          <path d="M9.4 18.7h5.2" className="idleverse-icon__stroke-accent" />
        </>
      );
    case 'manufacturing':
      return (
        <>
          <path d="M12 4.2 15 5.1 16.9 7.3 19.8 8.1 19.4 11.2 20.2 14.1 17.9 16 17.1 18.9 14 18.5 11.1 19.3 9.2 17 6.3 16.2 6.7 13.1 5.9 10.2 8.2 8.3 9 5.4Z" className="idleverse-icon__stroke-primary" />
          <circle cx="12" cy="12" r="2.8" className="idleverse-icon__stroke-secondary" />
        </>
      );
    case 'reprocessing':
      return (
        <>
          <path d="M9 3.8h6" className="idleverse-icon__stroke-accent" />
          <path d="M10.2 3.8v4l-4.3 8a3.2 3.2 0 0 0 2.9 4.7h6.4a3.2 3.2 0 0 0 2.9-4.7l-4.3-8v-4" className="idleverse-icon__stroke-primary" />
          <path d="M8.5 14.2h7" className="idleverse-icon__stroke-secondary" />
          <circle cx="14.9" cy="11.1" r="0.9" className="idleverse-icon__fill-accent" />
        </>
      );
    case 'market':
      return (
        <>
          <path d="M4.5 18.5h15" className="idleverse-icon__stroke-secondary" />
          <path d="M7 16V11.5" className="idleverse-icon__stroke-primary" />
          <path d="M12 16V8.5" className="idleverse-icon__stroke-secondary" />
          <path d="M17 16V5.5" className="idleverse-icon__stroke-accent" />
          <path d="m6.5 9.5 4-2.4 2.3 1.7 4-4.3" className="idleverse-icon__stroke-primary" />
        </>
      );
    case 'exploration':
      return (
        <>
          <circle cx="12" cy="12" r="7" className="idleverse-icon__stroke-secondary" />
          <path d="m12 5 3.1 6.2L12 19l-3.1-7.8Z" className="idleverse-icon__stroke-primary" />
          <path d="M12 5v14" className="idleverse-icon__stroke-accent" />
        </>
      );
    case 'science':
      return (
        <>
          <circle cx="12" cy="12" r="1.5" className="idleverse-icon__fill-accent" />
          <ellipse cx="12" cy="12" rx="7.8" ry="3.5" className="idleverse-icon__stroke-primary" />
          <ellipse cx="12" cy="12" rx="7.8" ry="3.5" transform="rotate(60 12 12)" className="idleverse-icon__stroke-secondary" />
          <ellipse cx="12" cy="12" rx="7.8" ry="3.5" transform="rotate(120 12 12)" className="idleverse-icon__stroke-accent" />
        </>
      );
    case 'electronics':
      return (
        <>
          <rect x="7" y="7" width="10" height="10" rx="1.5" className="idleverse-icon__stroke-primary" />
          <path d="M9 4.5v2M12 4.5v2M15 4.5v2M9 17.5v2M12 17.5v2M15 17.5v2M4.5 9h2M4.5 12h2M4.5 15h2M17.5 9h2M17.5 12h2M17.5 15h2" className="idleverse-icon__stroke-secondary" />
        </>
      );
    case 'combat':
      return (
        <>
          <circle cx="12" cy="12" r="5.5" className="idleverse-icon__stroke-primary" />
          <path d="M12 3.5v3.2M12 17.3v3.2M3.5 12h3.2M17.3 12h3.2" className="idleverse-icon__stroke-accent" />
          <circle cx="12" cy="12" r="1.8" className="idleverse-icon__fill-secondary" />
        </>
      );
    case 'cargo':
      return (
        <>
          <path d="M5.5 8.2 12 4.8l6.5 3.4v7.6L12 19.2l-6.5-3.4Z" className="idleverse-icon__stroke-primary" />
          <path d="M12 4.8v7.5M5.5 8.2 12 12.3l6.5-4.1" className="idleverse-icon__stroke-secondary" />
        </>
      );
    case 'shield':
      return <path d="M12 3.5 18.5 6v4.3c0 4.8-2.8 7.8-6.5 10.2-3.7-2.4-6.5-5.4-6.5-10.2V6Z" className="idleverse-icon__stroke-primary" />;
    case 'idle':
      return (
        <>
          <path d="M15.6 4.5a6.8 6.8 0 1 0 3.9 12.4A7.8 7.8 0 1 1 15.6 4.5Z" className="idleverse-icon__fill-primary" />
          <circle cx="17.8" cy="7" r="1.1" className="idleverse-icon__fill-accent" />
        </>
      );
    case 'audio-on':
      return (
        <>
          <path d="M6 14.8H4.5V9.2H6l4.2-3.3v12.2Z" className="idleverse-icon__stroke-primary" />
          <path d="M14.5 9.1a4 4 0 0 1 0 5.8" className="idleverse-icon__stroke-secondary" />
          <path d="M16.9 6.8a7 7 0 0 1 0 10.4" className="idleverse-icon__stroke-accent" />
        </>
      );
    case 'audio-off':
      return (
        <>
          <path d="M6 14.8H4.5V9.2H6l4.2-3.3v12.2Z" className="idleverse-icon__stroke-primary" />
          <path d="m15.2 8.8 4.3 6.4" className="idleverse-icon__stroke-secondary" />
          <path d="m19.5 8.8-4.3 6.4" className="idleverse-icon__stroke-secondary" />
        </>
      );
    case 'tool':
      return (
        <>
          <path d="M14.9 4.4a3 3 0 0 0-3.5 4l-5.6 5.6a1.8 1.8 0 1 0 2.5 2.5l5.6-5.6a3 3 0 0 0 4-3.5l-2.2 2.2-1.8-.4-.4-1.8Z" className="idleverse-icon__stroke-primary" />
        </>
      );
    case 'warning':
      return (
        <>
          <path d="m12 4.3 8 14H4Z" className="idleverse-icon__stroke-primary" />
          <path d="M12 9v4.4" className="idleverse-icon__stroke-secondary" />
          <circle cx="12" cy="16.4" r="0.9" className="idleverse-icon__fill-secondary" />
        </>
      );
    case 'warp':
      return (
        <>
          <path d="M18.5 11.5A6.5 6.5 0 1 1 10 5.2" className="idleverse-icon__stroke-primary" />
          <path d="m15.6 4.8-1 4.6 4.5-1.2" className="idleverse-icon__stroke-accent" />
          <path d="M9.2 14.7a3 3 0 1 0 0-5.4" className="idleverse-icon__stroke-secondary" />
        </>
      );
    case 'scan':
      return (
        <>
          <path d="M12 12 18.6 5.4" className="idleverse-icon__stroke-secondary" />
          <path d="M12 5.2a6.8 6.8 0 0 1 6.8 6.8" className="idleverse-icon__stroke-primary" />
          <path d="M12 2.8a9.2 9.2 0 0 1 9.2 9.2" className="idleverse-icon__stroke-secondary" />
          <circle cx="12" cy="12" r="1.5" className="idleverse-icon__fill-accent" />
        </>
      );
    case 'success':
      return <path d="m5.8 12.7 4 4.1 8.4-9" className="idleverse-icon__stroke-primary" />;
    case 'error':
      return (
        <>
          <path d="m6.7 6.7 10.6 10.6" className="idleverse-icon__stroke-primary" />
          <path d="M17.3 6.7 6.7 17.3" className="idleverse-icon__stroke-secondary" />
        </>
      );
    case 'transit':
      return (
        <>
          <path d="M4.2 12h13.6" className="idleverse-icon__stroke-primary" />
          <path d="m13.3 7.6 4.5 4.4-4.5 4.4" className="idleverse-icon__stroke-accent" />
        </>
      );
    case 'data':
      return (
        <>
          <path d="M12 4.5 18.5 8.2v7.6L12 19.5l-6.5-3.7V8.2Z" className="idleverse-icon__stroke-primary" />
          <path d="M8.5 10.4h7M8.5 13h7" className="idleverse-icon__stroke-secondary" />
        </>
      );
  }
}

export function resolveThemedIcon(icon: string | ThemedIconName): ThemedIconName {
  return LEGACY_ICON_MAP[icon] ?? (icon as ThemedIconName);
}

export function splitIconLabel(label: string): { icon: ThemedIconName | null; text: string } {
  const sortedKeys = Object.keys(LEGACY_ICON_MAP).sort((left, right) => right.length - left.length);
  for (const key of sortedKeys) {
    if (label.startsWith(`${key} `)) {
      return {
        icon: LEGACY_ICON_MAP[key],
        text: label.slice(key.length + 1),
      };
    }
  }
  return { icon: null, text: label };
}

interface ThemedIconProps {
  icon: string | ThemedIconName;
  size?: number;
  tone?: string;
  className?: string;
  interactive?: boolean;
  decorative?: boolean;
  label?: string;
}

export function ThemedIcon({
  icon,
  size = 16,
  tone,
  className = '',
  interactive = false,
  decorative = true,
  label,
}: ThemedIconProps) {
  const resolved = resolveThemedIcon(icon);
  const palette = ICON_PALETTES[resolved];
  const style = {
    '--icon-size': `${size}px`,
    '--icon-primary': tone ?? palette.primary,
    '--icon-secondary': palette.secondary,
    '--icon-accent': palette.accent,
    '--icon-glow': palette.glow,
  } as CSSProperties;

  return (
    <span
      className={`idleverse-icon ${interactive ? 'idleverse-icon--interactive' : ''} ${className}`.trim()}
      style={style}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : label ?? resolved}
      role={decorative ? undefined : 'img'}
    >
      <span className="idleverse-icon__glow" />
      <span className="idleverse-icon__particles">
        <span className="idleverse-icon__particle idleverse-icon__particle--a" />
        <span className="idleverse-icon__particle idleverse-icon__particle--b" />
        <span className="idleverse-icon__particle idleverse-icon__particle--c" />
      </span>
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="idleverse-icon__svg">
        {renderIconGlyph(resolved)}
      </svg>
    </span>
  );
}