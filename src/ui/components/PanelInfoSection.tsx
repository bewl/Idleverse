import type { ReactNode } from 'react';
import { useUiStore } from '@/stores/uiStore';

interface PanelInfoSectionProps {
  sectionId: string;
  title: string;
  subtitle: string;
  accentColor: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  className?: string;
}

export function PanelInfoSection({
  sectionId,
  title,
  subtitle,
  accentColor,
  children,
  defaultCollapsed = false,
  className = '',
}: PanelInfoSectionProps) {
  const storedCollapsed = useUiStore(s => s.collapsedInfoSections[sectionId]);
  const setCollapsed = useUiStore(s => s.setInfoSectionCollapsed);
  const collapsed = storedCollapsed ?? defaultCollapsed;

  return (
    <div
      className={`rounded-xl border overflow-hidden ${className}`.trim()}
      style={{ background: 'rgba(3,8,20,0.55)', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div
        className="flex items-start gap-2 px-3 py-2.5 cursor-pointer select-none hover:bg-white/[0.03] transition-colors"
        onClick={() => setCollapsed(sectionId, !collapsed)}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${collapsed ? 'bg-slate-600' : 'animate-pulse'}`}
          style={{ backgroundColor: collapsed ? '#475569' : accentColor }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold" style={{ color: collapsed ? '#cbd5e1' : accentColor }}>
              {title}
            </span>
            <span className={`text-[8px] px-1.5 py-0.5 rounded border uppercase tracking-widest ${collapsed ? 'text-slate-500 border-slate-700/40 bg-slate-900/40' : 'text-cyan-300 border-cyan-500/20 bg-cyan-950/20'}`}>
              {collapsed ? 'Hidden' : 'Shown'}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
            {subtitle}
          </div>
        </div>
        <span className="text-[10px] text-slate-600 shrink-0 mt-0.5">{collapsed ? 'Show' : 'Hide'} {collapsed ? 'v' : '^'}</span>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid rgba(30,41,59,0.5)' }}>
          {children}
        </div>
      )}
    </div>
  );
}