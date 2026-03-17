import { useEffect, useRef, useState } from 'react';
import { ThemedIcon } from '@/ui/components/ThemedIcon';
import type {
  TutorialStepChecklistItem,
  TutorialStepMetric,
  TutorialStepProgress,
} from '@/game/progression/tutorialSequence';

interface TutorialOverlayProps {
  eyebrow: string;
  title: string;
  description: string;
  helperText: string;
  lockMessage: string;
  metrics: TutorialStepMetric[];
  checklist: TutorialStepChecklistItem[];
  progress: TutorialStepProgress | null;
  uiTerms: string[];
  icon: string;
  stepIndex: number;
  stepCount: number;
  actionLabel: string;
  completionMode: 'acknowledge' | 'automatic';
  desktopSide?: 'left' | 'right';
  onAction(): void;
  onSkip(): void;
}

export function TutorialOverlay({
  eyebrow,
  title,
  description,
  helperText,
  lockMessage,
  metrics,
  checklist,
  progress,
  uiTerms,
  icon,
  stepIndex,
  stepCount,
  actionLabel,
  completionMode,
  desktopSide = 'right',
  onAction,
  onSkip,
}: TutorialOverlayProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    startRect: DOMRect | null;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const progressWidth = `${Math.max(8, Math.round((stepIndex / stepCount) * 100))}%`;
  const progressToneClass = progress?.tone === 'emerald'
    ? 'bg-emerald-500/85'
    : progress?.tone === 'amber'
      ? 'bg-amber-500/80'
      : progress?.tone === 'violet'
        ? 'bg-violet-500/80'
        : 'bg-cyan-500/85';

  const checklistToneClass = (status: TutorialStepChecklistItem['status']) => (
    status === 'complete'
      ? 'bg-emerald-400 border-emerald-300/40'
      : status === 'active'
        ? 'bg-cyan-400 animate-pulse border-cyan-300/40'
        : 'bg-slate-700 border-slate-600/50'
  );

  const metricToneClass = (tone: TutorialStepMetric['tone']) => (
    tone === 'emerald'
      ? 'text-emerald-200 border-emerald-500/28 bg-[rgba(6,24,20,0.98)]'
      : tone === 'amber'
        ? 'text-amber-200 border-amber-500/28 bg-[rgba(28,18,8,0.985)]'
        : tone === 'violet'
          ? 'text-violet-200 border-violet-500/28 bg-[rgba(20,12,32,0.985)]'
          : tone === 'cyan'
            ? 'text-cyan-100 border-cyan-500/28 bg-[rgba(6,18,28,0.985)]'
            : 'text-slate-300 border-slate-700/80 bg-[rgba(2,6,23,0.99)]'
  );

  const highlightTerms = Array.from(new Set(uiTerms.filter(Boolean))).sort((left, right) => right.length - left.length);

  useEffect(() => {
    dragStateRef.current = null;
    setDragOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, [desktopSide]);

  const clampDragOffset = (nextX: number, nextY: number) => {
    const startRect = dragStateRef.current?.startRect;
    if (!startRect) return { x: nextX, y: nextY };

    const margin = 12;
    const minX = dragStateRef.current!.originX + (margin - startRect.left);
    const maxX = dragStateRef.current!.originX + (window.innerWidth - margin - startRect.right);
    const minY = dragStateRef.current!.originY + (margin - startRect.top);
    const maxY = dragStateRef.current!.originY + (window.innerHeight - margin - startRect.bottom);

    return {
      x: Math.min(Math.max(nextX, minX), maxX),
      y: Math.min(Math.max(nextY, minY), maxY),
    };
  };

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
      startRect: cardRef.current?.getBoundingClientRect() ?? null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    setDragOffset(clampDragOffset(dragState.originX + deltaX, dragState.originY + deltaY));
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  const renderHighlightedText = (text: string) => {
    if (highlightTerms.length === 0) return text;

    const escapedTerms = highlightTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'g');
    const segments = text.split(pattern);

    return segments.map((segment, index) => {
      if (!segment) return null;
      const isMatch = highlightTerms.some(term => term === segment);
      return isMatch ? (
        <span
          key={`${segment}-${index}`}
          className="rounded-md border border-cyan-400/35 bg-[rgba(8,32,48,0.98)] px-1.5 py-0.5 text-cyan-100 shadow-[0_0_10px_rgba(34,211,238,0.10)]"
        >
          {segment}
        </span>
      ) : (
        <span key={`${segment}-${index}`}>{segment}</span>
      );
    });
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[72]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_38%),linear-gradient(180deg,rgba(2,6,23,0.08),rgba(2,6,23,0.44))]" />

      <div className={`absolute inset-x-0 bottom-0 flex justify-center px-3 pb-24 sm:px-4 lg:pb-8 ${desktopSide === 'left' ? 'lg:justify-start' : 'lg:justify-end'}`}>
        <div
          ref={cardRef}
          className="pointer-events-auto w-full max-w-[34rem] overflow-hidden rounded-[1.4rem] border border-cyan-400/32 bg-[rgba(2,6,23,0.995)] shadow-[0_36px_140px_rgba(2,6,23,0.92)]"
          style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
        >
          <div
            className={`border-b border-cyan-500/18 bg-[linear-gradient(135deg,rgba(8,47,73,0.92),rgba(15,23,42,0.995)_55%,rgba(76,29,149,0.74))] px-5 py-4 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            style={{ touchAction: 'none', userSelect: 'none' }}
          >
            <div className="mb-4 flex justify-center">
              <div className={`flex h-5 w-16 items-center justify-center rounded-full border ${isDragging ? 'border-cyan-300/45 bg-[rgba(10,40,58,0.99)]' : 'border-cyan-400/24 bg-[rgba(8,32,48,0.9)]'}`}>
                <span className="h-1.5 w-8 rounded-full bg-cyan-300/35" />
              </div>
            </div>
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/26 bg-[rgba(8,32,48,0.98)] shadow-[0_0_24px_rgba(34,211,238,0.12)]">
                  <ThemedIcon icon={icon} size={22} tone="#67e8f9" interactive />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-300/80">{eyebrow}</div>
                  <div className="mt-1 text-lg font-semibold text-slate-50">{renderHighlightedText(title)}</div>
                </div>
              </div>
              <button
                className="rounded-lg border border-white/10 bg-[rgba(2,6,23,0.98)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-400 transition-colors hover:border-red-400/30 hover:text-red-200"
                onClick={onSkip}
              >
                Skip Tour
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(2,6,23,0.98)]">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.85),rgba(167,139,250,0.88))] transition-all duration-500" style={{ width: progressWidth }} />
              </div>
              <div className="rounded-full border border-cyan-500/24 bg-[rgba(8,32,48,0.98)] px-2 py-1 text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-100">
                Step {stepIndex} / {stepCount}
              </div>
            </div>
          </div>

          <div className="px-5 py-4">
            <div className="rounded-2xl border border-slate-700/85 bg-[rgba(2,6,23,0.992)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="text-sm leading-relaxed text-slate-300">{renderHighlightedText(description)}</div>
              <div className="mt-3 rounded-xl border border-amber-400/24 bg-[rgba(36,22,8,0.985)] px-3 py-2 text-[10px] leading-relaxed text-amber-100/92">
                <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">Tutorial Lock</div>
                <div className="mt-1">{renderHighlightedText(lockMessage)}</div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                <span>{renderHighlightedText(helperText)}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {metrics.map(metric => (
                <div key={metric.label} className={`rounded-xl border px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${metricToneClass(metric.tone)}`}>
                  <div className="text-[8px] uppercase tracking-[0.24em] text-slate-500">{metric.label}</div>
                  <div className="mt-1 text-[12px] font-semibold font-mono">{metric.value}</div>
                </div>
              ))}
            </div>

            {progress && (
              <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-[rgba(2,6,23,0.99)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  <span>{progress.label}</span>
                  <span className="font-mono text-slate-500 normal-case tracking-normal">{progress.valueLabel}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(2,6,23,0.98)]">
                  <div className={`h-full rounded-full transition-all duration-500 ${progressToneClass}`} style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
                </div>
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-slate-700/85 bg-[rgba(2,6,23,0.99)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Step checklist</div>
              <div className="mt-3 space-y-2.5">
                {checklist.map(item => (
                  <div key={item.label} className="flex items-start gap-3">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full border ${checklistToneClass(item.status)}`} />
                    <div>
                      <div className="text-[11px] font-semibold text-slate-100">{renderHighlightedText(item.label)}</div>
                      <div className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{renderHighlightedText(item.detail)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="rounded-xl border border-cyan-400/35 bg-[rgba(8,32,48,0.98)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-[rgba(10,40,58,0.99)]"
                onClick={onAction}
              >
                {actionLabel}
              </button>
              {completionMode === 'automatic' && (
                <div className="text-[10px] text-slate-500">
                  This step resolves automatically from live game state.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}