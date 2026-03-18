import { useEffect, useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useUiStore } from '@/stores/uiStore';
import type { NotificationEntry } from '@/types/game.types';
import {
  NotificationList,
  NotificationViewTabs,
  filterNotifications,
  getUnreadNotificationCount,
  formatNotificationAge,
} from '@/ui/components/NotificationCenter';
import { ThemedIcon } from '@/ui/components/ThemedIcon';

function openNotificationTarget(entry: NotificationEntry, navigate: ReturnType<typeof useUiStore.getState>['navigate']) {
  if (!entry.focusTarget) return;
  navigate(entry.focusTarget.panelId, {
    entityType: entry.focusTarget.entityType,
    entityId: entry.focusTarget.entityId,
    panelSection: entry.focusTarget.panelSection,
    parentEntityId: entry.focusTarget.parentEntityId,
  });
}

export function InboxPanel() {
  const notifications = useGameStore((state) => state.state.notifications.entries);
  const galaxySeed = useGameStore((state) => state.state.galaxy.seed);
  const markNotificationRead = useGameStore((state) => state.markNotificationRead);
  const markAllNotificationsRead = useGameStore((state) => state.markAllNotificationsRead);
  const archiveNotification = useGameStore((state) => state.archiveNotification);
  const restoreNotification = useGameStore((state) => state.restoreNotification);
  const archiveReadNotifications = useGameStore((state) => state.archiveReadNotifications);

  const navigate = useUiStore((state) => state.navigate);
  const panelState = useUiStore((state) => state.panelStates.inbox);
  const setPanelState = useUiStore((state) => state.setPanelState);

  const activeView = panelState.activeView ?? 'all';
  const showArchived = panelState.showArchived ?? false;
  const selectedNotificationId = panelState.selectedNotificationId ?? null;
  const unreadCount = useMemo(() => getUnreadNotificationCount(notifications), [notifications]);
  const visibleEntries = useMemo(
    () => filterNotifications(notifications, activeView, showArchived),
    [notifications, activeView, showArchived],
  );
  const selectedEntry = useMemo(
    () => visibleEntries.find((entry) => entry.id === selectedNotificationId) ?? visibleEntries[0] ?? null,
    [visibleEntries, selectedNotificationId],
  );

  useEffect(() => {
    const nextId = visibleEntries[0]?.id ?? null;
    if (selectedNotificationId !== (selectedEntry?.id ?? null)) {
      setPanelState('inbox', { selectedNotificationId: selectedEntry?.id ?? nextId ?? null });
    }
  }, [selectedEntry?.id, selectedNotificationId, setPanelState, visibleEntries]);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-cyan-500/20 bg-slate-950/75 p-4 shadow-[inset_0_1px_0_rgba(103,232,249,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">Inbox Archive</div>
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-100">
              <ThemedIcon icon="inbox" size={22} tone={unreadCount > 0 ? '#22d3ee' : '#94a3b8'} interactive />
              <span>Messages, alerts, and operational updates</span>
            </div>
            <div className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
              Persistent command traffic is stored here so fleet arrivals, industrial completions, discoveries, market events, and progression beats remain actionable after the toast fades.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Unread</div>
              <div className="mt-1 text-lg font-semibold text-cyan-100">{unreadCount}</div>
            </div>
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">Active</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">{notifications.filter(entry => !entry.archivedAt).length}</div>
            </div>
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">Archived</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">{notifications.filter(entry => !!entry.archivedAt).length}</div>
            </div>
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">Newest</div>
              <div className="mt-1 text-sm font-semibold text-slate-200">{notifications[0] ? formatNotificationAge(notifications[0].createdAt) : 'N/A'}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/65 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <NotificationViewTabs
            activeView={activeView}
            entries={notifications}
            showArchived={showArchived}
            onChange={(view) => setPanelState('inbox', { activeView: view })}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-lg border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] transition-colors ${showArchived ? 'border-violet-500/35 bg-violet-950/25 text-violet-100' : 'border-slate-800/80 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'}`}
              onClick={() => setPanelState('inbox', { showArchived: !showArchived })}
            >
              {showArchived ? 'Hide Archived' : 'Show Archived'}
            </button>
            <button
              className="rounded-lg border border-slate-800/80 bg-slate-950/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-cyan-500/35 hover:text-cyan-100"
              onClick={markAllNotificationsRead}
            >
              Mark All Read
            </button>
            <button
              className="rounded-lg border border-slate-800/80 bg-slate-950/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-amber-500/35 hover:text-amber-100"
              onClick={archiveReadNotifications}
            >
              Dismiss Read
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.85fr)] xl:items-stretch">
        <section className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Visible Feed · {visibleEntries.length}
          </div>
          <div className="max-h-[32rem] overflow-y-auto pr-1 xl:max-h-[calc(100dvh-21rem)]">
            <NotificationList
              entries={visibleEntries}
              galaxySeed={galaxySeed}
              activeView={activeView}
              compact
              selectedId={selectedEntry?.id ?? null}
              onSelect={(entry) => {
                markNotificationRead(entry.id);
                setPanelState('inbox', { selectedNotificationId: entry.id });
              }}
              onArchive={(entry) => archiveNotification(entry.id)}
              onRestore={(entry) => restoreNotification(entry.id)}
            />
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Selected Entry</div>
          {selectedEntry ? (
            <div className="mt-3 flex max-h-[32rem] flex-col gap-3 overflow-y-auto pr-1 xl:max-h-[calc(100dvh-21rem)]">
              <div>
                <div className="text-base font-semibold text-slate-100">{selectedEntry.title}</div>
                <div className="mt-1 text-[11px] text-slate-400">{selectedEntry.body}</div>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
                <span className="rounded-full border border-slate-800/80 bg-slate-900/70 px-2 py-1">{selectedEntry.category}</span>
                <span className="rounded-full border border-slate-800/80 bg-slate-900/70 px-2 py-1">{selectedEntry.kind}</span>
                <span className="rounded-full border border-slate-800/80 bg-slate-900/70 px-2 py-1">{selectedEntry.severity}</span>
                <span className="rounded-full border border-slate-800/80 bg-slate-900/70 px-2 py-1">{formatNotificationAge(selectedEntry.createdAt)}</span>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/75 p-3 text-[11px] text-slate-400">
                Read: {selectedEntry.readAt ? formatNotificationAge(selectedEntry.readAt) : 'No'}
                <br />
                Archived: {selectedEntry.archivedAt ? formatNotificationAge(selectedEntry.archivedAt) : 'No'}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedEntry.focusTarget && (
                  <button
                    className="rounded-lg border border-cyan-500/30 bg-cyan-950/25 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100 transition-colors hover:border-cyan-400/50 hover:bg-cyan-950/35"
                    onClick={() => openNotificationTarget(selectedEntry, navigate)}
                  >
                    {selectedEntry.actionLabel ?? 'Open Source'}
                  </button>
                )}
                {!selectedEntry.archivedAt ? (
                  <button
                    className="rounded-lg border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-red-500/35 hover:text-red-200"
                    onClick={() => archiveNotification(selectedEntry.id)}
                  >
                    Dismiss Entry
                  </button>
                ) : (
                  <button
                    className="rounded-lg border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-cyan-500/35 hover:text-cyan-100"
                    onClick={() => restoreNotification(selectedEntry.id)}
                  >
                    Restore Entry
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-slate-800/80 bg-slate-950/45 px-4 py-5 text-[11px] text-slate-500">
              No notification selected.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}