interface ProgressBarProps {
  value: number; // 0–1
  className?: string;
  color?: 'cyan' | 'violet' | 'amber' | 'green';
  animated?: boolean;
}

const COLOR_MAP = {
  cyan:   'bg-cyan-500',
  violet: 'bg-violet-500',
  amber:  'bg-amber-500',
  green:  'bg-emerald-500',
};

export function ProgressBar({ value, className = '', color = 'cyan', animated = true }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const colorClass = COLOR_MAP[color];
  return (
    <div className={`progress-track ${className}`}>
      <div
        className={`progress-fill ${colorClass} ${animated && pct > 0 && pct < 100 ? 'animate-pulse-slow' : ''}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
