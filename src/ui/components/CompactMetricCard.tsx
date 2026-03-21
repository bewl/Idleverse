import type { ReactNode } from 'react';

export type CompactMetricTone = 'cyan' | 'violet' | 'amber' | 'emerald' | 'slate';

function toneClassFor(tone: CompactMetricTone): string {
  return tone === 'cyan'
    ? 'text-cyan-300 border-cyan-700/30 bg-cyan-950/15'
    : tone === 'violet'
      ? 'text-violet-300 border-violet-700/30 bg-violet-950/15'
      : tone === 'amber'
        ? 'text-amber-300 border-amber-700/30 bg-amber-950/15'
        : tone === 'emerald'
          ? 'text-emerald-300 border-emerald-700/30 bg-emerald-950/15'
          : 'text-slate-300 border-slate-700/30 bg-slate-900/50';
}

export function CompactMetricCard({
  label,
  value,
  meta,
  tone = 'slate',
  onClick,
  className = '',
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  tone?: CompactMetricTone;
  onClick?: () => void;
  className?: string;
}) {
  const toneClass = toneClassFor(tone);
  const sharedClassName = `rounded-md border px-2 py-1.5 ${toneClass} ${className}`.trim();
  const content = (
    <>
      <div className="text-[7px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-0.5 text-[11px] font-semibold font-mono leading-tight">{value}</div>
      {meta ? <div className="mt-0.5 text-[8px] leading-tight text-slate-500">{meta}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className={`${sharedClassName} text-left transition-colors hover:bg-white/[0.04]`}>
        {content}
      </button>
    );
  }

  return <div className={sharedClassName}>{content}</div>;
}