interface FlairProgressBarProps {
  value: number; // 0–1
  color?: 'cyan' | 'violet' | 'amber' | 'green' | 'rose';
  className?: string;
  label?: string;
  valueLabel?: string;
}

const C = {
  cyan:   { bg: '#040f14', dark: '#065976', bright: '#22d3ee', glow: '#22d3ee', rgb: '34,211,238'   },
  violet: { bg: '#0a061a', dark: '#4c1d95', bright: '#a78bfa', glow: '#a78bfa', rgb: '167,139,250'  },
  amber:  { bg: '#100800', dark: '#78350f', bright: '#fbbf24', glow: '#fbbf24', rgb: '251,191,36'   },
  green:  { bg: '#021208', dark: '#064e3b', bright: '#34d399', glow: '#34d399', rgb: '52,211,153'   },
  rose:   { bg: '#130008', dark: '#9f1239', bright: '#fb7185', glow: '#f43f5e', rgb: '244,63,94'    },
} as const;

export function FlairProgressBar({ value, color = 'cyan', className = '', label, valueLabel }: FlairProgressBarProps) {
  const pct      = Math.min(100, Math.max(0, value * 100));
  const c        = C[color];
  const active   = pct > 0 && pct < 100;
  const done     = pct >= 100;
  const charging = pct >= 80 && !done;  // near-completion charging state

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {(label || valueLabel) && (
        <div className="flex items-center justify-between gap-2 text-[8px] uppercase tracking-widest text-slate-600">
          <span>{label ?? 'Progress'}</span>
          {valueLabel && <span className="font-mono text-slate-500">{valueLabel}</span>}
        </div>
      )}
      <div
        className="relative rounded overflow-hidden"
        style={{
          height: '8px',
          background: c.bg,
          boxShadow: done
            ? `inset 0 1px 4px rgba(0,0,0,0.7), 0 0 10px rgba(${c.rgb},0.55)`
            : `inset 0 1px 4px rgba(0,0,0,0.7), 0 0 2px rgba(${c.rgb},0.12)`,
          '--bglow-color': `rgba(${c.rgb},0.5)`,
          '--bglow-min': charging ? '5px' : '2px',
          '--bglow-max': charging ? '16px' : '8px',
          animation: charging ? 'bar-charge-glow 0.85s ease-in-out infinite' : undefined,
        } as React.CSSProperties}
      >
        {[25, 50, 75].map(t => (
          <div
            key={t}
            className="absolute inset-y-0 z-20 pointer-events-none"
            style={{
              left: `${t}%`,
              width: '1px',
              background: pct >= t
                ? 'rgba(0,0,0,0.4)'
                : `rgba(${c.rgb},0.15)`,
            }}
          />
        ))}

        {pct > 0 && (
          <div
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ width: `${pct}%`, transition: 'width 0.55s cubic-bezier(0.4,0,0.2,1)' }}
          >
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(90deg, ${c.dark} 0%, ${c.bright} 100%)` }}
            />
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, rgba(0,0,0,0.6) 0px, rgba(0,0,0,0.6) 1px, transparent 1px, transparent 3px)',
              }}
            />
            {active && (
              <div
                className="absolute inset-0"
                style={{
                  width: '45%',
                  background:
                    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)',
                  animation: 'flair-shimmer 1.8s ease-in-out infinite',
                }}
              />
            )}
            {charging && (
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(90deg, transparent 50%, rgba(${c.rgb},0.30) 100%)`,
                  animation: 'activity-breathe 0.85s ease-in-out infinite',
                }}
              />
            )}
            {done && (
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(90deg, transparent 60%, rgba(${c.rgb},0.35) 100%)`,
                }}
              />
            )}
          </div>
        )}

        {active && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${pct}%`,
              width: charging ? '4px' : '3px',
              transform: 'translateX(-50%)',
              background: c.bright,
              boxShadow: charging
                ? `0 0 8px ${c.glow}, 0 0 22px ${c.glow}`
                : `0 0 6px ${c.glow}, 0 0 16px ${c.glow}`,
              animation: 'leading-glow 1.1s ease-in-out infinite',
              zIndex: 15,
            }}
          />
        )}
      </div>
    </div>
  );
}


