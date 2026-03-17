interface ActivityBarProps {
  /** Whether the system is actively running */
  active: boolean;
  /** 0–1 — normalised rate / efficiency; controls sweep speed */
  rate: number;
  color?: 'cyan' | 'violet' | 'amber' | 'green' | 'rose';
  className?: string;
  label?: string;
  valueLabel?: string;
}

const C = {
  cyan:   { bg: '#020b0f', rgb: '34,211,238'  },
  violet: { bg: '#07031a', rgb: '167,139,250' },
  amber:  { bg: '#0d0500', rgb: '251,191,36'  },
  green:  { bg: '#010d04', rgb: '52,211,153'  },
  rose:   { bg: '#100003', rgb: '244,63,94'   },
} as const;

export function ActivityBar({ active, rate, color = 'cyan', className = '', label, valueLabel }: ActivityBarProps) {
  const c      = C[color];
  const r      = Math.min(1, Math.max(0, rate));
  const resolvedLabel = label ?? 'Activity';
  // Sweep duration: 3.4 s when idle/slow → 0.85 s at full rate
  const dur    = active ? Math.max(0.85, 3.4 - r * 2.55) : 3.4;
  const dur2   = dur * 0.95; // second comet slightly different timing for organic feel

  return (
      <div
        className={`flex flex-col gap-1 ${className}`}
      >
        <div className="flex items-center justify-between gap-2 text-[8px] uppercase tracking-widest text-slate-600">
          <span>{resolvedLabel}</span>
          {valueLabel && <span className="font-mono text-slate-500">{valueLabel}</span>}
        </div>
        <div
          className="relative overflow-hidden rounded"
          style={{
            height: '6px',
            background: c.bg,
            boxShadow: active
              ? `inset 0 0 4px rgba(0,0,0,0.8), 0 0 5px rgba(${c.rgb},0.18)`
              : 'inset 0 0 4px rgba(0,0,0,0.8)',
          }}
        >
          {/* Power fill — faint gradient showing current rate intensity */}
          {active && r > 0 && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(90deg, rgba(${c.rgb},0.10) 0%, rgba(${c.rgb},${(0.05 + r * 0.14).toFixed(3)}) ${Math.min(95, r * 100).toFixed(0)}%, transparent ${Math.min(100, r * 100 + 5).toFixed(0)}%)`,
              }}
            />
          )}

          {/* Rail dots — give the bar a "track" feeling */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `repeating-linear-gradient(
                90deg,
                rgba(${c.rgb},0.18) 0px, rgba(${c.rgb},0.18) 1px,
                transparent 1px, transparent 9px
              )`,
              opacity: active ? 1 : 0.4,
            }}
          />

          {/* Comet 1 — primary */}
          {active && (
            <div
              className="absolute top-0 h-full pointer-events-none"
              style={{
                width: '26%',
                background: `linear-gradient(90deg,
                  transparent 0%,
                  rgba(${c.rgb},0.25) 35%,
                  rgba(${c.rgb},0.75) 75%,
                  rgba(${c.rgb},1) 100%
                )`,
                animation: `comet-sweep ${dur}s linear infinite`,
              }}
            />
          )}

          {/* Comet 2 — secondary, staggered; only appears at decent rate */}
          {active && r > 0.2 && (
            <div
              className="absolute top-0 h-full pointer-events-none"
              style={{
                width: '18%',
                background: `linear-gradient(90deg,
                  transparent 0%,
                  rgba(${c.rgb},0.15) 40%,
                  rgba(${c.rgb},0.55) 75%,
                  rgba(${c.rgb},0.8) 100%
                )`,
                animation: `comet-sweep ${dur2}s linear infinite`,
                animationDelay: `-${dur2 * 0.52}s`,
              }}
            />
          )}

          {/* Third faint comet at high rate */}
          {active && r > 0.65 && (
            <div
              className="absolute top-0 h-full pointer-events-none"
              style={{
                width: '12%',
                background: `linear-gradient(90deg,
                  transparent 0%,
                  rgba(${c.rgb},0.1) 50%,
                  rgba(${c.rgb},0.5) 100%
                )`,
                animation: `comet-sweep ${dur * 0.88}s linear infinite`,
                animationDelay: `-${dur * 0.27}s`,
              }}
            />
          )}

          {/* Idle haze — breathes to show the system is "ready" */}
          {!active && (
            <div
              className="absolute inset-0"
              style={{
                background: `rgba(${c.rgb},0.04)`,
                animation: 'activity-breathe 3.2s ease-in-out infinite',
              }}
            />
          )}
        </div>
      </div>
  );
}
