import { useEffect, useMemo, useRef, useState } from 'react';
import type { NotificationEntry, NotificationSeverity } from '@/types/game.types';
import type { InboxView } from '@/stores/uiStore';
import { ThemedIcon, type ThemedIconName } from '@/ui/components/ThemedIcon';
import { getSystemById } from '@/game/galaxy/galaxy.gen';

const TOAST_EXIT_MS = 260;

type NotificationTone = {
  dot: string;
  iconTone: string;
  border: string;
  badge: string;
  text: string;
};

const VIEW_LABELS: Record<InboxView, string> = {
  all: 'All',
  unread: 'Unread',
  alerts: 'Alerts',
  messages: 'Messages',
};

const CATEGORY_LABELS: Record<NotificationEntry['category'], string> = {
  progression: 'Progression',
  industry: 'Industry',
  fleet: 'Fleet',
  combat: 'Combat',
  exploration: 'Exploration',
  economy: 'Economy',
  faction: 'Faction',
  system: 'System',
};

function getNotificationTone(severity: NotificationSeverity): NotificationTone {
  switch (severity) {
    case 'critical':
      return {
        dot: 'bg-red-400',
        iconTone: '#f87171',
        border: 'border-red-500/30 bg-red-950/20',
        badge: 'border-red-500/30 bg-red-950/40 text-red-200',
        text: 'text-red-200',
      };
    case 'warning':
      return {
        dot: 'bg-amber-400/80',
        iconTone: '#fbbf24',
        border: 'border-amber-500/25 bg-amber-950/15',
        badge: 'border-amber-500/30 bg-amber-950/40 text-amber-200',
        text: 'text-amber-100',
      };
    case 'success':
      return {
        dot: 'bg-emerald-400',
        iconTone: '#34d399',
        border: 'border-emerald-500/25 bg-emerald-950/15',
        badge: 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200',
        text: 'text-emerald-100',
      };
    case 'queued':
      return {
        dot: 'bg-violet-400/80',
        iconTone: '#a78bfa',
        border: 'border-violet-500/25 bg-violet-950/15',
        badge: 'border-violet-500/30 bg-violet-950/40 text-violet-200',
        text: 'text-violet-100',
      };
    case 'info':
    default:
      return {
        dot: 'bg-cyan-400',
        iconTone: '#22d3ee',
        border: 'border-cyan-500/25 bg-cyan-950/15',
        badge: 'border-cyan-500/30 bg-cyan-950/40 text-cyan-200',
        text: 'text-cyan-100',
      };
  }
}

function getNotificationIcon(entry: NotificationEntry): ThemedIconName {
  if (entry.severity === 'critical') return 'error';
  if (entry.severity === 'warning') return 'warning';
  if (entry.severity === 'success') return 'success';

  switch (entry.category) {
    case 'progression':
      return 'skills';
    case 'industry':
      return 'manufacturing';
    case 'fleet':
      return entry.kind === 'update' ? 'transit' : 'fleet';
    case 'combat':
      return 'combat';
    case 'exploration':
      return 'scan';
    case 'economy':
      return 'market';
    case 'faction':
      return 'shield';
    case 'system':
    default:
      return 'data';
  }
}

function getEmptyMessage(view: InboxView): string {
  switch (view) {
    case 'unread':
      return 'No unread notifications.';
    case 'alerts':
      return 'No alert traffic right now.';
    case 'messages':
      return 'No message traffic right now.';
    case 'all':
    default:
      return 'No notifications recorded yet.';
  }
}

export function filterNotifications(entries: NotificationEntry[], view: InboxView, showArchived: boolean): NotificationEntry[] {
  return entries.filter((entry) => {
    if (!showArchived && entry.archivedAt) return false;
    if (view === 'unread') return !entry.readAt;
    if (view === 'alerts') return entry.kind === 'alert';
    if (view === 'messages') return entry.kind === 'message';
    return true;
  });
}

export function getUnreadNotificationCount(entries: NotificationEntry[]): number {
  return entries.filter(entry => !entry.archivedAt && !entry.readAt).length;
}

export function formatNotificationAge(createdAt: number, now = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}

function resolveSourceLabel(entry: NotificationEntry, galaxySeed: number): string {
  try {
    return getSystemById(galaxySeed, entry.sourceSystem).name;
  } catch {
    return entry.sourceSystem;
  }
}

interface NotificationViewTabsProps {
  activeView: InboxView;
  entries: NotificationEntry[];
  showArchived: boolean;
  onChange(view: InboxView): void;
}

export function NotificationViewTabs({ activeView, entries, showArchived, onChange }: NotificationViewTabsProps) {
  const counts = useMemo(() => ({
    all: filterNotifications(entries, 'all', showArchived).length,
    unread: filterNotifications(entries, 'unread', showArchived).length,
    alerts: filterNotifications(entries, 'alerts', showArchived).length,
    messages: filterNotifications(entries, 'messages', showArchived).length,
  }), [entries, showArchived]);

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-1">
      <div className="flex flex-wrap gap-1">
        {(['all', 'unread', 'alerts', 'messages'] as InboxView[]).map((view) => {
          const active = activeView === view;
          return (
            <button
              key={view}
              className={[
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] transition-colors',
                active
                  ? 'border border-cyan-500/35 bg-cyan-950/35 text-cyan-100'
                  : 'border border-transparent bg-slate-900/60 text-slate-500 hover:bg-slate-900/90 hover:text-slate-200',
              ].join(' ')}
              onClick={() => onChange(view)}
            >
              <span>{VIEW_LABELS[view]}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono ${active ? 'bg-cyan-500/15 text-cyan-100' : 'bg-slate-800/70 text-slate-400'}`}>
                {counts[view]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface NotificationRowProps {
  entry: NotificationEntry;
  galaxySeed: number;
  compact?: boolean;
  selected?: boolean;
  onSelect(): void;
  onArchive?(): void;
  onRestore?(): void;
}

export function NotificationRow({
  entry,
  galaxySeed,
  compact = false,
  selected = false,
  onSelect,
  onArchive,
  onRestore,
}: NotificationRowProps) {
  const tone = getNotificationTone(entry.severity);
  const sourceLabel = resolveSourceLabel(entry, galaxySeed);
  const icon = getNotificationIcon(entry);

  return (
    <div className={`rounded-xl border ${selected ? tone.border : 'border-slate-800/80 bg-slate-950/55'} transition-colors`}>
      <div className="flex items-stretch gap-2 p-2">
        <button
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={onSelect}
        >
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${entry.readAt ? 'bg-slate-700' : tone.dot}`} />
          <span className="mt-0.5 shrink-0">
            <ThemedIcon icon={icon} size={16} tone={tone.iconTone} interactive />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className={`truncate text-[11px] font-semibold ${entry.readAt ? 'text-slate-300' : tone.text}`}>
                {entry.title}
              </span>
              {!entry.readAt && <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-[0.2em] text-cyan-200">New</span>}
            </span>
            {!compact && (
              <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">
                {entry.body}
              </span>
            )}
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500">
              <span className={`rounded-full border px-1.5 py-0.5 ${tone.badge}`}>{entry.kind}</span>
              <span className="rounded-full border border-slate-800/80 bg-slate-900/70 px-1.5 py-0.5 text-slate-400">{CATEGORY_LABELS[entry.category]}</span>
              <span>{sourceLabel}</span>
              <span>{formatNotificationAge(entry.createdAt)}</span>
            </span>
          </span>
        </button>
        {entry.archivedAt ? (
          onRestore && (
            <button
              className="shrink-0 rounded-lg border border-slate-700/60 bg-slate-900/70 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-cyan-500/35 hover:text-cyan-100"
              onClick={(event) => {
                event.stopPropagation();
                onRestore();
              }}
            >
              Restore
            </button>
          )
        ) : (
          onArchive && (
            <button
              className="shrink-0 rounded-lg border border-slate-800/80 bg-slate-950/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400 transition-colors hover:border-red-500/35 hover:text-red-200"
              onClick={(event) => {
                event.stopPropagation();
                onArchive();
              }}
            >
              Archive
            </button>
          )
        )}
      </div>
    </div>
  );
}

interface NotificationListProps {
  entries: NotificationEntry[];
  galaxySeed: number;
  activeView: InboxView;
  compact?: boolean;
  selectedId?: string | null;
  emptyMessage?: string;
  onSelect(entry: NotificationEntry): void;
  onArchive?(entry: NotificationEntry): void;
  onRestore?(entry: NotificationEntry): void;
}

export function NotificationList({
  entries,
  galaxySeed,
  activeView,
  compact = false,
  selectedId = null,
  emptyMessage,
  onSelect,
  onArchive,
  onRestore,
}: NotificationListProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800/80 bg-slate-950/45 px-4 py-5 text-[11px] text-slate-500">
        {emptyMessage ?? getEmptyMessage(activeView)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <NotificationRow
          key={entry.id}
          entry={entry}
          galaxySeed={galaxySeed}
          compact={compact}
          selected={selectedId === entry.id}
          onSelect={() => onSelect(entry)}
          onArchive={onArchive ? () => onArchive(entry) : undefined}
          onRestore={onRestore ? () => onRestore(entry) : undefined}
        />
      ))}
    </div>
  );
}

interface NotificationDrawerProps {
  entries: NotificationEntry[];
  galaxySeed: number;
  activeView: InboxView;
  unreadCount: number;
  onChangeView(view: InboxView): void;
  onSelect(entry: NotificationEntry): void;
  onOpenInbox(): void;
  onMarkAllRead(): void;
}

export function NotificationDrawer({
  entries,
  galaxySeed,
  activeView,
  unreadCount,
  onChangeView,
  onSelect,
  onOpenInbox,
  onMarkAllRead,
}: NotificationDrawerProps) {
  const visibleEntries = filterNotifications(entries, activeView, false).slice(0, 6);

  return (
    <div className="w-[min(30rem,calc(100vw-1.5rem))] rounded-2xl border border-cyan-500/20 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur-xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">Command Traffic</div>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-100">
            <ThemedIcon icon="inbox" size={18} tone={unreadCount > 0 ? '#22d3ee' : '#94a3b8'} interactive />
            <span>Inbox</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${unreadCount > 0 ? 'bg-cyan-500/15 text-cyan-200' : 'bg-slate-800/70 text-slate-400'}`}>
              {unreadCount} unread
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-lg border border-slate-800/80 bg-slate-900/70 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-cyan-500/35 hover:text-cyan-100"
            onClick={onOpenInbox}
          >
            Open Panel
          </button>
          <button
            className="rounded-lg border border-slate-800/80 bg-slate-900/70 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
            onClick={onMarkAllRead}
          >
            Mark All Read
          </button>
        </div>
      </div>

      <NotificationViewTabs activeView={activeView} entries={entries} showArchived={false} onChange={onChangeView} />

      <div className="mt-3">
        <NotificationList
          entries={visibleEntries}
          galaxySeed={galaxySeed}
          activeView={activeView}
          compact
          emptyMessage="No current command traffic for this filter."
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

interface NotificationToastStackProps {
  entries: NotificationEntry[];
  galaxySeed: number;
  onOpen(entry: NotificationEntry): void;
  onDismiss(notificationId: string): void;
}

interface RenderedToastEntry {
  entry: NotificationEntry;
  exiting: boolean;
}

export function NotificationToastStack({ entries, galaxySeed, onOpen, onDismiss }: NotificationToastStackProps) {
  const [renderedEntries, setRenderedEntries] = useState<RenderedToastEntry[]>(() => entries.map(entry => ({ entry, exiting: false })));
  const exitTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setRenderedEntries(current => {
      const nextIds = new Set(entries.map(entry => entry.id));
      const nextMap = new Map(entries.map(entry => [entry.id, entry]));
      const nextRendered: RenderedToastEntry[] = [];

      for (const renderedEntry of current) {
        const updatedEntry = nextMap.get(renderedEntry.entry.id);
        if (updatedEntry) {
          nextRendered.push({ entry: updatedEntry, exiting: false });
          nextMap.delete(renderedEntry.entry.id);
          const exitTimer = exitTimersRef.current[renderedEntry.entry.id];
          if (exitTimer) {
            window.clearTimeout(exitTimer);
            delete exitTimersRef.current[renderedEntry.entry.id];
          }
          continue;
        }

        if (!renderedEntry.exiting) {
          nextRendered.push({ ...renderedEntry, exiting: true });
          exitTimersRef.current[renderedEntry.entry.id] = window.setTimeout(() => {
            setRenderedEntries(active => active.filter(candidate => candidate.entry.id !== renderedEntry.entry.id));
            delete exitTimersRef.current[renderedEntry.entry.id];
          }, TOAST_EXIT_MS);
          continue;
        }

        nextRendered.push(renderedEntry);
      }

      for (const entry of entries) {
        if (!current.some(candidate => candidate.entry.id === entry.id) && nextIds.has(entry.id)) {
          nextRendered.push({ entry, exiting: false });
        }
      }

      return nextRendered;
    });
  }, [entries]);

  useEffect(() => () => {
    Object.values(exitTimersRef.current).forEach(timerId => window.clearTimeout(timerId));
  }, []);

  if (renderedEntries.length === 0) return null;

  return (
    <div className="pointer-events-none flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2">
      {renderedEntries.map(({ entry, exiting }) => {
        const tone = getNotificationTone(entry.severity);
        return (
          <div
            key={entry.id}
            className={`pointer-events-auto rounded-2xl border ${tone.border} bg-slate-950/92 p-3 shadow-[0_18px_60px_rgba(2,6,23,0.6)] backdrop-blur-xl transition-all duration-300 ease-out ${exiting ? 'translate-y-1 scale-[0.985] opacity-0' : 'translate-y-0 scale-100 opacity-100'}`}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0"><ThemedIcon icon={getNotificationIcon(entry)} size={18} tone={tone.iconTone} interactive /></span>
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(entry)}>
                <div className="flex items-center gap-2">
                  <span className={`truncate text-[11px] font-semibold ${tone.text}`}>{entry.title}</span>
                  <span className="rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-[0.18em] text-slate-400">
                    {CATEGORY_LABELS[entry.category]}
                  </span>
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-slate-300">{entry.body}</div>
                <div className="mt-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500">
                  {resolveSourceLabel(entry, galaxySeed)} · {formatNotificationAge(entry.createdAt)}
                </div>
              </button>
              <button
                className="shrink-0 rounded-lg border border-slate-800/80 bg-slate-900/70 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
                onClick={() => onDismiss(entry.id)}
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}